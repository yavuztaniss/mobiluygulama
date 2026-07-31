-- ===========================================================================
-- 0037 — Güvenlik denetimi düzeltmeleri (F1, F2, F3 + iki gözlem)
-- ===========================================================================
-- Periyodik güvenlik denetiminin ölçerek bulduğu üç sömürülebilir açık ve
-- ikisi para akışına dokunan iki gözlem.
--
-- BÖLÜMLER
--   1) F1 — Yönetici daveti kilidi iki yoldan aşılıyordu
--   2) F2 — Ön ödemeli paket düşümü sunucuda hiç doğrulanmıyordu
--   3) F3 — hesabimi_sil() ödeme kaydı olan hesapta patlıyordu
--   4) Gözlem — antrenör kendi ücret alanlarını değiştirebiliyor
--   5) Gözlem — anon başvuruda durum/kulup_id yazabiliyor
--   6) Doğrulama
--
-- ÇALIŞTIRMA: 0036'dan sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) F1 — YÖNETİCİ DAVETİ KİLİDİ İKİ YOLDAN AŞILIYORDU
-- ===========================================================================
-- 0034 ve 0035 aynı kuralı iki kez yanlış yerden okudu. Kalan iki delik:
--
--   (a) TETİKLEYİCİ YALNIZCA INSERT'TEYDİ. davet politikası `for all` olduğu
--       için kulüp yöneticisi antrenör daveti açıp sonra satırı UPDATE ile
--       rol='yonetici' yapabiliyordu. Ölçüldü: açılan hesabın profili gerçekten
--       role=yonetici olarak oluştu.
--
--   (b) olusturan_id İSTEMCİ TARAFINDAN YAZILABİLİR. 0035 yetkiyi o kolondan
--       okuyordu. Üstelik platform konsolunun o kulübe çıkardığı İLK yönetici
--       daveti kulübün kendi davet tablosunda duruyor ve içinde platform_admin'in
--       UUID'si yazıyor — kulüp yöneticisi onu okuyup sahte davet açabiliyordu.
--
-- DOĞRU KATMAN: KURALI SATIRIN `rol` ALANINA, RLS WITH CHECK İLE BAĞLA.
--   RLS yalnızca `authenticated`'a uygulanır ve INSERT ile UPDATE'i BİRLİKTE
--   kapsar — (a) ve (b) aynı anda kapanıyor, üstelik olusturan_id'ye hiç
--   güvenmeden. service_role ve postgres RLS'i baypas ettiği için platform
--   konsolu ve seed etkilenmiyor.
--
-- Tetikleyici KALIYOR ama görevi değişiyor: service_role yolunu (panelin kendi
-- davet ucu) kapatmak ve reddi ANLAŞILIR bir mesaja çevirmek. İki katman
-- birbirinin yedeği:
--   · authenticated  → RLS kapatıyor (olusturan_id ne olursa olsun)
--   · service_role   → tetikleyici olusturan_id'nin rolüne bakıyor; o yolda
--                      olusturan_id'yi İSTEMCİ DEĞİL SUNUCU KODU yazıyor
--                      (route `olusturan_id: user.id` diyor), dolayısıyla
--                      orada güvenilir bir değer.

drop policy if exists "davet: yönetici kendi kulübünün davetlerini yönetir" on public.davet;
create policy "davet: yönetici kendi kulübünün davetlerini yönetir" on public.davet for all
  using (private.current_profile_role() = 'yonetici')
  with check (
    private.current_profile_role() = 'yonetici'
    and (
      -- Yönetici olmayan roller serbest.
      rol <> 'yonetici'
      -- Yönetici rolü yalnızca kilidi AÇILMIŞ kulüpte.
      or coalesce(
           (select k.yonetici_davet_kilitli from public.kulup k where k.id = davet.kulup_id),
           true
         ) = false
    )
  );

create or replace function public.protect_yonetici_daveti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kilitli   boolean;
  v_olusturan app_role;
