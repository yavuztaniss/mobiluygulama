-- ===========================================================================
-- 0022_davet.sql — Davet linki akışı (çok kiracılı kayıt sorununun çözümü)
-- ===========================================================================
-- BAĞLAM
--   0021 çok kiracılılığı kurdu ama kayıt akışını AÇIKTA bıraktı: bölüm 11.2'deki
--   geçiş köprüsü, sistemde birden fazla kulüp varsa yeni kullanıcının hangi
--   kulübe ait olduğunu çözemediği için EXCEPTION atıyor
--   ("Birden fazla kulüp var: ... 0022 uygulanmalı"). Yani ikinci kulüp
--   açıldığı anda hem mobil self-signup (app/app/(auth)/register.tsx) hem de
--   admin-panel davet route'ları (antrenor-davet / kullanici-davet) kırılıyor.
--
-- SEÇİLEN ÇÖZÜM — DAVET LİNKİ
--   Kayıt kodu veya "kulüp listesinden seç" DEĞİL. Kulüp yöneticisi panelden
--   tek kullanımlık bir davet üretir, linki paylaşır; kayıt olan kişi token'ı
--   taşır. Kulüp VE rol bilgisi token'ın işaret ettiği DAVET KAYDINDAN gelir,
--   istemciden değil.
--
-- NEDEN BU YAKLAŞIM GÜVENLİ — 0016'NIN KAZANIMI KORUNUYOR
--   0016, handle_new_user'ın rolü raw_user_meta_data'dan okumasını kaldırmıştı:
--   metadata self-signup'ta İSTEMCİ KONTROLLÜDÜR, oradan okunan her şey
--   saldırganın yazabildiği bir değerdir (data:{role:'yonetici'} → admin hesabı).
--   0021 aynı gerekçeyle kulup_id'yi de metadata'dan okumayı reddetti.
--
--   Burada metadata'dan okunan tek şey DAVET TOKEN'IDIR ve bu güvenlidir, çünkü:
--     · Token'ın kendisi KANITTIR (bearer secret) — 16 rastgele bayt, tahmin
--       edilemez. Saldırganın uydurduğu bir token hiçbir satırla eşleşmez.
--     · Rol ve kulüp metadata'dan DEĞİL, token'ın eşleştiği davet SATIRINDAN
--       okunur. O satırı yalnızca ilgili kulübün yöneticisi oluşturabilir (RLS).
--     · Token geçersizse fonksiyon EXCEPTION atar (fail-closed) — sessizce
--       'veli' açıp bir kulübe iliştirmez.
--     · platform_admin rolü davet edilemez (check kısıtı) — davet yolu platform
--       sahipliğine yükselmek için kullanılamaz.
--
-- BÖLÜMLER
--   0) Ön koşul: pgcrypto (token üretimi)
--   1) davet tablosu
--   2) Kısıtlar + indeks
--   3) RLS: restrictive kiracı duvarı + yönetici politikası
--   4) davet.sporcu_id kiracı doğrulaması (trigger)
--   5) private.davet_coz()
--   6) handle_new_user() — davet öncelikli yeni mantık
--   7) Bakım: süresi geçmiş davetlerin temizliği
--   8) Doğrulama + uygulama tarafında yapılacaklar + artık riskler
--
-- ÇALIŞTIRMA
--   0021'den SONRA, tek seferde çalışır. Tekrar çalıştırılabilir (idempotent):
--   tablo "create table if not exists", tüm kısıt/politika/trigger işlemleri
--   "drop if exists → create" ile korunuyor.
-- ===========================================================================


-- ===========================================================================
-- 0) ÖN KOŞUL — pgcrypto
-- ===========================================================================
-- Token varsayılanı gen_random_bytes(16) kullanıyor; bu fonksiyon çekirdekte
-- DEĞİL, pgcrypto eklentisindedir. Supabase projelerinde pgcrypto varsayılan
-- olarak `extensions` şemasında KURULUDUR, dolayısıyla aşağıdaki blok normalde
-- hiçbir şey yapmaz — yalnızca bağımlılığı belgeliyor ve boş bir projede
-- migration'ın anlaşılmaz bir "function does not exist" hatasıyla patlamasını
-- engelliyor.
--
-- NOT: default ifadesi CREATE TABLE anında çözümlenip fonksiyona OID ile
-- bağlanır; yani eklenti hangi şemada olursa olsun, migration çalıştığı anda
-- search_path'ten görülebiliyorsa sonrasında sorunsuz çalışır.
--
-- pgcrypto hiç kurulamıyorsa (kısıtlı ortam) tek satırlık alternatif:
--   default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
-- gen_random_uuid() PostgreSQL 13+ çekirdeğindedir, eklenti gerektirmez ve
-- 2 x 122 bit entropi üretir (16 bayttan fazla).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      execute 'create extension pgcrypto with schema extensions';
    else
      execute 'create extension pgcrypto';
    end if;
    raise notice '0022: pgcrypto eklentisi kuruldu.';
  end if;
