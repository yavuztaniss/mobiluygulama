-- ===========================================================================
-- 0029 — Hesap silme (App Store 5.1.1(v)) + kullanıcı erişimini geri alma
-- ===========================================================================
-- İKİ AYRI İHTİYAÇ, TEK ALTYAPI
--
--   A) HESAP SİLME. Apple Guideline 5.1.1(v): hesap oluşturmaya izin veren her
--      uygulama, hesabın UYGULAMA İÇİNDEN silinmesini de sunmak zorundadır.
--      "Bize e-posta atın" ya da web'e yönlendirmek kabul edilmiyor; pasife
--      almak da yetmiyor, hesabın gerçekten silinmesi isteniyor. Aynı zamanda
--      KVKK'daki silme hakkının karşılığı.
--
--   B) ERİŞİM KALDIRMA (offboarding). Kulüpten ayrılan antrenör bugün sporcu
--      listesini, veli telefonlarını, yoklama geçmişini ve mesajları GÖRMEYE
--      DEVAM EDİYOR — panelde profiles tablosuna tek bir UPDATE/DELETE yok.
--      Hem güvenlik hem KVKK sorunu, ve kulübün satın almadan önce soracağı
--      somut bir soru.
--
-- BÖLÜMLER
--   1) Yabancı anahtar davranışlarının düzeltilmesi (silme güvenliği)
--   2) profiles.aktif — erişim kaldırma anahtarı
--   3) current_kulup_id() — pasif kullanıcı fail-closed olsun
--   4) Yöneticinin personeli pasife alma politikası
--   5) public.hesabimi_sil() — kullanıcının kendi hesabını silmesi
--   6) Doğrulama
--
-- ÇALIŞTIRMA: 0028'den sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) YABANCI ANAHTAR DAVRANIŞLARI
-- ===========================================================================
-- Bir hesabı silmek, o hesaba bağlı satırlarla ne olacağını belirlemeyi
-- gerektiriyor. Mevcut şemadaki davranışlar bu senaryo hiç düşünülmeden
-- konmuştu ve iki ayrı yanlışa yol açıyordu:
--
--   · CASCADE olması GEREKMEYEN yerde cascade → kulübün MUHASEBE KAYDI sessizce
--     siliniyordu. hakedis.antrenor_id cascade'di: antrenör hesabı silindiğinde
--     o antrenöre ait tüm hakediş geçmişi de gidiyordu. Ödenmiş bordronun kaydı
--     kulübün kendi kaydıdır; kişi silinse de kalmalı.
--   · NO ACTION olan yerde → silme hiç mümkün olmuyordu (FK ihlali). Kullanıcı
--     "hesabımı sil" diyor, işlem anlaşılmaz bir hatayla düşüyordu.
--
-- KURAL: kişiye ait olan gider (mesajlar, rezervasyon sahipliği), kulübe ait
-- olan kalır (bordro, ödeme, yoklama, sporcu kaydı) — kalanlarda kişi bağı
-- NULL'a düşer.

-- --- 1.1 Mesajlaşma: kişiyle birlikte GİDER.
-- Konuşma iki taraflı ama içeriği silinen kişinin kişisel verisi. Karşı taraf
-- geçmişi kaybeder; KVKK açısından doğru olan bu.
alter table public.konusma drop constraint if exists konusma_veli_id_fkey;
alter table public.konusma add constraint konusma_veli_id_fkey
  foreign key (veli_id) references public.profiles(id) on delete cascade;

alter table public.konusma drop constraint if exists konusma_antrenor_id_fkey;
alter table public.konusma add constraint konusma_antrenor_id_fkey
  foreign key (antrenor_id) references public.profiles(id) on delete cascade;

alter table public.mesaj drop constraint if exists mesaj_gonderen_id_fkey;
alter table public.mesaj add constraint mesaj_gonderen_id_fkey
  foreign key (gonderen_id) references public.profiles(id) on delete cascade;

