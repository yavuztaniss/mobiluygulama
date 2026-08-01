-- ===========================================================================
-- 0052 — Davetsiz kayıt artık kulübe OTOMATİK bağlanmıyor
-- ===========================================================================
-- NASIL ÇIKTI
--   Kullanıcı, PWA canlıya alınmadan önce sordu: "adres herkese açık olacak,
--   giren herkes inceleyebilecek, bunu nasıl engelleriz?" Adresi gizlemek çözüm
--   değil (veliler o adrese girecek), asıl soru YABANCI NE YAPABİLİYOR.
--
-- SÖMÜRÜLEREK ÖLÇÜLDÜ (yerel, tek kulüplü kurulum = canlının bugünkü hâli)
--   handle_new_user'ın davetsiz dalı şöyleydi:
--     select count(*) into v_adet from public.kulup;
--     if v_adet = 1 then select id into v_kulup from public.kulup;  -- BAĞLA
--     ...
--     insert into profiles (id, role, ad, kulup_id) values (new.id,'veli',...);
--
--   Yani adrese giren bir yabancı "Kayıt Ol" deyip kulübün VELİSİ oluyordu.
--   O hesapla okunabilenler ölçüldü:
--     kurum_ayarlari 1  → IBAN AÇIK: TR33 0006 1005 1978 6457 8413 26
--     duyuru 1 · etkinlik 1 · grup 7 · urun 6
--     sporcular 0 · odeme 0 · yoklama 0 · antrenman 0   (çocuk verisi sızmıyor)
--
--   Çocuk verisi sızmaması sahiplik kurallarının çalıştığını gösteriyor; ama
--   kulübün IBAN'ının internetteki herkese açık olması gerçek bir risk:
--   dolandırıcı velilere "kulübün hesabı değişti" yazabilir. Duyurular da
--   kulübe özel bilgi taşıyabiliyor.
--
-- NEDEN "DAVETSİZ KAYDI TAMAMEN KAPAT" DEĞİL
--   İki sebep. (1) Ön kayıt akışı (basvuru, tag='DENEME') oturum açmış bir VELİ
--   gerektiriyor; kaydı tümden kapatmak ürünün kendi akışını kırardı.
--   (2) Daha önemlisi: kurulum bootstrap'i kırılırdı. Platform sahibinin ve bir
--   kulübün ilk yöneticisinin hesabı Supabase > Add user ile açılıyor, SONRA
--   04/05 dosyalarıyla yetkilendiriliyor. Kayıt tümden reddedilseydi o ilk hesap
--   hiç açılamaz ve sistem kurulamaz hâle gelirdi.
--
-- ÇÖZÜM: BAĞLAMA, AMA REDDETME DE
--   Davetsiz kayıt artık `kulup_id = NULL` ile profil açıyor.
--   private.current_kulup_id() NULL döndüğü için 0021'in restrictive kiracı
--   duvarı bu kullanıcı için TÜMÜYLE kapanıyor (fail-closed) — tek satır bile
--   göremiyor. Hesap var, erişim yok.
--
--   Yan fayda: davranış artık kulüp sayısından BAĞIMSIZ. Eskiden sistem tek
--   kulüpken açık, iki kulüpken kapalıydı; yani güvenlik, kaç müşterin olduğuna
--   göre değişiyordu. Böyle bir kural er geç yanlış tarafa düşer.
--
--   Panelde bu kişi zaten doğru mesajı alıyor (dal.ts → 'hesapsiz'):
--   "Bu hesabın kulüp kaydı bulunamadı... kulüp yöneticinizden yeni bir davet
--   bağlantısı isteyin."
--
-- ⚠ MEVCUT KULLANICILAR ETKİLENMİYOR: bu değişiklik yalnızca YENİ kayıtlarda
--   çalışıyor, hiçbir profil satırına dokunmuyor.
--
-- ÇALIŞTIRMA: 0051'den sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token  text;
  v_ad     text;
  v_kulup  uuid;
  v_rol    app_role;
  v_sporcu uuid;
  v_adet   int;
  v_satir  int;
