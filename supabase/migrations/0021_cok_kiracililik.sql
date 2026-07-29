-- ===========================================================================
-- 0021_cok_kiracililik.sql — Tek kulüpten çok kiracılı (SaaS) yapıya geçiş
-- ===========================================================================
-- BAĞLAM
--   0001–0020 arası şema TEK kulüp için kuruldu: hiçbir tabloda kiracı kimliği
--   yok, 158 RLS politikasının tamamı yalnızca ROL bazlı
--   (private.current_profile_role() deseni). Bu migration kiracı boyutunu
--   ekler ve izolasyonu RESTRICTIVE politikalarla kurar.
--
-- TASARIM KARARLARI (verilmiş, bu dosyada uygulanıyor)
--   1) Bir hesap = bir kulüp. profiles.kulup_id tek kaynak; ayrı üyelik
--      tablosu YOK.
--   2) İzolasyon RESTRICTIVE politikalarla. Mevcut 158 permissive politikaya
--      DOKUNULMUYOR. PostgreSQL permissive politikaları OR ile, restrictive
--      politikaları AND ile birleştirir:
--         erişim = (mevcut rol kuralları OR'lanmış) AND (kulup_id eşleşmesi)
--      Böylece rol mantığı aynen korunur, üstüne kiracı duvarı biner.
--   3) kulup_id kolonları `default private.current_kulup_id()` alır → uygulama
--      kodundaki INSERT'ler DEĞİŞMEZ (PostgREST kolonu atlar, default doldurur).
--   4) Süper-admin (platform sahibi) ayrı panelden service_role ile bağlanır.
--      service_role Postgres'te BYPASSRLS'tir; aşağıdaki hiçbir politika onu
--      etkilemez, bu yüzden platform_admin için RLS politikası YAZILMIYOR.
--
-- ÇALIŞTIRMA
--   MEVCUT VERİ DOLU veritabanında çalışacak şekilde yazıldı (canlı test
--   projesi + yerel demo). Kolon ekleme sırası: nullable ekle → doldur →
--   not null → default. Tek seferde, tek transaction içinde çalışır.
--   Tekrar çalıştırılabilir (idempotent): tüm constraint/policy işlemleri
--   "drop if exists → add" veya katalog kontrolü ile korunuyor.
--
-- BÖLÜMLER
--   0)  Ön uyarılar
--   1)  app_role enum'una platform_admin
--   2)  kulup tablosu + RLS
--   3)  profiles.kulup_id  (fonksiyondan ÖNCE — gerekçe bölüm 3'te)
--   4)  private.current_kulup_id()
--   5)  VERİ TAŞIMA: mevcut her şey tek varsayılan kulübe
--   6)  Kiracı tablolarına kulup_id (41 tablo) + ortak katalog (3 tablo)
--   7)  Bileşik benzersizlik + bileşik FK (bağ tablolarının kiracı bütünlüğü)
--   8)  İndeksler
--   9)  RESTRICTIVE izolasyon politikaları
--   10) Tekil/global kısıtların kiracı bazına çevrilmesi
--       (kurum_ayarlari, mobil_ozellik, fatura)
--   11) Koruma trigger'ları + geçiş köprüsü (handle_new_user)
--   12) Doğrulama sorguları (yorum)
-- ===========================================================================


-- ===========================================================================
-- 0) ÖN UYARILAR — bu migration'dan sonra geçerli olan iki kural
-- ===========================================================================
-- UYARI 1 — `alter table public.profiles force row level security` ASLA
--   çalıştırılmamalı. private.current_profile_role() (0006) ve aşağıda eklenen
--   private.current_kulup_id() SECURITY DEFINER'dır ve sahibi profiles'ın da
--   sahibi olan postgres'tir; tablo sahibi RLS'i baypas ettiği için bu iki
--   fonksiyon profiles'ın KENDİ politikaları içinden çağrılabiliyor. FORCE
--   açılırsa sahiplik istisnası kalkar ve her ikisi de sonsuz özyinelemeye
--   girer (Postgres "infinite recursion detected in policy for relation
--   profiles" hatası verir), yani tüm sistem kilitlenir.
--
-- UYARI 2 — service_role ile yapılan INSERT'lerde auth.uid() NULL'dur, dolayısıyla
--   `default private.current_kulup_id()` NULL üretir ve kulup_id NOT NULL olan
--   tablolarda 23502 hatası alınır. Süper-admin paneli / admin-panel'in
--   createAdminClient() kullanan route'ları kulup_id'yi AÇIKÇA geçmek zorundadır.


-- ===========================================================================
-- 1) app_role ENUM'UNA platform_admin
-- ===========================================================================
-- Platform sahibi (Yavuz) için rol değeri. Bilinçli olarak HİÇBİR RLS
-- politikasında kullanılmıyor — süper-admin service_role ile bağlanır ve RLS'i
-- baypas eder. Enum değeri yalnızca "bu profil normal bir kulüp kullanıcısı
-- değil" işaretidir; kulup_id'si NULL kalır ve bu sayede aşağıdaki restrictive
-- politikaların hepsi onun için fail-closed olur (NULL = NULL → NULL → red).
--
-- NOT: PostgreSQL 12+ `alter type ... add value` komutunun transaction bloğu
-- içinde çalışmasına izin verir; tek kısıt, yeni değerin AYNI transaction içinde
-- KULLANILMAMASIDIR. Bu dosyada 'platform_admin' hiçbir yerde kullanılmıyor,
-- dolayısıyla güvenli. (Eğer yine de "unsafe use of new value" hatası alınırsa
-- yalnızca bu satırı ayrı çalıştırıp migration'ı yeniden başlatın.)
alter type app_role add value if not exists 'platform_admin';


-- ===========================================================================
-- 2) kulup TABLOSU
-- ===========================================================================
-- Kiracı kök tablosu. Faturalama/abonelik alanları (plan, sporcu_limiti,
-- abonelik_bitis) süper-admin panelinin yöneteceği alanlardır; uygulama bu
-- alanları okumaz.
create table if not exists public.kulup (
  id             uuid primary key default gen_random_uuid(),
  ad             text not null,
  slug           text unique,
  durum          text not null default 'deneme' check (durum in ('aktif', 'askida', 'deneme')),
  plan           text,
  sporcu_limiti  int,
  abonelik_bitis date,
  created_at     timestamptz not null default now()
);

