-- =============================================================================
-- 02_katalog.sql — Başlangıç kataloğu (her kulüpte gerekli çekirdek veri)
-- =============================================================================
--
-- Bu dosya, 01_sema.sql çalıştırıldıktan SONRA çalıştırılır ve yeni kurulan HER
-- kulüpte bulunması gereken, kulüptan bağımsız başlangıç verisini yükler.
-- Karşıyaka Spor Okulu'na (ya da başka herhangi bir kulübe) özgü hiçbir kayıt
-- burada YOKTUR — onlar demo/karsiyaka_demo.sql dosyasındadır.
--
-- Kaynak migration'lar: 0004 (brans, hizmet_turu), 0007 (aidat_plani),
-- 0008 (beceri), 0015 (kurum_ayarlari), 0019 (mobil_ozellik).
--
-- IDEMPOTENT: her insert `on conflict ... do nothing` ile yazılmıştır, dosya
-- birden fazla kez çalıştırılabilir; var olan satırlar EZİLMEZ (yani kulüp
-- panelden bir bayrağı kapattıysa bu dosyayı tekrar çalıştırmak onu geri açmaz).
--
-- ÇALIŞTIRMA SIRASI:
--   1) kurulum/01_sema.sql
--   2) kurulum/02_katalog.sql   <-- bu dosya
--   3) (yalnızca demo/satış ortamında) demo/karsiyaka_demo.sql
--
-- SABİT UUID UYARISI: brans ve beceri satırlarının id'leri BİLİNÇLİ olarak
-- sabittir. Demo verisi ve olası ileri seed'ler bu id'lere doğrudan referans
-- verir; değiştirmeyin.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) BRANŞLAR  (kaynak: 0004_kurum_ve_sporcular.sql)
--    Kulübün sunabileceği spor branşlarının ana kataloğu. Bir kulübün hangi
--    branşları AÇTIĞI ayrı bir tabloda tutulur (kurum_brans_secimi) — burada
--    yalnızca seçilebilir havuz tanımlanır.
--    Kulüp buraya kendi branşını ekleyebilir; yeni satırlar gen_random_uuid()
--    ile id alır, aşağıdaki sabit id'lere dokunmaya gerek yoktur.
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
--    branşları için buraya satır ekleyerek doldurmalıdır. Örnek desen:
--      insert into beceri (ad, brans_id, sira) values
--        ('Pas Tekniği', '20000000-0000-0000-0000-000000000001', 0);
-- -----------------------------------------------------------------------------
insert into beceri (id, ad, brans_id, sira) values
  ('70000000-0000-0000-0000-000000000001', 'Şut Tekniği', '20000000-0000-0000-0000-000000000002', 0),
  ('70000000-0000-0000-0000-000000000002', 'Top Sürme',   '20000000-0000-0000-0000-000000000002', 1),
  ('70000000-0000-0000-0000-000000000003', 'Kondisyon',   '20000000-0000-0000-0000-000000000002', 2),
  ('70000000-0000-0000-0000-000000000004', 'Takım Oyunu', '20000000-0000-0000-0000-000000000002', 3)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 4) MOBİL ÖZELLİK BAYRAKLARI  (kaynak: 0019_mobil_ozellik.sql)
--    Web panelden aç/kapa yapılan, mobil uygulamanın açılışta okuduğu bayraklar.
--    Bayrak SETİ sabittir — yeni bayrak eklemek mobil tarafta karşılığı olan kod
--    gerektirdiği için ayrı bir migration ile gelir; panel yalnızca aktif/pasif
--    değiştirir. Çekirdek akışlar (ana sayfa, yoklama, ödemeler, duyurular,
--    profil) bilinçli olarak bayraklanmamıştır.
--
--    Tüm bayraklar yeni kurulumda AÇIK gelir; kulüp kullanmadığı modülü panelden
--    kapatır. (Mobil taraf tabloyu okuyamazsa fail-open davranır: her şey açık.)
-- -----------------------------------------------------------------------------
insert into mobil_ozellik (anahtar, ad, aciklama, aktif) values
  ('mesajlar',      'Mesajlaşma',    'Veli ↔ antrenör mesajlaşma sekmeleri', true),
  ('magaza',        'Mağaza',        'Veli tarafındaki mağaza sekmesi ve sipariş akışı', true),
  ('servis',        'Servis Takibi', 'Veli tarafındaki servis sekmesi', true),
  ('bireysel_ders', 'Bireysel Ders', 'Veli bireysel ders kartı + antrenör takvim/kazanç ekranları', true),
  ('etkinlikler',   'Etkinlikler',   'Veli tarafındaki etkinlikler/maç takvimi ekranı', true)
