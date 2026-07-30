-- ===========================================================================
-- 01_sema.sql — Spor Kulübü Yönetim Platformu · TAM ŞEMA (sıfırdan kurulum)
-- ===========================================================================
-- Bu dosya app/supabase/migrations/0001–0025 arasındaki TÜM migration'ların
-- NİHAİ halini tek dosyada birleştirir. Ara adımlar (drop+recreate edilen
-- politikalar, sonradan eklenen kolonlar, alter policy ile genişletilen
-- muhasebe kuralları, search_path sertleştirmeleri) burada zincir olarak
-- DEĞİL, doğrudan son hâlleriyle yazılmıştır.
--
-- ÇOK KİRACILILIK (0021 + 0022) BU DOSYAYA DAHİLDİR:
--   · kulup tablosu + private.current_kulup_id()
--   · 41 kiracı tablosunda  kulup_id NOT NULL default private.current_kulup_id()
--   · 3 katalog tablosunda  (brans / hizmet_turu / beceri) NULLABLE kulup_id
--   · profiles.kulup_id     (nullable, default YOK — gerekçe bölüm 2)
--   · 14 bileşik benzersizlik + 23 bileşik FK (bağ tablolarının kiracı bütünlüğü)
--   · 55 RESTRICTIVE izolasyon politikası
--   · davet tablosu + davet token'ını çözen handle_new_user
--
--   0021'in VERİ TAŞIMA adımları (bölüm 5 ve 6.2 — mevcut satırların varsayılan
--   kulübe bağlanması) BİLİNÇLİ OLARAK DAHİL DEĞİLDİR: bu dosya sıfırdan kurulum
--   içindir, taşınacak veri yoktur. Kulüp kaydı 03_kulup_olustur.sql'de açılır.
--
-- 0023–0025 DE DAHİLDİR:
--   · 0023 abonelik kill-switch'i  → private.current_kulup_id() gövdesindeki
--                                    `k.durum = 'aktif'` koşulu (bölüm 2)
--   · 0024 yumuşak silme           → grup + sporcular tablolarında aktif /
--                                    pasif_tarihi kolonları ve bileşik indeksler
--   · 0025 maç sonucu girişi       → "etkinlik: antrenör kendi grubunun maç
--                                    sonucunu girer" politikası (12.7),
--                                    protect_etkinlik_sonuc() trigger'ı (13.8),
--                                    etkinlik_sonuc_bekleyen_idx (bölüm 14)
--   0023'ün "mevcut kulüpleri aktifleştir" UPDATE'i dahil DEĞİL (veri taşıması;
--   kulüp zaten 03_kulup_olustur.sql'de 'aktif' doğar).
--
-- İÇERMEZ: hiçbir INSERT / demo verisi / kulübe özgü kayıt.
--   · Platform kataloğu (tüm kulüplerde ortak) → kurulum/02_katalog.sql
--   · Kulübün kendi başlangıç kayıtları        → kurulum/03_kulup_olustur.sql
--   · Yalnızca demo/satış ortamı verisi        → demo/karsiyaka_demo.sql
--
-- ÇALIŞTIRMA SIRASI (yeni bir Supabase projesinde — SQL Editor veya psql):
--   1) kurulum/01_sema.sql            <-- bu dosya
--   2) kurulum/02_katalog.sql         platform kataloğu (brans/hizmet_turu/beceri)
--   3) kurulum/03_kulup_olustur.sql   kulüp + şube + kurum ayarları + bayraklar
--   4) İLK YÖNETİCİNİN HESABINI AÇIN (uygulamadan "Kayıt Ol" ya da
--      Supabase > Authentication > Users > "Add user")
--      ⚠ Bu adım 3'ten SONRA olmak ZORUNDA: handle_new_user() sistemde hiç kulüp
--        yoksa açık bir exception atar (bölüm 13.2).
--   5) kurulum/04_ilk_yonetici.sql    hesabı 'yonetici' yapar (ZORUNLU)
--   6) (yalnızca demo/satış ortamında) demo/karsiyaka_demo.sql
--
-- ✔ BU ADIMLAR YETERLİDİR — app/supabase/migrations/ altındaki dosyaların
--   HİÇBİRİNİ ayrıca çalıştırmayın. Paket 0001–0025'in nihai halini içerir;
--   migration klasörü yalnızca ZATEN KURULU bir projeyi güncellemek içindir.
--
-- Bu dosya baştan sona TEK SEFERDE çalıştırılır. Postgres 15+ / Supabase
-- uyumludur. auth şeması, auth.users tablosu, `anon` / `authenticated` /
-- `service_role` rolleri ve `supabase_realtime` publication'ı Supabase
-- tarafından hazır gelir.
--
-- BÖLÜMLER
--   1)  Enum, private şeması, rol fonksiyonu
--   2)  Kiracı çekirdeği: kulup + profiles + private.current_kulup_id()
--   3)  Kurum tabloları (şube, branş, grup, sporcular, bağlar)
--   4)  Finans (aidat + ödeme)
--   5)  Antrenman / yoklama / gelişim
--   6)  Duyuru / etkinlik / maç kadrosu
--   7)  Mesajlaşma
--   8)  Servis / mağaza
--   9)  Bireysel ders / hakediş / başvuru
--   10) Muhasebe / ayarlar / mobil bayrak / push
--   11) Davet (çok kiracılı kayıt akışı)
--   12) Row Level Security: etkinleştirme + rol politikaları + kiracı duvarı
--   13) Fonksiyonlar, trigger'lar, grant/revoke
--   14) kulup_id indeksleri + bileşik/kısmi indeksler
--   15) Realtime yayını
-- ===========================================================================
--
-- KİRACI KOLONU DESENİ (0021 karar 3) — dosya boyunca tekrarlanan üç satır:
--
--   kulup_id uuid not null default private.current_kulup_id() references kulup(id)
--
--   · default sayesinde uygulama kodundaki ~33 INSERT çağrısının HİÇBİRİ kolonu
--     yazmaz; PostgREST kolonu atlar, Postgres çağıranın kulübüyle doldurur.
--   · kulup_id kolonu tabloların EN SONUNA yazılıyor. Görsel olarak başa yakışırdı
--     ama 0021 kolonu `alter table ... add column` ile eklediği için migration
--     yoluyla güncellenen bir veritabanında kolon HER ZAMAN sonda durur; aynı
--     yerde tutmak iki kurulumun pg_dump çıktısını birebir aynı tutar.
--   · service_role bağlamında auth.uid() NULL'dur → default NULL üretir → NOT NULL
--     ihlali (23502). createAdminClient() kullanan her route ve SQL Editor'dan
--     yapılan her INSERT kulup_id'yi AÇIKÇA yazmak zorundadır (0021 UYARI 2).
-- ===========================================================================

-- private.current_profile_role() bölüm 1'de, public.profiles ise bölüm 2'de
-- yaratılıyor. LANGUAGE SQL fonksiyon gövdeleri CREATE anında doğrulandığı için
-- (check_function_bodies varsayılan olarak açık) bu sıra hata verirdi. pg_dump'ın
-- da kullandığı standart çözüm: gövde doğrulamasını dosya boyunca kapatmak.
-- Dosyanın sonunda tekrar açılıyor. Çalışma zamanında hiçbir etkisi yoktur.
set check_function_bodies = off;


-- ===========================================================================
-- 1) ENUM, PRIVATE ŞEMASI, ROL FONKSİYONU
--    Kaynak: 0001 (enum), 0015 (enum'a 'muhasebeci'), 0021 (enum'a
--            'platform_admin'), 0004 (current_profile_role), 0006 (private şema)
-- ===========================================================================

-- 0001 üç değerle yaratmış, 0015 'muhasebeci'yi, 0021 'platform_admin'i
-- eklemişti — burada BEŞ değerli nihai hâli tek seferde tanımlanıyor
-- (alter type zinciri yok).
--
-- platform_admin (0021): platform sahibinin rolü. Bilinçli olarak HİÇBİR RLS
-- politikasında kullanılmıyor — süper-admin service_role ile bağlanır ve RLS'i
-- baypas eder. Enum değeri yalnızca "bu profil normal bir kulüp kullanıcısı
-- değil" işaretidir; kulup_id'si NULL kalır ve bu sayede bölüm 12'deki
-- restrictive politikaların hepsi onun için fail-closed olur.
create type app_role as enum ('yonetici', 'veli', 'antrenor', 'muhasebeci', 'platform_admin');

