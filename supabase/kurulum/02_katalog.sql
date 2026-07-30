-- =============================================================================
-- 02_katalog.sql — PLATFORM KATALOĞU (tüm kulüplerde ortak, kulüpten bağımsız)
-- =============================================================================
--
-- Bu dosya 01_sema.sql'den SONRA, kulüp kaydı açılmadan ÖNCE çalıştırılır ve
-- sistemin tamamında ortak olan seçilebilir havuzları yükler: branşlar, hizmet
-- türleri ve beceri başlıkları. Karşıyaka Spor Okulu'na (ya da başka herhangi
-- bir kulübe) özgü hiçbir kayıt burada YOKTUR — onlar demo/karsiyaka_demo.sql
-- dosyasındadır.
--
-- Kaynak migration'lar: 0004 (brans, hizmet_turu), 0008 (beceri).
--
-- =============================================================================
-- ⚠ ÇOK KİRACILILIKTA NE DEĞİŞTİ (0021 + 0022 sonrası)
-- =============================================================================
-- 0021 tüm tablolara kulup_id ekledi ve tabloları ikiye ayırdı:
--
--   · KİRACI TABLOLARI (41) — kulup_id NOT NULL. Bir kulübe AİT kayıtlardır:
--     sube, kurum_ayarlari, mobil_ozellik, aidat_plani, sporcular, ...
--     Bunlar kulüp kaydı AÇILMADAN eklenemez (23502 NOT NULL ihlali), bu yüzden
--     ESKİ 02_katalog.sql'de bulunan mobil_ozellik / kurum_ayarlari / merkez şube
--     bölümleri BU DOSYADAN ÇIKARILDI ve 03_kulup_olustur.sql'e taşındı.
--
--   · PLATFORM KATALOĞU (3) — brans, hizmet_turu, beceri. kulup_id NULLABLE:
--       kulup_id IS NULL  → platform kataloğu: HER kulüp okur, HİÇBİR kulüp
--                           değiştiremez veya silemez (0021 ŞABLON-B: okuma ile
--                           yazma ayrı restrictive politikalara bölünmüştür).
--       kulup_id DOLU     → o kulübe özel satır; kulüp panelden kendi branşını
--                           veya becerisini ekleyince böyle kaydedilir.
--
-- Aşağıdaki insert'ler kulup_id yazmaz. Kolonun varsayılanı
-- `private.current_kulup_id()`; bu dosya SQL Editor'da `postgres` rolüyle koştuğu
-- için auth.uid() NULL'dur, fonksiyon NULL döner ve satırlar tam da istendiği gibi
-- PLATFORM KATALOĞU olarak (kulup_id = NULL) yazılır. Yani dosyada tek karakter
-- değişmeden çok kiracılı davranış elde edilir.
--
-- ⚠ Bu dosyayı kulüp panelinden veya bir kullanıcı oturumuyla ÇALIŞTIRMAYIN:
--   o durumda auth.uid() dolu olur ve satırlar o kulübe özel yazılır.
--
-- =============================================================================
-- ÇALIŞTIRMA SIRASI
--   1) kurulum/01_sema.sql
--   2) kurulum/02_katalog.sql          <-- bu dosya
--   3) kurulum/03_kulup_olustur.sql    kulüp + şube + ayarlar + bayraklar
--   4) İLK YÖNETİCİNİN HESABINI AÇIN (uygulamadan "Kayıt Ol" ya da
--      Supabase > Authentication > Users > "Add user")
--   5) kurulum/04_ilk_yonetici.sql
--   6) (yalnızca demo/satış ortamında) demo/karsiyaka_demo.sql
--
-- ✔ Bu altı adım YETERLİDİR: 01_sema.sql migration 0001–0025'in nihai halini
--   içerir. app/supabase/migrations/ altındaki dosyaları ayrıca çalıştırmayın.
--
-- IDEMPOTENT: her insert `on conflict ... do nothing` ile yazılmıştır, dosya
-- birden fazla kez çalıştırılabilir; var olan satırlar EZİLMEZ.
--
-- SABİT UUID UYARISI: brans ve beceri satırlarının id'leri BİLİNÇLİ olarak
-- sabittir. Demo verisi ve 03_kulup_olustur.sql bu id'lere doğrudan referans
-- verir; değiştirmeyin.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) BRANŞLAR  (kaynak: 0004_kurum_ve_sporcular.sql)
--    Kulüplerin sunabileceği spor branşlarının ortak kataloğu. Bir kulübün hangi
--    branşları AÇTIĞI ayrı bir tabloda tutulur (kurum_brans_secimi) — burada
--    yalnızca seçilebilir havuz tanımlanır.
--    Kulüp buraya kendi branşını panelden ekleyebilir; o satır kulup_id'si dolu
--    olarak yazılır ve yalnızca o kulüpte görünür.
-- -----------------------------------------------------------------------------
insert into brans (id, ad, ikon) values
  ('20000000-0000-0000-0000-000000000001', 'Futbol', '⚽'),
  ('20000000-0000-0000-0000-000000000002', 'Basketbol', '🏀'),
  ('20000000-0000-0000-0000-000000000003', 'Voleybol', '🏐'),
  ('20000000-0000-0000-0000-000000000004', 'Tenis', '🎾'),
  ('20000000-0000-0000-0000-000000000005', 'Yüzme', '🏊'),
  ('20000000-0000-0000-0000-000000000006', 'Jimnastik', '🤸'),
  ('20000000-0000-0000-0000-000000000007', 'Bale', '🩰'),
  ('20000000-0000-0000-0000-000000000008', 'Satranç', '♟️')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2) HİZMET TÜRLERİ  (kaynak: 0004_kurum_ve_sporcular.sql)