alter table public.kulup enable row level security;

-- RLS politikası bölüm 4'ün SONUNDA yaratılıyor, burada DEĞİL: politika ifadesi
-- private.current_kulup_id() fonksiyonunu çağırıyor ve CREATE POLICY ifadeyi
-- yaratma anında ayrıştırıp fonksiyona OID ile bağlanıyor — fonksiyon henüz
-- yokken "function private.current_kulup_id() does not exist" hatası alınırdı.
-- RLS'in bu satırda açılmış olması yeterli: politikası olmayan tablo
-- authenticated/anon için tamamen kapalıdır (fail-closed).


-- ===========================================================================
-- 3) profiles.kulup_id
-- ===========================================================================
-- SIRA NOTU: görev tanımında bu adım fonksiyondan SONRA geliyordu; burada
-- bilinçli olarak ÖNCE yapılıyor. Sebep: private.current_kulup_id() gövdesi
-- public.profiles.kulup_id kolonunu okur ve LANGUAGE SQL fonksiyon gövdeleri
-- CREATE anında doğrulanır (check_function_bodies varsayılan olarak on).
-- Kolon önce yaratılmazsa fonksiyon "column kulup_id does not exist" ile patlar.
--
-- NULLABLE — iki gerekçe:
--   a) platform_admin'in kulübü yoktur (kulup_id NULL kalır).
--   b) profiles, "default private.current_kulup_id()" hilesini YAPISAL olarak
--      kullanamaz: fonksiyon kulüp bilgisini profiles'tan okur, bir satır kendi
--      default'unu kendinden türetemez. Bu yüzden profiles.kulup_id her zaman
--      AÇIKÇA yazılmak zorundadır (bkz. bölüm 11 — handle_new_user).
alter table public.profiles
  add column if not exists kulup_id uuid;

alter table public.profiles drop constraint if exists profiles_kulup_id_fkey;
alter table public.profiles
  add constraint profiles_kulup_id_fkey foreign key (kulup_id) references public.kulup(id);


-- ===========================================================================
-- 4) private.current_kulup_id()
-- ===========================================================================
-- Aşağıdaki 54 restrictive politikanın tamamı bu fonksiyona dayanır.
--   · SECURITY DEFINER  → profiles'ın kendi RLS'ine takılmaz (bkz. UYARI 1)
--   · stable            → aynı sorgu içinde tek kez değerlendirilebilir
--   · set search_path   → search_path enjeksiyonuna kapalı (0017 deseni)
--   · private şemasında → PostgREST yalnızca public'i yayımladığı için
--                         /rest/v1/rpc/ üzerinden çağrılamaz (0006 deseni)
create or replace function private.current_kulup_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select kulup_id from public.profiles where id = auth.uid()
$$;

-- İSTEĞE BAĞLI SERTLEŞTİRME (bilinçli olarak KAPALI bırakıldı):
-- Gövde aşağıdaki gibi yazılırsa abonelik kill-switch'i bedava gelir —
-- kulüp 'askida' yapıldığı an current_kulup_id() NULL döner ve tüm restrictive
-- politikalar fail-closed olur, tek UPDATE ile kulüp erişimi kapanır:
--     select p.kulup_id from public.profiles p
--     join public.kulup k on k.id = p.kulup_id and k.durum in ('aktif','deneme')
--     where p.id = auth.uid()
-- Görev tanımı düz select istediği için uygulanmadı; abonelik yönetimi
-- devreye alınırken bu sürüme geçilmesi önerilir.

-- current_profile_role() için 0005'te kurulan grant deseninin aynısı.
-- authenticated: politikalar içinden çağrıldığı için EXECUTE şart.
-- service_role : kulup_id'yi açıkça geçmeyen bir service_role INSERT'ünde kolon
--                default'u bu fonksiyonu çağırır; EXECUTE olmazsa "permission
--                denied for function" gibi yanıltıcı bir hata alınır.
revoke execute on function private.current_kulup_id() from public;
revoke execute on function private.current_kulup_id() from anon;
grant execute on function private.current_kulup_id() to authenticated;
grant execute on function private.current_kulup_id() to service_role;

-- --- Bölüm 2'den ertelenen kulup politikası (fonksiyon artık var).
--     Kullanıcı YALNIZCA kendi kulübünün satırını okur (kulüp adı / plan
--     gösterimi için). Yazma politikası bilinçli olarak YOK: kulüp açma-kapama,
--     plan ve abonelik değişikliği yalnızca service_role ile (süper-admin
--     paneli) yapılır; service_role BYPASSRLS olduğu için politika gerekmez.
drop policy if exists "kulup: kullanıcı kendi kulübünü okur" on public.kulup;
create policy "kulup: kullanıcı kendi kulübünü okur"
  on public.kulup for select
  using (id = (select private.current_kulup_id()));


-- ===========================================================================
-- 5) VERİ TAŞIMA — 1. adım: varsayılan kulüp kaydı
-- ===========================================================================
-- Mevcut veritabanındaki HER ŞEY tek bir kulübe aittir (bugün tek kiracı
-- kurulu). O kulübün adını kurum_ayarlari.kulup_adi'ndan alıyoruz; tablo boşsa
-- veya ad boşsa 'Varsayılan Kulüp' kullanılıyor.
-- Durum 'aktif' — 'deneme' değil: bu zaten çalışan, ödemesi yapılmış kurulum.
do $$
declare
  v_ad   text;
  v_slug text;