-- 0006: fonksiyonlar bilinçli olarak `private` şemasında. PostgREST yalnızca
-- `public` şemasını dışa açtığı için buradaki fonksiyonlar /rest/v1/rpc/ üzerinden
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
-- 2) KİRACI ÇEKİRDEĞİ — kulup + profiles + private.current_kulup_id()
--    Kaynak: 0021 (bölüm 1-4), 0001 (profiles)
-- ===========================================================================
-- SIRA KRİTİK, üç bağımlılık iç içe:
--   kulup   → profiles.kulup_id FK'sinin hedefi, bu yüzden EN ÖNCE.
--   profiles→ private.current_kulup_id() gövdesi profiles.kulup_id kolonunu okur.
--   fonksiyon→ bölüm 3'ten itibaren HER tablonun kulup_id default ifadesi bu
--             fonksiyona OID ile bağlanır; fonksiyon yoksa "function
--             private.current_kulup_id() does not exist" ile patlar.
--             (check_function_bodies=off bunu KURTARMAZ: o ayar yalnızca
--             fonksiyon gövdelerini etkiler, kolon default ifadelerini değil.)
--
-- profiles'ın sube_id FK'si bu yüzden tablo gövdesinde DEĞİL, bölüm 3'te sube
-- yaratıldıktan sonra `alter table` ile bağlanıyor (0004'teki orijinal desen).

-- Kiracı kök tablosu. Faturalama/abonelik alanları (plan, sporcu_limiti,
-- abonelik_bitis) süper-admin panelinin yöneteceği alanlardır; uygulama bu
-- alanları okumaz.
create table kulup (
  id             uuid primary key default gen_random_uuid(),
  ad             text not null,
  slug           text unique,
  durum          text not null default 'deneme' check (durum in ('aktif', 'askida', 'deneme')),
  plan           text,
  sporcu_limiti  int,
  abonelik_bitis date,
  created_at     timestamptz not null default now()
);

-- Kullanıcı profilleri — auth.users'a 1:1 bağlı, rol bazlı yetkilendirmenin temeli.
--
-- kulup_id NULLABLE ve default'suz — iki gerekçe (0021 bölüm 3):
--   a) platform_admin'in kulübü yoktur (kulup_id NULL kalır).
--   b) profiles, `default private.current_kulup_id()` hilesini YAPISAL olarak
--      kullanamaz: fonksiyon kulüp bilgisini profiles'tan okur, bir satır kendi
--      default'unu kendinden türetemez. Bu yüzden profiles.kulup_id her zaman
--      AÇIKÇA yazılmak zorundadır (bkz. bölüm 13.2 — handle_new_user).
--
-- profiles_id_kulup_uniq (0021 bölüm 7.1): mantıksal olarak gereksiz (id zaten
-- PK) ama veli_sporcu / sporcu_antrenor tablolarındaki bileşik FK'lerin
-- hedefleyebilmesi için ŞART — FK yalnızca unique/PK'ye bağlanabilir.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null,
  ad text not null,
  telefon text,
  sube_id uuid,
  avatar_url text,
  created_at timestamptz not null default now(),
  kulup_id uuid references kulup(id),
  constraint profiles_id_kulup_uniq unique (id, kulup_id)
);

-- ---------------------------------------------------------------------------
-- private.current_kulup_id() — bölüm 12'deki 55 restrictive politikanın ve
-- tüm kulup_id default'larının dayandığı tek fonksiyon.
--   · SECURITY DEFINER  → profiles'ın kendi RLS'ine takılmaz (bkz. UYARI aşağıda)
--   · stable            → aynı sorgu içinde tek kez değerlendirilebilir
--   · set search_path   → search_path enjeksiyonuna kapalı (0017 deseni)
--   · private şemasında → PostgREST yalnızca public'i yayımladığı için
--                         /rest/v1/rpc/ üzerinden çağrılamaz (0006 deseni)
--
-- ABONELİK KILL-SWITCH: gövdedeki `k.durum = 'aktif'` koşulu sayesinde kulübün
-- durumu 'aktif' dışına çekildiği an fonksiyon o kulübün TÜM kullanıcıları için
-- NULL döner; restrictive politikalar NULL karşılaştırmasında fail-closed
-- olduğundan erişim tek bir UPDATE ile kapanır:
--     update kulup set durum = 'askida' where id = '...';
-- Geri açmak da tek UPDATE'tir; hiçbir veri silinmez.
--
-- ⚠ BUNUN KAÇINILMAZ SONUCU: 'deneme' ve 'askida' durumlarının İKİSİ DE KAPALI
--   durumdur. kulup.durum varsayılanı 'deneme' olduğu için `insert into kulup
--   (ad) values (...)` ile açılan bir kulübün kullanıcıları HİÇBİR ŞEY göremez.
--   Deneme süreci `durum='aktif' + plan='deneme' + abonelik_bitis=<tarih>` ile
--   ifade edilmelidir. 03_kulup_olustur.sql kulübü bu yüzden AÇIKÇA 'aktif'
--   yazarak oluşturur, 04_ilk_yonetici.sql de doğrulama bloğunda kontrol eder.
--
-- ⚠ `alter table public.profiles force row level security` ASLA çalıştırılmamalı
--   (0021 UYARI 1): current_profile_role() ve current_kulup_id() SECURITY
--   DEFINER'dır ve sahibi profiles'ın da sahibi olan postgres'tir; tablo sahibi
--   RLS'i baypas ettiği için bu iki fonksiyon profiles'ın KENDİ politikaları
--   içinden çağrılabiliyor. FORCE açılırsa sahiplik istisnası kalkar, ikisi de
--   sonsuz özyinelemeye girer ("infinite recursion detected in policy for
--   relation profiles") ve tüm sistem kilitlenir.
--   AYNI KURAL `kulup` TABLOSU İÇİN DE GEÇERLİ: gövde artık kulup'u da okuyor ve
--   kulup'un kendi politikası (12.1) bu fonksiyonu çağırıyor —
--   `alter table public.kulup force row level security` de ASLA çalıştırılmamalı.
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
     and k.durum = 'aktif'
$$;


-- ===========================================================================
-- 3) KURUM TABLOLARI
--    Kaynak: 0004 (şube, branş, hizmet türü, grup, sporcular, veli↔sporcu,
--            antrenör↔sporcu), 0021 (kulup_id + bileşik kısıtlar),
--            0024 (grup/sporcular yumuşak silme kolonları)
-- ===========================================================================

create table sube (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alt_bilgi text,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint sube_id_kulup_uniq unique (id, kulup_id)
);

-- 0004'te de böyleydi: profiles → sube FK'si tablo yaratıldıktan SONRA bağlanır.
-- Burada zorunluluk daha da katı (bölüm 2'deki sıra notu).
alter table profiles
  add constraint profiles_sube_id_fkey foreign key (sube_id) references sube(id);

-- --- ORTAK KATALOG (3 tablo): brans / hizmet_turu / beceri
--     kulup_id NULLABLE. NULL = platform kataloğu (her kulüp okur, kimse
--     değiştiremez), dolu = kulübe özel satır.
--     Default ifadesi aynı iki işi birden yapıyor:
--       · 02_katalog.sql SQL Editor'da postgres olarak koşar → auth.uid() NULL
--         → kulup_id NULL → platform kataloğu.
--       · Panelden yönetici ekler → kendi kulup_id'si → kulübe özel satır.
--     Nullable olması ZORUNLU: 02_katalog.sql yalnızca Basketbol için beceri
--     tanımlıyor; diğer branşların becerilerini kulübün kendisi eklemek zorunda.
create table brans (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  ikon text,
  kulup_id uuid default private.current_kulup_id() references kulup(id)
);

create table hizmet_turu (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aciklama text,
  ikon text,
  kulup_id uuid default private.current_kulup_id() references kulup(id)
);

-- Bağ tablolarında kulup_id DENORMALİZE (0021 karar: her satırda exists()
-- alt sorgusu yerine kolon). Denormalizasyonun parent'tan sapması bileşik FK ile
-- veritabanı seviyesinde imkânsız kılınıyor.
-- NOT: brans_id / hizmet_turu_id ayağına bileşik FK KONULAMAZ — katalog
-- tablolarında kulup_id nullable'dır (0021 artık risk R1).
create table kurum_brans_secimi (
  sube_id uuid not null references sube(id) on delete cascade,
  brans_id uuid not null references brans(id) on delete cascade,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (sube_id, brans_id),
  constraint kurum_brans_secimi_sube_kulup_fkey
    foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete cascade
);

create table kurum_hizmet_turu_secimi (
  sube_id uuid not null references sube(id) on delete cascade,
  hizmet_turu_id uuid not null references hizmet_turu(id) on delete cascade,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (sube_id, hizmet_turu_id),
  constraint kurum_hizmet_turu_secimi_sube_kulup_fkey
    foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete cascade
);

-- YUMUŞAK SİLME (0024): grup ve sporcular kayıtları SİLİNMEZ, `aktif = false`
-- ile pasife alınır. Gerekçe: sporcular(id)'ye bağlı FK'lerin çoğu ON DELETE
-- CASCADE (ödeme, yoklama, gelişim, kadro...) — tek bir DELETE kapanmış bir
-- muhasebe dönemini geriye dönük siler. Cascade'siz olanlar (fatura.sporcu_id,
-- siparis.sporcu_id, antrenman.grup_id) ise DELETE'i zaten 23503 ile reddeder.
-- İki kolon da kulup_id'den SONRA yazılıyor: 0024 bunları `alter table` ile
-- ekliyor, yani migration yoluyla güncellenen bir veritabanında sıra budur
-- (bkz. başlıktaki KİRACI KOLONU DESENİ notu — iki kurulum yolunun pg_dump
-- çıktısı birebir aynı kalmalı).
--
-- Grup pasife alındığında sporcuların grup_id ataması BİLİNÇLİ OLARAK
-- DEĞİŞTİRİLMEZ: grup geri alındığında kadro olduğu gibi geri gelsin diye.
create table grup (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  brans_id uuid references brans(id),
  sube_id uuid references sube(id),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  aktif boolean not null default true,
  pasif_tarihi timestamptz,
  constraint grup_id_kulup_uniq unique (id, kulup_id)
);

