-- =============================================================================
-- karsiyaka_demo.sql — Karşıyaka Spor Okulu DEMO / SATIŞ verisi
-- =============================================================================
--
-- ⛔ GERÇEK MÜŞTERİ KURULUMUNDA BU DOSYAYI ÇALIŞTIRMAYIN.
--    Buradaki her satır (3 şube, 22 sporcu, veliler, ödemeler, duyurular,
--    servis rotaları, siparişler...) yalnızca ürünü göstermek için üretilmiş
--    kurgusal demo verisidir.
--
-- ÖN KOŞULLAR (sırayla):
--   1) kurulum/01_sema.sql   çalıştırılmış olmalı
--   2) kurulum/02_katalog.sql çalıştırılmış olmalı
--      (brans + beceri satırları buradaki kayıtların FK hedefidir)
--   3) ⚠ AŞAĞIDAKİ E-POSTAYA SAHİP BİR SUPABASE AUTH KULLANICISI ZATEN VAR OLMALI
--
-- =============================================================================
-- ⚠⚠ KRİTİK — DEMO HESABI E-POSTASI ⚠⚠
-- =============================================================================
--
--   DEMO HESABI: yavuzttaniss@gmail.com
--
--   Bu dosyadaki veli / antrenör bağları `auth.users` tablosunda bu e-postayı
--   ARAYARAK kurulur (`select ... from auth.users u where u.email = '...'`).
--   Kullanıcı Auth'ta YOKSA bu insert'ler HATA VERMEZ — sessizce 0 satır ekler.
--   Sonuç: uygulama açılır ama veli hiçbir çocuğunu, antrenör hiçbir sporcusunu,
--   kimse mesajlarını/bireysel derslerini göremez. Bu durumda önce hesabı
--   Supabase Auth'ta oluşturun (Authentication > Users > Add user), sonra bu
--   dosyayı yeniden çalıştırın.
--
--   ⚙ E-POSTAYI DEĞİŞTİRMEK İÇİN: aşağıdaki satırlarda geçen
--   'yavuzttaniss@gmail.com' değerini toplu olarak (bul & değiştir) güncelleyin.
--   Toplam 11 yer — bu dosyadaki satır numaraları:
--
--       satır  167 — veli_sporcu           (Ali Kaya bağı)          · Bölüm 4
--       satır  172 — veli_sporcu           (Zeynep Kaya bağı)       · Bölüm 4
--       satır  179 — sporcu_antrenor       (U12 Basketbol roster'ı) · Bölüm 4
--       satır  387 — konusma               (demo sohbet)            · Bölüm 10
--       satır  398 — mesaj                 (sohbetin 3 mesajı)      · Bölüm 10
--       satır  493 — bireysel_antrenor                              · Bölüm 13
--       satır  508 — bireysel_musaitlik                             · Bölüm 13
--       satır  514 — bireysel_paket                                 · Bölüm 13
--       satır  521 — bireysel_rezervasyon  (geçmiş / tamamlandı)    · Bölüm 13
--       satır  527 — bireysel_rezervasyon  (yaklaşan / onay bekl.)  · Bölüm 13
--       satır  541 — antrenor_grup_ucret                            · Bölüm 14
--
--   NOT: Migration 0004 ve 0008'de bu bağlar ESKİ test hesabına
--   ('karsiyaka.test.20260721@gmail.com') kuruluydu. O hesap artık
--   kullanılmıyor; burada hepsi güncel demo hesabına çevrildi.
--
--   NOT 2: Demo hesabı hem VELİ hem ANTRENÖR olarak kullanılıyor (aynı
--   auth kullanıcısı). Bu yüzden `konusma` satırında veli_id = antrenor_id'dir
--   (self-chat) ve mesajın hangi şapkayla yazıldığı `gonderen_rol` kolonundan
--   okunur (bkz. 0011). Gerçek kurulumda iki ayrı hesap olur, bu desen gerekmez.
--
-- =============================================================================
-- ÇALIŞTIRMA NOTU: Bu dosya TEK SEFERLİK, TEMİZ bir veritabanı için yazılmıştır.
-- Sabit id'li insert'lere `on conflict do nothing` eklenmiştir, ancak id'si
-- otomatik üretilen kayıtlar ikinci çalıştırmada ÇOĞALIR:
--   odeme, geçmiş antrenman + yoklama, gider, basvuru, bireysel_rezervasyon,
--   geçmiş maç sonuçları (etkinlik), mesaj, siparis_kalem.
-- `fatura` ise fatura_no unique kısıtına takılıp HATA verir — ve bu insert
-- dosyanın SONUNDA olduğu için, tek transaction'a sarılmayan bir çalıştırmada
-- (ör. `psql -f`) yukarıdaki tablolar çoğalmış halde kalır.
-- Yeniden yüklemek için önce demo tablolarını temizleyin.
--
-- Kaynak migration'lar bölüm başlıklarında belirtilmiştir (0004 → 0014).
-- =============================================================================


-- =============================================================================
-- BÖLÜM 1 — KURUM: şubeler, açılan branşlar, hizmet türü  (kaynak: 0004)
-- =============================================================================
-- Şube id '1000...0001' (Merkez) mobil uygulamada koda gömülüdür
-- (app/src/data/kurumRepo.ts → MERKEZ_SUBE_ID). Değiştirmeyin.
-- alt_bilgi'deki sporcu/branş sayıları statik vitrin metnidir, gerçek satır
-- sayılarıyla eşleşmez (demo amaçlı bilinçli abartı).

insert into sube (id, ad, alt_bilgi) values
  ('10000000-0000-0000-0000-000000000001', 'Merkez',           '184 sporcu · 6 branş'),
  ('10000000-0000-0000-0000-000000000002', 'Karşıyaka Sahil',  '96 sporcu · 4 branş'),
  ('10000000-0000-0000-0000-000000000003', 'Bostanlı',         '58 sporcu · 3 branş')
on conflict (id) do nothing;

-- Merkez şubede açık olan branşlar (Bale ve Satranç hariç 6 branş).
insert into kurum_brans_secimi (sube_id, brans_id)
  select '10000000-0000-0000-0000-000000000001', id from brans
  where ad in ('Futbol', 'Basketbol', 'Voleybol', 'Tenis', 'Yüzme', 'Jimnastik')
on conflict do nothing;

insert into kurum_hizmet_turu_secimi (sube_id, hizmet_turu_id) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- Kurum adını demo kulübüne çevir (02_katalog.sql nötr bir yer tutucu yazar).
update kurum_ayarlari set kulup_adi = 'Karşıyaka Spor Okulu', updated_at = now() where id;


-- =============================================================================
-- BÖLÜM 2 — GRUPLAR  (kaynak: 0004)
-- =============================================================================
insert into grup (id, ad, brans_id, sube_id) values
  ('40000000-0000-0000-0000-000000000001', 'U12 Basketbol',  '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', 'U14 Basketbol',  '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', 'U12 Yüzme',      '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000004', 'U10 Jimnastik',  '20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000005', 'U12 Voleybol',   '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000006', 'U10 Yüzme',      '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000007', 'U11 Basketbol',  '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;


-- =============================================================================
-- BÖLÜM 3 — SPORCULAR  (kaynak: 0004)
-- =============================================================================
-- Toplam 22 satır: Küme A (13) + Zeynep Kaya (1) + Küme B (8).
--
-- ÖNEMLİ TASARIM NOTU ("Ali Kaya problemi"): Küme A ve Küme B'de AYNI İSİMLİ
-- ama FARKLI kişiler var (iki Ali Kaya, iki Zeynep Kaya). Bu bilinçlidir —
-- sistem hiçbir yerde isimle eşleştirme yapmaz, her satır kendi uuid'siyle
-- var olur. Demo sırasında bu ayrımı bozmayın.

-- Küme A — antrenör tarafındaki U12 Basketbol roster'ı (13 sporcu)
insert into sporcular (id, ad, numara, brans_id, grup_id, sube_id, veli_ad, veli_telefon) values
  ('50000000-0000-0000-0000-000000000001', 'Ali Kaya',       7, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Elif Kaya',      '0532 417 88 21'),
  ('50000000-0000-0000-0000-000000000002', 'Emir Şahin',     4, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Burak Şahin',    '0533 221 44 09'),
  ('50000000-0000-0000-0000-000000000003', 'Kerem Yılmaz',   9, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Aslı Yılmaz',    '0535 620 11 47'),
  ('50000000-0000-0000-0000-000000000004', 'Deniz Aksoy',   11, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Merve Aksoy',    '0536 802 93 15'),
  ('50000000-0000-0000-0000-000000000005', 'Arda Güneş',    12, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Hakan Güneş',    '0532 774 20 63'),
  ('50000000-0000-0000-0000-000000000006', 'Yusuf Demirel',  8, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nalan Demirel',  '0538 411 96 27'),
  ('50000000-0000-0000-0000-000000000007', 'Ege Aydın',     23, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Serkan Aydın',   '0533 908 55 12'),
  ('50000000-0000-0000-0000-000000000008', 'Can Polat',     10, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Selin Polat',    '0532 111 22 33'),
  ('50000000-0000-0000-0000-000000000009', 'Baran Koç',      6, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Emre Koç',       '0533 444 55 66'),
  ('5000000a-0000-0000-0000-000000000001', 'Kaan Erdem',    15, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Derya Erdem',    '0535 777 88 99'),
  ('5000000b-0000-0000-0000-000000000001', 'Toprak Sezer',   3, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Onur Sezer',     '0536 123 45 67'),
  ('5000000c-0000-0000-0000-000000000001', 'Umut Karaca',   14, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Gamze Karaca',   '0532 987 65 43'),
  ('5000000d-0000-0000-0000-000000000001', 'Mert Can Öz',    5, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Aylin Öz',       '0533 456 78 90')
on conflict (id) do nothing;

-- Zeynep Kaya — demo veli hesabının İKİNCİ çocuğu (Ali'nin kardeşi, U10 Yüzme).
-- Veli ekranındaki "çocuk değiştirme" akışının çalışması için gereklidir.
insert into sporcular (id, ad, brans_id, grup_id, sube_id, veli_ad, veli_telefon) values
  ('50000016-0000-0000-0000-000000000001', 'Zeynep Kaya', '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Elif Kaya', '0532 417 88 21')
on conflict (id) do nothing;

-- Küme B — yönetici tarafındaki genel roster (8 sporcu, farklı gruplar/branşlar).
-- odeme_durumu burada düz metin kolon olarak tutulur (yönetici listesinin rozeti).
insert into sporcular (id, ad, brans_id, grup_id, sube_id, odeme_durumu, veli_ad, veli_telefon, veli_yakinlik) values
  ('5000000e-0000-0000-0000-000000000001', 'Mert Aydın',   '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'gecikmis', 'Serkan Aydın', '0532 417 88 21', 'Baba'),
  ('5000000f-0000-0000-0000-000000000001', 'Ali Kaya',     '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'guncel',   'Fatma Kaya',   '0533 221 44 09', 'Anne'),
  ('50000010-0000-0000-0000-000000000001', 'Zeynep Kaya',  '20000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'guncel',   'Fatma Kaya',   '0533 221 44 09', 'Anne'),
  ('50000011-0000-0000-0000-000000000001', 'Berk Tan',     '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'gecikmis', 'Hakan Tan',    '0535 620 11 47', 'Baba'),
  ('50000012-0000-0000-0000-000000000001', 'Ece Yıldız',   '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'guncel',   'Derya Yıldız', '0536 802 93 15', 'Anne'),
  ('50000013-0000-0000-0000-000000000001', 'Cem Demir',    '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'guncel',   'Onur Demir',   '0532 774 20 63', 'Baba'),
  ('50000014-0000-0000-0000-000000000001', 'Defne Arslan', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'gecikmis', 'Seda Arslan',  '0538 411 96 27', 'Anne'),
  ('50000015-0000-0000-0000-000000000001', 'Kerem Tunç',   '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'guncel',   'Murat Tunç',   '0533 908 55 12', 'Baba')
on conflict (id) do nothing;


-- =============================================================================
-- BÖLÜM 4 — DEMO HESABININ BAĞLARI: veli_sporcu + sporcu_antrenor
--           (kaynak: 0004 veli_sporcu, 0008 sporcu_antrenor)
-- =============================================================================
-- ⚠ Bu bölümdeki 3 insert, auth.users'ta demo e-postası yoksa SESSİZCE 0 satır
--   ekler. Dosyanın başındaki uyarıyı okuyun.
--   RLS'in tamamı (veli ne görür / antrenör ne görür) bu iki tabloya dayanır.

-- Veli şapkası: demo hesabı, Ali Kaya ve Zeynep Kaya'nın velisi.
insert into veli_sporcu (veli_id, sporcu_id, yakinlik)
  select u.id, '50000000-0000-0000-0000-000000000001', 'Anne'
  from auth.users u where u.email = 'yavuzttaniss@gmail.com'
  on conflict do nothing;

insert into veli_sporcu (veli_id, sporcu_id, yakinlik)
  select u.id, '50000016-0000-0000-0000-000000000001', 'Anne'
  from auth.users u where u.email = 'yavuzttaniss@gmail.com'
  on conflict do nothing;

-- Antrenör şapkası: demo hesabı, U12 Basketbol'un 13 sporcusunun antrenörü.
insert into sporcu_antrenor (sporcu_id, antrenor_id)
select s.id, u.id
from sporcular s, auth.users u
where u.email = 'yavuzttaniss@gmail.com'
  and s.grup_id = '40000000-0000-0000-0000-000000000001'
on conflict do nothing;


-- =============================================================================
-- BÖLÜM 5 — AİDAT PLANLARI ve ÖDEMELER  (kaynak: 0007)
-- =============================================================================
--
-- Aidat planları buraya (demo dosyasına) taşındı: fiyatlar ve `beklenen` tahsilat
-- hedefleri Karşıyaka'ya özgü gerçek rakamlar olduğu için katalogda değiller —
-- yeni bir müşteri kendi planlarını panelden tanımlar (bkz. 02_katalog.sql § 7).
-- Panelin Muhasebe > Aidatlar ve Mali Rapor ekranlarının demoda dolu görünmesi
-- için burada bulunmaları gerekiyor.
insert into aidat_plani (id, ad, alt, fiyat, beklenen, sube_id) values
  ('b0000000-0000-0000-0000-000000000001', 'Basketbol Aylık', 'U12-U14 · haftada 3 gün', 1250, 43750, null),
  ('b0000000-0000-0000-0000-000000000002', 'Yüzme Aylık',     'U10-U12 · haftada 2 gün', 1100, 30800, null),
  ('b0000000-0000-0000-0000-000000000003', 'Jimnastik Aylık', 'U8-U10 · haftada 3 gün',   950, 19000, null),
  ('b0000000-0000-0000-0000-000000000004', 'Voleybol Aylık',  'U12 · haftada 2 gün',     1050, 21000, null)
on conflict (id) do nothing;

-- Tarihler current_date'e görelidir → demo ne zaman kurulursa kurulsun güncel görünür.
--
-- ⚠ TARİH TUTARSIZLIĞI (bilinçli olarak dokunulmadı): `aciklama` alanındaki ay
--   adları SABİT metindir ('Temmuz aidatı', 'Haziran aidatı'...) ama tarih
--   kolonları current_date'e görelidir. Demo Ekim ayında kurulursa "Temmuz
--   aidatı · bugün ödendi" gibi görünür.
--   → Dinamikleştirmek isterseniz aciklama'yı şu desenle üretebilirsiniz:
--       (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz',
--              'Ağustos','Eylül','Ekim','Kasım','Aralık'])
--         [extract(month from current_date)::int] || ' aidatı'
--     (to_char(..., 'TMMonth') Supabase'de tr_TR locale'ine bağlı olduğu için
--      önerilmiyor.)

-- Küme B (yönetici "Tahsilatlar" listesi) — 5 tamamlanmış tahsilat.
insert into odeme (sporcu_id, aciklama, tutar, yontem, durum, odendi_tarihi) values
  ('5000000f-0000-0000-0000-000000000001', 'Temmuz aidatı', 1250, 'kart',   'odendi', current_date),
  ('50000012-0000-0000-0000-000000000001', 'Temmuz aidatı', 1050, 'havale', 'odendi', current_date),
  ('50000013-0000-0000-0000-000000000001', 'Temmuz aidatı', 1100, 'elden',  'odendi', current_date - 1),
  ('50000015-0000-0000-0000-000000000001', 'Temmuz aidatı', 1100, 'kart',   'odendi', current_date - 1),
  ('50000010-0000-0000-0000-000000000001', 'Temmuz aidatı',  950, 'kart',   'odendi', current_date - 3);

-- Küme A (demo velinin çocukları) — Ali: güncel aidat GECİKMİŞ (kırmızı uyarı
-- kartı görünsün diye) + 3 geçmiş ödeme. Zeynep: hepsi ödenmiş.
insert into odeme (sporcu_id, aciklama, tutar, yontem, durum, son_odeme_tarihi) values
  ('50000000-0000-0000-0000-000000000001', 'Temmuz aidatı · Basketbol U12', 1250, 'kart', 'gecikti', current_date - 4);

insert into odeme (sporcu_id, aciklama, tutar, yontem, durum, odendi_tarihi) values
  ('50000000-0000-0000-0000-000000000001', 'Haziran aidatı',              1250, 'kart',   'odendi', current_date - 30),
  ('50000000-0000-0000-0000-000000000001', 'Mayıs aidatı',                1250, 'kart',   'odendi', current_date - 60),
  ('50000000-0000-0000-0000-000000000001', 'Nisan aidatı',                1250, 'havale', 'odendi', current_date - 90),
  ('50000016-0000-0000-0000-000000000001', 'Temmuz aidatı · Yüzme U10',   1100, 'kart',   'odendi', current_date - 3),
  ('50000016-0000-0000-0000-000000000001', 'Haziran aidatı',              1100, 'kart',   'odendi', current_date - 33),
  ('50000016-0000-0000-0000-000000000001', 'Mayıs aidatı',                1100, 'kart',   'odendi', current_date - 63);

-- NOT: odeme.aidat_plani_id (0014'te eklendi) demo verisinde bilinçli olarak
-- null bırakıldı — 02_katalog.sql'deki aidat planları isteğe bağlı şablondur ve
-- silinmiş olabilir. Panelde "Plan" kolonu boş görünür.


-- =============================================================================
-- BÖLÜM 6 — ANTRENMAN + YOKLAMA  (kaynak: 0008)
-- =============================================================================
-- Tamamı current_date bazlıdır — demo her zaman "bugün antrenman var" gösterir.

-- Bugünün antrenmanı: yoklama_kaydedildi=false, yani antrenör demo sırasında
-- CANLI yoklama alabilir. Deniz Aksoy için önceden veli izin bildirimi var.
insert into antrenman (id, grup_id, tarih, saat1, saat2, tesis, yoklama_kaydedildi) values
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', current_date, '17:00', '18:30', 'Mavişehir Spor Salonu · Salon 2', false)
on conflict (id) do nothing;

insert into yoklama (antrenman_id, sporcu_id, izinli, izin_detay) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', true, 'Hastalık · veli notu: "Ateşi var, evde dinlenecek" · 09:12')
on conflict (antrenman_id, sporcu_id) do nothing;

-- Geçmiş ~4 hafta, Pzt/Çar/Cum antrenmanları (U12 Basketbol haftada 3 gün) —
-- yoklama_kaydedildi=true, aylık katılım yüzdesi/takvim gerçek veriden hesaplansın diye.
-- Ali Kaya bilinçli olarak 2 antrenmana katılmadı (3. ve 8.) → %100 olmayan,
-- gerçekçi bir katılım grafiği çıkması için.
with gecmis as (
  insert into antrenman (grup_id, tarih, saat1, saat2, tesis, yoklama_kaydedildi, yoklama_kayit_zamani)
  select '40000000-0000-0000-0000-000000000001', d::date, '17:00', '18:30', 'Mavişehir Spor Salonu · Salon 2', true, '18:32'
  from generate_series(current_date - 28, current_date - 1, interval '1 day') d
  where extract(dow from d) in (1, 3, 5)
  returning id, tarih
),
gecmis_sirali as (
  select id, row_number() over (order by tarih) as rn from gecmis
)
insert into yoklama (antrenman_id, sporcu_id, durum)
select gs.id, s.id,
  case when s.id = '50000000-0000-0000-0000-000000000001' and gs.rn in (3, 8) then 'katilmadi' else 'katildi' end
from gecmis_sirali gs
cross join sporcular s
where s.grup_id = '40000000-0000-0000-0000-000000000001';


-- =============================================================================
-- BÖLÜM 7 — GELİŞİM DEĞERLENDİRMELERİ  (kaynak: 0008)
-- =============================================================================
-- U12 Basketbol roster'ının 13 sporcusunun her biri için 1 satır.
-- Emir ve Yusuf'unki GÖNDERİLMİŞ (gonderildi=true) → veli tarafında görünür.
-- Diğerleri taslak (gonderildi=false) → yalnızca antrenör görür; demo sırasında
-- "değerlendir → gönder" akışı bu satırlar üzerinde canlı gösterilebilir.
-- Gönderilmiş olanların `tarih` alanı current_date bazlıdır.
--
-- NOT: antrenor_id bilinçli olarak null — migration 0008'de de doldurulmuyordu.
-- Doldurmak isterseniz demo hesabının uuid'siyle ayrıca update gerekir.
insert into gelisim_degerlendirme (id, sporcu_id, not_metni, gonderildi, tarih) values
  ('80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '', false, null),
  ('80000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Emir hızlı hücumda çok gelişti, bireysel savunmada tempo kazanıyor.', true, current_date - 3),
  ('80000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '', false, null),
  ('80000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '', false, null),
  ('80000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '', false, null),
  ('80000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', 'Yusuf bu ay tüm antrenmanlara katıldı; ribaunt zamanlaması belirgin iyileşti.', true, current_date - 5),
  ('80000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000007', '', false, null),
  ('80000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000008', '', false, null),
  ('80000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000009', '', false, null),
  ('8000000a-0000-0000-0000-000000000001', '5000000a-0000-0000-0000-000000000001', '', false, null),
  ('8000000b-0000-0000-0000-000000000001', '5000000b-0000-0000-0000-000000000001', '', false, null),
  ('8000000c-0000-0000-0000-000000000001', '5000000c-0000-0000-0000-000000000001', '', false, null),
  ('8000000d-0000-0000-0000-000000000001', '5000000d-0000-0000-0000-000000000001', '', false, null)
on conflict (id) do nothing;

-- Beceri seviyeleri (1-5). Dizideki sıra `beceri.sira` ile eşleşir:
--   [Şut Tekniği, Top Sürme, Kondisyon, Takım Oyunu]
-- Beceri satırları 02_katalog.sql'den gelir (Basketbol branşı).
insert into gelisim_beceri_seviye (degerlendirme_id, beceri_id, seviye)
select v.degerlendirme_id, b.id, v.seviyeler[b.sira + 1]
from (values
  ('80000000-0000-0000-0000-000000000001'::uuid, array[4,4,3,5]),  -- ali
  ('80000000-0000-0000-0000-000000000002'::uuid, array[4,3,3,4]),  -- emir
  ('80000000-0000-0000-0000-000000000003'::uuid, array[2,3,3,4]),  -- kerem
  ('80000000-0000-0000-0000-000000000004'::uuid, array[3,3,4,3]),  -- deniz
  ('80000000-0000-0000-0000-000000000005'::uuid, array[3,3,3,3]),  -- arda
  ('80000000-0000-0000-0000-000000000006'::uuid, array[4,4,4,4]),  -- yusuf
  ('80000000-0000-0000-0000-000000000007'::uuid, array[3,3,3,3]),  -- ege
  ('80000000-0000-0000-0000-000000000008'::uuid, array[3,3,3,3]),  -- can
  ('80000000-0000-0000-0000-000000000009'::uuid, array[3,3,3,3]),  -- baran
  ('8000000a-0000-0000-0000-000000000001'::uuid, array[3,3,3,3]),  -- kaan
  ('8000000b-0000-0000-0000-000000000001'::uuid, array[3,3,3,3]),  -- toprak
  ('8000000c-0000-0000-0000-000000000001'::uuid, array[3,3,3,3]),  -- umut
  ('8000000d-0000-0000-0000-000000000001'::uuid, array[3,3,3,3])   -- mert
) as v(degerlendirme_id, seviyeler)
cross join beceri b
-- Yalnızca kataloğun ilk 4 Basketbol becerisi (sira 0-3): kulüp katalogdaki
-- beceri listesini genişletebilir (02_katalog.sql bunu teşvik ediyor) ve o
-- durumda seviyeler[5] null dönüp not-null ihlaliyle patlardı.
where b.brans_id = '20000000-0000-0000-0000-000000000002'
  and b.sira between 0 and 3
on conflict (degerlendirme_id, beceri_id) do nothing;


-- =============================================================================
-- BÖLÜM 8 — DUYURULAR  (kaynak: 0009)
-- =============================================================================
-- Biri tüm velilere (tum_veliler=true, SMS ile), biri yalnızca U12 Basketbol'a.
--
-- ⚠ SABİT TARİH: birinci duyurunun metninde "1 Ağustos'a kadar" geçiyor.
--   Demo yıl içinde başka bir ayda gösterilirse tarih tutarsız görünür.
--   → Dinamikleştirmek için metni parçalayıp
--     to_char(current_date + 14, 'DD.MM.YYYY') gibi bir ifadeyle birleştirin.
insert into duyuru (id, baslik, mesaj, tur, tum_veliler, sms_ile) values
  ('90000000-0000-0000-0000-000000000001', 'Yaz Kampı Erken Kayıt İndirimi', 'Foça Yaz Kampı kayıtları açıldı! 1 Ağustos''a kadar %15 erken kayıt indirimi geçerli. Detaylar ve kayıt formu uygulamada.', 'kamp', true, true),
  ('90000000-0000-0000-0000-000000000002', 'U12 takımımız İzmir il şampiyonu!', 'Finalde 64–58''lik galibiyetle kupayı kaldırdık', 'basari', false, false)
on conflict (id) do nothing;

insert into duyuru_hedef (duyuru_id, grup_id) values
  ('90000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001')
on conflict do nothing;


-- =============================================================================
-- BÖLÜM 9 — ETKİNLİKLER + LCV (etkinlik_katilim)  (kaynak: 0009)
-- =============================================================================
-- Tüm tarihler current_date bazlı: 2 yaklaşan (+2, +10 gün), 3 geçmiş (-11, -18, -27).

insert into etkinlik (id, tur, baslik, grup_id, tesis, tarih, saat, lcv_istenir, ucretli, tutar, rakip) values
  ('91000000-0000-0000-0000-000000000001', 'mac',     'Bornova U12',    '40000000-0000-0000-0000-000000000001', 'Merkez Tesis · Salon 1', current_date + 2,  '11:00', true, false, null, 'Bornova U12'),
  ('91000000-0000-0000-0000-000000000002', 'turnuva', 'Ege Kupası U12', null,                                   'Bornova Spor Salonu',    current_date + 10, '09:00', true, true,  3825, null)
on conflict (id) do nothing;

-- Geçmiş maç sonuçları (id otomatik — ikinci çalıştırmada çoğalır).
insert into etkinlik (tur, baslik, grup_id, tesis, tarih, rakip, skor_biz, skor_rakip, sonuc, sonuc_notu) values
  ('mac', 'Lig Maçı', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis', current_date - 11, 'Bornova SK',        64, 58, 'galibiyet',  'İl şampiyonu olduk 🏆'),
  ('mac', 'Lig Maçı', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis', current_date - 18, 'Karşıyaka Yıldız',  52, 41, 'galibiyet',  'Yarı final galibiyeti'),
  ('mac', 'Lig Maçı', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis', current_date - 27, 'Alsancak Gençlik',  38, 45, 'maglubiyet', 'Grup maçı');

-- Ali Kaya'nın LCV'leri: yaklaşan maçta "bekliyor" (demo sırasında veli
-- tarafından yanıtlanabilsin diye), turnuvada "katilir".
insert into etkinlik_katilim (etkinlik_id, sporcu_id, durum) values
  ('91000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'bekliyor'),
  ('91000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'katilir')
on conflict (etkinlik_id, sporcu_id) do nothing;

-- Roster'ın geri kalanı: antrenörün Maç Kadrosu ekranındaki LCV listesi boş
-- görünmesin diye karışık (3'e bölünerek dağıtılmış) durumlar.
with roster_sirali as (
  select id, row_number() over (order by ad) as rn
  from sporcular
  where grup_id = '40000000-0000-0000-0000-000000000001'
    and id <> '50000000-0000-0000-0000-000000000001'
)
insert into etkinlik_katilim (etkinlik_id, sporcu_id, durum)
select '91000000-0000-0000-0000-000000000001', id,
  case when rn % 3 = 0 then 'katilir' when rn % 3 = 1 then 'katilmaz' else 'bekliyor' end
from roster_sirali
on conflict (etkinlik_id, sporcu_id) do nothing;

-- NOT: mac_kadro / mac_kadro_sporcu için migration'larda seed YOKTU — antrenör
-- demo sırasında kadroyu kendisi kurar. Bilinçli olarak boş bırakıldı.


-- =============================================================================
-- BÖLÜM 10 — MESAJLAŞMA  (kaynak: 0010 + 0011)
-- =============================================================================
-- ⚠ Demo hesabı hem veli hem antrenör olduğu için veli_id = antrenor_id
--   (kendisiyle sohbet). `gonderen_rol` kolonu (0011'de eklendi) mesajın hangi
--   şapkayla yazıldığını ayırt eder — 0011'deki update zinciri yerine burada
--   doğrudan NİHAİ değerleriyle yazılıyor.
-- Zamanlar now() bazlıdır → sohbet her zaman "birkaç saat önce" görünür.

insert into konusma (id, veli_id, antrenor_id, son_mesaj, son_mesaj_zaman)
select '93000000-0000-0000-0000-000000000001', u.id, u.id,
  'Merhaba hocam, harika haber! Cuma erken geliriz.', now() - interval '2 hours'
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict do nothing;

insert into mesaj (konusma_id, gonderen_id, metin, gonderen_rol, created_at)
select '93000000-0000-0000-0000-000000000001', u.id, m.metin, m.rol, now() - m.once
from auth.users u
cross join (values
  ('Merhaba Elif Hanım, Ali bugün şut çalışmasında çok iyiydi. Kısa videosunu veli kanalına yükledim.', 'antrenor', interval '3 hours'),
  ('Cuma antrenmanı 30 dk erken başlayacak, 16:30''da salonda olalım.',                                 'antrenor', interval '2 hours 10 minutes'),
  ('Merhaba hocam, harika haber! Cuma erken geliriz.',                                                  'veli',     interval '2 hours')
) as m(metin, rol, once)
where u.email = 'yavuzttaniss@gmail.com';


-- =============================================================================
-- BÖLÜM 11 — SERVİS (rota / durak / sporcu)  (kaynak: 0012, kolon: 0018)
-- =============================================================================
-- 2 rota × 7 sporcu = 14 sporcu (U12 Basketbol'un 13'ü + Zeynep Kaya).
-- Ali + Zeynep Kaya bilinçli olarak Rota 1'e konuldu ve Rota 1 "yolda=true" —
-- demo hesabı Servis sekmesinde canlı hareket eden bir rota görsün diye.
--
-- ⚠ sofor_telefon (0018'de eklendi) null bırakıldı: migration'larda hiç değer
--   yoktu, uydurulmadı. Mobil taraf boşsa "Ara" butonunu gizler. Demoda arama
--   butonunu göstermek isterseniz aşağıdaki update'i doldurup çalıştırın:
--     update servis_rota set sofor_telefon = '05XX XXX XX XX'
--       where id = '94000000-0000-0000-0000-000000000001';
--
-- ⚠ Rota durumları (gecti/suan/bekliyor) ve konum_saat '07:49' SABİT metindir —
--   günün saatinden bağımsızdır. Demo akşam yapılırsa "sabah seferi yolda"
--   görünür. Tam gerçekçilik için bu alanlar current_time'a göre üretilebilir,
--   ancak durum makinesi metin kolonlarda tutulduğu için basit bir ifadeyle
--   çözülmüyor — bilinçli olarak sabit bırakıldı.

insert into servis_rota (id, ad, sofor, plaka, arac, alt, durum_txt, yolda, konum_saat, konum_hiz) values
  ('94000000-0000-0000-0000-000000000001', 'Mavişehir – Merkez Hattı', 'Hasan Usta',     '35 KSO 112', 'Mercedes Sprinter', 'Sabah seferi · 07:30 kalkış',  'Yolda',    true,  '07:49', '32 km/s'),
  ('94000000-0000-0000-0000-000000000002', 'Karşıyaka – Merkez Hattı', 'Ayşe Yıldırım',  '35 KSO 220', 'Ford Transit',      'Akşam seferi · 17:45 kalkış',  'Bekliyor', false, null,    null)
on conflict (id) do nothing;

insert into servis_durak (id, rota_id, ad, sub, saat, sira, durum) values
  ('95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'Mavişehir Meydan', '3 sporcu biniş',        '07:30', 0, 'gecti'),
  ('95000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000001', 'Atakent Durağı',   '4 sporcu biniş',        '07:42', 1, 'suan'),
  ('95000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000001', 'Merkez Tesis',     'Varış · 7 sporcu iniş', '08:05', 2, 'bekliyor'),
  ('95000000-0000-0000-0000-000000000004', '94000000-0000-0000-0000-000000000002', 'Karşıyaka Çarşı',  '4 sporcu biniş',        '17:45', 0, 'bekliyor'),
  ('95000000-0000-0000-0000-000000000005', '94000000-0000-0000-0000-000000000002', 'Alaybey Durağı',   '3 sporcu biniş',        '17:58', 1, 'bekliyor'),
  ('95000000-0000-0000-0000-000000000006', '94000000-0000-0000-0000-000000000002', 'Merkez Tesis',     'Varış · 7 sporcu iniş', '18:15', 2, 'bekliyor')
on conflict (id) do nothing;

insert into servis_sporcu (rota_id, sporcu_id, durak_id) values
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001'), -- Ali Kaya
  ('94000000-0000-0000-0000-000000000001', '50000016-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001'), -- Zeynep Kaya
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '95000000-0000-0000-0000-000000000001'), -- Emir Şahin
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', '95000000-0000-0000-0000-000000000002'), -- Kerem Yılmaz
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', '95000000-0000-0000-0000-000000000002'), -- Deniz Aksoy
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', '95000000-0000-0000-0000-000000000002'), -- Arda Güneş
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000006', '95000000-0000-0000-0000-000000000002'), -- Yusuf Demirel
  ('94000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000007', '95000000-0000-0000-0000-000000000004'), -- Ege Aydın
  ('94000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000008', '95000000-0000-0000-0000-000000000004'), -- Can Polat
  ('94000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000009', '95000000-0000-0000-0000-000000000004'), -- Baran Koç
  ('94000000-0000-0000-0000-000000000002', '5000000a-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000004'), -- Kaan Erdem
  ('94000000-0000-0000-0000-000000000002', '5000000b-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005'), -- Toprak Sezer
  ('94000000-0000-0000-0000-000000000002', '5000000c-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005'), -- Umut Karaca
  ('94000000-0000-0000-0000-000000000002', '5000000d-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005')  -- Mert Can Öz
on conflict (rota_id, sporcu_id) do nothing;


-- =============================================================================
-- BÖLÜM 12 — MAĞAZA: ürünler + siparişler  (kaynak: 0012)
-- =============================================================================
-- 6 ürün. "Kulüp Matarası" bilinçli olarak stoksuz + pasif — mağazadaki
-- "tükendi" durumunun gösterilebilmesi için.
--
-- ⚠ SABİT YIL: '2026 Sezon Forması' ürün adında yıl geçiyor. Demo başka bir
--   yılda gösterilecekse adı elle güncelleyin ya da şu desenle üretin:
--     extract(year from current_date)::text || ' Sezon Forması'
insert into urun (id, ad, aciklama, kategori, fiyat, stok, aktif, badge, jersey) values
  ('96000000-0000-0000-0000-000000000001', '2026 Sezon Forması',  'İsim + numara baskısı hediye', 'Forma',    450, 32, true,  'YENİ', true),
  ('96000000-0000-0000-0000-000000000002', 'Antrenman Eşofmanı',  'Nefes alabilir kumaş',          'Giyim',    620, 18, true,  null,   false),
  ('96000000-0000-0000-0000-000000000003', 'Kulüp Şapkası',       'Ayarlanabilir kayış',           'Aksesuar', 240, 25, true,  null,   false),
  ('96000000-0000-0000-0000-000000000004', 'Spor Çantası',        '40L · su geçirmez',             'Aksesuar', 380, 12, true,  null,   false),
  ('96000000-0000-0000-0000-000000000005', 'Kulüp Tişörtü',       'Pamuklu · unisex kesim',        'Giyim',    210, 40, true,  null,   false),
  ('96000000-0000-0000-0000-000000000006', 'Kulüp Matarası',      '750ml · paslanmaz çelik',       'Aksesuar', 120,  0, false, null,   false)
on conflict (id) do nothing;

-- Demo siparişleri — Ali (hazırlanıyor) ve Zeynep (teslim edilmiş) üzerinden
-- sipariş durumu akışının iki ucu da gösterilebilsin diye.
insert into siparis (id, sporcu_id, tutar, durum) values
  ('97000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1070, 'hazirlaniyor'),
  ('97000000-0000-0000-0000-000000000002', '50000016-0000-0000-0000-000000000001',  120, 'teslim')
on conflict (id) do nothing;

insert into siparis_kalem (siparis_id, urun_id, beden, adet, birim_fiyat, not_metni) values
  ('97000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', 'M',  1, 450, '"ELİF K · —" baskısı hediye'),
  ('97000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', 'S',  1, 620, 'Standart paket'),
  ('97000000-0000-0000-0000-000000000002', '96000000-0000-0000-0000-000000000006', null, 1, 120, 'Standart paket');


-- =============================================================================
-- BÖLÜM 13 — BİREYSEL DERS  (kaynak: 0013)
-- =============================================================================
-- ⚠ Bu bölümün TAMAMI demo hesabının auth.users kaydına bağlıdır.

-- Antrenörün bireysel ders profili (fiyatlar, paket, bio).
insert into bireysel_antrenor (antrenor_id, brans_id, deneyim_yil, puan, bio, musait, tek_fiyat, paket_fiyat, paket_ders_sayisi, varsayilan_tesis)
select u.id, '20000000-0000-0000-0000-000000000002', 11, 5.0,
  'Baş antrenör · şut mekaniği ve top sürme üzerine bireysel gelişim programları hazırlar.',
  true, 700, 6200, 10, 'Salon 2'
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict (antrenor_id) do nothing;

-- Haftalık müsaitlik (gun_index: 0=Pazar ... 6=Cumartesi).
-- Cumartesi (6) kapalı bırakıldı — "kapalı gün" görünümü için.
insert into bireysel_musaitlik (antrenor_id, gun_index, baslangic_saat, bitis_saat, aktif)
select u.id, v.gun_index, v.baslangic, v.bitis, v.aktif
from auth.users u
cross join (values
  (1, '16:00', '20:00', true),
  (2, '18:00', '21:00', true),
  (4, '16:00', '17:00', true),
  (5, '09:00', '15:00', true),
  (6, '00:00', '00:00', false)
) as v(gun_index, baslangic, bitis, aktif)
where u.email = 'yavuzttaniss@gmail.com'
on conflict (antrenor_id, gun_index) do nothing;

-- Ali Kaya'nın 10 derslik paketi, 6 ders kalmış (4'ü kullanılmış görünsün diye).
insert into bireysel_paket (id, antrenor_id, sporcu_id, toplam, kalan, tutar)
select 'a0000000-0000-0000-0000-000000000001', u.id, '50000000-0000-0000-0000-000000000001', 10, 6, 6200
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict (id) do nothing;

-- Geçmiş (tamamlanmış, paketten düşülmüş) ders — tarih current_date bazlı.
insert into bireysel_rezervasyon (antrenor_id, sporcu_id, tarih, saat, tesis, odeme_tipi, paket_id, tutar, durum, sonuc_zamani)
select u.id, '50000000-0000-0000-0000-000000000001', current_date - 7, '19:00', 'Salon 2', 'paket',
  'a0000000-0000-0000-0000-000000000001', 620, 'tamamlandi', now() - interval '7 days'
from auth.users u where u.email = 'yavuzttaniss@gmail.com';

-- Yaklaşan ders — durum 'onay_bekliyor': antrenör demo sırasında canlı
-- onaylayabilsin/reddedebilsin diye bilinçli olarak beklemede bırakıldı.
insert into bireysel_rezervasyon (antrenor_id, sporcu_id, tarih, saat, tesis, odeme_tipi, tutar, durum)
select u.id, '50000000-0000-0000-0000-000000000001', current_date + 2, '17:00', 'Salon 2', 'tek', 700, 'onay_bekliyor'
from auth.users u where u.email = 'yavuzttaniss@gmail.com';

-- NOT: bireysel_istisna (antrenörün kapalı gün istisnaları) için migration'larda
-- seed yoktu — bilinçli olarak boş.


-- =============================================================================
-- BÖLÜM 14 — HAKEDİŞ: antrenör grup ders ücreti  (kaynak: 0013)
-- =============================================================================
-- hakedis / hakedis_kalem tabloları BİLİNÇLİ olarak boş: hakediş ekranı ilk
-- açılışta gerçek antrenman sayısından hesaplayıp kendisi upsert eder. Yalnızca
-- ders başı birim ücret önceden tanımlı olmalı.
insert into antrenor_grup_ucret (antrenor_id, grup_id, ders_ucreti)
select u.id, '40000000-0000-0000-0000-000000000001', 400
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict (antrenor_id, grup_id) do nothing;


-- =============================================================================
-- BÖLÜM 15 — BAŞVURULAR  (kaynak: 0013)
-- =============================================================================
-- Yönetici > Başvurular ekranında bekleyen 2 deneme dersi başvurusu.
--
-- ⚠ SABİT TARİH: detay_notu alanındaki 'Çar 22 Temmuz' / 'Pzt 27 Temmuz'
--   düz metindir ve current_date ile ilişkisizdir — demo başka bir tarihte
--   yapılırsa tutarsız görünür.
--   → Dinamikleştirmek için, örneğin:
--       'Deneme · ' || to_char(current_date + 3, 'DD.MM.YYYY') || ' · 17:00 · Salon 1'
insert into basvuru (ad, dogum_yili, brans_id, sube_id, veli_ad, veli_telefon, tag, detay_notu) values
  ('Defne Arslan', 2015, '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Seda Arslan', '0538 411 96 27', 'DENEME', 'Çar 22 Temmuz · 17:00 · Salon 1'),
  ('Mina Yaman',   2016, '20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Aslı Yaman',  '0533 908 55 12', 'DENEME', 'Pzt 27 Temmuz · 16:00 · Stüdyo');


-- =============================================================================
-- BÖLÜM 16 — MUHASEBE: giderler + faturalar  (kaynak: 0014)
-- =============================================================================
-- Genel Bakış / Mali Rapor ekranları boş görünmesin diye birkaç gerçekçi kayıt.
-- Tarihler current_date bazlıdır.
insert into gider (tarih, kategori, aciklama, tutar, yontem) values
  (current_date - 3,  'Kira',     'Merkez tesis aylık kira',           45000, 'havale'),
  (current_date - 5,  'Personel', 'Antrenör maaş ödemesi',             38000, 'havale'),
  (current_date - 10, 'Malzeme',  'Basketbol topu + forma yenileme',    6200, 'kart'),
  (current_date - 20, 'Kira',     'Merkez tesis aylık kira',           45000, 'havale');

-- ⚠ SABİT YIL + UNIQUE: fatura_no'da yıl gömülü ('FT-2026-...') ve kolon UNIQUE.
--   Bu dosya ikinci kez çalıştırılırsa bu insert HATA verir.
--   → Dinamik ve çakışmasız hale getirmek için:
--       'FT-' || extract(year from current_date)::text || '-0001'
--     (tekrar çalıştırma sorunu için ayrıca `on conflict (fatura_no) do nothing`
--      eklenebilir — burada bilinçli olarak eklenmedi ki çift yükleme fark edilsin.)
insert into fatura (fatura_no, sporcu_id, tutar, tarih, durum) values
  ('FT-2026-0001', '50000000-0000-0000-0000-000000000001', 1250, current_date - 4, 'odendi'),
  ('FT-2026-0002', '5000000f-0000-0000-0000-000000000001', 1050, current_date - 1, 'bekliyor');


-- =============================================================================
-- BÖLÜM 17 — SEED EDİLMEYENLER (bilinçli boş tablolar)
-- =============================================================================
--   mac_kadro, mac_kadro_sporcu   → antrenör demo sırasında kadroyu kendisi kurar
--   bireysel_istisna              → migration'larda seed yoktu
--   hakedis, hakedis_kalem        → ekran ilk açılışta hesaplayıp upsert eder
--   push_token (0020)             → gerçek cihaz oturum açınca kendi yazar
--   profiles                      → auth.users trigger'ı (handle_new_user) yazar
--
-- Ayrıca 0011'deki `update mesaj set gonderen_rol = 'antrenor' where metin =
-- 'Faz 5 Realtime test mesajı - antrenör tarafından'` satırı buraya TAŞINMADI:
-- o mesaj hiçbir migration tarafından eklenmiyordu, canlı test sırasında
-- uygulama üzerinden gönderilmişti.
-- =============================================================================


-- =============================================================================
-- DOĞRULAMA (çalıştırdıktan sonra elle kontrol edilebilir)
-- =============================================================================
-- select count(*) from sporcular;        -- 22 beklenir
-- select count(*) from veli_sporcu;      --  2 beklenir (0 ise Auth kullanıcısı YOK!)
-- select count(*) from sporcu_antrenor;  -- 13 beklenir (0 ise Auth kullanıcısı YOK!)
-- select count(*) from odeme;            -- 12 beklenir
-- select count(*) from antrenman;        -- 1 + son 4 haftanın Pzt/Çar/Cum sayısı
-- select count(*) from mesaj;            --  3 beklenir
-- =============================================================================