begin
  -- Idempotanlık: kulüp zaten varsa (migration yeniden çalıştırılıyor) yeni
  -- kulüp AÇMA. Aşağıdaki doldurma adımları zaten "where kulup_id is null"
  -- filtresiyle çalıştığı için tekrar çalıştırma güvenlidir.
  if exists (select 1 from public.kulup) then
    raise notice '0021: kulup tablosu zaten dolu — varsayılan kulüp oluşturulmadı.';
    return;
  end if;

  select k.kulup_adi into v_ad from public.kurum_ayarlari k limit 1;
  v_ad := coalesce(nullif(btrim(v_ad), ''), 'Varsayılan Kulüp');

  -- Türkçe karakterleri ASCII'ye indirip slug üret: "Karşıyaka Spor Okulu"
  -- → "karsiyaka-spor-okulu". translate() karakter bazlı çalışır (bayt değil),
  -- iki listenin karakter sayısı eşit olmak ZORUNDADIR (12 = 12).
  v_slug := translate(v_ad, 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU');
  v_slug := lower(v_slug);
  -- Veritabanı tr_TR locale'inde ise lower('I') noktasız 'ı' üretir; ASCII'ye
  -- indirdiğimiz 'I' harfleri geri Türkçeye dönmesin diye ikinci geçiş.
  v_slug := translate(v_slug, 'ı', 'i');
  v_slug := btrim(regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'), '-');
  v_slug := coalesce(nullif(v_slug, ''), 'kulup');

  insert into public.kulup (ad, slug, durum, plan)
  values (v_ad, v_slug, 'aktif', 'mevcut');

  raise notice '0021: varsayılan kulüp oluşturuldu — ad=%, slug=%', v_ad, v_slug;
end
$$;


-- ===========================================================================
-- 6) KİRACI TABLOLARINA kulup_id
-- ===========================================================================
-- SINIFLANDIRMA (45 tablo)
--   · KİRACI (41)  : kulup_id NOT NULL + default. Aşağıdaki listede.
--   · profiles (1) : kulup_id NULLABLE, default YOK (bölüm 3'teki gerekçe).
--   · KATALOG (3)  : brans, hizmet_turu, beceri — kulup_id NULLABLE.
--                    NULL = platform kataloğu (herkes okur), dolu = kulübe özel.
--
-- Kiracı listesi iki mantıksal gruptan oluşur:
--   A) Birinci sınıf kayıtlar (27): kendi id'si olan ve uygulamanın doğrudan
--      sorguladığı tablolar.
--   C) Bağ / türetilmiş tablolar (14): parent'ı üzerinden erişilen tablolar.
--      Bunlara da kulup_id DENORMALİZE ediliyor (exists() alt sorgusu yerine),
--      çünkü mevcut 158 permissive politika zaten parent üzerinde exists()
--      yapıyor; ikinci bir exists() her satırda çift alt-sorgu demek olurdu.
--      Denormalizasyonun bozulması bölüm 7'deki BİLEŞİK FK'lerle veritabanı
--      seviyesinde imkânsız kılınıyor.

-- --- 6.1 Kolonu NULLABLE olarak ekle (dolu tabloda anında, tablo yeniden
--         yazılmaz; default vermediğimiz için satırlara dokunulmaz).
do $$
declare t text;
begin
  foreach t in array array[
    -- A grubu (27)
    'sube','grup','sporcular','aidat_plani','odeme','antrenman','yoklama',
    'gelisim_degerlendirme','duyuru','etkinlik','konusma','servis_rota','urun',
    'siparis','bireysel_antrenor','bireysel_musaitlik','bireysel_istisna',
    'bireysel_paket','bireysel_rezervasyon','antrenor_grup_ucret','hakedis',
    'basvuru','gider','fatura','kurum_ayarlari','mobil_ozellik','push_token',
    -- C grubu (14)
    'kurum_brans_secimi','kurum_hizmet_turu_secimi','veli_sporcu',
    'sporcu_antrenor','gelisim_beceri_seviye','duyuru_hedef','etkinlik_katilim',
    'mac_kadro','mac_kadro_sporcu','mesaj','servis_durak','servis_sporcu',
    'siparis_kalem','hakedis_kalem',
    -- Katalog (3) — kolon aynı, kısıtları farklı (aşağıda ayrışıyor)
    'brans','hizmet_turu','beceri'
  ] loop
    execute format('alter table public.%I add column if not exists kulup_id uuid', t);
  end loop;
end
$$;

-- --- 6.2 VERİ TAŞIMA — 2. adım: mevcut satırları varsayılan kulübe bağla.
--         Katalog tabloları (brans/hizmet_turu/beceri) BİLİNÇLİ OLARAK HARİÇ:
--         mevcut branş/beceri/hizmet türü satırları 02_katalog.sql'in seed'idir,
--         NULL kalarak "platform kataloğu" olur. Backfill edilseydi bu satırlar
--         mevcut kulübe kilitlenir, açılacak İKİNCİ kulüp bomboş bir branş ve
--         beceri listesiyle başlardı.
do $$
declare
  t text;
  v_kulup uuid;
begin
  select id into v_kulup from public.kulup order by created_at, id limit 1;
  if v_kulup is null then
    raise exception '0021: kulup tablosu boş — veri taşıma yapılamaz.';
  end if;

  -- profiles dahil: kulup_id NULL kalan bir kullanıcı restrictive politikalar
  -- yüzünden KENDİ profilini bile okuyamaz (sessiz kilitlenme). Bu yüzden
  -- mevcut tüm profiles satırları da taşınıyor.
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
    'siparis_kalem','hakedis_kalem'
  ] loop
    execute format('update public.%I set kulup_id = $1 where kulup_id is null', t)
      using v_kulup;
  end loop;
end
$$;

-- --- 6.3 Kiracı tabloları: NOT NULL + default + kulup FK.
--         SIRA ÖNEMLİ: 6.1 (nullable ekle) → 6.2 (doldur) → 6.3 (not null).
--         Tersi sırada dolu tabloda "column contains null values" hatası alınır.
do $$
declare t text;
begin
  foreach t in array array[
    'sube','grup','sporcular','aidat_plani','odeme','antrenman','yoklama',
    'gelisim_degerlendirme','duyuru','etkinlik','konusma','servis_rota','urun',
    'siparis','bireysel_antrenor','bireysel_musaitlik','bireysel_istisna',
    'bireysel_paket','bireysel_rezervasyon','antrenor_grup_ucret','hakedis',
    'basvuru','gider','fatura','kurum_ayarlari','mobil_ozellik','push_token',
    'kurum_brans_secimi','kurum_hizmet_turu_secimi','veli_sporcu',
    'sporcu_antrenor','gelisim_beceri_seviye','duyuru_hedef','etkinlik_katilim',
    'mac_kadro','mac_kadro_sporcu','mesaj','servis_durak','servis_sporcu',
    'siparis_kalem','hakedis_kalem'
  ] loop
    execute format('alter table public.%I alter column kulup_id set not null', t);
    -- Karar 3: default sayesinde app kodundaki ~33 INSERT çağrısının hiçbiri
    -- değişmiyor — PostgREST kulup_id'yi göndermez, Postgres doldurur.
    execute format('alter table public.%I alter column kulup_id set default private.current_kulup_id()', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_kulup_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (kulup_id) references public.kulup(id)',
                   t, t || '_kulup_id_fkey');
  end loop;