end
$$;


-- ===========================================================================
-- 1) davet TABLOSU
-- ===========================================================================
-- Bir davet = "şu kulübe, şu rolle, (varsa) şu sporcunun velisi olarak katıl"
-- iznidir. Tek kullanımlıktır: kullanildi_at dolduktan sonra token ölür.
--
-- KOLON GEREKÇELERİ
--   token         PK. Linkin kendisi. 16 rastgele bayt → 32 karakter hex →
--                 2^128 olasılık; kaba kuvvet denemesi anlamsız. UUID yerine
--                 hex tercih edildi: URL'de tire yok, kopyala-yapıştır güvenli.
--   kulup_id      Kiracı. Default private.current_kulup_id() → panelden yapılan
--                 INSERT'te kolon yazılmasa bile yöneticinin kulübü dolar
--                 (0021 karar 3'ün aynısı).
--   rol           Kayıt sonrası atanacak rol. İSTEMCİDEN DEĞİL BURADAN gelir.
--   ad            Davet edilenin adı (opsiyonel). Kayıt formunu ön doldurmak ve
--                 panelde "kimi davet etmiştim" sorusunu yanıtlamak için.
--   eposta        Doluysa davet O adrese bağlıdır: başka bir e-postayla kayıt
--                 olan kişi token'ı kullanamaz (bkz. bölüm 5). NULL ise link
--                 herkese açıktır ama yine TEK KULLANIMLIKTIR.
--   sporcu_id     Veli daveti belirli bir sporcuya bağlanabilir; kayıt anında
--                 veli_sporcu bağı otomatik kurulur ve veli ilk açılışta
--                 çocuğunu görür. Yalnızca rol='veli' için anlamlı (kısıt 2.2).
--   son_kullanma  Varsayılan 14 gün. Süresi geçen link fail-closed olur.
--   kullanildi_at / kullanan_id  Tek kullanımlık mührü + denetim izi.
--   olusturan_id  Daveti kim çıkardı (denetim). Default auth.uid().
--   davet_notu    Serbest not.
--
-- KOLON ADI SAPMASI — `not` DEĞİL `davet_notu`
--   Görev tanımında bu kolonun adı `not` idi. `NOT` PostgreSQL'de AYRILMIŞ
--   ANAHTAR KELİMEDİR: kolon her sorguda "not" şeklinde çift tırnaklanmak
--   zorunda kalırdı (PostgREST select/order ifadeleri dahil) ve ilk unutulan
--   tırnakta anlaşılmaz bir sözdizimi hatası çıkardı. Şemanın mevcut deseni de
--   zaten sonek kullanıyor: odeme_notu, sonuc_notu, detay_notu (01_sema.sql).
--   Bu yüzden `davet_notu` seçildi.
create table if not exists public.davet (
  token         text primary key default encode(gen_random_bytes(16), 'hex'),
  kulup_id      uuid not null default private.current_kulup_id(),
  rol           public.app_role not null default 'veli',
  ad            text,
  eposta        text,
  sporcu_id     uuid,
  son_kullanma  timestamptz not null default now() + interval '14 days',
  kullanildi_at timestamptz,
  kullanan_id   uuid,
  olusturan_id  uuid default auth.uid(),
  davet_notu    text,
  created_at    timestamptz not null default now()
);

-- UYARI (0021 UYARI 2'nin aynısı): service_role ile yapılan INSERT'te
-- auth.uid() NULL'dur → default private.current_kulup_id() NULL üretir →
-- kulup_id NOT NULL ihlali (23502). Süper-admin paneli veya createAdminClient()
-- kullanan route'lar kulup_id'yi AÇIKÇA geçmek zorundadır.


-- ===========================================================================
-- 2) KISITLAR + İNDEKS
-- ===========================================================================
-- Kısıtlar tablo gövdesinde DEĞİL, ayrı ALTER'larla ekleniyor: "create table if
-- not exists" tablo zaten varken gövdeyi görmezden gelir, bu yüzden gövdeye
-- yazılan bir kısıt yeniden çalıştırmada güncellenmezdi. drop if exists → add
-- deseni her koşulda yakınsar (0021 bölüm 7 deseni).

-- --- 2.1 Yabancı anahtarlar
--         kulup_id  : cascade — kulüp silinirse davetleri de gider.
--         sporcu_id : set null — sporcu silinse bile davet linki ölmez,
--                     yalnızca sporcu bağı düşer.
--         olusturan_id / kullanan_id : set null — daveti çıkaran veya kullanan
--                     hesap silindiğinde davet satırı FK yüzünden silmeyi
--                     ENGELLEMESİN; denetim izi kalsın, referans boşalsın.
alter table public.davet drop constraint if exists davet_kulup_id_fkey;
alter table public.davet add constraint davet_kulup_id_fkey
  foreign key (kulup_id) references public.kulup(id) on delete cascade;

alter table public.davet drop constraint if exists davet_sporcu_id_fkey;
alter table public.davet add constraint davet_sporcu_id_fkey
  foreign key (sporcu_id) references public.sporcular(id) on delete set null;

alter table public.davet drop constraint if exists davet_kullanan_id_fkey;
alter table public.davet add constraint davet_kullanan_id_fkey
  foreign key (kullanan_id) references public.profiles(id) on delete set null;

alter table public.davet drop constraint if exists davet_olusturan_id_fkey;
alter table public.davet add constraint davet_olusturan_id_fkey
  foreign key (olusturan_id) references public.profiles(id) on delete set null;

-- NOT — neden sporcu_id'de BİLEŞİK FK (sporcu_id, kulup_id) YOK:
-- 0021 bölüm 7.2 bağ tablolarında kiracı bütünlüğünü bileşik FK ile kapatmıştı.
-- Burada teknik olarak MÜMKÜN DEĞİL: `on delete set null` bileşik FK'de HER İKİ
-- kolonu da NULL yapar, kulup_id ise NOT NULL — sporcu silindiği an kısıt
-- ihlaliyle patlardı. Bunun yerine aynı garanti bölüm 4'teki trigger ile
-- sağlanıyor.

-- --- 2.2 CHECK kısıtları
-- platform_admin YASAK: davet yolu platform sahipliğine yükselmek için
-- kullanılamaz. Beyaz liste yazıldı (rol <> 'platform_admin' değil) — enum'a
-- ileride yeni bir ayrıcalıklı rol eklenirse davet edilebilir hale GELMESİN.
alter table public.davet drop constraint if exists davet_rol_check;
alter table public.davet add constraint davet_rol_check
  check (rol in ('veli', 'antrenor', 'muhasebeci', 'yonetici'));

-- sporcu bağı yalnızca veli davetinde anlamlı; antrenör/muhasebeci davetine
-- sporcu iliştirilmesi veri hatasıdır.
alter table public.davet drop constraint if exists davet_sporcu_rol_check;
alter table public.davet add constraint davet_sporcu_rol_check
  check (sporcu_id is null or rol = 'veli');

-- --- 2.3 İndeks
-- 0021 bölüm 8'in gerekçesi burada da geçerli: restrictive politika her sorguya
-- `kulup_id = $1` predicate'i ekliyor, indekssiz kalırsa seq scan olur.
-- Adlandırma 0021 ile birebir aynı (<tablo>_kulup_id_idx).
create index if not exists davet_kulup_id_idx on public.davet (kulup_id);


-- ===========================================================================
-- 3) RLS
-- ===========================================================================
alter table public.davet enable row level security;