comment on column grup.aktif is
  'false = kapatılmış / pasife alınmış grup. Kayıt SİLİNMEZ; antrenman ve yoklama geçmişi korunur. Gruptaki sporcuların grup_id ataması değişmez.';
comment on column grup.pasif_tarihi is
  'aktif=false yapıldığı an. Geri alındığında NULL''a döner. Uygulama katmanında yazılır (gruplar/actions.ts).';

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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  aktif boolean not null default true,
  pasif_tarihi timestamptz,
  constraint sporcular_id_kulup_uniq unique (id, kulup_id)
);

comment on column sporcular.aktif is
  'false = kulüpten ayrılmış / pasife alınmış sporcu. Kayıt SİLİNMEZ; ödeme ve yoklama geçmişi olduğu gibi korunur (0024).';
comment on column sporcular.pasif_tarihi is
  'aktif=false yapıldığı an. Geri alındığında NULL''a döner. Uygulama katmanında yazılır (sporcular/actions.ts).';

create table veli_sporcu (
  veli_id uuid not null references profiles(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  yakinlik text,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (veli_id, sporcu_id),
  constraint veli_sporcu_veli_kulup_fkey
    foreign key (veli_id, kulup_id) references profiles(id, kulup_id) on delete cascade,
  constraint veli_sporcu_sporcu_kulup_fkey
    foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade
);

create table sporcu_antrenor (
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  antrenor_id uuid not null references profiles(id) on delete cascade,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (sporcu_id, antrenor_id),
  constraint sporcu_antrenor_sporcu_kulup_fkey
    foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade,
  constraint sporcu_antrenor_antrenor_kulup_fkey
    foreign key (antrenor_id, kulup_id) references profiles(id, kulup_id) on delete cascade
);


-- ===========================================================================
-- 4) FİNANS (AİDAT PLANI + ÖDEME)
--    Kaynak: 0007 (tablolar), 0014 (odeme.aidat_plani_id kolonu), 0021 (kulup_id)
-- ===========================================================================

create table aidat_plani (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alt text,
  fiyat numeric not null,
  beklenen numeric,
  sube_id uuid references sube(id),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
);


-- ===========================================================================
-- 5) ANTRENMAN / YOKLAMA / GELİŞİM
--    Kaynak: 0008, 0021 (kulup_id)
-- ===========================================================================
-- Not: tablo adı "ders" değil "antrenman" — bireysel ders (ücretli 1:1)
-- kavramıyla isim çakışmasın diye.

-- unique (grup_id, tarih) kiracı bazına çevrilmedi (0021 bölüm 10 kararı):
-- grup zaten kulübe özel bir kayıt, dolayısıyla kısıt ZATEN kulüp içinde geçerli.
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
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
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
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  unique (antrenman_id, sporcu_id)
);

-- Katalog tablosu (kulup_id nullable) — bkz. bölüm 3'teki ortak katalog notu.
create table beceri (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  brans_id uuid references brans(id),
  sira int not null default 0,
  kulup_id uuid default private.current_kulup_id() references kulup(id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint gelisim_degerlendirme_id_kulup_uniq unique (id, kulup_id)
);

create table gelisim_beceri_seviye (
  degerlendirme_id uuid not null references gelisim_degerlendirme(id) on delete cascade,
  beceri_id uuid not null references beceri(id),
  seviye int not null check (seviye between 1 and 5),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (degerlendirme_id, beceri_id),
  constraint gelisim_beceri_seviye_degerlendirme_kulup_fkey
    foreign key (degerlendirme_id, kulup_id)
    references gelisim_degerlendirme(id, kulup_id) on delete cascade
);


-- ===========================================================================
-- 6) DUYURU / ETKİNLİK / MAÇ KADROSU
--    Kaynak: 0009, 0021 (kulup_id), 0025 (maç sonucu yazma yetkisi — politika
--            12.7'de, trigger 13.8'de, indeks 14.2'de)
-- ===========================================================================

create table duyuru (
  id uuid primary key default gen_random_uuid(),
  baslik text not null,
  mesaj text not null,
  tur text not null default 'genel' check (tur in ('kamp', 'servis', 'basari', 'genel')),
  tum_veliler boolean not null default true,
  sms_ile boolean not null default false,
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint duyuru_id_kulup_uniq unique (id, kulup_id)
);

create table duyuru_hedef (
  duyuru_id uuid not null references duyuru(id) on delete cascade,
  grup_id uuid not null references grup(id),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (duyuru_id, grup_id),
  constraint duyuru_hedef_duyuru_kulup_fkey
    foreign key (duyuru_id, kulup_id) references duyuru(id, kulup_id) on delete cascade,
  constraint duyuru_hedef_grup_kulup_fkey
    foreign key (grup_id, kulup_id) references grup(id, kulup_id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint etkinlik_id_kulup_uniq unique (id, kulup_id)
);

create table etkinlik_katilim (
  etkinlik_id uuid not null references etkinlik(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'katilir', 'katilmaz')),
  updated_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (etkinlik_id, sporcu_id),
  constraint etkinlik_katilim_etkinlik_kulup_fkey
    foreign key (etkinlik_id, kulup_id) references etkinlik(id, kulup_id) on delete cascade,
  constraint etkinlik_katilim_sporcu_kulup_fkey
    foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade
);

create table mac_kadro (
  id uuid primary key default gen_random_uuid(),
  etkinlik_id uuid not null unique references etkinlik(id) on delete cascade,
  yayinlandi boolean not null default false,
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint mac_kadro_id_kulup_uniq unique (id, kulup_id),
  constraint mac_kadro_etkinlik_kulup_fkey
    foreign key (etkinlik_id, kulup_id) references etkinlik(id, kulup_id) on delete cascade
);

create table mac_kadro_sporcu (
  mac_kadro_id uuid not null references mac_kadro(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  secili boolean not null default false,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (mac_kadro_id, sporcu_id),
  constraint mac_kadro_sporcu_kadro_kulup_fkey
    foreign key (mac_kadro_id, kulup_id) references mac_kadro(id, kulup_id) on delete cascade,
  constraint mac_kadro_sporcu_sporcu_kulup_fkey
    foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade
);


-- ===========================================================================
-- 7) MESAJLAŞMA
--    Kaynak: 0010 (tablolar), 0011 (mesaj.gonderen_rol kolonu), 0021 (kulup_id)
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
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  unique (veli_id, antrenor_id),
  constraint konusma_id_kulup_uniq unique (id, kulup_id)
);

-- gonderen_rol (0011): aynı hesabın hem veli hem antrenör olarak test edildiği
-- durumda (veli_id = antrenor_id) mesajın hangi "şapkayla" yazıldığını ayırt eder.
create table mesaj (
  id uuid primary key default gen_random_uuid(),
  konusma_id uuid not null references konusma(id) on delete cascade,
  gonderen_id uuid not null references profiles(id),
  metin text not null,
  gonderen_rol text not null default 'veli' check (gonderen_rol in ('veli', 'antrenor')),
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint mesaj_konusma_kulup_fkey
    foreign key (konusma_id, kulup_id) references konusma(id, kulup_id) on delete cascade
);


-- ===========================================================================
-- 8) SERVİS / MAĞAZA
--    Kaynak: 0012 (tablolar), 0018 (servis_rota.sofor_telefon), 0021 (kulup_id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint servis_rota_id_kulup_uniq unique (id, kulup_id)
);

create table servis_durak (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references servis_rota(id) on delete cascade,
  ad text not null,
  sub text,
  saat text,
  sira int not null default 0,
  durum text not null default 'bekliyor' check (durum in ('gecti', 'suan', 'bekliyor')),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint servis_durak_id_kulup_uniq unique (id, kulup_id),
  constraint servis_durak_rota_kulup_fkey
    foreign key (rota_id, kulup_id) references servis_rota(id, kulup_id) on delete cascade
);

