-- ===========================================================================
-- 0024_yumusak_silme.sql — Sporcu ve grup kayıtlarında YUMUŞAK SİLME
-- ===========================================================================
-- NEDEN BU MIGRATION
--   Bugüne kadar panelde bir sporcu ya da grup kaydı ne silinebiliyor ne de
--   pasife alınabiliyordu. Okuldan ayrılan sporcu listede sonsuza kadar aktif
--   görünüyor, kapanan grup her seçim kutusunda durmaya devam ediyordu. Bu
--   migration iki tabloya da `aktif` + `pasif_tarihi` kolonlarını ekler ve
--   panelde "Pasife Al / Geri Al" aksiyonunu mümkün kılar.
--
-- NEDEN GERÇEK SİLME (DELETE) EKLENMİYOR — bilinçli karar
--   1) VERİ KAYBI. sporcular(id)'ye bağlı FK'lerin çoğu ON DELETE CASCADE:
--        odeme (0007), yoklama + gelisim_degerlendirme (0008),
--        veli_sporcu + sporcu_antrenor (0004), etkinlik_katilim + mac_kadro_sporcu
--        (0009), servis_sporcu (0012), bireysel_rezervasyon (0013)
--      Tek bir `delete from sporcular` çağrısı sporcunun TÜM ödeme geçmişini ve
--      yoklama kayıtlarını da götürür — kapanmış bir muhasebe dönemini geriye
--      dönük değiştirir ve geri alınamaz.
--   2) ZATEN PATLAR. Cascade OLMAYAN FK'ler de var: fatura.sporcu_id (0014) ve
--      siparis.sporcu_id (0012). Faturası ya da siparişi olan bir sporcu için
--      DELETE zaten 23503 ile reddedilir; "Sil" düğmesi kullanıcıya çoğu zaman
--      anlamsız bir veritabanı hatası göstermekten başka bir şey yapmazdı.
--   Aynı gerekçe grup için de geçerli: antrenman.grup_id NOT NULL ve cascade'siz
--   (0008), yani antrenmanı olan bir grup silinemez.
--   Bu gerekçe panelde de kullanıcıya açık metinle yazılıyor:
--     admin-panel/app/(panel)/sporcular/page.tsx
--     admin-panel/app/(panel)/gruplar/page.tsx
--
-- RLS — EK POLİTİKA GEREKMİYOR
--   0021 bölüm 9.1'deki `"kulup izolasyonu"` RESTRICTIVE politikası her iki
--   tabloda da FOR ALL biçiminde kurulu ve SATIR düzeyinde çalışıyor, kolon
--   düzeyinde değil. Yeni kolonlar otomatik olarak aynı kiracı duvarının
--   arkasındadır. Yazma yetkisi de değişmiyor: `aktif` alanını güncelleyen
--   UPDATE, tablonun mevcut permissive "yönetici yazar" politikasından geçer
--   (01_sema.sql / 0004). Yani bu dosyada TEK BİR politika bile yaratılmıyor.
--
-- GERİYE DÖNÜK UYUMLULUK
--   Kolon varsayılanı `true`; mevcut satırların tamamı aktif kalır. `aktif`
--   filtresi EKLEMEYEN hiçbir sorgu davranış değiştirmez, dolayısıyla mobil
--   uygulama ve panelin geri kalanı bu migration'dan etkilenmez.
--
--   Pasife alınan kaydın gizlenmesi ilgili ekranın `.eq('aktif', true)` filtresi
--   eklemesine bağlıdır. Bu migration ile birlikte filtre eklenen yerler:
--     admin-panel/app/(panel)/sporcular/page.tsx   (liste + CSV)
--     admin-panel/app/(panel)/gruplar/page.tsx     (kartlar + üye sayımı)
--   HENÜZ FİLTRELENMEYEN okuma noktaları (bilinçli olarak kapsam dışı; pasif
--   kayıt oralarda görünmeye devam eder):
--     admin-panel: davetler, muhasebe/{aidatlar,faturalar,odemeler}, duyurular,
--                  etkinlikler seçim kutuları ve ana sayfa sayaçları
--     app/src/data: sporcularRepo, antrenorRepo, veliRepo, yoneticiRepo,
--                   etkinlikRepo, pushRepo
--
-- ⚠ SIFIRDAN KURULUM
--   supabase/kurulum/01_sema.sql bu iki kolonu HENÜZ İÇERMİYOR. Yeni bir kulüp
--   projesi bu migration'sız kurulursa panelin "Pasife Al" aksiyonu 42703
--   (column does not exist) hatası verir. Kurulum paketi güncellenene kadar
--   yeni projelerde bu dosya kurulumdan sonra elle çalıştırılmalıdır.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) sporcular
-- ---------------------------------------------------------------------------
alter table public.sporcular
  add column if not exists aktif        boolean not null default true,
  add column if not exists pasif_tarihi timestamptz;