-- --- 3.1 RESTRICTIVE kiracı duvarı — 0021 bölüm 9.1 (ŞABLON-A) ile BİREBİR
--         aynı iki uygulama detayı korunuyor:
--         (A) `to` yan tümcesi YOK (yani TO PUBLIC). Restrictive politikalar
--             yalnızca adlandırdıkları rollere uygulanır; `to authenticated`
--             yazılsaydı anon rolünde kiracı duvarı hiç devreye girmezdi.
--         (B) Fonksiyon `(select ...)` ile sarılıyor → planlayıcı InitPlan
--             olarak sorgu başına bir kez hesaplar.
drop policy if exists "kulup izolasyonu" on public.davet;
create policy "kulup izolasyonu" on public.davet
  as restrictive for all
  using (kulup_id = (select private.current_kulup_id()))
  with check (kulup_id = (select private.current_kulup_id()));

-- --- 3.2 PERMISSIVE: yalnızca yönetici.
--         Tek permissive politika bu; veli/antrenör/muhasebeci için davet
--         tablosunda HİÇBİR politika yok, dolayısıyla tablo onlar için tamamen
--         kapalıdır (RLS'te permissive politikadan geçemeyen satır görünmez —
--         fail-closed). Muhasebeci bilinçli olarak dışarıda: personel/veli
--         davet etmek finans değil kurum yönetimi işidir.
--         Politika metni 01_sema.sql'deki "yönetici yazar" deseninin aynısı.
drop policy if exists "davet: yönetici kendi kulübünün davetlerini yönetir" on public.davet;
create policy "davet: yönetici kendi kulübünün davetlerini yönetir" on public.davet for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- NOT: Davet edilen kişi kayıt olurken bu tabloyu OKUMAZ ve OKUYAMAZ — henüz
-- oturumu yoktur. Token doğrulaması bölüm 5'teki SECURITY DEFINER fonksiyonla
-- sunucu tarafında yapılır.


