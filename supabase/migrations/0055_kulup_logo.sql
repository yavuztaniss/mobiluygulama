-- ===========================================================================
-- 0055 — Kulüp logosu: depolama kovası + logo_url
-- ===========================================================================
-- NEDEN
--   Veli uygulamayı ana ekranına eklediğinde KENDİ kulübünün simgesini ve adını
--   görecek. Ana ekrandaki simge, "Ana Ekrana Ekle" anındaki manifest'ten
--   okunuyor; manifest de kulübün logosunu bir ADRESTEN almak zorunda. Yani
--   önce logonun bir yerde durması gerekiyor.
--
--   Bugüne kadar projede HİÇ Storage kovası yoktu (güvenlik denetiminde
--   ölçülmüştü: "storage bucket yok"). Bu ilk kova.
--
-- YOL SÖZLEŞMESİ: <kulup_id>/logo.<uzanti>
--   Klasör adı kulüp kimliği. Politikalar bu ilk klasöre bakarak "bu dosya
--   hangi kulübün" sorusunu yanıtlıyor — dosya adına ya da istemcinin
--   iddiasına değil, YOLUN KENDİSİNE bakılıyor.
--
-- ⚠ KOVA HERKESE AÇIK OKUNUR — VE BU BİLİNÇLİ.
--   Simge, telefonun ana ekranında ve giriş ekranında oturum AÇILMADAN
--   görünmek zorunda. Kapalı bir kova, imzalı URL üretmeyi gerektirirdi;
--   imzalı URL'in süresi dolar ve manifest'teki simge bir gün sessizce kırılır.
--   Sızan bilgi kulübün logosu — zaten tabelasında, formasında ve web sitesinde.
--
-- ⚠ YAZMA KULÜBE HAPSEDİLDİ.
--   Bir kulübün yöneticisi yalnızca kendi kulup_id'siyle başlayan yola
--   yazabiliyor. Kontrol edilmeseydi A kulübünün yöneticisi B'nin logosunu
--   değiştirebilir ve B'nin velilerinin ana ekranındaki simgeyi ele geçirebilirdi
--   — beyaz etiketli bir üründe bu, marka taklidine açık kapı olurdu.
--
-- ÇALIŞTIRMA: 0054'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) logo_url
-- ---------------------------------------------------------------------------
-- Yol deterministik olsa da (<kulup_id>/logo.png) tam adres saklanıyor:
--   · logonun VAR OLUP OLMADIĞI tek sorguyla anlaşılıyor (dosya var mı diye
--     Storage'a gitmeye gerek yok),
--   · adrese sürüm damgası eklenebiliyor (?v=...) — logo değişince tarayıcı ve
--     ana ekran simgesi eski dosyayı önbellekten göstermesin.
alter table public.kurum_ayarlari add column if not exists logo_url text;

comment on column public.kurum_ayarlari.logo_url is
  '0055: kulüp logosunun genel adresi. PWA manifest''i ve giriş ekranı bunu '
  'kullanıyor. NULL ise ürünün kendi simgesi gösteriliyor.';


-- ---------------------------------------------------------------------------
-- 2) Depolama kovası
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kulup-logo',
  'kulup-logo',
  true,
  -- 2 MB: logo zaten 512×512 PNG'ye indirgeniyor (panelde, tarayıcıda).
  -- Sınır olmasaydı biri 40 MB'lık bir dosya yükleyip kotayı yakardı.
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 3) Politikalar
-- ---------------------------------------------------------------------------
-- storage.objects'te RLS zaten açık (Supabase varsayılanı).

drop policy if exists "kulup-logo: herkes okur" on storage.objects;
create policy "kulup-logo: herkes okur"
  on storage.objects for select
  using (bucket_id = 'kulup-logo');

-- Yazma/güncelleme/silme: yalnızca o kulübün yöneticisi, yalnızca kendi klasörü.
--
-- `storage.foldername(name)` yolu parçalara ayırıyor; [1] ilk klasör =
-- kulüp kimliği. current_kulup_id() SECURITY DEFINER olduğu için burada
-- güvenle çağrılabiliyor.
--
-- Şube yöneticisi BİLEREK dışarıda: logo kulübün tamamını temsil ediyor,
-- tek bir şubenin sorumlusunun kararı değil.
drop policy if exists "kulup-logo: yönetici kendi kulübüne yazar" on storage.objects;
create policy "kulup-logo: yönetici kendi kulübüne yazar"
  on storage.objects for insert
  with check (
    bucket_id = 'kulup-logo'
    and (select private.current_profile_role()) = 'yonetici'
    and (storage.foldername(name))[1] = (select private.current_kulup_id())::text
  );

drop policy if exists "kulup-logo: yönetici kendi kulübünü günceller" on storage.objects;
create policy "kulup-logo: yönetici kendi kulübünü günceller"
  on storage.objects for update
  using (
    bucket_id = 'kulup-logo'
    and (select private.current_profile_role()) = 'yonetici'
    and (storage.foldername(name))[1] = (select private.current_kulup_id())::text
  );

drop policy if exists "kulup-logo: yönetici kendi kulübünden siler" on storage.objects;
create policy "kulup-logo: yönetici kendi kulübünden siler"
  on storage.objects for delete
  using (
    bucket_id = 'kulup-logo'
    and (select private.current_profile_role()) = 'yonetici'
    and (storage.foldername(name))[1] = (select private.current_kulup_id())::text
  );


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare v_kova int; v_pol int; v_kolon int;
begin
  select count(*) into v_kova from storage.buckets where id = 'kulup-logo' and public;
  if v_kova <> 1 then
    raise exception '0055: kulup-logo kovası açık okunur olarak kurulamadı.';
  end if;

  select count(*) into v_pol from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects' and p.polname like 'kulup-logo:%';
  if v_pol <> 4 then
    raise exception '0055: 4 politika bekleniyordu, % bulundu.', v_pol;
  end if;

  select count(*) into v_kolon from information_schema.columns
   where table_schema = 'public' and table_name = 'kurum_ayarlari' and column_name = 'logo_url';
  if v_kolon <> 1 then
    raise exception '0055: logo_url kolonu yok.';
  end if;

  raise notice '0055 doğrulandı: kova açık, 4 politika, logo_url kolonu yerinde.';
end $$;
