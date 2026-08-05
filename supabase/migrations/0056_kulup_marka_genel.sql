-- ===========================================================================
-- 0056 — public.kulup_marka(slug): oturumsuz okunabilen kulüp markası
-- ===========================================================================
-- NEDEN
--   Veli uygulamayı ana ekranına eklediğinde kendi kulübünün simgesini ve adını
--   görecek. Bunlar PWA manifest'inden okunuyor ve manifest OTURUM AÇILMADAN
--   üretilmek zorunda — veli henüz giriş yapmamışken, hatta hesabı yokken bile.
--
--   Ama `kulup` ve `kurum_ayarlari` kiracı duvarının arkasında: anon anahtarla
--   tek satır bile okunamıyor. Bu doğru bir tasarım ve BOZULMAMALI.
--
-- NEDEN TABLOYA POLİTİKA EKLENMİYOR
--   `kulup`a "anon okur" politikası eklemek en kolay yol olurdu ama sistemdeki
--   TÜM kulüplerin listesini herkese açardı: adları, planları, abonelik
--   durumları, sporcu limitleri. Rakip için hazır müşteri listesi.
--
--   Bunun yerine tek bir slug'a bakan, YALNIZCA İKİ ALAN döndüren bir fonksiyon:
--   listelemek imkânsız (slug'ı bilmek gerekiyor), dönen bilgi ise zaten
--   herkese açık olan şey — kulübün adı ve logosu.
--
-- ⚠ SLUG TAHMİNİ BİR TEHDİT DEĞİL: kulüp adları zaten kamuya açık ve slug
--   onlardan türüyor. Sızan bilgi "böyle bir kulüp var mı" — kulübün kendi
--   web sitesinden de öğrenilebilecek bir şey.
--
-- ⚠ ASKIYA ALINMIŞ KULÜP DE MARKASINI DÖNDÜRÜYOR (durum kontrolü YOK).
--   Bilinçli: aboneliği duran kulübün velisi uygulamayı açtığında markasız bir
--   ekran değil, kendi kulübünün adını ve "aboneliğiniz askıda" mesajını
--   görmeli. Veriye erişim zaten current_kulup_id() ile kapalı; burada dönen
--   şey veri değil, marka.
--
-- ÇALIŞTIRMA: 0055'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

create or replace function public.kulup_marka(p_slug text)
returns table (ad text, logo_url text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Beyaz etiket adı kurum_ayarlari'nda; kulup.ad kurulum sırasındaki addır
    -- ve kulüp sonradan panelden değiştirmiş olabilir. Sıra bu yüzden önemli.
    coalesce(nullif(btrim(ka.kulup_adi), ''), k.ad) as ad,
    ka.logo_url,
    k.slug
  from public.kulup k
  left join public.kurum_ayarlari ka on ka.kulup_id = k.id
  where k.slug = btrim(lower(p_slug))
  limit 1
$$;

comment on function public.kulup_marka(text) is
  '0056: PWA manifest''i için oturumsuz okunabilen kulüp markası. YALNIZCA ad, '
  'logo ve slug döner — kulüp listesi sızdırmaz, slug bilinmeden çağrılamaz.';

-- ⚠ anon''a AÇIKÇA veriliyor: manifest oturum açılmadan üretiliyor.
--   01_sema.sql''in toplu `grant all on all routines` satırı bunu zaten verirdi
--   ama ona güvenilmiyor — o satır bir gün daraltılırsa bu uç sessizce kapanır
--   ve simgeler kırılır.
revoke all on function public.kulup_marka(text) from public;
grant execute on function public.kulup_marka(text) to anon, authenticated;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare
  v_slug text;
  v_ad   text;
  v_kac  int;
begin
  select slug into v_slug from public.kulup where slug is not null limit 1;
  if v_slug is null then
    raise notice '0056: kulüp yok, işlevsel doğrulama atlandı.';
    return;
  end if;

  -- anon çağırabiliyor mu ve doğru kulübü buluyor mu?
  set local role anon;
  select ad into v_ad from public.kulup_marka(v_slug);
  select count(*) into v_kac from public.kulup_marka('olmayan-slug-' || gen_random_uuid()::text);
  reset role;

  if v_ad is null then
    raise exception '0056: anon rolü kulüp markasını okuyamadı.';
  end if;
  if v_kac <> 0 then
    raise exception '0056: olmayan slug için satır döndü.';
  end if;

  raise notice '0056 doğrulandı: anon markayı okuyor (%), olmayan slug boş dönüyor.', v_ad;
end $$;