-- ===========================================================================
-- 4) davet.sporcu_id KİRACI DOĞRULAMASI
-- ===========================================================================
-- Bölüm 2.1'deki gerekçeyle sporcu ayağına bileşik FK konulamadı. Boşluk şu
-- olurdu: bir kulüp yöneticisi BAŞKA bir kulübün sporcu UUID'sini bilirse
-- (0021 artık risk R1) o sporcuya davet çıkarabilir; kayıt anında
-- handle_new_user RLS'i baypas ederek çalıştığı için veli_sporcu bağı
-- kurulmaya çalışılır ve kiracılar arası bir bağ doğardı.
--
-- (veli_sporcu üzerindeki bileşik FK — 0021:415-420 — bu INSERT'i zaten
-- reddederdi, ama hata KAYIT ANINDA ve anlaşılmaz bir FK mesajıyla çıkardı.
-- Bu trigger hatayı DAVET OLUŞTURMA anına, yani hatanın yapıldığı yere çeker.)
--
-- SECURITY INVOKER (0016/0021 trigger deseni): fonksiyon çağıranın yetkileriyle
-- koşar, dolayısıyla bir yönetici için public.sporcular sorgusu RLS'e tabidir ve
-- yabancı sporcu zaten "bulunamadı" olur; service_role / postgres için RLS
-- baypas edilir ve karşılaştırma gerçek kulup_id üzerinden yapılır. İki yol da
-- doğru sonuç verir.
-- search_path = '' → isim çözümleme enjeksiyonuna kapalı (0017/0021 deseni),
-- bu yüzden tüm isimler tam nitelikli yazıldı.
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

drop trigger if exists on_davet_sporcu_protect on public.davet;
create trigger on_davet_sporcu_protect
  before insert or update on public.davet
  for each row execute procedure public.protect_davet_sporcu();


