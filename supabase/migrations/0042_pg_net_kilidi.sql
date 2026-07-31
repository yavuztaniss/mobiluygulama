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