end
$$;

-- --- 6.4 Ortak katalog (brans / hizmet_turu / beceri): NULLABLE + default + FK.
--         Default aynı ifade iki işi birden yapıyor:
--           · 02_katalog.sql SQL Editor'da postgres olarak koşar → auth.uid()
--             NULL → kulup_id NULL → platform kataloğu.
--           · Panelden yönetici ekler → kendi kulup_id'si → kulübe özel satır.
--         Bu sayede 02_katalog.sql'de tek karakter değişmiyor.
--         Neden nullable ZORUNLU: 02_katalog.sql'de yalnızca Basketbol branşı
--         için beceri tanımlı; diğer branşların gelişim ekranı boş açılıyor ve
--         kulübün kendi becerisini eklemesi bir olasılık değil ZORUNLULUK.
do $$
declare t text;
begin
  foreach t in array array['brans','hizmet_turu','beceri'] loop
    execute format('alter table public.%I alter column kulup_id set default private.current_kulup_id()', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_kulup_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (kulup_id) references public.kulup(id)',
                   t, t || '_kulup_id_fkey');
  end loop;
end
$$;


-- ===========================================================================
-- 7) BİLEŞİK BENZERSİZLİK + BİLEŞİK FK
-- ===========================================================================
-- C grubu tablolarındaki denormalize kulup_id'nin parent'ından SAPMASINI
-- veritabanı seviyesinde imkânsız kılar. Örnek: mesaj.kulup_id, bağlı olduğu
-- konusma.kulup_id'den farklı olamaz — çünkü (konusma_id, kulup_id) ikilisi
-- konusma(id, kulup_id) benzersiz anahtarına FK ile bağlı.
-- Bedeli: parent başına fazladan bir unique index. Faydası: kiracı sızıntısının
-- uygulama hatasıyla bile üretilememesi.

-- --- 7.1 Parent tablolara (id, kulup_id) benzersizliği (14 tablo)
--         Bunlar mantıksal olarak gereksiz (id zaten PK) ama bileşik FK'nin
--         hedefleyebilmesi için ŞART: FK yalnızca unique/PK'ye bağlanabilir.
alter table public.sube                 drop constraint if exists sube_id_kulup_uniq cascade;
alter table public.sube                 add  constraint sube_id_kulup_uniq unique (id, kulup_id);
alter table public.grup                 drop constraint if exists grup_id_kulup_uniq cascade;
alter table public.grup                 add  constraint grup_id_kulup_uniq unique (id, kulup_id);
alter table public.sporcular            drop constraint if exists sporcular_id_kulup_uniq cascade;
alter table public.sporcular            add  constraint sporcular_id_kulup_uniq unique (id, kulup_id);
alter table public.profiles             drop constraint if exists profiles_id_kulup_uniq cascade;
alter table public.profiles             add  constraint profiles_id_kulup_uniq unique (id, kulup_id);
alter table public.gelisim_degerlendirme drop constraint if exists gelisim_degerlendirme_id_kulup_uniq cascade;
alter table public.gelisim_degerlendirme add constraint gelisim_degerlendirme_id_kulup_uniq unique (id, kulup_id);
alter table public.duyuru               drop constraint if exists duyuru_id_kulup_uniq cascade;
alter table public.duyuru               add  constraint duyuru_id_kulup_uniq unique (id, kulup_id);
alter table public.etkinlik             drop constraint if exists etkinlik_id_kulup_uniq cascade;
alter table public.etkinlik             add  constraint etkinlik_id_kulup_uniq unique (id, kulup_id);
alter table public.mac_kadro            drop constraint if exists mac_kadro_id_kulup_uniq cascade;
alter table public.mac_kadro            add  constraint mac_kadro_id_kulup_uniq unique (id, kulup_id);
alter table public.konusma              drop constraint if exists konusma_id_kulup_uniq cascade;
alter table public.konusma              add  constraint konusma_id_kulup_uniq unique (id, kulup_id);
alter table public.servis_rota          drop constraint if exists servis_rota_id_kulup_uniq cascade;
alter table public.servis_rota          add  constraint servis_rota_id_kulup_uniq unique (id, kulup_id);
alter table public.servis_durak         drop constraint if exists servis_durak_id_kulup_uniq cascade;
alter table public.servis_durak         add  constraint servis_durak_id_kulup_uniq unique (id, kulup_id);
alter table public.siparis              drop constraint if exists siparis_id_kulup_uniq cascade;
alter table public.siparis              add  constraint siparis_id_kulup_uniq unique (id, kulup_id);
alter table public.urun                 drop constraint if exists urun_id_kulup_uniq cascade;
alter table public.urun                 add  constraint urun_id_kulup_uniq unique (id, kulup_id);
alter table public.hakedis              drop constraint if exists hakedis_id_kulup_uniq cascade;
alter table public.hakedis              add  constraint hakedis_id_kulup_uniq unique (id, kulup_id);

-- --- 7.2 C grubu bağ tablolarında bileşik FK (23 adet)
--         ON DELETE davranışı mevcut tek kolonlu FK ile AYNEN eşleştirildi;
--         farklı olsaydı iki FK'nin silme sırası çakışabilirdi.

-- kurum_brans_secimi / kurum_hizmet_turu_secimi → sube
alter table public.kurum_brans_secimi drop constraint if exists kurum_brans_secimi_sube_kulup_fkey;
alter table public.kurum_brans_secimi add constraint kurum_brans_secimi_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete cascade;
alter table public.kurum_hizmet_turu_secimi drop constraint if exists kurum_hizmet_turu_secimi_sube_kulup_fkey;
alter table public.kurum_hizmet_turu_secimi add constraint kurum_hizmet_turu_secimi_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete cascade;
-- NOT: bu iki tablonun brans_id / hizmet_turu_id ayağına bileşik FK KONULAMAZ,
-- çünkü brans/hizmet_turu katalog tablolarında kulup_id nullable'dır (platform
-- kataloğu satırlarının kulup_id'si NULL). Kabul edilen artık risk bölüm 12'de.