-- --- 1.2 Muhasebe: KALIR, kişi bağı boşalır.
-- hakedis bir bordro kaydıdır; antrenör ayrılsa da kulübün defterinde durmalı.
-- Kolon nullable'a çekiliyor ki set null çalışabilsin.
alter table public.hakedis alter column antrenor_id drop not null;
alter table public.hakedis drop constraint if exists hakedis_antrenor_id_fkey;
alter table public.hakedis add constraint hakedis_antrenor_id_fkey
  foreign key (antrenor_id) references public.profiles(id) on delete set null;

-- --- 1.3 Sporcunun ön ödemeli paketi: KALIR.
-- Paket sporcuya aittir, antrenöre değil. Cascade olsaydı antrenör ayrıldığında
-- velinin parasını ödediği ders hakkı silinirdi.
alter table public.bireysel_paket alter column antrenor_id drop not null;
alter table public.bireysel_paket drop constraint if exists bireysel_paket_antrenor_id_fkey;
alter table public.bireysel_paket add constraint bireysel_paket_antrenor_id_fkey
  foreign key (antrenor_id) references public.profiles(id) on delete set null;

-- --- 1.4 Rezervasyon geçmişi: KALIR (tamamlanmış dersin kaydı).
alter table public.bireysel_rezervasyon alter column antrenor_id drop not null;
alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_antrenor_id_fkey;
alter table public.bireysel_rezervasyon add constraint bireysel_rezervasyon_antrenor_id_fkey
  foreign key (antrenor_id) references public.profiles(id) on delete set null;

-- NOT: nullable creator alanları (duyuru.olusturan_id, etkinlik.olusturan_id,
-- gider/fatura.olusturan_id, basvuru.created_by, antrenman.olusturan_id,
-- gelisim_degerlendirme.antrenor_id) zaten NO ACTION + nullable. Bunlar
-- hesabimi_sil() içinde açıkça NULL'a çekiliyor; FK davranışını değiştirmek
-- yerine uygulama katmanında yapmak, silme sırasının denetlenebilir kalmasını
-- sağlıyor (hangi satırın neden boşaldığı fonksiyonun gövdesinde görünüyor).


-- ===========================================================================
-- 2) profiles.aktif — ERİŞİM KALDIRMA ANAHTARI
-- ===========================================================================
-- SİLME DEĞİL, ERİŞİM KALDIRMA. Ayrılan antrenörün hesabını silmek yanlış
-- olurdu: yoklama kayıtları, gelişim değerlendirmeleri ve hakediş geçmişi onun
-- adıyla anlamlı. İhtiyaç "bu kişi artık veri göremesin"; kayıtlar dursun.
-- 0024'teki sporcu/grup yumuşak silme deseninin aynısı.
alter table public.profiles add column if not exists aktif boolean not null default true;
alter table public.profiles add column if not exists pasif_tarihi timestamptz;

comment on column public.profiles.aktif is
  'false = kulüpten ayrılmış kullanıcı (0029). Hesap ve kayıtları durur ama current_kulup_id() NULL döndüğü için hiçbir veri göremez.';
comment on column public.profiles.pasif_tarihi is
  'aktif=false yapıldığı an. Geri alındığında NULL''a döner.';

create index if not exists profiles_kulup_aktif_idx on public.profiles (kulup_id, aktif);


-- ===========================================================================
-- 3) current_kulup_id() — PASİF KULLANICI FAIL-CLOSED
-- ===========================================================================
-- Erişim kaldırmayı 55 restrictive politikanın her birine ayrı ayrı yazmak
-- yerine, hepsinin dayandığı TEK fonksiyona bir koşul ekleniyor. Kulüp askıya
-- alma anahtarının (0023 `k.durum = 'aktif'`) birebir aynı mantığı:
-- fonksiyon NULL döndüğü an kiracı duvarı o kullanıcı için tümüyle kapanır.
--
-- Bunun sonucu: pasife alınan antrenör giriş YAPABİLİR ama tek bir sporcu,
-- yoklama, telefon numarası veya mesaj göremez. Panel de onu 'hesapsiz'
-- olarak karşılar (admin-panel/lib/auth/dal.ts → erisimSebebi).
create or replace function private.current_kulup_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.kulup_id
    from public.profiles p
    join public.kulup k on k.id = p.kulup_id
   where p.id = auth.uid()
     and p.aktif                -- 0029: erişimi kaldırılmış kullanıcı
     and k.durum = 'aktif'      -- 0023: aboneliği durmuş kulüp