on conflict (anahtar) do nothing;


-- -----------------------------------------------------------------------------
-- 5) KURUM AYARLARI — tekil (singleton) satır  (kaynak: 0015_muhasebeci_rolu_kurum_ayarlari.sql)
--    Tablo `id boolean primary key default true check (id)` ile tanımlıdır:
--    yalnızca TEK satır var olabilir. Panel > Ayarlar > Genel bu satırı günceller.
--
--    NOT: 0015'te bu satır kolon varsayılanlarıyla (`values (true)`) ekleniyordu;
--    kulup_adi'nın şema varsayılanı 'Karşıyaka Spor Okulu' olduğu için yeni bir
--    müşteride yanlış isim görünürdü. Burada bilinçli olarak NÖTR bir yer tutucu
--    yazılıyor — kulüp ilk girişte panelden kendi bilgilerini doldurur.
--    telefon / eposta / adres kasıtlı olarak boş (null) bırakıldı.
-- -----------------------------------------------------------------------------
insert into kurum_ayarlari (id, kulup_adi, para_birimi) values
  (true, 'Spor Kulübü', 'TRY')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 6) MERKEZ ŞUBE — ZORUNLU
--
--    Kulübün en az bir şubesi OLMAK ZORUNDA: grup, sporcular, aidat_plani,
--    servis_rota, urun, basvuru ve profiles tablolarının tamamı sube'ye FK ile
--    bağlı. Ayrıca mobil uygulama bugün tek şube varsayımıyla çalışıyor ve bu
--    id'yi koda gömülü tutuyor:
--
--      app/src/data/kurumRepo.ts → MERKEZ_SUBE_ID = '10000000-...-000000000001'
--
--    Bu satır olmadan Kurum Branşları ekranı yalnızca boş dönmez, branş açmaya
--    çalışıldığında FK ihlaliyle (23503) YAZMA HATASI verir. Bu yüzden burada
--    varsayılan olarak oluşturuluyor — `ad` değerini kulübe göre değiştirin
--    (panelden de değiştirilebilir).
--
--    Çoklu şube desteği geldiğinde bu sabit id kaldırılacak.
-- -----------------------------------------------------------------------------
insert into sube (id, ad, alt_bilgi) values
  ('10000000-0000-0000-0000-000000000001', 'Merkez', null)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 7) AİDAT PLANLARI — İSTEĞE BAĞLI ŞABLON  (kaynak: 0007_odeme.sql)
--
--    ⚠ Bu bölüm VARSAYILAN OLARAK ÇALIŞMAZ (yorumdadır). Her kulüp kendi aidat
--      planlarını panelden tanımlar. Aşağıdaki satırlar yalnızca "bir plan kaydı
--      neye benzer" sorusunu gösteren örnektir.
--
--    NEDEN YORUMDA: bu tutarlar Karşıyaka'nın gerçek fiyatları ve `beklenen`
--    değerleri o kulübün sporcu sayısından türetilmiş ciro hedefleridir. Açık
--    bırakılsaydı yeni bir müşteri, panelin Muhasebe > Aidatlar ve Mali Rapor
--    ekranlarında kendisine ait olmayan 4 plan ve ~114.550 TL'lik sahte bir
--    tahsilat beklentisi görürdü.
--
--    Kolonlar:
--      ad       : planın adı (ör. "Basketbol Aylık")
--      alt      : listede ikinci satırda görünen açıklama
--      fiyat    : sporcu başına aylık tutar
--      beklenen : o plandan ay içinde beklenen toplam tahsilat (raporlama için)
--      sube_id  : plan şubeye özelse doldurulur; null = tüm kulüp
-- -----------------------------------------------------------------------------
-- insert into aidat_plani (ad, alt, fiyat, beklenen, sube_id) values
--   ('Basketbol Aylık', 'U12-U14 · haftada 3 gün', 1250, 43750, null);


-- =============================================================================
-- Katalog sonu. Bir sonraki adım:
--   • Gerçek müşteri kurulumu  → kurulum/03_ilk_yonetici.sql (ZORUNLU — o dosya
--     olmadan panele girebilecek hiçbir hesap oluşmaz, kurulum kilitli kalır).
--   • Demo / satış ortamı      → önce 03_ilk_yonetici.sql, sonra
--     demo/karsiyaka_demo.sql.
-- =============================================================================