-- ===========================================================================
-- 5) private.davet_coz()
-- ===========================================================================
-- Token'ı doğrular ve davetin taşıdığı kiracı/rol/sporcu bilgisini döndürür.
--
-- NEDEN SECURITY DEFINER: kayıt anında henüz OTURUM YOKTUR. auth.uid() NULL →
-- private.current_kulup_id() NULL → bölüm 3.1'deki restrictive politika NULL
-- karşılaştırması yüzünden HER satırı reddeder. Bu fonksiyon tablonun sahibi
-- (postgres) olarak koştuğu için RLS'e takılmaz.
--
-- NEDEN private ŞEMASINDA: PostgREST yalnızca public şemayı yayımlar, bu
-- yüzden fonksiyon /rest/v1/rpc/ üzerinden ÇAĞRILAMAZ (0006 deseni). Aksi halde
-- token deneme (enumeration) uç noktası olurdu.
--
-- GEÇERSİZ TOKEN → SIFIR SATIR. Çağıran `select ... into` kullandığında
-- değişkenler NULL kalır; yani "geçersizde NULL döner" sözleşmesi korunur.
-- Boş satır ile "kullanılmış" / "süresi geçmiş" / "hiç yok" ayrımı BİLİNÇLİ
-- olarak yapılmıyor: ayrım verilseydi fonksiyon geçerli token'ların varlığını
-- sızdıran bir oracle haline gelirdi.
--
-- p_eposta PARAMETRESİ (görev tanımındaki tek argümanlı imzayı BOZMAZ —
-- varsayılanı NULL, `davet_coz(token)` çağrısı aynen çalışır):
--   Davet belirli bir e-postaya çıkarıldıysa (davet.eposta dolu) token yalnızca
--   O adresle kayıt olan kişide çalışmalıdır. Kontrolün burada olması şart,
--   çünkü satırı yalnızca bu fonksiyon görebiliyor. p_eposta verilmezse ve
--   davet kişiye özelse eşleşme OLMAZ (fail-closed).
-- IDEMPOTANLIK NOTU: aşağıdaki imza (text, text) — ikinci argümanın varsayılanı
-- olduğu için `davet_coz(token)` çağrısı da bu fonksiyona düşer. Tek argümanlı
-- AYRI bir sürüm (bir taslaktan kalmışsa) `create or replace` ile DEĞİŞMEZ,
-- yanına AŞIRI YÜKLEME olarak durur ve tek argümanlı her çağrı "function is not
-- unique" hatası verirdi. Bu yüzden önce o varyant düşürülüyor.
drop function if exists private.davet_coz(text);

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

-- Grant deseni 0006/0021 ile aynı. authenticated'a EXECUTE VERİLMİYOR: bu
-- fonksiyon hiçbir RLS politikası içinden çağrılmıyor, yalnızca SECURITY
-- DEFINER olan handle_new_user'dan çağrılıyor ve orada çağıran postgres'tir
-- (fonksiyon sahibi her zaman kendi fonksiyonunu çalıştırabilir).
revoke execute on function private.davet_coz(text, text) from public;
revoke execute on function private.davet_coz(text, text) from anon;
revoke execute on function private.davet_coz(text, text) from authenticated;
grant  execute on function private.davet_coz(text, text) to service_role;