-- durak_id nullable → MATCH SIMPLE gereği durak_id NULL ise bileşik kısıt aranmaz.
create table servis_sporcu (
  rota_id uuid not null references servis_rota(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durak_id uuid references servis_durak(id),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  primary key (rota_id, sporcu_id),
  constraint servis_sporcu_rota_kulup_fkey
    foreign key (rota_id, kulup_id) references servis_rota(id, kulup_id) on delete cascade,
  constraint servis_sporcu_sporcu_kulup_fkey
    foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade,
  constraint servis_sporcu_durak_kulup_fkey
    foreign key (durak_id, kulup_id) references servis_durak(id, kulup_id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint urun_id_kulup_uniq unique (id, kulup_id)
);

create table siparis (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null references sporcular(id),
  tutar numeric not null,
  durum text not null default 'hazirlaniyor' check (durum in ('hazirlaniyor', 'hazir', 'teslim')),
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint siparis_id_kulup_uniq unique (id, kulup_id)
);

create table siparis_kalem (
  id uuid primary key default gen_random_uuid(),
  siparis_id uuid not null references siparis(id) on delete cascade,
  urun_id uuid not null references urun(id),
  beden text,
  adet int not null default 1,
  birim_fiyat numeric not null,
  not_metni text,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint siparis_kalem_siparis_kulup_fkey
    foreign key (siparis_id, kulup_id) references siparis(id, kulup_id) on delete cascade,
  constraint siparis_kalem_urun_kulup_fkey
    foreign key (urun_id, kulup_id) references urun(id, kulup_id)
);


-- ===========================================================================
-- 9) BİREYSEL DERS / HAKEDİŞ / BAŞVURU
--    Kaynak: 0013, 0021 (kulup_id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
);

create table bireysel_musaitlik (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  gun_index int not null check (gun_index between 0 and 6),
  baslangic_saat text not null,
  bitis_saat text not null,
  aktif boolean not null default true,
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  unique (antrenor_id, gun_index)
);

create table bireysel_istisna (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  tarih date not null,
  aciklama text,
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
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
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  check ((odeme_tipi = 'paket' and paket_id is not null) or (odeme_tipi = 'tek' and paket_id is null))
);

-- Aynı antrenörün aynı saatini iki kişi kapamasın diye — reddedildi/iptal hariç.
-- Kiracı bazına çevrilmedi: antrenor_id zaten kulübe özel bir profildir.
create unique index bireysel_rezervasyon_slot_uniq on bireysel_rezervasyon (antrenor_id, tarih, saat)
  where durum not in ('reddedildi', 'iptal');

-- Hakediş — grup dersi bordrosu, gerçek antrenman satır sayısından hesaplanır.
create table antrenor_grup_ucret (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  grup_id uuid not null references grup(id) on delete cascade,
  ders_ucreti numeric not null,
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
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
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  unique (antrenor_id, donem_ay),
  constraint hakedis_id_kulup_uniq unique (id, kulup_id)
);

create table hakedis_kalem (
  id uuid primary key default gen_random_uuid(),
  hakedis_id uuid not null references hakedis(id) on delete cascade,
  grup_id uuid references grup(id),
  ders_sayisi int not null,
  birim_ucret numeric not null,
  tutar numeric not null,
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint hakedis_kalem_hakedis_kulup_fkey
    foreign key (hakedis_id, kulup_id) references hakedis(id, kulup_id) on delete cascade,
  constraint hakedis_kalem_grup_kulup_fkey
    foreign key (grup_id, kulup_id) references grup(id, kulup_id)
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
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
);


-- ===========================================================================
-- 10) MUHASEBE / AYARLAR / MOBİL BAYRAK / PUSH
--     Kaynak: 0014 (gider, fatura), 0015 (kurum_ayarlari), 0019 (mobil_ozellik),
--             0020 (push_token), 0021 (kulup_id + kiracı bazına çevrilen kısıtlar)
-- ===========================================================================

create table gider (
  id uuid primary key default gen_random_uuid(),
  tarih date not null default current_date,
  kategori text not null,
  aciklama text,
  tutar numeric not null,
  yontem text not null check (yontem in ('kart', 'havale', 'elden')),
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
);

-- 0021 bölüm 10.3: fatura_no'nun GLOBAL unique'i kiracı bazına çevrildi.
-- Fatura numarası admin-panel/.../faturalar/actions.ts'te `count(*) + 1` ile
-- üretiliyor; bu count restrictive politika yüzünden kulübe özel saydığından iki
-- kulüp kaçınılmaz olarak aynı 'FT-2026-0001' numarasını üretir. Global unique
-- kalsaydı ikinci kulübün ilk faturası patlardı.
create table fatura (
  id uuid primary key default gen_random_uuid(),
  fatura_no text not null,
  sporcu_id uuid not null references sporcular(id),
  tutar numeric not null,
  tarih date not null default current_date,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi')),
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint fatura_kulup_fatura_no_key unique (kulup_id, fatura_no)
);

-- 0021 bölüm 10.1: `id boolean primary key check(id)` singleton'ı tabloda ömür
-- boyu TEK satıra izin veriyordu. `id` kolonu ve check(id) AYNEN KALIYOR, yalnızca
-- PRIMARY KEY (id) → (kulup_id) oldu: kulüp başına tam bir satır. Uygulamadaki
-- `.eq('id', true).single()` çağrıları AYNEN çalışır — restrictive politika zaten
-- yalnızca kendi kulübünün satırını gösterdiği için .single() tek satır bulur.
--
-- Not: kulup_adi varsayılanı 0015'te 'Karşıyaka Spor Okulu' idi; SaaS kurulumunda
-- demo kulüp adı taşınmaması için nötr bir varsayılana çekildi. Gerçek kulüp adı
-- 03_kulup_olustur.sql'de yazılır veya Ayarlar ekranından değiştirilir.
create table kurum_ayarlari (
  id boolean not null default true check (id),
  kulup_adi text not null default 'Spor Kulübü',
  telefon text,
  eposta text,
  adres text,
  para_birimi text not null default 'TRY' check (para_birimi in ('TRY', 'USD', 'EUR')),
  updated_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint kurum_ayarlari_pkey primary key (kulup_id)
);

-- Mobil özellik bayrakları — panelden aç/kapa. Bayrak seti sabittir; yeni bayrak
-- mobil tarafta karşılığı olan kod gerektirdiği için migration'la gelir.
-- Bayrak SATIRLARI kulübe aittir → 03_kulup_olustur.sql'de eklenir.
--
-- 0021 bölüm 10.2: `anahtar text primary key` GLOBAL benzersizdi → ikinci kulüp
-- 'mesajlar' bayrağını ekleyemezdi. PK artık (kulup_id, anahtar).
create table mobil_ozellik (
  anahtar text not null,
  ad text not null,
  aciklama text,
  aktif boolean not null default true,
  updated_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint mobil_ozellik_pkey primary key (kulup_id, anahtar)
);

-- Expo push token kaydı — cihaz başına tek satır (token primary key).
-- token PK'si bilinçli olarak GLOBAL kalıyor: token fiziksel bir cihazı temsil
-- eder, aynı cihaz iki kulüpte aynı anda kayıtlı olamaz (push_token_devral()
-- trigger'ı zaten eski satırı siliyor — bölüm 13.9).
create table push_token (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id)
);


-- ===========================================================================
-- 11) DAVET (ÇOK KİRACILI KAYIT AKIŞI)
--     Kaynak: 0022
-- ===========================================================================
-- Bir davet = "şu kulübe, şu rolle, (varsa) şu sporcunun velisi olarak katıl"
-- iznidir. Tek kullanımlıktır: kullanildi_at dolduktan sonra token ölür.
--
-- NEDEN GEREKLİ: birden fazla kulüp varken handle_new_user yeni kullanıcının
-- hangi kulübe ait olduğunu çözemez. Kulüp VE rol bilgisi token'ın işaret ettiği
-- DAVET KAYDINDAN gelir, istemciden değil — 0016'nın rol yükseltme koruması
-- böylece korunur (ayrıntı bölüm 13.2).

-- Token varsayılanı gen_random_bytes(16) kullanıyor; bu fonksiyon çekirdekte
-- DEĞİL, pgcrypto eklentisindedir. Supabase projelerinde pgcrypto varsayılan
-- olarak `extensions` şemasında KURULUDUR, dolayısıyla aşağıdaki blok normalde
-- hiçbir şey yapmaz — yalnızca bağımlılığı belgeliyor ve boş bir projede
-- kurulumun anlaşılmaz bir "function does not exist" hatasıyla patlamasını
-- engelliyor.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      execute 'create extension pgcrypto with schema extensions';
    else
      execute 'create extension pgcrypto';
    end if;
    raise notice '01_sema: pgcrypto eklentisi kuruldu.';
  end if;
end
$$;

