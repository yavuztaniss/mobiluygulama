-- ===========================================================================
-- 0049 — Tetikleyici fonksiyonlarından gereksiz EXECUTE izni geri alınıyor
-- ===========================================================================
-- NASIL ÇIKTI
--   Supabase'in kendi danışmanı (Advisors → Security) 12 uyarı verdi:
--     "Function public.paket_iade() can be executed by the anon role as a
--      SECURITY DEFINER function via /rest/v1/rpc/paket_iade."
--   Uyarı verilen 12 fonksiyonun HEPSİ `returns trigger`:
--     hiz_basvuru, hiz_davet, hiz_engelleme, hiz_kulup_basvurusu, hiz_mesaj,
--     hiz_sikayet, paket_dirilt, paket_dus, paket_iade,
--     protect_rezervasyon_paket_baglilik, protect_yonetici_daveti,
--     rezervasyon_fiyatla
--
-- ⚠ ÖNCE ÖLÇÜLDÜ: UYARININ İDDİASI BU FONKSİYONLAR İÇİN DOĞRU DEĞİL.
--   Danışman "anon /rest/v1/rpc/X ile çağırabilir" diyor; iki yoldan da
--   çağrılamıyor:
--     · PostgREST, anon anahtarıyla:
--         POST /rest/v1/rpc/paket_iade  →  PGRST202
--         (tetikleyici fonksiyonlar RPC olarak hiç yayınlanmıyor)
--     · Doğrudan SQL, anon rolüyle:
--         set local role anon; select public.paket_iade();
--         →  ERROR: trigger functions can only be called as triggers
--   Yani ortada SÖMÜRÜLEBİLİR bir açık yok. Bu dosya bir açığı kapatmıyor.
--
-- O HÂLDE NEDEN DÜZELTİLİYOR — ÜÇ SEBEP
--   1) İZİN ZATEN GEREKSİZ. PostgreSQL bir tetikleyiciyi ateşlerken fonksiyon
--      üzerinde EXECUTE izni ARAMAZ; tetikleyici tablo işleminin parçası olarak
--      çalışır. Yani bu grant hiçbir işe yaramıyor, yalnızca duruyor.
--   2) GÜRÜLTÜ GERÇEK BULGUYU GİZLER. 12 kalıcı uyarı, danışman listesini
--      okunamaz hâle getiriyor; bir gün gerçek bir uyarı çıktığında aralarında
--      kaybolur. Güvenlik raporunda gürültü, bulgu kadar zararlıdır.
--   3) GİZLİ TUZAK. Bu fonksiyonlardan biri ileride `returns trigger` olmaktan
--      çıkarılıp normal bir fonksiyona dönüştürülürse, üzerindeki EXECUTE izni
--      O ANDA anlamlı hale gelir ve anon'a açık bir SECURITY DEFINER fonksiyon
--      doğar. Kimse o an "grant'ı da kaldırmam lazım" diye düşünmez.
--
-- İZİN NEREDEN GELİYOR
--   01_sema.sql'in sonundaki toplu satırdan:
--     grant all on all routines in schema public to anon, authenticated, service_role;
--   Bu yüzden geri alma o satırdan SONRA gelmek zorunda. Aynı sıralama kuralı
--   TRUNCATE'te (0040) ve demo fonksiyonlarında da geçerliydi.
--
-- NEDEN KATALOGDAN SÜRÜLÜYOR, SABİT LİSTEDEN DEĞİL
--   Uyarı bugün 12 fonksiyon için çıkıyor. Sabit liste yazılsaydı 13. tetikleyici
--   fonksiyon eklendiğinde uyarı geri gelirdi ve kimse listeyi güncellemeyi
--   hatırlamazdı. 0029'da tam olarak bu yaşandı: elle yazılmış tablo listesi,
--   şema değişince sessizce eksik kaldı. Burada `prorettype = 'trigger'` ile
--   sürülüyor, yeni eklenen her tetikleyici fonksiyon kendiliğinden kapsanıyor.
--
-- ÇALIŞTIRMA: 0048'den sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

do $$
declare
  r     record;
  v_adet int := 0;
begin
  for r in
    select p.oid::regprocedure as imza
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.imza);
    v_adet := v_adet + 1;
  end loop;

  raise notice '0049: % tetikleyici fonksiyonundan EXECUTE izni geri alındı.', v_adet;
end $$;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare v_kalan int;
begin
  select count(*) into v_kalan
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prorettype = 'pg_catalog.trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if v_kalan > 0 then
    raise exception '0049: % tetikleyici fonksiyonu hâlâ anon/authenticated''a açık.', v_kalan;
  end if;

  raise notice '0049 doğrulandı: hiçbir tetikleyici fonksiyonu istemci rollerine açık değil.';
end $$;