--    Kurulum sihirbazında kulübün "ne tür bir işletme olduğunu" seçtiği liste.
--    Seçim kurum_hizmet_turu_secimi tablosunda saklanır.
-- -----------------------------------------------------------------------------
insert into hizmet_turu (id, ad, aciklama, ikon) values
  ('30000000-0000-0000-0000-000000000001', 'Çok Branşlı Spor Okulu', 'Birden fazla branş tek çatı altında', '🏟️'),
  ('30000000-0000-0000-0000-000000000002', 'Fitness / Spor Salonu', 'Üyelik tabanlı salon ve stüdyolar', '🏋️')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 3) BECERİLER  (kaynak: 0008_yoklama_gelisim.sql)
--    Antrenörün gelişim değerlendirmesinde 1-5 arası puanladığı beceri başlıkları.
--    `sira` kolonu ekrandaki sıralamayı belirler (0'dan başlar).
--
--    DİKKAT: migration'larda YALNIZCA Basketbol branşı için beceri tanımlıydı.
--    Diğer branşlarda gelişim ekranı boş beceri listesiyle açılır — kulüp kendi
--    branşları için panelden satır eklemelidir (o satırlar kulübe özel olur).
--    Platform kataloğuna yeni bir beceri eklemek isteniyorsa buraya, postgres
--    rolüyle, aynı desende yazılır:
--      insert into beceri (id, ad, brans_id, sira) values
--        ('70000000-0000-0000-0000-00000000000X', 'Pas Tekniği',
--         '20000000-0000-0000-0000-000000000001', 0)
--      on conflict (id) do nothing;
-- -----------------------------------------------------------------------------
insert into beceri (id, ad, brans_id, sira) values
  ('70000000-0000-0000-0000-000000000001', 'Şut Tekniği', '20000000-0000-0000-0000-000000000002', 0),
  ('70000000-0000-0000-0000-000000000002', 'Top Sürme',   '20000000-0000-0000-0000-000000000002', 1),
  ('70000000-0000-0000-0000-000000000003', 'Kondisyon',   '20000000-0000-0000-0000-000000000002', 2),
  ('70000000-0000-0000-0000-000000000004', 'Takım Oyunu', '20000000-0000-0000-0000-000000000002', 3)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- DOĞRULAMA — satırların PLATFORM kataloğu olarak yazıldığını kanıtlar.
-- kulup_id'si dolu bir satır çıkarsa dosya yanlış bağlamda (bir kullanıcı
-- oturumuyla) çalıştırılmış demektir; o satırlar yalnızca o kulüpte görünür.
-- -----------------------------------------------------------------------------
do $$
declare
  v_kacak int;
begin
  select count(*) into v_kacak from (
    select 1 from brans       where kulup_id is not null
    union all select 1 from hizmet_turu where kulup_id is not null
    union all select 1 from beceri      where kulup_id is not null
  ) x;

  if v_kacak > 0 then
    raise warning 'Katalogda kulübe özel % satır var. Bu dosya postgres rolüyle (SQL Editor) çalıştırılmalıydı; kulup_id dolu satırlar yalnızca o kulüpte görünür.', v_kacak;
  else
    raise notice 'Platform kataloğu hazır: brans/hizmet_turu/beceri satırlarının tamamı kulup_id = NULL.';
  end if;
end $$;


-- =============================================================================
-- Katalog sonu. Bir sonraki adım ZORUNLU:
--   kurulum/03_kulup_olustur.sql — kulüp kaydını, merkez şubesini, kurum
--   ayarlarını ve mobil özellik bayraklarını oluşturur. O dosya çalıştırılmadan
--   hiçbir kullanıcı hesabı açılamaz: handle_new_user() sistemde kulüp yoksa
--   açık bir exception atar.
-- =============================================================================