-- veli_sporcu / sporcu_antrenor → sporcular + profiles
alter table public.veli_sporcu drop constraint if exists veli_sporcu_sporcu_kulup_fkey;
alter table public.veli_sporcu add constraint veli_sporcu_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;
alter table public.veli_sporcu drop constraint if exists veli_sporcu_veli_kulup_fkey;
alter table public.veli_sporcu add constraint veli_sporcu_veli_kulup_fkey
  foreign key (veli_id, kulup_id) references public.profiles(id, kulup_id) on delete cascade;
alter table public.sporcu_antrenor drop constraint if exists sporcu_antrenor_sporcu_kulup_fkey;
alter table public.sporcu_antrenor add constraint sporcu_antrenor_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;
alter table public.sporcu_antrenor drop constraint if exists sporcu_antrenor_antrenor_kulup_fkey;
alter table public.sporcu_antrenor add constraint sporcu_antrenor_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references public.profiles(id, kulup_id) on delete cascade;

-- gelisim_beceri_seviye → gelisim_degerlendirme
alter table public.gelisim_beceri_seviye drop constraint if exists gelisim_beceri_seviye_degerlendirme_kulup_fkey;
alter table public.gelisim_beceri_seviye add constraint gelisim_beceri_seviye_degerlendirme_kulup_fkey
  foreign key (degerlendirme_id, kulup_id) references public.gelisim_degerlendirme(id, kulup_id) on delete cascade;

-- duyuru_hedef → duyuru + grup
alter table public.duyuru_hedef drop constraint if exists duyuru_hedef_duyuru_kulup_fkey;
alter table public.duyuru_hedef add constraint duyuru_hedef_duyuru_kulup_fkey
  foreign key (duyuru_id, kulup_id) references public.duyuru(id, kulup_id) on delete cascade;
alter table public.duyuru_hedef drop constraint if exists duyuru_hedef_grup_kulup_fkey;
alter table public.duyuru_hedef add constraint duyuru_hedef_grup_kulup_fkey
  foreign key (grup_id, kulup_id) references public.grup(id, kulup_id);

-- etkinlik_katilim → etkinlik + sporcular
alter table public.etkinlik_katilim drop constraint if exists etkinlik_katilim_etkinlik_kulup_fkey;
alter table public.etkinlik_katilim add constraint etkinlik_katilim_etkinlik_kulup_fkey
  foreign key (etkinlik_id, kulup_id) references public.etkinlik(id, kulup_id) on delete cascade;
alter table public.etkinlik_katilim drop constraint if exists etkinlik_katilim_sporcu_kulup_fkey;
alter table public.etkinlik_katilim add constraint etkinlik_katilim_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;

-- mac_kadro → etkinlik ; mac_kadro_sporcu → mac_kadro + sporcular
alter table public.mac_kadro drop constraint if exists mac_kadro_etkinlik_kulup_fkey;
alter table public.mac_kadro add constraint mac_kadro_etkinlik_kulup_fkey
  foreign key (etkinlik_id, kulup_id) references public.etkinlik(id, kulup_id) on delete cascade;
alter table public.mac_kadro_sporcu drop constraint if exists mac_kadro_sporcu_kadro_kulup_fkey;
alter table public.mac_kadro_sporcu add constraint mac_kadro_sporcu_kadro_kulup_fkey
  foreign key (mac_kadro_id, kulup_id) references public.mac_kadro(id, kulup_id) on delete cascade;
alter table public.mac_kadro_sporcu drop constraint if exists mac_kadro_sporcu_sporcu_kulup_fkey;
alter table public.mac_kadro_sporcu add constraint mac_kadro_sporcu_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;

-- mesaj → konusma
alter table public.mesaj drop constraint if exists mesaj_konusma_kulup_fkey;
alter table public.mesaj add constraint mesaj_konusma_kulup_fkey
  foreign key (konusma_id, kulup_id) references public.konusma(id, kulup_id) on delete cascade;

-- servis_durak → servis_rota ; servis_sporcu → servis_rota + sporcular + servis_durak
alter table public.servis_durak drop constraint if exists servis_durak_rota_kulup_fkey;
alter table public.servis_durak add constraint servis_durak_rota_kulup_fkey
  foreign key (rota_id, kulup_id) references public.servis_rota(id, kulup_id) on delete cascade;
alter table public.servis_sporcu drop constraint if exists servis_sporcu_rota_kulup_fkey;
alter table public.servis_sporcu add constraint servis_sporcu_rota_kulup_fkey
  foreign key (rota_id, kulup_id) references public.servis_rota(id, kulup_id) on delete cascade;
alter table public.servis_sporcu drop constraint if exists servis_sporcu_sporcu_kulup_fkey;
alter table public.servis_sporcu add constraint servis_sporcu_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;
-- durak_id nullable → MATCH SIMPLE gereği durak_id NULL ise kısıt aranmaz.
alter table public.servis_sporcu drop constraint if exists servis_sporcu_durak_kulup_fkey;
alter table public.servis_sporcu add constraint servis_sporcu_durak_kulup_fkey
  foreign key (durak_id, kulup_id) references public.servis_durak(id, kulup_id);

-- siparis_kalem → siparis + urun
alter table public.siparis_kalem drop constraint if exists siparis_kalem_siparis_kulup_fkey;
alter table public.siparis_kalem add constraint siparis_kalem_siparis_kulup_fkey
  foreign key (siparis_id, kulup_id) references public.siparis(id, kulup_id) on delete cascade;
alter table public.siparis_kalem drop constraint if exists siparis_kalem_urun_kulup_fkey;
alter table public.siparis_kalem add constraint siparis_kalem_urun_kulup_fkey
  foreign key (urun_id, kulup_id) references public.urun(id, kulup_id);

-- hakedis_kalem → hakedis + grup  (grup_id nullable)
alter table public.hakedis_kalem drop constraint if exists hakedis_kalem_hakedis_kulup_fkey;
alter table public.hakedis_kalem add constraint hakedis_kalem_hakedis_kulup_fkey
  foreign key (hakedis_id, kulup_id) references public.hakedis(id, kulup_id) on delete cascade;
