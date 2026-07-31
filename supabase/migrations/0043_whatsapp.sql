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