begin
  if new.rol <> 'yonetici' then
    return new;
  end if;

  select k.yonetici_davet_kilitli into v_kilitli
    from public.kulup k where k.id = new.kulup_id;

  if coalesce(v_kilitli, true) = false then
    return new;
  end if;

  -- DENENİP KALDIRILAN KONTROL: "olusturan_id auth.uid() olmalı".
  -- Amacı (b) deliğine ikinci bir kapak koymaktı ama PLATFORM KONSOLUNU
  -- KİLİTLİYOR: service_role isteği bir kullanıcı JWT'si taşıyorsa auth.uid()
  -- dolu olur, olusturan_id ise platform_admin'dir ve eşleşmez. Testte tam
  -- olarak bu oldu — kontrol eklendiği turda konsol kilitlendi.
  --
  -- Kaldırılabilmesinin sebebi: koruduğu senaryoyu RLS ZATEN kapatıyor.
  -- Kilitli bir kulüpte authenticated bir istek rol='yonetici' satırını ne
  -- INSERT ne UPDATE edebiliyor — olusturan_id'ye ne yazdığından bağımsız.
  -- Kilit açıksa yönetici daveti zaten serbest; sahtecilikten kazanılan bir
  -- şey yok.
  -- ⚠ Bölüm 1'deki RLS politikası gevşetilirse bu kapak geri gerekir.

  select p.role into v_olusturan
    from public.profiles p where p.id = new.olusturan_id;

  if v_olusturan = 'platform_admin' then
    return new;
  end if;

  raise exception 'Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından açılabilir. Yeni yönetici için sağlayıcınızla iletişime geçin.'
    using errcode = 'insufficient_privilege';
end;
$$;

-- (a) DÜZELTMESİ: UPDATE de kapsanıyor.
drop trigger if exists on_davet_yonetici_kontrol on public.davet;
create trigger on_davet_yonetici_kontrol
  before insert or update on public.davet
  for each row execute procedure public.protect_yonetici_daveti();


-- ===========================================================================
-- 2) F2 — ÖN ÖDEMELİ PAKET DÜŞÜMÜ SUNUCUDA DOĞRULANMIYORDU
-- ===========================================================================
-- 0036 TUTARI sunucuya taşıdı ama HAKKIN VAR OLUP OLMADIĞINI taşımadı.
-- Paketten düşme işlemi istemcide, rezervasyondan AYRI bir istekte yapılıyordu
-- (bireyselRepo: önce insert, sonra `update bireysel_paket set kalan`).
-- İstemci ikinci isteği atlayabiliyordu.
--
-- Ölçüldü: 3 paket rezervasyonu açıldı, kalan 6'da kaldı; paket tükendikten
-- sonra (kalan = 0) bile geçti. Sonuç: veli bir kez paket alır, sınırsız ders
-- rezerve eder; her ders antrenörün hakedişine girer. Kulüp tahsil etmediği
-- dersi verir ve üstüne pay öder.
--
-- ÇÖZÜM: DÜŞÜM REZERVASYONLA AYNI İŞLEMDE, SUNUCUDA.
--   Tek transaction, `for update` ile satır kilidi — eşzamanlı iki rezervasyon
--   aynı son dersi kullanamıyor. İstemcinin atlayabileceği bir adım kalmıyor.
create or replace function public.paket_dus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kalan   int;
  v_sporcu  uuid;
  v_ant     uuid;
begin
  if new.odeme_tipi <> 'paket' then
    return new;
  end if;

  if new.paket_id is null then
    raise exception 'Paket dersi için paket seçilmedi.';
  end if;

  -- FOR UPDATE: satırı kilitle. Kilitsiz okunsaydı iki eşzamanlı rezervasyon
  -- aynı "kalan = 1" değerini görüp ikisi de geçerdi.
  select bp.kalan, bp.sporcu_id, bp.antrenor_id
    into v_kalan, v_sporcu, v_ant
    from public.bireysel_paket bp
   where bp.id = new.paket_id
     for update;

  if v_kalan is null then
    raise exception 'Paket bulunamadı.';
  end if;

  -- PAKET BU SPORCUNUN MU? paket_id'de sporcuya bağlayan bir FK yoktu; başka
  -- bir sporcunun paketini göstererek ders almak mümkündü.
  if v_sporcu is distinct from new.sporcu_id then
    raise exception 'Bu paket bu sporcuya ait değil.';
  end if;

  -- PAKET BU ANTRENÖRÜN MÜ? Paket belirli bir antrenörle alınıyor; başka bir
  -- antrenörün dersine saydırmak paketin anlamını bozar.
  if v_ant is not null and v_ant is distinct from new.antrenor_id then
    raise exception 'Bu paket başka bir antrenör için alınmış.';
  end if;

  if v_kalan <= 0 then
    raise exception 'Paketinizde kalan ders yok.';
  end if;

  update public.bireysel_paket set kalan = v_kalan - 1 where id = new.paket_id;
  return new;
end;
$$;

