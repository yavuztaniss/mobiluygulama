-- ===========================================================================
-- 01_sema.sql — Spor Kulübü Yönetim Platformu · TAM ŞEMA (sıfırdan kurulum)
-- ===========================================================================
-- Bu dosya app/supabase/migrations/0001–0020 arasındaki TÜM migration'ların
-- NİHAİ halini tek dosyada birleştirir. Ara adımlar (drop+recreate edilen
-- politikalar, sonradan eklenen kolonlar, alter policy ile genişletilen
-- muhasebe kuralları, search_path sertleştirmeleri) burada zincir olarak
-- DEĞİL, doğrudan son hâlleriyle yazılmıştır.
--
-- İÇERMEZ: hiçbir INSERT / demo verisi / Karşıyaka'ya özgü kayıt.
--   · Her kulüpte gerekli başlangıç verisi  → kurulum/02_katalog.sql
--   · Yalnızca demo/satış ortamı verisi     → demo/karsiyaka_demo.sql
--
-- ÇALIŞTIRMA: yeni bir Supabase projesinde (SQL Editor veya psql) baştan sona
-- tek seferde çalıştırılır. Postgres 15+ / Supabase uyumludur. auth şeması,
-- auth.users tablosu, `anon` / `authenticated` / `service_role` rolleri ve
-- `supabase_realtime` publication'ı Supabase tarafından hazır gelir.
--
-- BÖLÜMLER
--   1)  Enum, private şeması, yardımcı fonksiyon
--   2)  Kimlik / kurum tabloları
--   3)  Finans (aidat + ödeme)
--   4)  Antrenman / yoklama / gelişim
--   5)  Duyuru / etkinlik / maç kadrosu
--   6)  Mesajlaşma
--   7)  Servis / mağaza
--   8)  Bireysel ders / hakediş / başvuru
--   9)  Muhasebe / ayarlar / mobil bayrak / push
--   10) Row Level Security: etkinleştirme + tüm politikalar
--   11) Fonksiyonlar, trigger'lar, grant/revoke
--   12) Realtime yayını
-- ===========================================================================

-- private.current_profile_role() bölüm 1'de, public.profiles ise bölüm 2'de
-- yaratılıyor. LANGUAGE SQL fonksiyon gövdeleri CREATE anında doğrulandığı için
-- (check_function_bodies varsayılan olarak açık) bu sıra hata verirdi. pg_dump'ın
-- da kullandığı standart çözüm: gövde doğrulamasını dosya boyunca kapatmak.
-- Dosyanın sonunda tekrar açılıyor. Çalışma zamanında hiçbir etkisi yoktur.
set check_function_bodies = off;


-- ===========================================================================
-- 1) ENUM, PRIVATE ŞEMASI, YARDIMCI FONKSİYON
--    Kaynak: 0001 (enum), 0015 (enum'a 'muhasebeci' eklemesi),
--            0004 (current_profile_role), 0006 (private şemasına taşınması)
-- ===========================================================================

-- 0001 üç değerle yaratmış, 0015 'muhasebeci'yi eklemişti — burada dört değerli
-- nihai hâli tek seferde tanımlanıyor (alter type zinciri yok).
create type app_role as enum ('yonetici', 'veli', 'antrenor', 'muhasebeci');

-- 0006: fonksiyon bilinçli olarak `private` şemasında. PostgREST yalnızca
-- `public` şemasını dışa açtığı için buradaki fonksiyon /rest/v1/rpc/ üzerinden
-- çağrılamaz; RLS politikaları ise fonksiyona OID ile bağlandığından etkilenmez.
create schema if not exists private;

-- RLS politikalarında tekrar tekrar profiles sorgusu yazmamak için. SECURITY
-- DEFINER olduğundan profiles'ın kendi RLS'ine takılmadan çağıranın rolünü döner.
create or replace function private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid()
$$;


-- ===========================================================================
-- 2) KİMLİK / KURUM TABLOLARI
--    Kaynak: 0001 (profiles), 0004 (şube, branş, hizmet türü, grup, sporcular,
--            veli↔sporcu, antrenör↔sporcu)
-- ===========================================================================
-- Not: 0004'te `alter table profiles add constraint profiles_sube_id_fkey ...`
-- ile sonradan bağlanan FK burada doğrudan tanımda. Bu yüzden `sube` tablosu
-- `profiles`ten ÖNCE yaratılıyor.

create table sube (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alt_bilgi text
);

create table brans (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  ikon text
);

create table hizmet_turu (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aciklama text,
  ikon text
);

create table kurum_brans_secimi (
  sube_id uuid not null references sube(id) on delete cascade,
  brans_id uuid not null references brans(id) on delete cascade,
  primary key (sube_id, brans_id)
);

create table kurum_hizmet_turu_secimi (
  sube_id uuid not null references sube(id) on delete cascade,
  hizmet_turu_id uuid not null references hizmet_turu(id) on delete cascade,
  primary key (sube_id, hizmet_turu_id)
);

create table grup (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  brans_id uuid references brans(id),
  sube_id uuid references sube(id)
);

-- Kullanıcı profilleri — auth.users'a 1:1 bağlı, rol bazlı yetkilendirmenin temeli.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null,
  ad text not null,
  telefon text,
  sube_id uuid,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint profiles_sube_id_fkey foreign key (sube_id) references sube(id)
);

-- Sporcular — birleşik roster. veli_ad/veli_telefon/veli_yakinlik ve odeme_durumu
-- bilinçli olarak düz kolon: her veli için gerçek bir profiles satırı olmak zorunda
-- değil. RLS'i sağlayan gerçek ilişki `veli_sporcu` tablosudur.
create table sporcular (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  numara int,
  brans_id uuid references brans(id),
  grup_id uuid references grup(id),
  sube_id uuid references sube(id),
  odeme_durumu text not null default 'guncel' check (odeme_durumu in ('guncel', 'gecikmis')),
  veli_ad text,
  veli_telefon text,
  veli_yakinlik text,
  dogum_yili int,
  kayit_tarihi text,
  created_at timestamptz not null default now()
);

create table veli_sporcu (
  veli_id uuid not null references profiles(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  yakinlik text,
  primary key (veli_id, sporcu_id)
);

create table sporcu_antrenor (
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  antrenor_id uuid not null references profiles(id) on delete cascade,
  primary key (sporcu_id, antrenor_id)
);


-- ===========================================================================
-- 3) FİNANS (AİDAT PLANI + ÖDEME)
--    Kaynak: 0007 (tablolar), 0014 (odeme.aidat_plani_id kolonu)
-- ===========================================================================

create table aidat_plani (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alt text,
  fiyat numeric not null,
  beklenen numeric,
  sube_id uuid references sube(id)
);

-- 0014'te `alter table odeme add column aidat_plani_id ...` ile eklenen kolon
-- burada doğrudan tanımın içinde (nullable — plan bağlamak zorunlu değil).
create table odeme (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  aciklama text not null,
  tutar numeric not null,
  yontem text not null check (yontem in ('kart', 'havale', 'elden')),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'gecikti', 'odendi')),
  son_odeme_tarihi date,
  odendi_tarihi date,
  olusturan_id uuid references profiles(id),
  aidat_plani_id uuid references aidat_plani(id),
  created_at timestamptz not null default now()
);