-- ===========================================================================
-- 6) handle_new_user() — DAVET ÖNCELİKLİ YENİ MANTIK
-- ===========================================================================
-- Bu migration'ın asıl amacı. Sıra:
--
--   a) metadata'da davet_token VARSA → tek doğru kaynak odur.
--        · davet_coz ile çöz (e-posta bağı dahil).
--        · Geçersizse EXCEPTION (fail-closed). Sessizce 'veli' açıp herhangi
--          bir kulübe iliştirmek, davet akışının tüm anlamını yok ederdi.
--        · Daveti ATOMİK olarak mühürle, sonra profiles satırını davetteki
--          kulüp ve ROLLE aç, gerekiyorsa veli_sporcu bağını kur.
--
--   b) Token YOK ve sistemde TEK kulüp var → 0021'in köprü davranışı AYNEN
--      korunuyor: o kulübe 'veli' olarak bağlan. Kurulum/demo kolaylığı için
--      bilinçli. Tek kulüplü bir kurulumda davet zorunlu değildir.
--
--   c) Token YOK ve birden fazla kulüp var → EXCEPTION (0021 davranışı).
--      Mesaj güncellendi: artık yapılacak şey bellidir, davet linki istenmeli.
--
-- GÜVENLİK NOTU — 0016'NIN ROL YÜKSELTME KORUMASI KORUNUYOR
--   Rol hiçbir dalda raw_user_meta_data'dan OKUNMUYOR:
--     · (a) dalında rol DAVET SATIRINDAN gelir. O satırı yalnızca ilgili
--       kulübün yöneticisi oluşturabilir (bölüm 3.2) ve platform_admin
--       oluşturamaz (bölüm 2.2). Kullanıcının metadata'ya role:'yonetici'
--       yazması hiçbir şeyi değiştirmez — o alan artık okunmuyor bile.
--     · (b) dalında rol sabit 'veli'.
--   Metadata'dan okunan TEK alanlar: 'ad' (zararsız, yalnızca görünen isim) ve
--   'davet_token'. Token'ın metadata'dan okunması güvenlidir çünkü token
--   KANITIN KENDİSİDİR: uydurulan bir değer hiçbir satırla eşleşmez ve (a)
--   dalı exception ile kapanır. Bu, "istemcinin söylediğine güvenmek" değil
--   "istemcinin sunduğu sırrı doğrulamak"tır.
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
    -- Rol ve kulüp DAVETTEN. profiles.kulup_id "default" hilesini yapısal
    -- olarak kullanamaz (0021 bölüm 3), bu yüzden açıkça yazılıyor.
    insert into public.profiles (id, role, ad, kulup_id)
    values (new.id, v_rol, v_ad, v_kulup);

    -- TEK KULLANIMLIK MÜHÜR — KOŞULLU.
    -- Yarış durumu: aynı linkle eşzamanlı iki kayıt denemesinde ikisi de
    -- davet_coz'dan geçebilir. Bu UPDATE'in `kullanildi_at is null` koşulu
    -- READ COMMITTED'de birinci işlem commit ettikten sonra YENİDEN
    -- değerlendirilir; ikinci işlem 0 satır günceller ve aşağıdaki kontrolle
    -- reddedilir. Exception tüm kayıt işlemini geri alır (trigger, auth.users
    -- INSERT'i ile aynı transaction'dadır) — yarım kalmış hesap ve yetim profil
    -- satırı oluşmaz.
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

    -- Veli daveti belirli bir sporcuya bağlıysa bağı hemen kur; veli ilk
    -- girişte çocuğunu görsün. kulup_id AÇIKÇA yazılıyor: bu fonksiyon
    -- service_role/postgres bağlamında koşar, auth.uid() NULL'dur ve tablonun
    -- `default private.current_kulup_id()` değeri NULL üretirdi (0021 UYARI 2).
    -- Sporcunun aynı kulüpte olduğu bölüm 4'teki trigger ile davet oluşturma
    -- anında garanti altındadır.
    if v_sporcu is not null then
      insert into public.veli_sporcu (veli_id, sporcu_id, kulup_id)
      values (new.id, v_sporcu, v_kulup)
      on conflict do nothing;
    end if;

    return new;
  end if;

  -- --- (b)/(c) DAVETSİZ KAYIT — 0021 köprüsü ----------------------------
  select count(*) into v_adet from public.kulup;

  if v_adet = 1 then
    select id into v_kulup from public.kulup;
  elsif v_adet = 0 then
    raise exception 'Kulüp tanımlı değil: yeni kullanıcı oluşturulamaz (0021 veri taşıma çalıştırılmamış).';
  else
    raise exception 'Kayıt için davet linki gerekli: sistemde birden fazla kulüp var ve davet token''ı sunulmadı.';
  end if;

  insert into public.profiles (id, role, ad, kulup_id)
  values (new.id, 'veli', v_ad, v_kulup);
  return new;
end;
$$;

-- 0002/0016/0021'deki sertleştirme deseni (idempotent) tazeleniyor: fonksiyon
-- yalnızca auth.users trigger'ından çağrılmalı, /rest/v1/rpc üzerinden değil.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Trigger (on_auth_user_created) 0001'de kurulmuştu; create or replace function
-- gövdeyi yerinde değiştirdiği için yeniden bağlamaya gerek YOK.