$$;


-- ===========================================================================
-- 4) YÖNETİCİNİN PERSONELİ PASİFE ALMA YETKİSİ
-- ===========================================================================
-- profiles üzerinde bugüne kadar YALNIZCA "kendi profilini günceller"
-- politikası vardı; yönetici hiç kimseyi güncelleyemiyordu. Bu yüzden panelde
-- personel çıkarma ekranı da yazılamıyordu.
--
-- ⚠ ROL/KULÜP DEĞİŞTİRME BU POLİTİKAYLA AÇILMIYOR: on_profile_role_protect
-- trigger'ı (13.3) `authenticated` rolündeki isteklerde role/sube_id/kulup_id
-- değişimini reddetmeye devam ediyor. Yani yönetici yalnızca aktif/pasif
-- yapabilir; kimseyi yönetici İLAN EDEMEZ. Rol yükseltme koruması korunuyor.
drop policy if exists "profiles: yönetici personeli pasife alır" on public.profiles;
create policy "profiles: yönetici personeli pasife alır" on public.profiles for update
  using (
    private.current_profile_role() = 'yonetici'
    -- Yönetici kendini pasife alamaz: kulübü kilitlemenin en kolay yolu bu olurdu.
    and id <> auth.uid()
  )
  with check (
    private.current_profile_role() = 'yonetici'
    and id <> auth.uid()
  );


-- ===========================================================================
-- 5) public.hesabimi_sil()
-- ===========================================================================
-- Kullanıcının KENDİ hesabını silmesi. Parametre YOK — hedef her zaman
-- auth.uid(). Bu bilinçli: parametre alsaydı "başkasının hesabını sil" ucu
-- olurdu ve tek bir yetki hatası tüm kullanıcıları silinebilir yapardı.
--
-- SECURITY DEFINER gerekli çünkü:
--   · auth.users tablosuna normal kullanıcının yazma yetkisi yok,
--   · silinen satırlar (konuşmalar, bağlar) RLS altında kısmen görünmez.
-- Fonksiyon postgres olarak koştuğu için RLS'i baypas eder; bu yüzden gövdedeki
-- HER İFADE auth.uid() ile sınırlandırılmıştır.
--
-- NE SİLİNİR / NE KALIR
--   Silinir : giriş hesabı (auth.users), profil satırı, push cihaz kayıtları,
--             veli↔sporcu bağı, kişinin konuşmaları ve mesajları.
--   Kalır   : sporcu kaydı (kulübün kaydı), ödemeler ve yoklama (mali/hukuki
--             kayıt), hakediş ve rezervasyon geçmişi — bunlarda kişi bağı NULL'a
--             düşer. Bu ayrım KVKK'nın "saklama yükümlülüğü olan veri hariç"
--             istisnasının karşılığı.
--
-- REDDEDİLEN DURUM: kulübün son yöneticisi. Silinirse kulüp panelsiz kalır ve
-- kurtarma yolu yalnızca SQL olur; kullanıcıya ne yapması gerektiği söyleniyor.
create or replace function public.hesabimi_sil()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := auth.uid();
  v_rol   app_role;
  v_kulup uuid;
  v_diger int;