-- ===========================================================================
-- 4) ANTRENMAN / YOKLAMA / GELİŞİM
--    Kaynak: 0008
-- ===========================================================================
-- Not: tablo adı "ders" değil "antrenman" — bireysel ders (ücretli 1:1)
-- kavramıyla isim çakışmasın diye.

create table antrenman (
  id uuid primary key default gen_random_uuid(),
  grup_id uuid not null references grup(id),
  tarih date not null default current_date,
  saat1 text,
  saat2 text,
  tesis text,
  yoklama_kaydedildi boolean not null default false,
  yoklama_kayit_zamani text,
  created_at timestamptz not null default now(),
  unique (grup_id, tarih)
);

create table yoklama (
  id uuid primary key default gen_random_uuid(),
  antrenman_id uuid not null references antrenman(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durum text check (durum in ('katildi', 'katilmadi')),
  izinli boolean not null default false,
  izin_detay text,
  created_at timestamptz not null default now(),
  unique (antrenman_id, sporcu_id)
);

create table beceri (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  brans_id uuid references brans(id),
  sira int not null default 0
);

-- Sporcu başına TEK aktif değerlendirme (unique sporcu_id) — gönder/kilit-aç aynı
-- satırı değiştirir, geçmiş sürüm tutulmaz.
create table gelisim_degerlendirme (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null unique references sporcular(id) on delete cascade,
  antrenor_id uuid references profiles(id),
  not_metni text not null default '',
  gonderildi boolean not null default false,
  tarih date,
  created_at timestamptz not null default now()
);

create table gelisim_beceri_seviye (
  degerlendirme_id uuid not null references gelisim_degerlendirme(id) on delete cascade,
  beceri_id uuid not null references beceri(id),
  seviye int not null check (seviye between 1 and 5),
  primary key (degerlendirme_id, beceri_id)
);


-- ===========================================================================
-- 5) DUYURU / ETKİNLİK / MAÇ KADROSU
--    Kaynak: 0009
-- ===========================================================================

create table duyuru (
  id uuid primary key default gen_random_uuid(),
  baslik text not null,
  mesaj text not null,
  tur text not null default 'genel' check (tur in ('kamp', 'servis', 'basari', 'genel')),
  tum_veliler boolean not null default true,
  sms_ile boolean not null default false,
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table duyuru_hedef (
  duyuru_id uuid not null references duyuru(id) on delete cascade,
  grup_id uuid not null references grup(id),
  primary key (duyuru_id, grup_id)
);

create table etkinlik (
  id uuid primary key default gen_random_uuid(),
  tur text not null check (tur in ('mac', 'turnuva', 'kamp')),
  baslik text not null,
  grup_id uuid references grup(id),
  tesis text,
  tarih date not null,
  saat text,
  lcv_istenir boolean not null default false,
  ucretli boolean not null default false,
  tutar numeric,
  aciklama text,
  rakip text,
  skor_biz int,
  skor_rakip int,
  sonuc text check (sonuc in ('galibiyet', 'maglubiyet', 'beraberlik')),
  sonuc_notu text,
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table etkinlik_katilim (
  etkinlik_id uuid not null references etkinlik(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'katilir', 'katilmaz')),
  updated_at timestamptz not null default now(),
  primary key (etkinlik_id, sporcu_id)
);

create table mac_kadro (
  id uuid primary key default gen_random_uuid(),
  etkinlik_id uuid not null unique references etkinlik(id) on delete cascade,
  yayinlandi boolean not null default false,
  created_at timestamptz not null default now()
);

create table mac_kadro_sporcu (
  mac_kadro_id uuid not null references mac_kadro(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  secili boolean not null default false,
  primary key (mac_kadro_id, sporcu_id)
);


-- ===========================================================================
-- 6) MESAJLAŞMA
--    Kaynak: 0010 (tablolar), 0011 (mesaj.gonderen_rol kolonu)
-- ===========================================================================

create table konusma (
  id uuid primary key default gen_random_uuid(),
  veli_id uuid not null references profiles(id),
  antrenor_id uuid not null references profiles(id),
  son_mesaj text,
  son_mesaj_zaman timestamptz,
  veli_okundu_zaman timestamptz,
  antrenor_okundu_zaman timestamptz,
  created_at timestamptz not null default now(),
  unique (veli_id, antrenor_id)
);

-- gonderen_rol (0011): aynı hesabın hem veli hem antrenör olarak test edildiği
-- durumda (veli_id = antrenor_id) mesajın hangi "şapkayla" yazıldığını ayırt eder.
create table mesaj (
  id uuid primary key default gen_random_uuid(),
  konusma_id uuid not null references konusma(id) on delete cascade,
  gonderen_id uuid not null references profiles(id),
  metin text not null,
  gonderen_rol text not null default 'veli' check (gonderen_rol in ('veli', 'antrenor')),
  created_at timestamptz not null default now()
);


-- ===========================================================================
-- 7) SERVİS / MAĞAZA
--    Kaynak: 0012 (tablolar), 0018 (servis_rota.sofor_telefon kolonu)
-- ===========================================================================

-- sofor_telefon (0018): servis ekranındaki "Ara" butonu için. Boşsa uygulama
-- butonu gizler.
create table servis_rota (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  sofor text not null,
  plaka text not null,
  arac text not null,
  alt text,
  durum_txt text not null default 'Planlandı',
  yolda boolean not null default false,
  konum_saat text,
  konum_hiz text,
  sofor_telefon text,
  sube_id uuid references sube(id),
  created_at timestamptz not null default now()
);

create table servis_durak (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references servis_rota(id) on delete cascade,
  ad text not null,
  sub text,
  saat text,
  sira int not null default 0,
  durum text not null default 'bekliyor' check (durum in ('gecti', 'suan', 'bekliyor'))
);

create table servis_sporcu (
  rota_id uuid not null references servis_rota(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durak_id uuid references servis_durak(id),
  primary key (rota_id, sporcu_id)
);

create table urun (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aciklama text,
  kategori text not null check (kategori in ('Forma', 'Giyim', 'Aksesuar')),
  fiyat numeric not null,
  stok int not null default 0,
  aktif boolean not null default true,
  badge text,
  jersey boolean not null default false,
  sube_id uuid references sube(id),
  created_at timestamptz not null default now()
);

create table siparis (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null references sporcular(id),
  tutar numeric not null,
  durum text not null default 'hazirlaniyor' check (durum in ('hazirlaniyor', 'hazir', 'teslim')),
  created_at timestamptz not null default now()
);

create table siparis_kalem (
  id uuid primary key default gen_random_uuid(),
  siparis_id uuid not null references siparis(id) on delete cascade,
  urun_id uuid not null references urun(id),
  beden text,
  adet int not null default 1,
  birim_fiyat numeric not null,
  not_metni text
);


-- ===========================================================================
-- 8) BİREYSEL DERS / HAKEDİŞ / BAŞVURU
--    Kaynak: 0013
-- ===========================================================================

create table bireysel_antrenor (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null unique references profiles(id) on delete cascade,
  brans_id uuid references brans(id),
  deneyim_yil int not null default 0,
  puan numeric(2,1),
  bio text,
  musait boolean not null default true,
  tek_fiyat numeric not null,
  paket_fiyat numeric not null,
  paket_ders_sayisi int not null default 10,
  varsayilan_tesis text,
  created_at timestamptz not null default now()
);