alter table public.hakedis_kalem drop constraint if exists hakedis_kalem_grup_kulup_fkey;
alter table public.hakedis_kalem add constraint hakedis_kalem_grup_kulup_fkey
  foreign key (grup_id, kulup_id) references public.grup(id, kulup_id);


-- ===========================================================================
-- 8) İNDEKSLER
-- ===========================================================================
-- Restrictive politika artık HER sorguya `kulup_id = $1` predicate'i ekliyor;
-- kulup_id indeksiz kalırsa çok kiracılı ortamda her okuma seq scan olur.
-- 7.1'deki (id, kulup_id) unique index'leri kulup_id ile BAŞLAMADIĞI için
-- filtreleme amacıyla kullanılamaz — ayrı tek kolonlu indeks şart.
-- HARİÇ: kurum_ayarlari ve mobil_ozellik — bölüm 10'da PK'leri kulup_id ile
-- BAŞLAYACAK şekilde yeniden kuruluyor, ayrı indeks gereksiz olurdu.
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
    'siparis_kalem','hakedis_kalem'
  ] loop
    execute format('create index if not exists %I on public.%I (kulup_id)', t || '_kulup_id_idx', t);
  end loop;
end
$$;


-- ===========================================================================
-- 9) RESTRICTIVE İZOLASYON POLİTİKALARI
-- ===========================================================================
-- İKİ KRİTİK UYGULAMA DETAYI — ikisi de görev tanımındaki şablondan bilinçli
-- olarak SAPIYOR, gerekçeleri aşağıda:
--
-- (A) `TO` YAN TÜMCESİ YAZILMIYOR (yani TO PUBLIC).
--     Görev tanımındaki şablon `to authenticated` diyordu. RESTRICTIVE
--     politikalar YALNIZCA adlandırdıkları rollere uygulanır; `to authenticated`
--     yazılsaydı politika `anon` rolüne HİÇ uygulanmaz, yani anon key ile
--     yapılan bir istekte kiracı duvarı tamamen devre dışı kalırdı. Bugün anon
--     zaten hiçbir permissive politikadan geçemiyor (hepsi `auth.uid() is not
--     null` veya rol kontrolü istiyor), dolayısıyla TO PUBLIC yazmanın
--     authenticated davranışına etkisi SIFIR; ama ileride birine `for select
--     using (true)` benzeri bir politika eklendiğinde tek fark bu satır olur.
--     Fail-closed tarafta duruyoruz.
--
-- (B) Fonksiyon `(select ...)` ile SARILIYOR.
--     Çıplak `private.current_kulup_id()` her SATIR için yeniden değerlendirilir.
--     Skaler alt sorgu hâlinde planlayıcı InitPlan olarak sorgu başına BİR KEZ
--     hesaplar. Semantik aynı (fonksiyon STABLE), 158 permissive politikanın
--     üstüne binen bir restrictive politika için fark ölçülebilir.

-- --- 9.1 Kiracı tabloları + profiles: tek politika, FOR ALL (ŞABLON-A)
--         profiles dahil: yönetici "tümünü görür" politikası (01_sema.sql:695)
--         bu restrictive kural olmadan BAŞKA kulüplerin kullanıcılarını da
--         listelerdi.
--         profiles.kulup_id NULL olan platform_admin için NULL = NULL → NULL →
--         satır reddedilir: platform_admin normal API üzerinden hiçbir şey
--         göremez, yalnızca service_role paneliyle çalışır (karar 4).
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
    'siparis_kalem','hakedis_kalem'
  ] loop
    execute format('drop policy if exists "kulup izolasyonu" on public.%I', t);
    execute format($f$
      create policy "kulup izolasyonu" on public.%I
        as restrictive for all
        using (kulup_id = (select private.current_kulup_id()))
        with check (kulup_id = (select private.current_kulup_id()))
    $f$, t);
  end loop;
end
$$;

-- --- 9.2 Ortak katalog (brans / hizmet_turu / beceri): DÖRT AYRI POLİTİKA
--         (ŞABLON-B). Tek `for all` politikasına İNDİRİLEMEZ.
--
--         SEBEP: bu üç tablonun mevcut permissive politikası FOR ALL
--         (01_sema.sql:708-713, 858-859 — "yönetici yazar"). Restrictive kural
--         tek satırda `for all using (kulup_id is null or kulup_id = ...)`
--         yazılsaydı, DELETE yalnızca USING'e baktığı için HERHANGİ bir kulübün
--         yöneticisi `delete from brans where ad = 'Futbol'` diyerek PLATFORM
--         KATALOĞUNU TÜM KULÜPLER İÇİN silebilirdi. UPDATE'te de aynısı.
--         Bu yüzden OKUMA (NULL'a izin verir) ile YAZMA (yalnızca kendi kulübü)
--         ayrı politikalara bölünmek ZORUNDA.
do $$
declare t text;
begin
  foreach t in array array['brans','hizmet_turu','beceri'] loop
    execute format('drop policy if exists "kulup izolasyonu (okuma)" on public.%I', t);
    execute format('drop policy if exists "kulup izolasyonu (ekleme)" on public.%I', t);
    execute format('drop policy if exists "kulup izolasyonu (guncelleme)" on public.%I', t);
    execute format('drop policy if exists "kulup izolasyonu (silme)" on public.%I', t);

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


-- ===========================================================================
-- 10) TEKİL / GLOBAL KISITLARIN KİRACI BAZINA ÇEVRİLMESİ
-- ===========================================================================
-- Üç kısıt çok kiracılıkta matematiksel olarak kırılıyor. Üçünün de çözümü,
-- UYGULAMA KODUNU DEĞİŞTİRMEDEN kısıtı kulup_id ile genişletmek.

-- --- 10.1 kurum_ayarlari: `id boolean primary key check(id)` singleton'ı
--          Tabloda ömür boyu TEK satır olmasına izin veriyordu.
--          ÇÖZÜM: `id` kolonu ve check(id) AYNEN KALIYOR, yalnızca PRIMARY KEY
--          (id) → (kulup_id) oluyor. Böylece kulüp başına tam bir satır olur ve
--          uygulamadaki `.eq('id', true).single()` çağrıları AYNEN çalışmaya
--          devam eder — restrictive politika zaten yalnızca kendi kulübünün
--          satırını gösterdiği için .single() tek satır bulur.
--          Etkilenen ve DEĞİŞMESİ GEREKMEYEN kod:
--            admin-panel/app/(panel)/ayarlar/genel/page.tsx:12  → .eq('id', true)
--            admin-panel/app/(panel)/destek/page.tsx:119        → .eq('id', true)
-- Mevcut PK adı varsayıma bırakılmıyor, pg_constraint'ten okunuyor.
do $$
declare v_pk text;
begin
  select conname into v_pk
    from pg_constraint
   where conrelid = 'public.kurum_ayarlari'::regclass and contype = 'p';
  if v_pk is not null then
    execute format('alter table public.kurum_ayarlari drop constraint %I', v_pk);
  end if;