begin
  if v_id is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  select p.role, p.kulup_id into v_rol, v_kulup
    from public.profiles p where p.id = v_id;

  if v_rol is null then
    raise exception 'Profil bulunamadı.';
  end if;

  -- Son yönetici koruması.
  if v_rol = 'yonetici' then
    select count(*) into v_diger
      from public.profiles
     where role = 'yonetici' and kulup_id = v_kulup and aktif and id <> v_id;

    if v_diger = 0 then
      raise exception 'Kulübün tek yöneticisi olduğunuz için hesabınız silinemiyor. Önce başka bir yönetici davet edin, sonra tekrar deneyin.';
    end if;
  end if;

  -- --- Kişiye ait bağlar ---------------------------------------------------
  delete from public.push_token   where user_id = v_id;
  delete from public.veli_sporcu  where veli_id = v_id;
  delete from public.sporcu_antrenor where antrenor_id = v_id;
  -- Konuşmalar cascade ile mesajları da götürür (bölüm 1.1).
  delete from public.konusma where veli_id = v_id or antrenor_id = v_id;
  -- Kullanılmamış davetler denetim izi taşımıyor.
  delete from public.davet where olusturan_id = v_id and kullanildi_at is null;

  -- --- Kulübe ait kayıtlarda kişi bağını boşalt ----------------------------
  -- Bu satırlar FK'de zaten nullable; burada AÇIKÇA boşaltılıyorlar ki silme
  -- sırasının ne yaptığı fonksiyonun gövdesinden okunabilsin.
  -- ⚠ BU LİSTE ŞEMADAN DOĞRULANDI, tahminle yazılmadı. İlk yazımda antrenman ve
  -- mac_kadro da buradaydı; o tablolarda olusturan_id KOLONU YOK ve fonksiyon
  -- çalışma anında "column does not exist" ile patlıyordu. Yeni bir kişi bağı
  -- kolonu eklenirse buraya da eklenmeli, aksi halde silinen kullanıcı o
  -- tablodan FK ile geri bağlı kalır.
  update public.duyuru                 set olusturan_id = null where olusturan_id = v_id;
  update public.etkinlik               set olusturan_id = null where olusturan_id = v_id;
  update public.gider                  set olusturan_id = null where olusturan_id = v_id;
  update public.fatura                 set olusturan_id = null where olusturan_id = v_id;
  update public.basvuru                set created_by   = null where created_by   = v_id;
  update public.gelisim_degerlendirme  set antrenor_id  = null where antrenor_id  = v_id;
  update public.davet                  set olusturan_id = null where olusturan_id = v_id;

  -- --- Giriş hesabı --------------------------------------------------------
  -- profiles satırı buradan cascade ile gider (profiles.id → auth.users(id)
  -- on delete cascade), hakediş/rezervasyon/paket bağları da bölüm 1'deki
  -- set null davranışıyla boşalır.
  --
  -- ⚠ MEVCUT BELİRTEÇ: silinen kullanıcının elindeki JWT süresi dolana kadar
  -- (varsayılan 1 saat) teknik olarak geçerlidir. Pratikte hiçbir şey göremez
  -- çünkü profiles satırı yok → current_kulup_id() NULL → kiracı duvarı kapalı.
  -- İstemci ayrıca signOut çağırıyor.
  delete from auth.users where id = v_id;
end;
$$;

-- Yalnızca oturum açmış kullanıcı çağırabilir. anon'a VERİLMEZ: kimliği
-- olmayan bir isteğin silecek bir hesabı yok, uç açıkta durmasın.
revoke execute on function public.hesabimi_sil() from public;
revoke execute on function public.hesabimi_sil() from anon;
grant  execute on function public.hesabimi_sil() to authenticated;


-- ===========================================================================
-- 6) DOĞRULAMA
-- ===========================================================================
--   -- FK davranışları (hakedis 'a' = NO ACTION değil 'n' = SET NULL olmalı)
--   select conname, confdeltype from pg_constraint
--    where conname in ('hakedis_antrenor_id_fkey','konusma_veli_id_fkey');
--     → hakedis: n (set null), konusma: c (cascade)
--
--   -- Pasif kullanıcı hiçbir şey görmemeli:
--   update public.profiles set aktif = false where id = '<antrenor-uuid>';
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<antrenor-uuid>","role":"authenticated"}',true);
--   select count(*) from public.sporcular;   → 0
--
--   -- Hesap silme (kendi oturumunda):
--   select public.hesabimi_sil();
--   select count(*) from auth.users where id = '<uuid>';   → 0
-- ===========================================================================