create table bireysel_musaitlik (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  gun_index int not null check (gun_index between 0 and 6),
  baslangic_saat text not null,
  bitis_saat text not null,
  aktif boolean not null default true,
  unique (antrenor_id, gun_index)
);

create table bireysel_istisna (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  tarih date not null,
  aciklama text,
  created_at timestamptz not null default now(),
  unique (antrenor_id, tarih)
);

-- (antrenör, sporcu) skalasında — her paket satışı yeni satır, üzerine yazılmaz.
create table bireysel_paket (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  toplam int not null,
  kalan int not null check (kalan >= 0),
  tutar numeric not null,
  created_at timestamptz not null default now()
);

create table bireysel_rezervasyon (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id),
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  tarih date not null,
  saat text not null,
  sure_dk int not null default 60,
  tesis text,
  odeme_tipi text not null check (odeme_tipi in ('tek', 'paket')),
  paket_id uuid references bireysel_paket(id),
  tutar numeric not null,
  odeme_notu text,
  durum text not null default 'onay_bekliyor'
    check (durum in ('onay_bekliyor', 'onaylandi', 'reddedildi', 'tamamlandi', 'iptal', 'gelmedi')),
  sonuc_zamani timestamptz,
  created_at timestamptz not null default now(),
  check ((odeme_tipi = 'paket' and paket_id is not null) or (odeme_tipi = 'tek' and paket_id is null))
);

-- Aynı antrenörün aynı saatini iki kişi kapamasın diye — reddedildi/iptal hariç.
create unique index bireysel_rezervasyon_slot_uniq on bireysel_rezervasyon (antrenor_id, tarih, saat)
  where durum not in ('reddedildi', 'iptal');

-- Hakediş — grup dersi bordrosu, gerçek antrenman satır sayısından hesaplanır.
create table antrenor_grup_ucret (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  grup_id uuid not null references grup(id) on delete cascade,
  ders_ucreti numeric not null,
  created_at timestamptz not null default now(),
  unique (antrenor_id, grup_id)
);

create table hakedis (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  donem_ay date not null,
  tutar numeric not null default 0,
  odendi boolean not null default false,
  odendi_tarihi date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (antrenor_id, donem_ay)
);

create table hakedis_kalem (
  id uuid primary key default gen_random_uuid(),
  hakedis_id uuid not null references hakedis(id) on delete cascade,
  grup_id uuid references grup(id),
  ders_sayisi int not null,
  birim_ucret numeric not null,
  tutar numeric not null,
  created_at timestamptz not null default now()
);

-- Başvurular — sporcu_id yalnızca başvuru onaylandığında doldurulur.
create table basvuru (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  dogum_yili int,
  brans_id uuid references brans(id),
  grup_id uuid references grup(id),
  sube_id uuid references sube(id),
  veli_ad text,
  veli_telefon text,
  tag text not null check (tag in ('DENEME', 'KAYIT')),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  detay_notu text,
  sporcu_id uuid references sporcular(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);


-- ===========================================================================
-- 9) MUHASEBE / AYARLAR / MOBİL BAYRAK / PUSH
--    Kaynak: 0014 (gider, fatura), 0015 (kurum_ayarlari),
--            0019 (mobil_ozellik), 0020 (push_token)
-- ===========================================================================