-- KOLON GEREKÇELERİ (0022 bölüm 1)
--   token         PK. Linkin kendisi. 16 rastgele bayt → 32 karakter hex →
--                 2^128 olasılık. UUID yerine hex: URL'de tire yok.
--   eposta        Doluysa davet O adrese bağlıdır (bkz. private.davet_coz).
--   sporcu_id     Veli daveti belirli bir sporcuya bağlanabilir; kayıt anında
--                 veli_sporcu bağı otomatik kurulur.
--   davet_notu    Kolon adı bilinçli olarak `not` DEĞİL: NOT ayrılmış anahtar
--                 kelimedir, her sorguda çift tırnak gerektirirdi. Şemanın mevcut
--                 deseni de sonek kullanıyor (odeme_notu, sonuc_notu, detay_notu).
--
-- FK davranışları:
--   kulup_id  cascade  — kulüp silinirse davetleri de gider.
--   sporcu_id set null — sporcu silinse bile davet linki ölmez, bağ düşer.
--   olusturan_id / kullanan_id set null — denetim izi kalsın, referans boşalsın.
--
-- NOT: sporcu_id ayağında BİLEŞİK FK yok — `on delete set null` bileşik FK'de HER
-- İKİ kolonu da NULL yapar, kulup_id ise NOT NULL. Aynı garanti bölüm 13.4'teki
-- protect_davet_sporcu() trigger'ı ile sağlanıyor.
create table davet (
  token         text primary key default encode(gen_random_bytes(16), 'hex'),
  kulup_id      uuid not null default private.current_kulup_id() references kulup(id) on delete cascade,
  rol           app_role not null default 'veli',
  ad            text,
  eposta        text,
  sporcu_id     uuid references sporcular(id) on delete set null,
  son_kullanma  timestamptz not null default now() + interval '14 days',
  kullanildi_at timestamptz,
  kullanan_id   uuid references profiles(id) on delete set null,
  olusturan_id  uuid default auth.uid() references profiles(id) on delete set null,
  davet_notu    text,
  created_at    timestamptz not null default now(),
  -- platform_admin YASAK: davet yolu platform sahipliğine yükselmek için
  -- kullanılamaz. Beyaz liste yazıldı (rol <> 'platform_admin' değil) — enum'a
  -- ileride yeni bir ayrıcalıklı rol eklenirse davet edilebilir hale GELMESİN.
  constraint davet_rol_check check (rol in ('veli', 'antrenor', 'muhasebeci', 'yonetici')),
  -- sporcu bağı yalnızca veli davetinde anlamlı.
  constraint davet_sporcu_rol_check check (sporcu_id is null or rol = 'veli')
);