-- ===========================================================================
-- 7) BAKIM — SÜRESİ GEÇMİŞ DAVETLERİN TEMİZLİĞİ
-- ===========================================================================
-- Süresi geçmiş veya kullanılmış davetler GÜVENLİK RİSKİ DEĞİLDİR: davet_coz
-- ikisini de zaten reddediyor. Tabloda birikmeleri denetim izi açısından
-- FAYDALIDIR ("bu kişiyi kim, ne zaman davet etmişti"). Bu yüzden otomatik
-- silme KURULMUYOR — ne trigger, ne pg_cron.
--
-- Panel şişmeye başlarsa, kullanılmamış ve süresi 90 günden fazla önce geçmiş
-- davetler elle temizlenebilir (SQL Editor'da, postgres olarak):
--
--   delete from public.davet
--    where kullanildi_at is null
--      and son_kullanma < now() - interval '90 days';
--
-- İleride otomatikleştirilmek istenirse pg_cron (Supabase'de Database >
-- Extensions'tan açılır) tek satırla yeter:
--
--   select cron.schedule(
--     'davet-temizlik', '0 4 * * 0',                       -- her pazar 04:00
--     $cron$ delete from public.davet
--             where kullanildi_at is null
--               and son_kullanma < now() - interval '90 days' $cron$);
--
-- pg_cron işleri postgres olarak koşar, yani RLS'e takılmaz; bu da tüm
-- kulüplerin davetlerini tek işte temizler.


-- ===========================================================================
-- 8) DOĞRULAMA + UYGULAMA TARAFI + ARTIK RİSKLER
-- ===========================================================================
-- DOĞRULAMA (elle çalıştırılabilir):
--
--   -- Davet üret (yönetici olarak panelden ya da SQL Editor'da kulup_id vererek)
--   insert into public.davet (kulup_id, rol, ad, eposta)
--   values ('<kulup-uuid>', 'antrenor', 'Test Antrenör', 'test@example.com')
--   returning token, son_kullanma;
--
--   -- Token çözülüyor mu? (doğru e-posta ile 1 satır, yanlışıyla 0 satır dönmeli)
--   select * from private.davet_coz('<token>', 'test@example.com');
--   select * from private.davet_coz('<token>', 'baska@example.com');   → boş
--
--   -- Kayıt: signUp options.data = { ad: '...', davet_token: '<token>' }
--   -- Sonrasında:
--   select p.role, p.kulup_id from public.profiles p where p.id = '<yeni-uid>';
--     → davetteki rol ve kulüp görünmeli ('veli' DEĞİL, 'antrenor')
--   select kullanildi_at, kullanan_id from public.davet where token = '<token>';
--     → dolu olmalı; aynı token ikinci kez kullanılamamalı.
--
--   -- Politikalar: 1 restrictive + 1 permissive
--   select policyname, permissive from pg_policies
--    where schemaname = 'public' and tablename = 'davet';
--
--   -- 0021 bölüm 12'deki sayımlar bu migration'dan sonra 1 artar:
--   --   kulup_id taşıyan tablo sayısı 45 → 46, politika sayısı 213 → 215.
--
-- UYGULAMA TARAFINDA YAPILACAKLAR (bu migration'ın KAPSAMI DIŞINDA):
--   U1. app/src/context/AuthContext.tsx → signUp() artık `role` göndermemeli
--       (0016'dan beri zaten okunmuyor), yerine opsiyonel `davetToken` alıp
--       options.data = { ad, davet_token } yazmalı.
--   U2. app/app/(auth)/register.tsx → davet token'ını derin linkten okumalı.
--       Scheme app.json'da "karsiyakasporokulu" — ör. karsiyakasporokulu://davet/<token>.
--   U3. admin-panel: davet oluşturma ekranı + linki kopyalama. Mevcut
--       antrenor-davet / kullanici-davet route'ları inviteUserByEmail'i
--       `data: { ad, davet_token }` ile çağırmalı ve kayıt sonrası yaptıkları
--       `profiles.update({ role })` adımını KALDIRMALI — rol artık davetten
--       geliyor, o update gereksiz ve rol ile davet arasında tutarsızlık
--       üretebilir.
--   U4. Kayıt ekranında "X Kulübü'ne davet edildiniz" önizlemesi istenirse
--       public şemada DAR bir RPC gerekir (yalnızca kulüp adı + rol + ad
--       döndüren, sporcu_id ve e-posta SIZDIRMAYAN bir sarmalayıcı).
--       private.davet_coz bilinçli olarak dışarıya kapalıdır, doğrudan
--       kullanılamaz.
--
-- ARTIK RİSKLER:
--   R1. Davet linkini ele geçiren kişi (yönlendirilmiş e-posta, ekran
--       görüntüsü) davet e-postaya bağlanmamışsa onu kullanabilir. Azaltım:
--       yönetici davet oluştururken `eposta` alanını doldurmalı — o zaman link
--       yalnızca o adresle kayıt olan kişide çalışır.
--   R2. 0021'in R2 maddesi (kurumRepo.ts'teki sabit MERKEZ_SUBE_ID) bu
--       migration'da ÇÖZÜLMEDİ; ikinci kulüp açılmadan önce hâlâ gerekli.
--   R3. Tek kulüplü kurulumda (b) dalı yüzünden self-signup davetsiz de
--       çalışmaya devam eder. Kulüp bunu istemiyorsa Supabase Authentication >
--       Providers > Email altındaki "Allow new users to sign up" kapatılmalı;
--       veritabanı tarafında kapatmak, ilk kurulumdaki ilk yönetici kaydını da
--       imkânsız kılardı.
-- ===========================================================================