create table gider (
  id uuid primary key default gen_random_uuid(),
  tarih date not null default current_date,
  kategori text not null,
  aciklama text,
  tutar numeric not null,
  yontem text not null check (yontem in ('kart', 'havale', 'elden')),
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table fatura (
  id uuid primary key default gen_random_uuid(),
  fatura_no text not null unique,
  sporcu_id uuid not null references sporcular(id),
  tutar numeric not null,
  tarih date not null default current_date,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi')),
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Tekil satır (singleton): id boolean primary key + check(id) sayesinde tabloda
-- en fazla bir satır olabilir.
-- Not: 0015'te kulup_adi varsayılanı 'Karşıyaka Spor Okulu' idi; SaaS kurulumunda
-- demo kulüp adı taşınmaması için nötr bir varsayılana çekildi. Gerçek kulüp adı
-- 02_katalog.sql'de veya Ayarlar ekranından yazılır.
create table kurum_ayarlari (
  id boolean primary key default true check (id),
  kulup_adi text not null default 'Spor Kulübü',
  telefon text,
  eposta text,
  adres text,
  para_birimi text not null default 'TRY' check (para_birimi in ('TRY', 'USD', 'EUR')),
  updated_at timestamptz not null default now()
);

-- Mobil özellik bayrakları — panelden aç/kapa. Bayrak seti sabittir; yeni bayrak
-- mobil tarafta karşılığı olan kod gerektirdiği için migration'la gelir.
-- Bayrak SATIRLARI (mesajlar/magaza/servis/bireysel_ders/etkinlikler) her kulümde
-- gerekli başlangıç verisi olduğu için 02_katalog.sql'de eklenir.
create table mobil_ozellik (
  anahtar text primary key,
  ad text not null,
  aciklama text,
  aktif boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Expo push token kaydı — cihaz başına tek satır (token primary key).
create table push_token (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);


-- ===========================================================================
-- 10) ROW LEVEL SECURITY
-- ===========================================================================
-- 45 tablonun tamamında RLS açık. Politikalar aşağıda NİHAİ halleriyle:
--   · 0016'nın drop+recreate ettiği etkinlik / yoklama(veli insert) /
--     bireysel_rezervasyon(antrenör update) / profiles(update) politikaları
--     yalnızca 0016 sonrası hâliyle,
--   · 0015'in `alter policy` ile muhasebeciye açtığı odeme / aidat_plani /
--     gider / fatura politikaları genişletilmiş hâliyle yazılmıştır.

alter table profiles                enable row level security;
alter table sube                    enable row level security;
alter table brans                   enable row level security;
alter table hizmet_turu             enable row level security;
alter table kurum_brans_secimi      enable row level security;
alter table kurum_hizmet_turu_secimi enable row level security;
alter table grup                    enable row level security;
alter table sporcular               enable row level security;
alter table veli_sporcu             enable row level security;
alter table sporcu_antrenor         enable row level security;
alter table aidat_plani             enable row level security;
alter table odeme                   enable row level security;
alter table antrenman               enable row level security;
alter table yoklama                 enable row level security;
alter table beceri                  enable row level security;
alter table gelisim_degerlendirme   enable row level security;
alter table gelisim_beceri_seviye   enable row level security;
alter table duyuru                  enable row level security;
alter table duyuru_hedef            enable row level security;
alter table etkinlik                enable row level security;
alter table etkinlik_katilim        enable row level security;
alter table mac_kadro               enable row level security;
alter table mac_kadro_sporcu        enable row level security;
alter table konusma                 enable row level security;
alter table mesaj                   enable row level security;
alter table servis_rota             enable row level security;
alter table servis_durak            enable row level security;
alter table servis_sporcu           enable row level security;
alter table urun                    enable row level security;
alter table siparis                 enable row level security;
alter table siparis_kalem           enable row level security;
alter table bireysel_antrenor       enable row level security;
alter table bireysel_musaitlik      enable row level security;
alter table bireysel_istisna        enable row level security;
alter table bireysel_paket          enable row level security;
alter table bireysel_rezervasyon    enable row level security;
alter table antrenor_grup_ucret     enable row level security;
alter table hakedis                 enable row level security;
alter table hakedis_kalem           enable row level security;
alter table basvuru                 enable row level security;
alter table gider                   enable row level security;
alter table fatura                  enable row level security;
alter table kurum_ayarlari          enable row level security;
alter table mobil_ozellik           enable row level security;
alter table push_token              enable row level security;


-- ---------------------------------------------------------------------------
-- 10.1 profiles  (0001 + 0010 + 0013 + 0016)
-- ---------------------------------------------------------------------------
create policy "profiles: kullanıcı kendi profilini okur"
  on profiles for select
  using (auth.uid() = id);

-- 0016: 0001'deki politikada WITH CHECK yoktu — role yükseltmesine açıktı.
-- WITH CHECK + protect_profile_role() trigger'ı (bölüm 11) birlikte kapatır.
create policy "profiles: kullanıcı kendi profilini günceller"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 0010: yeni sohbet rehberi + konuşma listesinde karşı tarafın adı için.
create policy "profiles: veli kendi antrenörünü görür" on profiles for select
  using (
    exists (
      select 1 from sporcu_antrenor sa join veli_sporcu vs on vs.sporcu_id = sa.sporcu_id
      where sa.antrenor_id = profiles.id and vs.veli_id = auth.uid()
    )
  );
create policy "profiles: antrenör bağlı velisini görür" on profiles for select
  using (
    exists (
      select 1 from sporcu_antrenor sa join veli_sporcu vs on vs.sporcu_id = sa.sporcu_id
      where vs.veli_id = profiles.id and sa.antrenor_id = auth.uid()
    )
  );

-- 0013: hakediş ekranı gerçek antrenör adını profiles'tan join'lemek zorunda.
create policy "profiles: yönetici tümünü görür" on profiles for select
  using (private.current_profile_role() = 'yonetici');


-- ---------------------------------------------------------------------------
-- 10.2 Kurum kataloğu: sube / brans / hizmet_turu / kurum_*_secimi / grup  (0004)
--      Desen: giriş yapan herkes okur, yalnızca yönetici yazar.
-- ---------------------------------------------------------------------------
create policy "sube: giriş yapan herkes okur" on sube for select using (auth.uid() is not null);
create policy "sube: yönetici yazar" on sube for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "brans: giriş yapan herkes okur" on brans for select using (auth.uid() is not null);
create policy "brans: yönetici yazar" on brans for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "hizmet_turu: giriş yapan herkes okur" on hizmet_turu for select using (auth.uid() is not null);
create policy "hizmet_turu: yönetici yazar" on hizmet_turu for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "kurum_brans_secimi: giriş yapan herkes okur" on kurum_brans_secimi for select using (auth.uid() is not null);
create policy "kurum_brans_secimi: yönetici yazar" on kurum_brans_secimi for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "kurum_hizmet_turu_secimi: giriş yapan herkes okur" on kurum_hizmet_turu_secimi for select using (auth.uid() is not null);
create policy "kurum_hizmet_turu_secimi: yönetici yazar" on kurum_hizmet_turu_secimi for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "grup: giriş yapan herkes okur" on grup for select using (auth.uid() is not null);
create policy "grup: yönetici yazar" on grup for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');


-- ---------------------------------------------------------------------------
-- 10.3 sporcular / veli_sporcu / sporcu_antrenor  (0004 + 0015 + 0018)
-- ---------------------------------------------------------------------------
create policy "sporcular: yönetici tümünü görür" on sporcular for select
  using (private.current_profile_role() = 'yonetici');
create policy "sporcular: antrenör bağlı olduklarını görür" on sporcular for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = sporcular.id and sa.antrenor_id = auth.uid()));
create policy "sporcular: veli bağlı olduklarını görür" on sporcular for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = sporcular.id and vs.veli_id = auth.uid()));
-- 0015: muhasebe sayfalarındaki sporcu adı join'leri ve seçim dropdown'ları için.
create policy "sporcular: muhasebeci tümünü görür" on sporcular for select
  using (private.current_profile_role() = 'muhasebeci');
create policy "sporcular: yönetici ekler/günceller" on sporcular for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "sporcular: yönetici günceller" on sporcular for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "veli_sporcu: yönetici tümünü görür" on veli_sporcu for select
  using (private.current_profile_role() = 'yonetici');
create policy "veli_sporcu: veli kendi bağını görür" on veli_sporcu for select
  using (veli_id = auth.uid());
create policy "veli_sporcu: yönetici yazar" on veli_sporcu for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "veli_sporcu: yönetici siler" on veli_sporcu for delete
  using (private.current_profile_role() = 'yonetici');

create policy "sporcu_antrenor: yönetici tümünü görür" on sporcu_antrenor for select
  using (private.current_profile_role() = 'yonetici');
create policy "sporcu_antrenor: antrenör kendi bağını görür" on sporcu_antrenor for select
  using (antrenor_id = auth.uid());
-- 0018: veli, çocuğunun antrenörünü göremiyordu (ana sayfa / gelişim / mesaj rehberi).
create policy "sporcu_antrenor: veli bağlı sporcusunun antrenörünü görür" on sporcu_antrenor for select
  using (exists (
    select 1 from veli_sporcu vs
    where vs.sporcu_id = sporcu_antrenor.sporcu_id and vs.veli_id = auth.uid()
  ));
create policy "sporcu_antrenor: yönetici yazar" on sporcu_antrenor for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "sporcu_antrenor: yönetici siler" on sporcu_antrenor for delete
  using (private.current_profile_role() = 'yonetici');


-- ---------------------------------------------------------------------------
-- 10.4 aidat_plani / odeme  (0007, 0015 ile muhasebeciye genişletilmiş)
-- ---------------------------------------------------------------------------
create policy "aidat_plani: giriş yapan herkes okur" on aidat_plani for select using (auth.uid() is not null);
create policy "aidat_plani: yönetici yazar" on aidat_plani for all
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

create policy "odeme: yönetici tümünü görür" on odeme for select
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'));
create policy "odeme: veli bağlı sporcusunu görür" on odeme for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = odeme.sporcu_id and vs.veli_id = auth.uid()));
create policy "odeme: yönetici yazar" on odeme for insert
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));
create policy "odeme: yönetici günceller" on odeme for update
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));


-- ---------------------------------------------------------------------------
-- 10.5 antrenman / yoklama / beceri / gelişim  (0008 + 0012 + 0016)
-- ---------------------------------------------------------------------------
create policy "antrenman: yönetici tümünü görür" on antrenman for select
  using (private.current_profile_role() = 'yonetici');
create policy "antrenman: antrenör kendi grubunu görür" on antrenman for select
  using (exists (
    select 1 from sporcu_antrenor sa join sporcular s on s.id = sa.sporcu_id
    where s.grup_id = antrenman.grup_id and sa.antrenor_id = auth.uid()
  ));