-- ===========================================================================
-- 12) ROW LEVEL SECURITY
-- ===========================================================================
-- 47 tablonun tamamında RLS açık. İki katman:
--   12.1–12.12  ROL POLİTİKALARI (permissive, 161 adet) — 0001–0020'nin nihai
--               hâli + kulup ve davet tablolarının kendi politikaları + 0025'in
--               antrenör maç sonucu politikası.
--               · 0016'nın drop+recreate ettiği etkinlik / yoklama(veli insert) /
--                 bireysel_rezervasyon(antrenör update) / profiles(update)
--                 politikaları yalnızca 0016 sonrası hâliyle,
--               · 0015'in `alter policy` ile muhasebeciye açtığı odeme /
--                 aidat_plani / gider / fatura politikaları genişletilmiş hâliyle.
--   12.13       KİRACI DUVARI (restrictive, 55 adet) — 0021 bölüm 9 + 0022 3.1.
--
-- PostgreSQL permissive politikaları OR ile, restrictive politikaları AND ile
-- birleştirir:  erişim = (rol kuralları OR'lanmış) AND (kulup_id eşleşmesi)
-- Böylece rol mantığı aynen korunur, üstüne kiracı duvarı biner.

alter table kulup                   enable row level security;
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
alter table davet                   enable row level security;


-- ---------------------------------------------------------------------------
-- 12.1 kulup  (0021)
-- ---------------------------------------------------------------------------
-- Kullanıcı YALNIZCA kendi kulübünün satırını okur (kulüp adı / plan gösterimi
-- için). Yazma politikası bilinçli olarak YOK: kulüp açma-kapama, plan ve
-- abonelik değişikliği yalnızca service_role ile (süper-admin paneli) yapılır;
-- service_role BYPASSRLS olduğu için politika gerekmez.
create policy "kulup: kullanıcı kendi kulübünü okur"
  on kulup for select
  using (id = (select private.current_kulup_id()));


-- ---------------------------------------------------------------------------
-- 12.2 profiles  (0001 + 0010 + 0013 + 0016)
-- ---------------------------------------------------------------------------
create policy "profiles: kullanıcı kendi profilini okur"
  on profiles for select
  using (auth.uid() = id);

-- 0016: 0001'deki politikada WITH CHECK yoktu — role yükseltmesine açıktı.
-- WITH CHECK + protect_profile_role() trigger'ı (bölüm 13.3) birlikte kapatır.
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
-- Kiracı duvarı olmasaydı bu politika BAŞKA kulüplerin kullanıcılarını da
-- listelerdi (0021 bölüm 9.1 notu).
create policy "profiles: yönetici tümünü görür" on profiles for select
  using (private.current_profile_role() = 'yonetici');


-- ---------------------------------------------------------------------------
-- 12.3 Kurum kataloğu: sube / brans / hizmet_turu / kurum_*_secimi / grup  (0004)
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
-- 12.4 sporcular / veli_sporcu / sporcu_antrenor  (0004 + 0015 + 0018)
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
-- 12.5 aidat_plani / odeme  (0007, 0015 ile muhasebeciye genişletilmiş)
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
-- 12.6 antrenman / yoklama / beceri / gelişim  (0008 + 0012 + 0016)
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
-- 12.7 duyuru / etkinlik / maç kadrosu  (0009 + 0016 + 0025)
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

-- 0025: maç sonucu girişi. RLS SATIR düzeyinde çalışır, KOLON düzeyinde değil —
-- antrenöre etkinlik UPDATE'i verildiği anda aynı satırın tarih/tesis/ucretli/
-- tutar alanlarını da değiştirebilir hâle gelir. Kolon bazlı GRANT de çare değil:
-- yönetici ve antrenör aynı `authenticated` Postgres rolünü paylaşır. Bu yüzden
-- 0003/0016 deseni tekrarlanıyor — politika HANGİ SATIR'ı, protect_etkinlik_sonuc()
-- trigger'ı (bölüm 13.8) HANGİ KOLONLAR'ı belirler. İkisi birlikte anlamlıdır.
--
-- Sahiplik testi "mac_kadro: antrenör kendi grubunu günceller" ile birebir aynı.
-- İKİ BİLİNÇLİ DARALTMA:
--   · `grup_id is not null` — antrenör yukarıdaki SELECT politikasıyla
--     `grup_id is null` (kulüp geneli) etkinlikleri de GÖRÜR; görmek zararsız
--     ama böyle bir etkinliğin sahibi hiçbir antrenör değildir, yazma yöneticide.
--   · `tarih <= current_date` — sonuç ancak oynanmış maça girilir. Aynı gün
--     oynanan maça akşam giriş yapılabilsin diye `<` değil `<=`.
create policy "etkinlik: antrenör kendi grubunun maç sonucunu girer" on etkinlik for update
  using (
    tur = 'mac'
    and grup_id is not null
    and tarih <= current_date
    and exists (
      select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
      where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
    )
  )
  with check (
    tur = 'mac'
    and grup_id is not null
    and tarih <= current_date
    and exists (
      select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
      where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
    )
  );

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
-- 12.8 konusma / mesaj  (0010)
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
-- Taraf değiştirmeyi protect_konusma_taraflar() trigger'ı engeller (bölüm 13.6).
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
-- 12.9 servis / mağaza  (0012)
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
-- 12.10 bireysel ders / hakediş / başvuru  (0013 + 0016 + 0018)
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
-- hakkı protect_bireysel_paket() trigger'ı (bölüm 13.5) ile "kalan tam 1 azalır"
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
-- 12.11 muhasebe / ayarlar / mobil bayrak / push  (0014 + 0015 + 0019 + 0020)
-- ---------------------------------------------------------------------------
-- Gider ve fatura tamamen dahili: veli/antrenör tarafına hiç açılmıyor.
-- 0015 ile yönetici + muhasebeci.
create policy "gider: yönetici tam yetkili" on gider for all
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

create policy "fatura: yönetici tam yetkili" on fatura for all
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

-- INSERT politikası bilinçli olarak YOK: kurum_ayarlari satırı kulüp açılışında
-- 03_kulup_olustur.sql tarafından bir kez eklenir, panelden yalnızca güncellenir.
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


-- ---------------------------------------------------------------------------
-- 12.12 davet  (0022 bölüm 3.2)
-- ---------------------------------------------------------------------------
-- Tek permissive politika bu; veli/antrenör/muhasebeci için davet tablosunda
-- HİÇBİR politika yok, dolayısıyla tablo onlar için tamamen kapalıdır
-- (fail-closed). Muhasebeci bilinçli olarak dışarıda: personel/veli davet etmek
-- finans değil kurum yönetimi işidir.
-- Davet edilen kişi kayıt olurken bu tabloyu OKUMAZ ve OKUYAMAZ — henüz oturumu
-- yoktur; token doğrulaması private.davet_coz ile sunucu tarafında yapılır.
create policy "davet: yönetici kendi kulübünün davetlerini yönetir" on davet for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');


-- ---------------------------------------------------------------------------
-- 12.13 KİRACI DUVARI — RESTRICTIVE İZOLASYON POLİTİKALARI  (0021 bölüm 9 + 0022 3.1)
-- ---------------------------------------------------------------------------
-- İKİ KRİTİK UYGULAMA DETAYI:
--
-- (A) `TO` YAN TÜMCESİ YAZILMIYOR (yani TO PUBLIC).
--     RESTRICTIVE politikalar YALNIZCA adlandırdıkları rollere uygulanır;
--     `to authenticated` yazılsaydı politika `anon` rolüne HİÇ uygulanmaz, yani
--     anon key ile yapılan bir istekte kiracı duvarı tamamen devre dışı kalırdı.
--     Bugün anon zaten hiçbir permissive politikadan geçemiyor, dolayısıyla
--     TO PUBLIC yazmanın authenticated davranışına etkisi SIFIR; ama ileride
--     birine `for select using (true)` benzeri bir politika eklendiğinde tek fark
--     bu satır olur. Fail-closed tarafta duruyoruz.
--
-- (B) Fonksiyon `(select ...)` ile SARILIYOR.
--     Çıplak `private.current_kulup_id()` her SATIR için yeniden değerlendirilir.
--     Skaler alt sorgu hâlinde planlayıcı InitPlan olarak sorgu başına BİR KEZ
--     hesaplar. Semantik aynı (fonksiyon STABLE).
--
-- Politikalar 43 + 12 = 55 adet. Tek tek yazmak yerine döngüyle üretiliyor:
-- metin birebir aynı olduğu için kopyala-yapıştır hatası riski sıfırlanıyor
-- (0021'in ürettiği şemayla bire bir aynı sonuç).

-- --- ŞABLON-A: tek politika, FOR ALL — profiles + 41 kiracı tablosu + davet.
--     profiles dahil: "yönetici tümünü görür" politikası (12.2) bu restrictive
--     kural olmadan BAŞKA kulüplerin kullanıcılarını da listelerdi.
--     profiles.kulup_id NULL olan platform_admin için NULL = NULL → NULL → satır
--     reddedilir: platform_admin normal API üzerinden hiçbir şey göremez,
--     yalnızca service_role paneliyle çalışır.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles',
    'sube','grup','sporcular','aidat_plani','odeme','antrenman','yoklama',
    'gelisim_degerlendirme','duyuru','etkinlik','konusma','servis_rota','urun',
    'siparis','bireysel_antrenor','bireysel_musaitlik','bireysel_istisna',
    'bireysel_paket','bireysel_rezervasyon','antrenor_grup_ucret','hakedis',
    'basvuru','gider','fatura','kurum_ayarlari','mobil_ozellik','push_token',
    'kurum_brans_secimi','kurum_hizmet_turu_secimi','veli_sporcu',
    'sporcu_antrenor','gelisim_beceri_seviye','duyuru_hedef','etkinlik_katilim',
    'mac_kadro','mac_kadro_sporcu','mesaj','servis_durak','servis_sporcu',
    'siparis_kalem','hakedis_kalem',
    'davet'
  ] loop
    execute format($f$
      create policy "kulup izolasyonu" on public.%I
        as restrictive for all
        using (kulup_id = (select private.current_kulup_id()))
        with check (kulup_id = (select private.current_kulup_id()))
    $f$, t);
  end loop;
end
$$;

-- --- ŞABLON-B: ortak katalog (brans / hizmet_turu / beceri) — DÖRT AYRI POLİTİKA.
--     Tek `for all` politikasına İNDİRİLEMEZ.
--     SEBEP: bu üç tablonun permissive politikası FOR ALL ("yönetici yazar").
--     Restrictive kural tek satırda `for all using (kulup_id is null or ...)`
--     yazılsaydı, DELETE yalnızca USING'e baktığı için HERHANGİ bir kulübün
--     yöneticisi `delete from brans where ad = 'Futbol'` diyerek PLATFORM
--     KATALOĞUNU TÜM KULÜPLER İÇİN silebilirdi. UPDATE'te de aynısı.
--     Bu yüzden OKUMA (NULL'a izin verir) ile YAZMA (yalnızca kendi kulübü)
--     ayrı politikalara bölünmek ZORUNDA.
do $$
declare t text;
begin
  foreach t in array array['brans','hizmet_turu','beceri'] loop
    -- SELECT: platform kataloğu (NULL) + kendi kulübünün satırları
    execute format($f$
      create policy "kulup izolasyonu (okuma)" on public.%I
        as restrictive for select
        using (kulup_id is null or kulup_id = (select private.current_kulup_id()))
    $f$, t);

    -- INSERT: yalnızca kendi kulübüne. Kulüp yöneticisi platform kataloğuna
    -- (kulup_id NULL) satır EKLEYEMEZ.
    execute format($f$
      create policy "kulup izolasyonu (ekleme)" on public.%I
        as restrictive for insert
        with check (kulup_id = (select private.current_kulup_id()))
    $f$, t);

    -- UPDATE: hem kaynak hem hedef satır kendi kulübüne ait olmalı.
    execute format($f$
      create policy "kulup izolasyonu (guncelleme)" on public.%I
        as restrictive for update
        using (kulup_id = (select private.current_kulup_id()))
        with check (kulup_id = (select private.current_kulup_id()))
    $f$, t);

    -- DELETE: yalnızca kendi kulübünün satırı. Platform kataloğu dokunulmaz.
    execute format($f$
      create policy "kulup izolasyonu (silme)" on public.%I
        as restrictive for delete
        using (kulup_id = (select private.current_kulup_id()))
    $f$, t);
  end loop;
end
$$;

-- NOT: `kulup` tablosunda restrictive politika YOK ve gerekmiyor — tek permissive
-- politikası (12.1) zaten `id = current_kulup_id()` diyor, yani kullanıcı yalnızca
-- kendi kulübünün satırını görür. Yazma politikası olmadığı için ekleme/güncelleme
-- yalnızca service_role'e (BYPASSRLS) açıktır.


-- ===========================================================================
-- 13) FONKSİYONLAR, TRIGGER'LAR, GRANT / REVOKE
--     Kaynak: 0016 (fonksiyon gövdeleri), 0017 (search_path sertleştirmesi),
--             0002/0005/0020 (revoke/grant), 0020 (push_token_devral),
--             0021 (protect_profile_role'e kulup_id), 0022 (davet_coz,
--             protect_davet_sporcu, handle_new_user'ın nihai hali),
--             0025 (protect_etkinlik_sonuc)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 13.1 private.davet_coz — davet token'ını doğrular, kiracı/rol/sporcu döner.
--
-- NEDEN SECURITY DEFINER: kayıt anında henüz OTURUM YOKTUR. auth.uid() NULL →
-- private.current_kulup_id() NULL → 12.13'teki restrictive politika NULL
-- karşılaştırması yüzünden HER satırı reddeder. Bu fonksiyon tablonun sahibi
-- (postgres) olarak koştuğu için RLS'e takılmaz.
--
-- NEDEN private ŞEMASINDA: PostgREST yalnızca public şemayı yayımlar, bu yüzden
-- fonksiyon /rest/v1/rpc/ üzerinden ÇAĞRILAMAZ (0006 deseni). Aksi halde token
-- deneme (enumeration) uç noktası olurdu.
--
-- GEÇERSİZ TOKEN → SIFIR SATIR. Boş satır ile "kullanılmış" / "süresi geçmiş" /
-- "hiç yok" ayrımı BİLİNÇLİ olarak yapılmıyor: ayrım verilseydi fonksiyon geçerli
-- token'ların varlığını sızdıran bir oracle haline gelirdi.
--
-- p_eposta: davet belirli bir e-postaya çıkarıldıysa (davet.eposta dolu) token
-- yalnızca O adresle kayıt olan kişide çalışır. Varsayılanı NULL olduğu için
-- `davet_coz(token)` çağrısı da bu fonksiyona düşer.
create or replace function private.davet_coz(p_token text, p_eposta text default null)
returns table (kulup_id uuid, rol public.app_role, sporcu_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.kulup_id, d.rol, d.sporcu_id
    from public.davet d
   where d.token = p_token
     and d.kullanildi_at is null
     and d.son_kullanma > now()
     -- nullif(btrim(...),'') → panelden boş string kaydedilmiş bir eposta
     -- "kişiye özel davet" sayılmaz, herkese açık davet gibi davranır.
     -- p_eposta NULL geldiğinde karşılaştırma NULL üretir, satır ELENİR:
     -- kişiye özel davet e-posta sunulmadan çözülemez (fail-closed).
     and (
       nullif(btrim(d.eposta), '') is null
       or lower(btrim(d.eposta)) = lower(btrim(p_eposta))
     )
$$;

-- ---------------------------------------------------------------------------
-- 13.2 handle_new_user — auth.users'a kayıt olunca profiles satırı açar.
--
-- SIRA:
--   a) metadata'da davet_token VARSA → tek doğru kaynak odur. davet_coz ile çöz;
--      geçersizse EXCEPTION (fail-closed). Daveti mühürle, profiles satırını
--      davetteki KULÜP ve ROLLE aç, gerekiyorsa veli_sporcu bağını kur.
--   b) Token YOK ve sistemde TEK kulüp var → o kulübe 'veli' olarak bağlan
--      (kurulum/demo kolaylığı; tek kulüplü kurulumda davet zorunlu değil).
--   c) Token YOK ve birden fazla kulüp var → EXCEPTION.
--
-- GÜVENLİK — 0016'NIN ROL YÜKSELTME KORUMASI:
--   Rol hiçbir dalda raw_user_meta_data'dan OKUNMUYOR. Eski hâli
--   coalesce(metadata.role, 'veli') idi; doğrudan /auth/v1/signup çağrısına
--   data:{role:'yonetici'} koyan herkes yönetici hesabı açabiliyordu.
--     · (a) dalında rol DAVET SATIRINDAN gelir. O satırı yalnızca ilgili kulübün
--       yöneticisi oluşturabilir (12.12) ve platform_admin oluşturamaz (davet_rol_check).
--     · (b) dalında rol sabit 'veli'.
--   Metadata'dan okunan TEK alanlar: 'ad' (zararsız) ve 'davet_token'. Token'ın
--   metadata'dan okunması güvenlidir çünkü token KANITIN KENDİSİDİR: 16 rastgele
--   bayt, uydurulan bir değer hiçbir satırla eşleşmez. Bu "istemcinin söylediğine
--   güvenmek" değil "istemcinin sunduğu sırrı doğrulamak"tır.
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

    -- SIRA ÖNEMLİ: profiles ÖNCE, davet mührü SONRA.
    -- davet.kullanan_id → profiles(id) FK'si var; mühür önce atılsaydı henüz var
    -- olmayan profil satırına referans verilir ve 23503 ile patlardı.
    --
    -- Rol ve kulüp DAVETTEN. profiles.kulup_id "default" hilesini yapısal olarak
    -- kullanamaz (bölüm 2), bu yüzden açıkça yazılıyor.
    insert into public.profiles (id, role, ad, kulup_id)
    values (new.id, v_rol, v_ad, v_kulup);

    -- TEK KULLANIMLIK MÜHÜR — KOŞULLU.
    -- Yarış durumu: aynı linkle eşzamanlı iki kayıt denemesinde ikisi de
    -- davet_coz'dan geçebilir. Bu UPDATE'in `kullanildi_at is null` koşulu
    -- READ COMMITTED'de birinci işlem commit ettikten sonra YENİDEN
    -- değerlendirilir; ikinci işlem 0 satır günceller ve aşağıdaki kontrolle
    -- reddedilir. Exception tüm kayıt işlemini geri alır (trigger, auth.users
    -- INSERT'i ile aynı transaction'dadır) — yetim profil satırı oluşmaz.
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

    -- Veli daveti belirli bir sporcuya bağlıysa bağı hemen kur; veli ilk girişte
    -- çocuğunu görsün. kulup_id AÇIKÇA yazılıyor: bu fonksiyon service_role/postgres
    -- bağlamında koşar, auth.uid() NULL'dur ve tablonun default'u NULL üretirdi.
    -- Sporcunun aynı kulüpte olduğu protect_davet_sporcu() ile davet oluşturma
    -- anında garanti altındadır.
    if v_sporcu is not null then
      insert into public.veli_sporcu (veli_id, sporcu_id, kulup_id)
      values (new.id, v_sporcu, v_kulup)
      on conflict do nothing;
    end if;

    return new;
  end if;

  -- --- (b)/(c) DAVETSİZ KAYIT -------------------------------------------
  select count(*) into v_adet from public.kulup;

  if v_adet = 1 then
    select id into v_kulup from public.kulup;
  elsif v_adet = 0 then
    raise exception 'Kulüp tanımlı değil: yeni kullanıcı oluşturulamaz. Önce kurulum/03_kulup_olustur.sql çalıştırılmalı.';
  else
    raise exception 'Kayıt için davet linki gerekli: sistemde birden fazla kulüp var ve davet token''ı sunulmadı.';
  end if;

  insert into public.profiles (id, role, ad, kulup_id)
  values (new.id, 'veli', v_ad, v_kulup);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 13.3 protect_profile_role — rol / şube / KULÜP yükseltme koruması.