end
$$;
-- PK düşünce Postgres kolonun NOT NULL işaretini korur; yine de garantiye alalım.
alter table public.kurum_ayarlari alter column id set not null;
alter table public.kurum_ayarlari add constraint kurum_ayarlari_pkey primary key (kulup_id);

-- --- 10.2 mobil_ozellik: `anahtar text primary key`
--          Bayrak anahtarı GLOBAL benzersizdi → ikinci kulüp 'mesajlar'
--          bayrağını ekleyemezdi. ÇÖZÜM: PK (kulup_id, anahtar).
--          Uygulama kodu değişmiyor:
--            admin-panel/app/(panel)/mobil/actions.ts:13 → .eq('anahtar', ...)
--              restrictive politika + yeni PK sayesinde yalnızca kendi
--              kulübünün satırını günceller.
--            app/src/data/ozellikRepo.ts:15 → filtresiz select, RLS daraltır.
do $$
declare v_pk text;
begin
  select conname into v_pk
    from pg_constraint
   where conrelid = 'public.mobil_ozellik'::regclass and contype = 'p';
  if v_pk is not null then
    execute format('alter table public.mobil_ozellik drop constraint %I', v_pk);
  end if;
end
$$;
alter table public.mobil_ozellik alter column anahtar set not null;
alter table public.mobil_ozellik add constraint mobil_ozellik_pkey primary key (kulup_id, anahtar);

-- --- 10.3 fatura.fatura_no: GLOBAL unique
--          Fatura numarası admin-panel/app/(panel)/muhasebe/faturalar/actions.ts:18-20'de
--          `select count(*) from fatura` + 1 ile üretiliyor. Bu count restrictive
--          politika sayesinde artık KULÜBE ÖZEL sayıyor, yani iki kulüp
--          kaçınılmaz olarak aynı 'FT-2026-0001' numarasını üretir ve global
--          unique yüzünden ikinci INSERT patlardı.
--          ÇÖZÜM: unique (fatura_no) → unique (kulup_id, fatura_no).
-- Yalnızca TEK BAŞINA fatura_no üzerindeki unique kısıtı düşürülüyor; kısıt adı
-- ('fatura_fatura_no_key') varsayıma bırakılmadan kolon listesinden bulunuyor.
do $$
declare v_uq text;
begin
  for v_uq in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.fatura'::regclass
       and c.contype = 'u'
       -- attname `name` tipinde; array['fatura_no'] `text[]` olduğu için
       -- karşılaştırma öncesi açıkça text'e çevriliyor (name[] = text[] operatörü yok).
       and (select array_agg(a.attname::text order by a.attname)
              from pg_attribute a
             where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) = array['fatura_no']
  loop
    execute format('alter table public.fatura drop constraint %I', v_uq);
  end loop;
end
$$;
alter table public.fatura drop constraint if exists fatura_kulup_fatura_no_key;
alter table public.fatura add constraint fatura_kulup_fatura_no_key unique (kulup_id, fatura_no);

-- DEĞİŞMEYEN KISITLAR (bilinçli): antrenman(grup_id,tarih),
-- yoklama(antrenman_id,sporcu_id), konusma(veli_id,antrenor_id),
-- hakedis(antrenor_id,donem_ay), antrenor_grup_ucret(antrenor_id,grup_id),
-- bireysel_* benzersizlikleri — hepsi zaten kulübe özel bir kolona (grup,
-- sporcu, profil) dayandığı için kiracı bazında ZATEN benzersizdir.
-- push_token.token PK'si de bilinçli olarak GLOBAL kalıyor: token fiziksel bir
-- cihazı temsil eder, aynı cihaz iki kulüpte aynı anda kayıtlı olamaz
-- (push_token_devral() trigger'ı zaten eski satırı siliyor — 01_sema.sql:1440).


-- ===========================================================================
-- 11) KORUMA TRIGGER'LARI + GEÇİŞ KÖPRÜSÜ
-- ===========================================================================

-- --- 11.1 protect_profile_role: kulup_id de donduruluyor.
--          Bu migration'ın AÇTIĞI deliği kapatır: profiles UPDATE politikası
--          (01_sema.sql:673-676) kullanıcının kendi satırını güncellemesine izin
--          veriyor ve 0003/0016'daki trigger yalnızca role + sube_id'yi
--          koruyordu. kulup_id korunmasaydı bir veli kendi kulup_id'sini
--          değiştirip BAŞKA BİR KULÜBE atlayabilirdi.
--          (Restrictive politikanın WITH CHECK'i de bunu engeller — çünkü
--          current_kulup_id() ifadesi ifade anında ESKİ değeri okur — ama bu
--          snapshot davranışına güvenmek kırılgan; trigger kesin çözüm.)
--          0003/0016'daki SECURITY INVOKER tercihi korunuyor: current_user
--          kontrolü sayesinde SQL Editor (postgres) ve service_role (davet
--          akışı) serbest kalır, yalnızca son kullanıcı kısıtlanır.
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
-- Trigger (on_profile_role_protect) 0003'te kurulmuştu, yeniden bağlamaya gerek
-- yok — create or replace function gövdeyi yerinde değiştirir.