create policy "antrenman: veli bağlı sporcusunun grubunu görür" on antrenman for select
  using (exists (
    select 1 from veli_sporcu vs join sporcular s on s.id = vs.sporcu_id
    where s.grup_id = antrenman.grup_id and vs.veli_id = auth.uid()
  ));
create policy "antrenman: yönetici yazar" on antrenman for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "antrenman: yönetici günceller" on antrenman for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "antrenman: antrenör kendi grubunu günceller" on antrenman for update
  using (exists (
    select 1 from sporcu_antrenor sa join sporcular s on s.id = sa.sporcu_id
    where s.grup_id = antrenman.grup_id and sa.antrenor_id = auth.uid()
  ))
  with check (exists (
    select 1 from sporcu_antrenor sa join sporcular s on s.id = sa.sporcu_id
    where s.grup_id = antrenman.grup_id and sa.antrenor_id = auth.uid()
  ));

create policy "yoklama: yönetici tümünü görür" on yoklama for select
  using (private.current_profile_role() = 'yonetici');
create policy "yoklama: antrenör kendi sporcusunu görür" on yoklama for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "yoklama: veli bağlı sporcusunu görür" on yoklama for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid()));
create policy "yoklama: yönetici yazar" on yoklama for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "yoklama: antrenör kendi sporcusu için yazar" on yoklama for insert
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "yoklama: yönetici günceller" on yoklama for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "yoklama: antrenör kendi sporcusunu günceller" on yoklama for update
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()))
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()));

-- Veli "İzin Bildir" (0012), 0016'nın grup eşleşmesi kontrolüyle birlikte:
-- `durum is null` sayesinde veli asla katıldı/katılmadı yazamaz veya antrenörün
-- işaretlediği satırı değiştiremez; ek exists ile yalnızca çocuğunun grubunun
-- antrenmanına satır ekleyebilir.
create policy "yoklama: veli kendi sporcusu için izin bildirir (ekler)" on yoklama for insert
  with check (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
    and exists (
      select 1 from antrenman a join sporcular s on s.grup_id = a.grup_id
      where a.id = yoklama.antrenman_id and s.id = yoklama.sporcu_id
    )
  );
create policy "yoklama: veli kendi sporcusunun işaretlenmemiş satırını günceller" on yoklama for update
  using (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
  )
  with check (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
  );

create policy "beceri: giriş yapan herkes okur" on beceri for select using (auth.uid() is not null);
create policy "beceri: yönetici yazar" on beceri for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- Veli yalnızca gönderilmiş (gonderildi=true) değerlendirmeyi görür — taslak sızmaz.
create policy "gelisim: yönetici tümünü görür" on gelisim_degerlendirme for select
  using (private.current_profile_role() = 'yonetici');
create policy "gelisim: antrenör kendi sporcusunu görür" on gelisim_degerlendirme for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "gelisim: veli gönderilmiş olanı görür" on gelisim_degerlendirme for select
  using (gonderildi = true and exists (select 1 from veli_sporcu vs where vs.sporcu_id = gelisim_degerlendirme.sporcu_id and vs.veli_id = auth.uid()));
create policy "gelisim: yönetici yazar" on gelisim_degerlendirme for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "gelisim: antrenör kendi sporcusu için yazar" on gelisim_degerlendirme for insert
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "gelisim: yönetici günceller" on gelisim_degerlendirme for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "gelisim: antrenör kendi sporcusunu günceller" on gelisim_degerlendirme for update
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()))
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()));

create policy "gelisim_seviye: degerlendirme üzerinden okur" on gelisim_beceri_seviye for select
  using (exists (
    select 1 from gelisim_degerlendirme gd where gd.id = gelisim_beceri_seviye.degerlendirme_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gd.sporcu_id and sa.antrenor_id = auth.uid())
      or (gd.gonderildi = true and exists (select 1 from veli_sporcu vs where vs.sporcu_id = gd.sporcu_id and vs.veli_id = auth.uid()))
    )
  ));
create policy "gelisim_seviye: yönetici ve antrenör yazar" on gelisim_beceri_seviye for all
  using (exists (
    select 1 from gelisim_degerlendirme gd where gd.id = gelisim_beceri_seviye.degerlendirme_id
    and (private.current_profile_role() = 'yonetici' or exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gd.sporcu_id and sa.antrenor_id = auth.uid()))
  ))
  with check (exists (
    select 1 from gelisim_degerlendirme gd where gd.id = gelisim_beceri_seviye.degerlendirme_id
    and (private.current_profile_role() = 'yonetici' or exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gd.sporcu_id and sa.antrenor_id = auth.uid()))
  ));


-- ---------------------------------------------------------------------------
-- 10.6 duyuru / etkinlik / maç kadrosu  (0009 + 0016)
-- ---------------------------------------------------------------------------
create policy "duyuru: yönetici tümünü görür" on duyuru for select
  using (private.current_profile_role() = 'yonetici');
create policy "duyuru: veli hedefindeyse görür" on duyuru for select
  using (
    auth.uid() is not null
    and (
      tum_veliler = true
      or exists (
        select 1 from duyuru_hedef dh
        join sporcular s on s.grup_id = dh.grup_id
        join veli_sporcu vs on vs.sporcu_id = s.id
        where dh.duyuru_id = duyuru.id and vs.veli_id = auth.uid()
      )
    )
  );
create policy "duyuru: yönetici yazar" on duyuru for insert
  with check (private.current_profile_role() = 'yonetici');

create policy "duyuru_hedef: giriş yapan herkes okur" on duyuru_hedef for select using (auth.uid() is not null);
create policy "duyuru_hedef: yönetici yazar" on duyuru_hedef for insert
  with check (private.current_profile_role() = 'yonetici');

create policy "etkinlik: yönetici tümünü görür" on etkinlik for select
  using (private.current_profile_role() = 'yonetici');
-- 0016: `grup_id is null` dalında auth kontrolü yoktu — girişsiz (yalnızca anon
-- key ile) tüm genel etkinlikler okunabiliyordu. `auth.uid() is not null` şart.
create policy "etkinlik: antrenör kendi grubunu görür" on etkinlik for select
  using (
    auth.uid() is not null
    and (
      grup_id is null
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  );
create policy "etkinlik: veli kendi grubunu görür" on etkinlik for select
  using (
    auth.uid() is not null
    and (
      grup_id is null
      or exists (
        select 1 from sporcular s join veli_sporcu vs on vs.sporcu_id = s.id
        where s.grup_id = etkinlik.grup_id and vs.veli_id = auth.uid()
      )
    )
  );
create policy "etkinlik: yönetici yazar" on etkinlik for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "etkinlik: yönetici günceller" on etkinlik for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "etkinlik_katilim: yönetici tümünü görür" on etkinlik_katilim for select
  using (private.current_profile_role() = 'yonetici');
create policy "etkinlik_katilim: antrenör kendi sporcusunu görür" on etkinlik_katilim for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = etkinlik_katilim.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "etkinlik_katilim: veli kendi sporcusunu görür" on etkinlik_katilim for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()));
create policy "etkinlik_katilim: veli kendi sporcusu için yazar" on etkinlik_katilim for insert
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()));
create policy "etkinlik_katilim: veli kendi sporcusunu günceller" on etkinlik_katilim for update
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()))
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()));

create policy "mac_kadro: yönetici tümünü görür" on mac_kadro for select
  using (private.current_profile_role() = 'yonetici');