-- Bilinçli olarak SECURITY INVOKER: current_user isteği yapan gerçek DB rolüdür,
-- yani son kullanıcı (authenticated) kısıtlanır; SQL Editor (postgres) ve
-- service_role (davet akışı) serbest kalır — test için trigger disable etmek gerekmez.
--
-- kulup_id kontrolü 0021'de eklendi: profiles UPDATE politikası (12.2)
-- kullanıcının kendi satırını güncellemesine izin veriyor; kulup_id korunmasaydı
-- bir veli kendi kulup_id'sini değiştirip BAŞKA BİR KULÜBE atlayabilirdi.
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
    if new.kulup_id is distinct from old.kulup_id then
      raise exception 'kulup_id alanı bu şekilde değiştirilemez';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_profile_role_protect
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- 13.4 protect_davet_sporcu — davetteki sporcu başka kulübün olmasın (0022 bölüm 4).
-- davet.sporcu_id ayağına bileşik FK konulamadığı için (on delete set null,
-- kulup_id NOT NULL) aynı garanti trigger ile sağlanıyor. Hata KAYIT ANINDA
-- anlaşılmaz bir FK mesajı olarak değil, DAVET OLUŞTURMA anında çıkar.
--
-- SECURITY INVOKER: bir yönetici için public.sporcular sorgusu RLS'e tabidir ve
-- yabancı sporcu zaten "bulunamadı" olur; service_role / postgres için RLS baypas
-- edilir ve karşılaştırma gerçek kulup_id üzerinden yapılır. İki yol da doğru.
create or replace function public.protect_davet_sporcu()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sporcu_kulup uuid;
begin
  if new.sporcu_id is not null then
    select s.kulup_id into v_sporcu_kulup
      from public.sporcular s
     where s.id = new.sporcu_id;

    if v_sporcu_kulup is null or v_sporcu_kulup is distinct from new.kulup_id then
      raise exception 'Davetteki sporcu bu kulübe ait değil.';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_davet_sporcu_protect
  before insert or update on public.davet
  for each row execute procedure public.protect_davet_sporcu();

-- ---------------------------------------------------------------------------
-- 13.5 protect_bireysel_paket — veli, kalan=999 yazıp sınırsız ders hakkı
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
-- 13.6 protect_konusma_taraflar — veli/antrenör, kendi thread'inin karşı tarafını
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
-- 13.7 protect_bireysel_rezervasyon — durum değiştirirken tutar/sporcu/paket de
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
-- 13.8 protect_etkinlik_sonuc — 12.7'deki "antrenör maç sonucunu girer"
-- politikasının kolon ayağı (0025): yönetici dışındaki kullanıcı etkinlik
-- satırında YALNIZCA 4 sonuç alanını değiştirebilir.
--
-- KOLONLARI TEK TEK SAYMAK YERİNE to_jsonb FARKI:
--   13.5/13.7 değişmemesi gereken kolonları tek tek sayıyor; orada tablo kapalı
--   bir küme, burada değil — etkinlik'e 0021 kulup_id ekledi, ileride başkaları
--   da eklenebilir. Kolon sayan bir gövde yeni her kolonu SESSİZCE serbest
--   bırakırdı (fail-open). İzinli 4 alanı jsonb'den düşürüp geri kalanı bütün
--   olarak karşılaştırmak fail-closed davranır: yarın eklenen kolon otomatik korunur.
--
-- SONUÇ ↔ SKOR TUTARLILIĞI BİLİNÇLİ OLARAK ZORLANMIYOR: `sonuc` normal akışta
-- skordan türetiliyor (sonucTuret, app/src/data/etkinlikRepo.ts) ama hükmen
-- galibiyet gibi skorla uyuşmayan meşru durumlar var. Değer kümesi zaten
-- etkinlik tablosundaki check constraint ile kapalı.
create or replace function public.protect_etkinlik_sonuc()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if to_jsonb(new) - 'skor_biz' - 'skor_rakip' - 'sonuc' - 'sonuc_notu'
       is distinct from
       to_jsonb(old) - 'skor_biz' - 'skor_rakip' - 'sonuc' - 'sonuc_notu' then
      raise exception 'etkinlikte yalnızca maç sonucu alanları güncellenebilir';
    end if;
  end if;
  return new;
end;
$$;

create trigger on_etkinlik_sonuc_protect
  before update on public.etkinlik
  for each row execute procedure public.protect_etkinlik_sonuc();