comment on column public.sporcular.aktif is
  'false = kulüpten ayrılmış / pasife alınmış sporcu. Kayıt SİLİNMEZ; ödeme ve yoklama geçmişi olduğu gibi korunur (bkz. 0024 başlığı).';
comment on column public.sporcular.pasif_tarihi is
  'aktif=false yapıldığı an. Geri alındığında NULL''a döner. Uygulama katmanında yazılır (sporcular/actions.ts).';


-- ---------------------------------------------------------------------------
-- 2) grup
-- ---------------------------------------------------------------------------
-- Grup pasife alındığında sporcuların grup_id ataması BİLİNÇLİ OLARAK
-- DEĞİŞTİRİLMEZ: grup geri alındığında kadro olduğu gibi geri gelsin diye.
-- Panel, pasife alma onayında "bu grupta N sporcu var" uyarısını gösteriyor.
alter table public.grup
  add column if not exists aktif        boolean not null default true,
  add column if not exists pasif_tarihi timestamptz;

comment on column public.grup.aktif is
  'false = kapatılmış / pasife alınmış grup. Kayıt SİLİNMEZ; antrenman ve yoklama geçmişi korunur. Gruptaki sporcuların grup_id ataması değişmez.';
comment on column public.grup.pasif_tarihi is
  'aktif=false yapıldığı an. Geri alındığında NULL''a döner. Uygulama katmanında yazılır (gruplar/actions.ts).';


-- ---------------------------------------------------------------------------
-- 3) İNDEKSLER
-- ---------------------------------------------------------------------------
-- Liste ekranlarının varsayılan sorgusu artık `kulup_id = ? and aktif = true`
-- biçiminde. 0021 bölüm 8'de eklenen tek kolonlu kulup_id indeksleri bu ikili
-- filtre için yeterli değil; bileşik indeks ikinci koşulu da karşılıyor.
create index if not exists sporcular_kulup_aktif_idx on public.sporcular (kulup_id, aktif);
create index if not exists grup_kulup_aktif_idx      on public.grup      (kulup_id, aktif);


-- ---------------------------------------------------------------------------
-- DOĞRULAMA
--   -- İki tabloda da kolonlar oluştu mu?  → 4 satır dönmeli
--   select table_name, column_name, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('sporcular', 'grup')
--      and column_name in ('aktif', 'pasif_tarihi')
--    order by table_name, column_name;
--
--   -- Mevcut kayıtların tamamı aktif mi?  → pasif sayısı 0 olmalı
--   select count(*) filter (where aktif) aktif, count(*) filter (where not aktif) pasif
--     from public.sporcular;
--
--   -- Pasife alma denemesi (panelden yapılan güncellemenin SQL karşılığı):
--   update public.sporcular set aktif = false, pasif_tarihi = now() where id = '<sporcu_id>';
--   update public.sporcular set aktif = true,  pasif_tarihi = null  where id = '<sporcu_id>';
-- ---------------------------------------------------------------------------