create policy "mac_kadro: antrenör kendi grubunu görür" on mac_kadro for select
  using (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ));
create policy "mac_kadro: yönetici yazar" on mac_kadro for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "mac_kadro: antrenör kendi grubu için yazar" on mac_kadro for insert
  with check (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ));
create policy "mac_kadro: yönetici günceller" on mac_kadro for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "mac_kadro: antrenör kendi grubunu günceller" on mac_kadro for update
  using (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ))
  with check (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ));

create policy "mac_kadro_sporcu: erişim mac_kadro üzerinden" on mac_kadro_sporcu for select
  using (exists (
    select 1 from mac_kadro mk join etkinlik e on e.id = mk.etkinlik_id
    where mk.id = mac_kadro_sporcu.mac_kadro_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = e.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  ));
create policy "mac_kadro_sporcu: yönetici ve antrenör yazar" on mac_kadro_sporcu for all
  using (exists (
    select 1 from mac_kadro mk join etkinlik e on e.id = mk.etkinlik_id
    where mk.id = mac_kadro_sporcu.mac_kadro_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = e.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  ))
  with check (exists (
    select 1 from mac_kadro mk join etkinlik e on e.id = mk.etkinlik_id
    where mk.id = mac_kadro_sporcu.mac_kadro_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = e.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  ));


-- ---------------------------------------------------------------------------
-- 10.7 konusma / mesaj  (0010)
-- ---------------------------------------------------------------------------
create policy "konusma: veli kendi görür" on konusma for select
  using (veli_id = auth.uid());
create policy "konusma: antrenör kendi görür" on konusma for select
  using (antrenor_id = auth.uid());
create policy "konusma: yönetici tümünü görür" on konusma for select
  using (private.current_profile_role() = 'yonetici');
-- Veli yalnızca gerçekten çocuğunun antrenörü olan biriyle konuşma açabilir.
create policy "konusma: veli gerçek antrenörüyle açar" on konusma for insert
  with check (
    veli_id = auth.uid()
    and exists (
      select 1 from sporcu_antrenor sa join veli_sporcu vs on vs.sporcu_id = sa.sporcu_id
      where sa.antrenor_id = konusma.antrenor_id and vs.veli_id = auth.uid()
    )
  );
-- Taraf değiştirmeyi protect_konusma_taraflar() trigger'ı engeller (bölüm 11).
create policy "konusma: veli kendi thread'ini günceller" on konusma for update
  using (veli_id = auth.uid()) with check (veli_id = auth.uid());
create policy "konusma: antrenör kendi thread'ini günceller" on konusma for update
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());

create policy "mesaj: konusma katılımcısı okur" on mesaj for select
  using (exists (
    select 1 from konusma k where k.id = mesaj.konusma_id
    and (k.veli_id = auth.uid() or k.antrenor_id = auth.uid())
  ));
create policy "mesaj: yönetici tümünü okur" on mesaj for select
  using (private.current_profile_role() = 'yonetici');
create policy "mesaj: katılımcı yazar" on mesaj for insert
  with check (
    gonderen_id = auth.uid()
    and exists (
      select 1 from konusma k where k.id = mesaj.konusma_id
      and (k.veli_id = auth.uid() or k.antrenor_id = auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- 10.8 servis / mağaza  (0012)
-- ---------------------------------------------------------------------------
create policy "servis_rota: yönetici tümünü yönetir" on servis_rota for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "servis_rota: veli çocuğunun rotasını görür" on servis_rota for select
  using (exists (
    select 1 from servis_sporcu ss join veli_sporcu vs on vs.sporcu_id = ss.sporcu_id
    where ss.rota_id = servis_rota.id and vs.veli_id = auth.uid()
  ));

create policy "servis_durak: yönetici tümünü yönetir" on servis_durak for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "servis_durak: veli çocuğunun rotasının duraklarını görür" on servis_durak for select
  using (exists (
    select 1 from servis_sporcu ss join veli_sporcu vs on vs.sporcu_id = ss.sporcu_id
    where ss.rota_id = servis_durak.rota_id and vs.veli_id = auth.uid()
  ));

create policy "servis_sporcu: yönetici tümünü yönetir" on servis_sporcu for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "servis_sporcu: veli kendi çocuğunu görür" on servis_sporcu for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = servis_sporcu.sporcu_id and vs.veli_id = auth.uid()));

create policy "urun: giriş yapan herkes okur" on urun for select using (auth.uid() is not null);
create policy "urun: yönetici yazar" on urun for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "siparis: yönetici tümünü yönetir" on siparis for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "siparis: veli bağlı sporcusunu görür" on siparis for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = siparis.sporcu_id and vs.veli_id = auth.uid()));
create policy "siparis: veli kendi sporcusu için sipariş açar" on siparis for insert
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = siparis.sporcu_id and vs.veli_id = auth.uid()));

create policy "siparis_kalem: erişim siparis üzerinden okunur" on siparis_kalem for select
  using (exists (
    select 1 from siparis s where s.id = siparis_kalem.siparis_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (select 1 from veli_sporcu vs where vs.sporcu_id = s.sporcu_id and vs.veli_id = auth.uid())
    )
  ));
create policy "siparis_kalem: yönetici tümünü yönetir" on siparis_kalem for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "siparis_kalem: veli kendi siparişine kalem ekler" on siparis_kalem for insert
  with check (exists (
    select 1 from siparis s join veli_sporcu vs on vs.sporcu_id = s.sporcu_id
    where s.id = siparis_kalem.siparis_id and vs.veli_id = auth.uid()
  ));


-- ---------------------------------------------------------------------------
-- 10.9 bireysel ders / hakediş / başvuru  (0013 + 0016 + 0018)
-- ---------------------------------------------------------------------------
create policy "bireysel_antrenor: giriş yapan herkes okur" on bireysel_antrenor for select
  using (auth.uid() is not null);
create policy "bireysel_antrenor: yönetici yazar" on bireysel_antrenor for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "bireysel_antrenor: yönetici günceller" on bireysel_antrenor for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "bireysel_antrenor: antrenör kendi kaydını günceller" on bireysel_antrenor for update
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());

create policy "bireysel_musaitlik: giriş yapan herkes okur" on bireysel_musaitlik for select
  using (auth.uid() is not null);
create policy "bireysel_musaitlik: antrenör kendi kaydını yönetir" on bireysel_musaitlik for all
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());
create policy "bireysel_musaitlik: yönetici tümünü yönetir" on bireysel_musaitlik for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "bireysel_istisna: giriş yapan herkes okur" on bireysel_istisna for select
  using (auth.uid() is not null);
create policy "bireysel_istisna: antrenör kendi kaydını yönetir" on bireysel_istisna for all
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());
create policy "bireysel_istisna: yönetici tümünü yönetir" on bireysel_istisna for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- Paket satın alma self-servis değil: INSERT yalnızca yönetici. Veli'nin UPDATE
-- hakkı protect_bireysel_paket() trigger'ı (bölüm 11) ile "kalan tam 1 azalır"
-- kuralına kilitlenir.
create policy "bireysel_paket: yönetici tümünü görür" on bireysel_paket for select
  using (private.current_profile_role() = 'yonetici');