drop trigger if exists on_rezervasyon_paket_dus on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_dus
  before insert on public.bireysel_rezervasyon
  for each row execute procedure public.paket_dus();

-- İADE: ders verilmediyse hak geri gelmeli.
-- Antrenör reddederse ya da rezervasyon iptal edilirse veli dersini
-- kaybetmemeli. ÇİFT İADE KORUMASI: yalnızca iade edilmemiş bir durumdan
-- iade edilen bir duruma GEÇİŞTE çalışıyor.
create or replace function public.paket_iade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.odeme_tipi <> 'paket' or new.paket_id is null then
    return new;
  end if;

  if new.durum in ('reddedildi', 'iptal')
     and old.durum not in ('reddedildi', 'iptal') then
    -- kalan, toplam'ı aşmasın: bozuk bir veri düzeltmesi paketi şişirmesin.
    update public.bireysel_paket
       set kalan = least(kalan + 1, toplam)
     where id = new.paket_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_rezervasyon_paket_iade on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_iade
  after update on public.bireysel_rezervasyon
  for each row execute procedure public.paket_iade();

-- İSTEMCİNİN PAKET YAZMA YETKİSİ KALDIRILIYOR.
-- Bu politika yalnızca istemci tarafındaki düşümü ayakta tutmak için vardı;
-- düşüm artık sunucuda. Politika kalsaydı veli `kalan` alanını doğrudan
-- yükseltebilirdi — düşümü sunucuya taşımanın anlamı kalmazdı.
drop policy if exists "bireysel_paket: veli kendi sporcusunun paketini günceller" on public.bireysel_paket;


-- ===========================================================================
-- 3) F3 — hesabimi_sil() ÖDEME KAYDI OLAN HESAPTA PATLIYORDU
-- ===========================================================================
-- odeme.olusturan_id boşaltılacaklar listesinde yoktu; FK'si NO ACTION olduğu
-- için ödeme kaydeden bir yönetici/muhasebeci hesabını silemiyordu (23503).
-- Apple 5.1.1(v) o hesaplar için fiilen çalışmıyordu.
--
-- LİSTE ARTIK ELLE TUTULMUYOR. 0029'un kendi notu bu hatanın tekrar edeceğini
-- söylüyordu: yeni bir kişi-bağı kolonu eklendiğinde listeye yazmayı unutmak
-- işlevi sessizce kırıyor. Aşağıdaki döngü profiles'a NO ACTION ile bağlı
-- NULLABLE her kolonu pg_constraint'ten bulup boşaltıyor — yani şema büyüdükçe
-- kendini güncelliyor.
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
  r       record;
begin
  if v_id is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  select p.role, p.kulup_id into v_rol, v_kulup
    from public.profiles p where p.id = v_id;

  if v_rol is null then
    raise exception 'Profil bulunamadı.';
  end if;

  if v_rol = 'yonetici' then
    select count(*) into v_diger
      from public.profiles
     where role = 'yonetici' and kulup_id = v_kulup and aktif and id <> v_id;

    if v_diger = 0 then
      raise exception 'Kulübün tek yöneticisi olduğunuz için hesabınız silinemiyor. Önce başka bir yönetici davet edin, sonra tekrar deneyin.';
    end if;
  end if;

  -- --- Kişiye ait bağlar ---------------------------------------------------
  delete from public.push_token      where user_id = v_id;
  delete from public.veli_sporcu     where veli_id = v_id;
  delete from public.sporcu_antrenor where antrenor_id = v_id;
  delete from public.konusma         where veli_id = v_id or antrenor_id = v_id;
  delete from public.engelleme       where engelleyen_id = v_id or engellenen_id = v_id;
  delete from public.davet           where olusturan_id = v_id and kullanildi_at is null;

  -- --- Kulübe ait kayıtlarda kişi bağını boşalt ----------------------------
  -- profiles'a NO ACTION ('a') ile bağlı ve NULLABLE olan her kolon.
  -- Elle liste tutmak yerine şemadan türetiliyor (yukarıdaki gerekçe).
  for r in
    select c.relname as tablo, a.attname as kolon
      from pg_constraint fk
      join pg_class     c on c.oid = fk.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = fk.conkey[1]
     where fk.contype = 'f'
       and fk.confrelid = 'public.profiles'::regclass
       and fk.confdeltype = 'a'          -- NO ACTION: cascade/set null zaten kendi halleder
       and array_length(fk.conkey, 1) = 1
       and not a.attnotnull              -- NOT NULL kolona NULL yazılamaz
       and n.nspname = 'public'
  loop
    execute format('update public.%I set %I = null where %I = $1', r.tablo, r.kolon, r.kolon)
      using v_id;
  end loop;

  -- --- BİLEREK SİLİNMEYEN: sporcular.veli_ad / veli_telefon / veli_yakinlik
  -- Çocuk kulübe kayıtlı olduğu sürece kulübün acil durumda ulaşabileceği bir
  -- iletişim bilgisine ihtiyacı var. Bu tercih kullanıcıya açıkça söyleniyor
  -- (src/components/HesabiSil.tsx "KULÜPTE KALACAKLAR" listesi).

  -- --- Giriş hesabı --------------------------------------------------------
  delete from auth.users where id = v_id;
