-- ===========================================================================
-- 0032_hiz_siniri.sql — Kötüye kullanım koruması (hız sınırı)
-- ===========================================================================
-- ÖNCE SALDIRI YÜZEYİNİN GERÇEKTE NEREDE OLDUĞU
--
--   Kayıt, giriş, şifre sıfırlama ve e-posta doğrulama istekleri BİZİM
--   KODUMUZDAN GEÇMEZ — doğrudan Supabase Auth'a (GoTrue) gider. Dolayısıyla o
--   uçların IP bazlı sınırı veritabanında değil, Supabase'in kendi ayarındadır
--   (config.toml [auth.rate_limit] / canlıda Dashboard > Authentication > Rate
--   Limits). Bu migration oraya dokunamaz ve dokunmaya çalışmamalı.
--
--   ⚠ handle_new_user içinde IP'ye BAKILAMAZ: GoTrue Postgres'e doğrudan
--   bağlanır, araya PostgREST girmediği için `request.headers` oturum ayarı
--   HİÇ SET EDİLMEZ. Yani "aynı IP'den kaç hesap açıldı" sorusu veritabanında
--   yanıtlanamaz; o kontrol Supabase'in kendi sınırıyla yapılır.
--
--   BU MIGRATION'IN KAPSADIĞI: oturum açmış bir kullanıcının PostgREST
--   üzerinden yaptığı YAZMA işlemleri. Bunların bugüne kadar HİÇBİR sınırı
--   yoktu: bir hesap dakikada binlerce mesaj, şikâyet veya başvuru
--   üretebiliyordu.
--
-- KİMLİĞE GÖRE SINIR, IP'YE GÖRE DEĞİL — ve bu bilinçli.
--   Bir spor kulübünün yöneticisi, muhasebecisi ve antrenörleri çoğu zaman AYNI
--   ofis internetindedir; velilerin bir kısmı da aynı mobil operatörün NAT'ı
--   arkasından çıkar. Saf IP bazlı bir sınır, kötü niyetli tek bir kullanıcı
--   yüzünden aynı ağdaki HERKESİ cezalandırır — kulübün tamamının uygulamayı
--   kullanamaması demek.
--   Bu yüzden anahtar: kimlik varsa auth.uid(), yoksa IP. Kimliği bilinen
--   kullanıcıyı kendi davranışından sorumlu tutmak hem daha adil hem daha
--   isabetli; IP yalnızca kimliksiz isteklerde son çare.
--
-- BÖLÜMLER
--   1) private.istek_sayaci
--   2) private.istek_kimligi() ve private.hiz_kontrol()
--   3) Tetikleyiciler (mesaj, sikayet, basvuru, engelleme, davet)
--   4) Doğrulama
--
-- ÇALIŞTIRMA: 0031'den sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) SAYAÇ TABLOSU
-- ===========================================================================
-- private şemasında: PostgREST yalnızca public'i yayımlar, bu tablo dışarıdan
-- ne okunabilir ne yazılabilir. Kullanıcının kendi sayacını sıfırlaması
-- mümkün olmamalı.
--
-- Pencere yaklaşımı SABİT PENCERE (sliding değil): basit, tek satır upsert ile
-- çalışıyor ve kilit süresi kısa. Sabit pencerenin bilinen zayıflığı iki
-- pencerenin sınırında iki kat isteğe izin vermesi; burada kabul edilebilir,
-- çünkü amaç saniyelik hassasiyet değil kaba kötüye kullanımı durdurmak.
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