create policy "bireysel_paket: antrenör kendi sattığını görür" on bireysel_paket for select
  using (antrenor_id = auth.uid());
create policy "bireysel_paket: veli bağlı sporcusunu görür" on bireysel_paket for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_paket.sporcu_id and vs.veli_id = auth.uid()));
create policy "bireysel_paket: yönetici ekler" on bireysel_paket for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "bireysel_paket: veli kendi sporcusunun paketini günceller" on bireysel_paket for update
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_paket.sporcu_id and vs.veli_id = auth.uid()))
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_paket.sporcu_id and vs.veli_id = auth.uid()));
create policy "bireysel_paket: yönetici günceller" on bireysel_paket for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "bireysel_rezervasyon: yönetici tümünü görür" on bireysel_rezervasyon for select
  using (private.current_profile_role() = 'yonetici');
create policy "bireysel_rezervasyon: antrenör kendi rezervasyonunu görür" on bireysel_rezervasyon for select
  using (antrenor_id = auth.uid());
create policy "bireysel_rezervasyon: veli bağlı sporcusunu görür" on bireysel_rezervasyon for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid()));
create policy "bireysel_rezervasyon: veli kendi sporcusu için rezervasyon açar" on bireysel_rezervasyon for insert
  with check (
    durum = 'onay_bekliyor'
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );
create policy "bireysel_rezervasyon: yönetici ekler" on bireysel_rezervasyon for insert
  with check (private.current_profile_role() = 'yonetici');
-- 0016: WITH CHECK yalnızca sahipliğe bakıyordu; hedef durumlar daraltıldı.
-- Tutar/sporcu/paket dondurmayı protect_bireysel_rezervasyon() trigger'ı yapar.
create policy "bireysel_rezervasyon: antrenör onaylar/reddeder/sonuçlandırır" on bireysel_rezervasyon for update
  using (antrenor_id = auth.uid() and durum in ('onay_bekliyor', 'onaylandi'))
  with check (antrenor_id = auth.uid() and durum in ('onaylandi', 'reddedildi', 'tamamlandi', 'gelmedi'));
create policy "bireysel_rezervasyon: veli kendi rezervasyonunu iptal eder" on bireysel_rezervasyon for update
  using (
    durum in ('onay_bekliyor', 'onaylandi')
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  )
  with check (
    durum = 'iptal'
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );
create policy "bireysel_rezervasyon: yönetici günceller" on bireysel_rezervasyon for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "antrenor_grup_ucret: yönetici tümünü görür" on antrenor_grup_ucret for select
  using (private.current_profile_role() = 'yonetici');
create policy "antrenor_grup_ucret: antrenör kendi ücretini görür" on antrenor_grup_ucret for select
  using (antrenor_id = auth.uid());
create policy "antrenor_grup_ucret: yönetici yazar" on antrenor_grup_ucret for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "antrenor_grup_ucret: yönetici günceller" on antrenor_grup_ucret for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "antrenor_grup_ucret: yönetici siler" on antrenor_grup_ucret for delete
  using (private.current_profile_role() = 'yonetici');

create policy "hakedis: yönetici tümünü görür" on hakedis for select
  using (private.current_profile_role() = 'yonetici');
create policy "hakedis: antrenör kendi hakedişini görür" on hakedis for select
  using (antrenor_id = auth.uid());
create policy "hakedis: yönetici ekler" on hakedis for insert
  with check (private.current_profile_role() = 'yonetici');
-- Kilit: odendi=true olan satır USING'e takılır, yeniden hesaplama dahil hiçbir
-- güncelleme geçemez.
create policy "hakedis: yönetici günceller (kilitli değilse)" on hakedis for update
  using (private.current_profile_role() = 'yonetici' and odendi = false)
  with check (private.current_profile_role() = 'yonetici');

create policy "hakedis_kalem: erişim hakedis üzerinden okunur" on hakedis_kalem for select
  using (exists (
    select 1 from hakedis h where h.id = hakedis_kalem.hakedis_id
    and (private.current_profile_role() = 'yonetici' or h.antrenor_id = auth.uid())
  ));
create policy "hakedis_kalem: yönetici ekler (ödenmemişse)" on hakedis_kalem for insert
  with check (exists (
    select 1 from hakedis h where h.id = hakedis_kalem.hakedis_id
    and private.current_profile_role() = 'yonetici' and h.odendi = false
  ));
create policy "hakedis_kalem: yönetici siler (ödenmemişse)" on hakedis_kalem for delete
  using (exists (
    select 1 from hakedis h where h.id = hakedis_kalem.hakedis_id
    and private.current_profile_role() = 'yonetici' and h.odendi = false
  ));

-- Başvurular personel içi takip aracı; 0018 ile veli yalnızca KENDİ DENEME
-- başvurusunu ekleyebilir ve kendi başvurularını görebilir.
create policy "basvuru: yönetici tümünü yönetir" on basvuru for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "basvuru: veli kendi başvurusunu ekler" on basvuru for insert
  with check (
    created_by = auth.uid()
    and private.current_profile_role() = 'veli'
    and tag = 'DENEME'
    and durum = 'bekliyor'
    and sporcu_id is null
  );
create policy "basvuru: veli kendi başvurusunu görür" on basvuru for select
  using (created_by = auth.uid());


-- ---------------------------------------------------------------------------
-- 10.10 muhasebe / ayarlar / mobil bayrak / push  (0014 + 0015 + 0019 + 0020)
-- ---------------------------------------------------------------------------
-- Gider ve fatura tamamen dahili: veli/antrenör tarafına hiç açılmıyor.
-- 0015 ile yönetici + muhasebeci.
create policy "gider: yönetici tam yetkili" on gider for all
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

create policy "fatura: yönetici tam yetkili" on fatura for all
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

create policy "kurum_ayarlari: giriş yapan herkes okur" on kurum_ayarlari for select
  using (auth.uid() is not null);
create policy "kurum_ayarlari: yönetici günceller" on kurum_ayarlari for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "mobil_ozellik: giriş yapan herkes okur" on mobil_ozellik for select
  using (auth.uid() is not null);
create policy "mobil_ozellik: yönetici yönetir" on mobil_ozellik for all
  using (private.current_profile_role() = 'yonetici')
  with check (private.current_profile_role() = 'yonetici');

create policy "push_token: kullanıcı kendi token'ını yönetir" on push_token for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_token: yönetici tümünü okur" on push_token for select
  using (private.current_profile_role() = 'yonetici');
create policy "push_token: yönetici ölü token'ları siler" on push_token for delete
  using (private.current_profile_role() = 'yonetici');