begin
  v_ad    := coalesce(new.raw_user_meta_data ->> 'ad', '');
  -- Boş string gönderilmesi "token yok" ile aynı anlama gelmeli.
  v_token := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'davet_token', '')), '');

  -- --- (a) DAVETLİ KAYIT ------------------------------------------------
  if v_token is not null then
    select c.kulup_id, c.rol, c.sporcu_id
      into v_kulup, v_rol, v_sporcu
      from private.davet_coz(v_token, new.email) c;

    if v_kulup is null then
      raise exception 'Davet linki geçersiz, süresi dolmuş, daha önce kullanılmış veya başka bir e-posta adresine düzenlenmiş.';
    end if;

    -- SIRA ÖNEMLİ: profiles ÖNCE, davet mührü SONRA (davet.kullanan_id → profiles FK).
    insert into public.profiles (id, role, ad, kulup_id)
    values (new.id, v_rol, v_ad, v_kulup);

    -- TEK KULLANIMLIK MÜHÜR — KOŞULLU (yarış durumuna kapalı).
    update public.davet
       set kullanildi_at = now(),
           kullanan_id   = new.id
     where token = v_token
       and kullanildi_at is null
       and son_kullanma  > now();

    get diagnostics v_satir = row_count;
    if v_satir <> 1 then
      raise exception 'Davet linki az önce başka bir kayıtta kullanıldı. Kulüp yöneticinizden yeni bir davet isteyin.';
    end if;

    if v_sporcu is not null then
      insert into public.veli_sporcu (veli_id, sporcu_id, kulup_id)
      values (new.id, v_sporcu, v_kulup)
      on conflict do nothing;
    end if;

    return new;
  end if;

  -- --- (b) DAVETSİZ KAYIT — KULÜBE BAĞLANMIYOR --------------------------
  -- ⚠ 0052: burası eskiden "tek kulüp varsa ona bağla" diyordu ve internetteki
  --   herkesin kulübün velisi olmasına yol açıyordu (IBAN dahil ölçüldü).
  --   Artık kulup_id NULL yazılıyor; current_kulup_id() NULL döndüğü için
  --   kiracı duvarı bu kullanıcı için tümüyle kapanıyor.
  --
  --   Sıfır kulüp kontrolü KALDIRILDI: bootstrap sırasında (henüz hiç kulüp
  --   yokken) platform sahibinin hesabı açılabilmeli. Eskiden burada atılan
  --   exception, sıfır kulüplü bir projede HİÇBİR hesabın açılamamasına ve
  --   sistemin kurulamamasına yol açıyordu.
  select count(*) into v_adet from public.kulup;

  insert into public.profiles (id, role, ad, kulup_id)
  values (new.id, 'veli', v_ad, null);

  if v_adet > 0 then
    raise notice 'Davetsiz kayıt: % kulübe bağlanmadı (kulup_id NULL). Erişim için davet gerekli.', new.email;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  '0052: davetsiz kayıt kulübe bağlanmıyor (kulup_id NULL) — kiracı duvarı '
  'fail-closed kapanıyor. Eskiden tek kulüp varsa otomatik bağlanıyordu ve '
  'internetteki herkes kulübün IBAN''ını okuyabiliyordu (ölçüldü).';


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare v_govde text;
begin
  select prosrc into v_govde from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_user';

  if v_govde is null then
    raise exception '0052: handle_new_user bulunamadı.';
  end if;

  -- Eski otomatik bağlama satırı gövdede KALMAMALI.
  if position('if v_adet = 1 then' in v_govde) > 0 then
    raise exception '0052: otomatik kulüp bağlama hâlâ gövdede — açık kapanmamış.';
  end if;

  raise notice '0052 doğrulandı: davetsiz kayıt kulübe bağlanmıyor.';
end $$;