-- --- 11.2 handle_new_user: GEÇİŞ KÖPRÜSÜ
--
--   SORUN: 0016'daki handle_new_user() profiles satırını kulup_id YAZMADAN
--   açıyor (0016_guvenlik_yamalari.sql:61-71 / 01_sema.sql:1303-1314). Bölüm
--   3'te açıklandığı gibi profiles.kulup_id "default" hilesini kullanamaz.
--   Bu migration'dan sonra kulup_id'si NULL kalan kullanıcı, 9.1'deki
--   restrictive politika yüzünden KENDİ PROFİLİNİ BİLE okuyamaz: giriş yapar,
--   hiçbir veri göremez. Sessiz ve teşhisi zor bir kilitlenme.
--   Etkilenen akışlar: app/app/(auth)/register.tsx self-signup ve
--   admin-panel/app/api/admin/{antrenor-davet,kullanici-davet}/route.ts
--   (ikisi de yalnızca role güncelliyor, kulup_id yazmıyor).
--
--   BU MIGRATION'DAKİ ÇÖZÜM — bilinçli olarak DAR ve KENDİNİ SINIRLAYAN:
--   Sistemde TAM OLARAK BİR kulüp varsa yeni kullanıcı o kulübe bağlanır.
--   Bugünkü kurulum (canlı test projesi + yerel demo) tam olarak budur, yani
--   mevcut davranış birebir korunur. İkinci kulüp açıldığı anda bu kural
--   otomatik olarak devre dışı kalır ve fonksiyon AÇIK BİR HATA fırlatır.
--
--   NEDEN raw_user_meta_data'dan kulup_id / kulüp kodu OKUNMUYOR:
--   raw_user_meta_data self-signup'ta İSTEMCİ KONTROLLÜDÜR. Oradan kulup_id
--   okunsaydı, herkes /auth/v1/signup çağrısına data:{kulup_id:'...'} koyarak
--   istediği kulübe 'veli' olarak katılabilir; o kulübün şubelerini, gruplarını,
--   ürünlerini, bireysel antrenörlerini ve tum_veliler=true duyurularını
--   okuyabilirdi. Bu, 0016'nın `role` için kapattığı deliğin birebir aynısıdır.
--   Doğru çözüm kulup tablosuna doğrulanabilir bir `kayit_kodu` eklemek ve
--   davet route'larının kulup_id'yi service_role ile AÇIKÇA yazmasıdır —
--   ikisi de 0022'nin işi, bu migration'ın kapsamı dışında.
--
--   NEDEN "NULL bırak" yerine "hata fırlat": NULL sessiz kilitlenmedir; hata,
--   ikinci kulüp açılmadan 0022'nin yapılmasını ZORUNLU kılar.
--
--   0016 GÜVENLİK KAZANIMI KORUNUYOR: rol hâlâ sabit 'veli'; istemciden
--   okunmuyor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kulup uuid;
  v_adet  int;
begin
  select count(*) into v_adet from public.kulup;

  if v_adet = 1 then
    select id into v_kulup from public.kulup;
  elsif v_adet = 0 then
    raise exception 'Kulüp tanımlı değil: yeni kullanıcı oluşturulamaz (0021 veri taşıma çalıştırılmamış).';
  else
    raise exception 'Birden fazla kulüp var: yeni kullanıcının hangi kulübe ait olduğu çözümlenemiyor. 0022 (kayıt kodu / davet akışında kulup_id) uygulanmalı.';
  end if;

  insert into public.profiles (id, role, ad, kulup_id)
  values (new.id, 'veli', coalesce(new.raw_user_meta_data ->> 'ad', ''), v_kulup);
  return new;
end;
$$;

-- 0002/0016'daki revoke deseni korunuyor (create or replace grant'leri sıfırlamaz
-- ama açıkça tekrarlamak zararsız ve niyeti belgeliyor).
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;


-- ===========================================================================
-- 12) DOĞRULAMA + ARTIK RİSKLER
-- ===========================================================================
-- DOĞRULAMA SORGULARI (elle çalıştırılabilir):
--
--   -- 45 tablonun tamamında kulup_id var mı?  → 45 dönmeli
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and column_name = 'kulup_id';
--
--   -- kulup_id'si NULL kalan satır var mı?  → yalnızca brans/hizmet_turu/beceri
--   --    (platform kataloğu) ve varsa platform_admin profili dönmeli
--   select 'brans' t, count(*) from brans where kulup_id is null
--   union all select 'beceri', count(*) from beceri where kulup_id is null
--   union all select 'profiles', count(*) from profiles where kulup_id is null;
--
--   -- Politika sayısı: 158 (mevcut) + 42 (ŞABLON-A) + 12 (ŞABLON-B)
--   --                  + 1 (kulup select) = 213
--   select count(*) from pg_policies where schemaname = 'public';
--
--   -- Restrictive politikaların hiçbirine rol atanmamış olmalı ({public})
--   select tablename, roles from pg_policies
--    where schemaname='public' and permissive = 'RESTRICTIVE' and roles <> '{public}';
--    → boş dönmeli
--
-- KABUL EDİLEN ARTIK RİSKLER:
--   R1. FK doğrulamaları RLS'e TABİ DEĞİLDİR. Kulüp B'nin yöneticisi kulüp A'ya
--       ait bir katalog satırının UUID'sini bilirse sporcular.brans_id'ye
--       yazabilir. Etkisi düşük (o satırı okuyamaz, yalnızca boş bir referans
--       taşır) ve katalog tabloları için bileşik FK teknik olarak mümkün değil
--       (kulup_id nullable). A→A yönündeki tek kolonlu FK'ler için de aynı
--       durum geçerlidir (ör. odeme.sporcu_id); bağ tabloları bileşik FK ile
--       kapatıldı, A→A bağları bilinçli olarak açık bırakıldı.
--   R2. app/src/data/kurumRepo.ts:6'daki sabit MERKEZ_SUBE_ID
--       ('10000000-0000-0000-0000-000000000001') taşınan kulüpte AYNI kaldığı
--       için mevcut kurulumda regresyon YOK; ancak açılacak İKİNCİ kulüpte
--       "Kurum Branşları" ekranı boş gelir ve toggleBrans() başka kulübün
--       şubesine yazmaya çalışıp restrictive politikaya takılır. Kod düzeltmesi
--       0022'nin işi.
--   R3. Yeni kulüp kurulumunda kurum_ayarlari ve mobil_ozellik satırları
--       süper-admin paneli tarafından kulup_id AÇIKÇA verilerek eklenmelidir
--       (service_role'de auth.uid() NULL → default NULL → NOT NULL ihlali).
--   R4. Bu migration'dan sonra ikinci kulüp açılmadan ÖNCE 0022 gerekir:
--       kulup.kayit_kodu + davet route'larında kulup_id yazımı (bölüm 11.2).
-- ===========================================================================