-- ===========================================================================
-- 11) FONKSİYONLAR, TRIGGER'LAR, GRANT / REVOKE
--     Kaynak: 0016 (fonksiyon gövdeleri), 0017 (search_path sertleştirmesi),
--             0002/0005/0020 (revoke/grant), 0020 (push_token_devral)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 11.1 handle_new_user — auth.users'a kayıt olunca profiles satırı açar.
-- 0016: rol ARTIK istemci kontrollü raw_user_meta_data'dan OKUNMUYOR. Eski hâli
-- coalesce(metadata.role, 'veli') idi; doğrudan /auth/v1/signup çağrısına
-- data:{role:'yonetici'} koyan herkes yönetici hesabı açabiliyordu. Self-signup
-- HER ZAMAN 'veli'; antrenör/yönetici/muhasebeci rolleri yalnızca admin panel
-- davet akışı tarafından (service_role ile) atanır.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, ad)
  values (new.id, 'veli', coalesce(new.raw_user_meta_data ->> 'ad', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 11.2 protect_profile_role — rol/şube yükseltme koruması.
-- Bilinçli olarak SECURITY INVOKER: current_user isteği yapan gerçek DB rolüdür,
-- yani son kullanıcı (authenticated) kısıtlanır; SQL Editor (postgres) ve
-- service_role (davet akışı) serbest kalır — test için trigger disable etmek gerekmez.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.role is distinct from old.role then
      raise exception 'role alanı bu şekilde değiştirilemez';
    end if;
    if new.sube_id is distinct from old.sube_id then
      raise exception 'sube_id alanı bu şekilde değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_profile_role_protect
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- 11.3 protect_bireysel_paket — veli, kalan=999 yazıp sınırsız ders hakkı
-- üretemesin diye. Yönetici dışındaki kullanıcılar için tek izinli değişiklik:
-- kalan'ın tam 1 azalması (rezervasyon anındaki düşüm).
-- Not: ileride "antrenör reddetti → ders hakkı iade" akışı eklenirse buraya
-- kontrollü bir kalan+1 istisnası gerekecek.
create or replace function public.protect_bireysel_paket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if new.id            is distinct from old.id
       or new.antrenor_id is distinct from old.antrenor_id
       or new.sporcu_id   is distinct from old.sporcu_id
       or new.toplam      is distinct from old.toplam
       or new.tutar       is distinct from old.tutar
       or new.created_at  is distinct from old.created_at
       or new.kalan       is distinct from old.kalan - 1 then
      raise exception 'paket yalnızca 1 ders düşülerek güncellenebilir';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_bireysel_paket_protect
  before update on public.bireysel_paket
  for each row execute procedure public.protect_bireysel_paket();

-- ---------------------------------------------------------------------------
-- 11.4 protect_konusma_taraflar — veli/antrenör, kendi thread'inin karşı tarafını
-- başka bir kullanıcıyla değiştirip istenmeyen mesaj kanalı açamasın diye.
-- Meşru istemci güncellemeleri yalnızca son_mesaj* / *okundu_zaman alanlarıdır.
create or replace function public.protect_konusma_taraflar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.veli_id is distinct from old.veli_id
       or new.antrenor_id is distinct from old.antrenor_id then
      raise exception 'konuşmanın tarafları değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_konusma_taraflar_protect
  before update on public.konusma
  for each row execute procedure public.protect_konusma_taraflar();

-- ---------------------------------------------------------------------------
-- 11.5 protect_bireysel_rezervasyon — durum değiştirirken tutar/sporcu/paket de
-- değiştirilip hakediş/ciro şişirilmesin diye kolonları dondurur (yönetici serbest).
create or replace function public.protect_bireysel_rezervasyon()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if new.id            is distinct from old.id
       or new.antrenor_id is distinct from old.antrenor_id
       or new.sporcu_id   is distinct from old.sporcu_id
       or new.paket_id    is distinct from old.paket_id
       or new.tutar       is distinct from old.tutar
       or new.odeme_tipi  is distinct from old.odeme_tipi
       or new.odeme_notu  is distinct from old.odeme_notu
       or new.tarih       is distinct from old.tarih
       or new.saat        is distinct from old.saat
       or new.sure_dk     is distinct from old.sure_dk
       or new.tesis       is distinct from old.tesis
       or new.created_at  is distinct from old.created_at then
      raise exception 'rezervasyonda yalnızca durum/sonuç alanları güncellenebilir';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_bireysel_rezervasyon_protect
  before update on public.bireysel_rezervasyon
  for each row execute procedure public.protect_bireysel_rezervasyon();

-- ---------------------------------------------------------------------------
-- 11.6 push_token_devral — cihaz devri. Aynı telefonda A çıkıp B girdiğinde token
-- hâlâ A'nın satırındadır; B'nin insert'i PK çakışmasına, upsert'i RLS reddine
-- takılırdı. Token cihazı temsil eder: INSERT'ten önce aynı token'ın eski satırı
-- (sahibi kim olursa olsun) SECURITY DEFINER ile silinir.
create or replace function public.push_token_devral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_token where token = new.token;
  return new;
end;
$$;

create trigger on_push_token_devral
  before insert on public.push_token
  for each row execute procedure public.push_token_devral();

-- ---------------------------------------------------------------------------
-- 11.7 Grant / revoke
-- ---------------------------------------------------------------------------
-- 0016: private şemasına USAGE. Yukarıdaki SECURITY INVOKER trigger'lar (11.3,
-- 11.5) isim çözümlemesini ÇAĞIRANIN yetkileriyle runtime'da yapar — USAGE
-- olmadan her authenticated UPDATE 'permission denied for schema private' verir.
grant usage on schema private to authenticated, service_role;

-- 0005: current_profile_role() RLS politikalarının içinden çağrıldığı için
-- authenticated'a EXECUTE şart; anon/public'ten kaldırılıyor (girişsiz doğrudan
-- çağrı engellenir). Fonksiyon zaten `private` şemasında olduğu için PostgREST
-- tarafından RPC endpoint'i olarak da yayımlanmaz.
revoke execute on function private.current_profile_role() from public;
revoke execute on function private.current_profile_role() from anon;
grant execute on function private.current_profile_role() to authenticated;

-- 0002 + 0016: handle_new_user() SECURITY DEFINER; yalnızca auth.users insert
-- trigger'ı çağırmalı. Trigger'ın çalışması bu izne bağlı değildir.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 0020: push_token_devral() de SECURITY DEFINER — yalnızca trigger çağırır.
revoke execute on function public.push_token_devral() from public;
revoke execute on function public.push_token_devral() from anon;
revoke execute on function public.push_token_devral() from authenticated;


-- ===========================================================================
-- 12) REALTIME YAYINI
--     Kaynak: 0010
-- ===========================================================================
-- Chat ekranı açıkken postgres_changes INSERT event'ine konusma_id filtresiyle
-- abone olunuyor. `supabase_realtime` publication'ı Supabase projelerinde hazır
-- gelir; saf Postgres kurulumlarında olmayabileceği için varlığı kontrol ediliyor.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table mesaj';
  else
    raise notice 'supabase_realtime publication bulunamadı — mesaj tablosu realtime yayınına eklenmedi.';
  end if;
end
$$;


-- ===========================================================================
-- Kurulum sonu. Gövde doğrulaması tekrar açılıyor.
-- ===========================================================================
reset check_function_bodies;

-- Doğrulama sorguları (elle çalıştırılabilir):
--   select count(*) from pg_tables where schemaname = 'public';          -- 45
--   select count(*) from pg_policies where schemaname = 'public';        -- 158
--   select tablename from pg_tables t where schemaname='public'
--     and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
--                     where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity);
--     → boş dönmeli (RLS'siz tablo yok).
--
-- Sıradaki adımlar: kurulum/02_katalog.sql (başlangıç verisi), ardından
-- yalnızca demo ortamında demo/karsiyaka_demo.sql.