-- ---------------------------------------------------------------------------
-- 13.9 push_token_devral — cihaz devri. Aynı telefonda A çıkıp B girdiğinde token
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
-- 13.10 Grant / revoke
-- ---------------------------------------------------------------------------
-- SIRA KRİTİK: önce toplu GRANT'ler, SONRA hedefli REVOKE'lar. Ters sırada
-- `grant all on all routines` aşağıda kaldırılan EXECUTE haklarını geri verirdi.

-- --- 13.10.1 public şeması toplu izinleri (SAVUNMA AMAÇLI)
-- Gerçek bir Supabase projesinde bu blok GEREKSİZDİR: proje kurulurken tanımlanan
-- `alter default privileges` kuralları, public şemasında yeni yaratılan her
-- tablo/sequence/fonksiyon için anon, authenticated ve service_role'e izinleri
-- OTOMATİK verir. Blok yine de yazılıyor çünkü:
--   · public şeması sıfırlanmış / elle yeniden yaratılmış ortamlarda (yerel
--     Docker kurulumunda `drop schema public cascade` sonrası) default
--     privileges kuralları KAYBOLUR ve tablolar API'ye kapalı doğar. Belirti
--     yanıltıcıdır: RLS doğru kurulmuşken PostgREST "permission denied for
--     table ..." döner ve saatlerce RLS'te hata aranır.
--   · Saf Postgres (Supabase olmayan) bir kurulumda hiç var olmaz.
-- İzinlerin gerçek daraltıcısı GRANT değil RLS'tir: aşağıdaki `grant all` bir
-- satır bile açmaz, 12. bölümdeki politikalar neyi görebileceğine karar verir.
--
-- NOT: pgcrypto `public` şemasına kurulmuş bir ortamda (bkz. bölüm 11) alttaki
-- `grant all on all routines` satırı eklentinin fonksiyonları için
-- "WARNING: no privileges were granted for digest/hmac/..." uyarıları basar.
-- Zararsızdır: o fonksiyonlarda EXECUTE zaten PUBLIC'e verilidir, verilecek yeni
-- bir izin yoktur. Supabase projelerinde pgcrypto `extensions` şemasındadır ve
-- bu uyarılar hiç çıkmaz.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- --- 13.10.2 private şeması
-- 0016: private şemasına USAGE. SECURITY INVOKER trigger'lar (13.5, 13.7, 13.8)
-- isim çözümlemesini ÇAĞIRANIN yetkileriyle runtime'da yapar — USAGE olmadan her
-- authenticated UPDATE 'permission denied for schema private' verir.
grant usage on schema private to authenticated, service_role;

-- 0005: current_profile_role() RLS politikalarının içinden çağrıldığı için
-- authenticated'a EXECUTE şart; anon/public'ten kaldırılıyor (girişsiz doğrudan
-- çağrı engellenir). Fonksiyon zaten `private` şemasında olduğu için PostgREST
-- tarafından RPC endpoint'i olarak da yayımlanmaz.
revoke execute on function private.current_profile_role() from public;
revoke execute on function private.current_profile_role() from anon;
grant execute on function private.current_profile_role() to authenticated;

-- 0021: current_kulup_id() için aynı desen.
--   authenticated: 55 restrictive politikanın içinden çağrılıyor, EXECUTE şart.
--   service_role : kulup_id'yi açıkça geçmeyen bir service_role INSERT'ünde kolon
--                  default'u bu fonksiyonu çağırır; EXECUTE olmazsa "permission
--                  denied for function" gibi yanıltıcı bir hata alınır.
revoke execute on function private.current_kulup_id() from public;
revoke execute on function private.current_kulup_id() from anon;
grant execute on function private.current_kulup_id() to authenticated;
grant execute on function private.current_kulup_id() to service_role;

-- 0022: davet_coz yalnızca SECURITY DEFINER olan handle_new_user'dan (yani
-- postgres bağlamında) çağrılıyor; authenticated'a EXECUTE VERİLMİYOR.
revoke execute on function private.davet_coz(text, text) from public;
revoke execute on function private.davet_coz(text, text) from anon;
revoke execute on function private.davet_coz(text, text) from authenticated;
grant  execute on function private.davet_coz(text, text) to service_role;

-- --- 13.10.3 public şemasındaki SECURITY DEFINER fonksiyonların kapatılması
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
-- 14) kulup_id İNDEKSLERİ
--     Kaynak: 0021 bölüm 8, 0022 bölüm 2.3, 0024 bölüm 3, 0025 bölüm 3
-- ===========================================================================
-- 14.1 TEK KOLONLU kulup_id İNDEKSLERİ
-- ---------------------------------------------------------------------------
-- Restrictive politika artık HER sorguya `kulup_id = $1` predicate'i ekliyor;
-- kulup_id indekssiz kalırsa çok kiracılı ortamda her okuma seq scan olur.
-- Bileşik (id, kulup_id) unique index'leri kulup_id ile BAŞLAMADIĞI için
-- filtreleme amacıyla kullanılamaz — ayrı tek kolonlu indeks şart.
-- HARİÇ: kurum_ayarlari ve mobil_ozellik — PK'leri zaten kulup_id ile BAŞLIYOR.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','brans','hizmet_turu','beceri',
    'sube','grup','sporcular','aidat_plani','odeme','antrenman','yoklama',
    'gelisim_degerlendirme','duyuru','etkinlik','konusma','servis_rota','urun',
    'siparis','bireysel_antrenor','bireysel_musaitlik','bireysel_istisna',
    'bireysel_paket','bireysel_rezervasyon','antrenor_grup_ucret','hakedis',
    'basvuru','gider','fatura','push_token',
    'kurum_brans_secimi','kurum_hizmet_turu_secimi','veli_sporcu',
    'sporcu_antrenor','gelisim_beceri_seviye','duyuru_hedef','etkinlik_katilim',
    'mac_kadro','mac_kadro_sporcu','mesaj','servis_durak','servis_sporcu',
    'siparis_kalem','hakedis_kalem',
    'davet'
  ] loop
    execute format('create index if not exists %I on public.%I (kulup_id)', t || '_kulup_id_idx', t);
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 14.2 BİLEŞİK / KISMİ İNDEKSLER  (0024 + 0025)
-- ---------------------------------------------------------------------------
-- Yukarıdaki tek kolonlu indeksler kiracı duvarını karşılıyor ama liste
-- ekranlarının gerçek sorgusu iki koşullu. Bu üç indeks ikinci koşulu da kapsar.

-- 0024: sporcu ve grup listelerinin varsayılan sorgusu artık
--   `kulup_id = ? and aktif = true` biçiminde.
create index if not exists sporcular_kulup_aktif_idx on public.sporcular (kulup_id, aktif);
create index if not exists grup_kulup_aktif_idx      on public.grup      (kulup_id, aktif);

-- 0025: "sonucu girilmemiş geçmiş maçlar" ekranlarının açılış sorgusu
--   `where kulup_id = ? and tur = 'mac' and tarih < ? and sonuc is null`.
-- Kısmi indeks yalnızca sonucu bekleyen satırları tutar; sonuç girildiği anda
-- satır indeksten düşer, yani indeks sezon boyunca küçük kalır.
create index if not exists etkinlik_sonuc_bekleyen_idx
  on public.etkinlik (kulup_id, tarih desc)
  where tur = 'mac' and sonuc is null;


-- ===========================================================================
-- 15) REALTIME YAYINI
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
--   select count(*) from pg_tables where schemaname = 'public';          -- 47
--   select count(*) from pg_policies where schemaname = 'public';        -- 216
--     (161 permissive + 55 restrictive)
--
--   -- 0024/0025 entegrasyonu: 4 kolon + 3 indeks + 1 trigger dönmeli
--   select table_name, column_name from information_schema.columns
--    where table_schema='public' and table_name in ('sporcular','grup')
--      and column_name in ('aktif','pasif_tarihi') order by 1, 2;
--   select indexname from pg_indexes where schemaname='public'
--    and indexname in ('sporcular_kulup_aktif_idx','grup_kulup_aktif_idx',
--                      'etkinlik_sonuc_bekleyen_idx');
--   select tgname from pg_trigger where tgrelid = 'public.etkinlik'::regclass
--    and not tgisinternal;                       -- on_etkinlik_sonuc_protect
--
--   -- kulup_id taşıyan tablo sayısı → 46 (47 tablo eksi kulup'un kendisi)
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and column_name = 'kulup_id';
--
--   -- RLS'siz tablo var mı? → boş dönmeli
--   select tablename from pg_tables t where schemaname='public'
--     and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
--                     where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity);
--
--   -- Restrictive politikaların hiçbirine rol atanmamış olmalı ({public})
--   select tablename, roles from pg_policies
--    where schemaname='public' and permissive = 'RESTRICTIVE' and roles <> '{public}';
--    → boş dönmeli
--
-- Sıradaki adım: kurulum/02_katalog.sql (platform kataloğu).
-- ===========================================================================