end;
$$;

revoke execute on function public.hesabimi_sil() from public;
revoke execute on function public.hesabimi_sil() from anon;
grant  execute on function public.hesabimi_sil() to authenticated;


-- ===========================================================================
-- 4) GÖZLEM — ANTRENÖR KENDİ ÜCRET ALANLARINI DEĞİŞTİREBİLİYOR
-- ===========================================================================
-- 0036'dan sonra bireysel_antrenor.tek_fiyat / paket_fiyat / paket_ders_sayisi
-- YETKİLİ PARA KAYNAĞI hâline geldi: rezervasyon tutarı oradan yazılıyor.
-- Ama "antrenör kendi kaydını günceller" politikası kolon dondurmuyordu.
-- Antrenör paket_ders_sayisi = 1 yazarsa sonraki her paket dersi bir paketin
-- TAMAMI kadar kaydedilir ve hakedişine öyle girer.
--
-- protect_profile_role deseninin aynısı; SECURITY INVOKER olması ŞART:
-- SECURITY DEFINER olsaydı gövdedeki current_user çağıranı değil sahibini
-- verirdi ve koşul hiç tutmazdı (0036'da tam olarak bu hata yapıldı).
create or replace function public.protect_antrenor_ucret()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and private.current_profile_role() <> 'yonetici' then
    if new.tek_fiyat is distinct from old.tek_fiyat
       or new.paket_fiyat is distinct from old.paket_fiyat
       or new.paket_ders_sayisi is distinct from old.paket_ders_sayisi then
      raise exception 'Ders ücretlerini yalnızca kulüp yöneticisi değiştirebilir.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_bireysel_antrenor_ucret on public.bireysel_antrenor;
create trigger on_bireysel_antrenor_ucret
  before update on public.bireysel_antrenor
  for each row execute procedure public.protect_antrenor_ucret();


-- ===========================================================================
-- 5) GÖZLEM — ANON BAŞVURUDA durum / kulup_id YAZABİLİYOR
-- ===========================================================================
-- kulup_basvurusu INSERT politikası `with check (true)` idi: kimliksiz biri
-- durum='onaylandi' ve gerçek bir kulup_id yazabiliyordu. Konsolda "zaten
-- onaylanmış" görünen sahte başvuru, sosyal mühendislik yüzeyi.
drop policy if exists "kulup_basvurusu: herkes başvuru gönderir" on public.kulup_basvurusu;
create policy "kulup_basvurusu: herkes başvuru gönderir" on public.kulup_basvurusu for insert
  with check (
    durum = 'yeni'
    and kulup_id is null
    and platform_notu is null
  );


-- ===========================================================================
-- 6) DOĞRULAMA
-- ===========================================================================
--   -- F1(a): kulüp yöneticisi antrenör davetini yönetici yapabiliyor mu?
--   update public.davet set rol = 'yonetici' where token = '<antrenor-daveti>';
--     → 0 satır (RLS) ya da exception (trigger)
--
--   -- F1(b): harvest edilmiş platform_admin uuid'siyle davet?
--   insert into public.davet (rol, ad, olusturan_id) values ('yonetici','X','<pa-uuid>');
--     → reddedilmeli
--
--   -- F2: paket düşüyor mu, tükenince duruyor mu?
--   select kalan from public.bireysel_paket where id = '<paket>';
--   insert into public.bireysel_rezervasyon (..., odeme_tipi, paket_id) values (...,'paket','<paket>');
--   select kalan from public.bireysel_paket where id = '<paket>';   → bir eksik
--
--   -- F3: ödeme kaydı olan yönetici hesabını silebiliyor mu?
--   select public.hesabimi_sil();   → hata vermemeli
-- ===========================================================================
