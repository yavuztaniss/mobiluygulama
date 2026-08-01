-- ===========================================================================
-- 0051 — site_ayarlari: tanıtım sitesinin metinleri panelden düzenlenebilir
-- ===========================================================================
-- NEDEN
--   Ürün adı, slogan, iletişim bilgileri ve uygulama adresi bugüne kadar
--   admin-panel/lib/marka.ts içinde SABİTTİ. Her değişiklik kod düzenleme +
--   yeni dağıtım demekti; ürün adı henüz kesinleşmediği ve PWA adresi belli
--   olmadığı için bu ikisi yakın zamanda birkaç kez değişecek.
--
-- ⚠ BU TABLO KİRACIYA AİT DEĞİL — kulup_id YOK, BİLEREK.
--   Buradaki bilgi SATILAN ÜRÜNÜN markası; bir kulübün markası değil. Kulüp
--   markası kurum_ayarlari'nda duruyor ve kiracı duvarıyla korunuyor. İkisi
--   karıştırılırsa ya kulüpler senin ürün adını görür ya da tanıtım sitesi
--   rastgele bir kulübün adını gösterir.
--
--   Bu yüzden 0021'in restrictive kiracı politikası bu tabloya EKLENMİYOR.
--   Eklenseydi tablo kalıcı olarak fail-closed olurdu: tanıtım sitesi
--   ziyaretçisinin oturumu yok, current_kulup_id() NULL döner ve karşılaştırma
--   hiçbir zaman tutmaz — site markasız açılırdı.
--
-- TEK SATIR NASIL GARANTİ EDİLİYOR
--   `tek boolean primary key default true check (tek)` — birincil anahtar
--   yalnızca `true` değerini kabul ediyor, dolayısıyla ikinci satır fiziksel
--   olarak eklenemiyor. Uygulama koduna "hep aynı id'yi kullan" disiplini
--   bırakmıyor; kural veritabanında.
--
-- İZİN MODELİ
--   OKUMA herkese açık: tanıtım sitesi oturumsuz ziyaretçiye çiziliyor,
--   anon anahtarla okunabilmesi ŞART. Burada gizli hiçbir şey yok — zaten
--   sayfanın kaynağında görünecek metinler.
--   YAZMA yalnızca platform_admin: kulüp yöneticisi kendi kulübünü yönetir,
--   satılan ürünün adını değiştiremez.
--   INSERT ve DELETE politikası YOK: satır tekil ve kalıcı, silinmesi ya da
--   çoğaltılması diye bir işlem yok.
--
-- ⚠ GRANT SIRASI — 01_sema.sql'e işlerken DİKKAT
--   01_sema.sql'in sonundaki toplu `grant all on all tables in schema public`
--   daha önce verilen kısıtlı izinleri GENİŞLETİR. Bu tablonun grant'leri o
--   satırdan SONRA gelmek zorunda, aksi halde anon'a INSERT/DELETE açılır.
--   Aynı tuzak 0040'ta (TRUNCATE) ve 0049'da (tetikleyici fonksiyonlar)
--   yaşandı.
--
-- ÇALIŞTIRMA: 0050'den sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

create table if not exists public.site_ayarlari (
  tek              boolean primary key default true check (tek),
  urun_adi         text not null default 'Spor Coach',
  slogan           text not null default 'Spor okulunuzu tek panelden yönetin',
  aciklama         text not null default '',
  eposta           text not null default '',
  -- Boş bırakılabilir: boşken telefon gösteren tüm yüzeyler hiç çizilmiyor.
  -- "0000 000 00 00" gibi sahte bir numara göstermektense hiç göstermemek doğru.
  telefon          text not null default '',
  sirket           text not null default '',
  -- Veli/antrenör uygulamasının (PWA) adresi. Boşken uygulamaya giden butonlar
  -- ölü bağlantı yerine anlatım sayfasına gidiyor.
  uygulama_adresi  text not null default '',
  guncelleyen      uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

comment on table public.site_ayarlari is
  '0051: tanıtım sitesinin metinleri. Kiracıya ait DEĞİL — satılan ürünün '
  'markası. Kulüp markası kurum_ayarlari''nda.';

alter table public.site_ayarlari enable row level security;

-- --- Tek satırı oluştur (idempotent) ---------------------------------------
insert into public.site_ayarlari (tek, urun_adi, slogan, aciklama, eposta, sirket)
values (
  true,
  'Spor Coach',
  'Spor okulunuzu tek panelden yönetin',
  'Spor okulları, kulüpler ve akademiler için yoklama, aidat, gelişim takibi ve veli '
  || 'iletişimini tek merkezde toplayan bulut tabanlı yönetim sistemi. Veliler için mobil '
  || 'uygulama dahil.',
  'info@zuvaydijital.com',
  'Zuvay Dijital'
)
on conflict (tek) do nothing;


-- --- Politikalar ------------------------------------------------------------
drop policy if exists "site_ayarlari: herkes okur" on public.site_ayarlari;
create policy "site_ayarlari: herkes okur"
  on public.site_ayarlari for select
  using (true);

drop policy if exists "site_ayarlari: yalnızca platform sahibi yazar" on public.site_ayarlari;
create policy "site_ayarlari: yalnızca platform sahibi yazar"
  on public.site_ayarlari for update
  using (private.current_profile_role() = 'platform_admin')
  with check (private.current_profile_role() = 'platform_admin');


-- --- İzinler ----------------------------------------------------------------
-- Önce her şeyi geri al, sonra yalnızca gerekeni ver. `grant all` yazılsaydı
-- anon satırı SİLEBİLİRDİ: politikalar DELETE'i engelliyor ama izin modelinin
-- kendisi de savunma katmanı olmalı, tek bir politikanın yanlış yazılması
-- tabloyu açmamalı.
revoke all on table public.site_ayarlari from public, anon, authenticated;
grant select on table public.site_ayarlari to anon, authenticated;
grant update on table public.site_ayarlari to authenticated;


-- --- guncelleyen/updated_at sunucuda yazılsın --------------------------------
-- İstemciye bırakılırsa "kim değiştirdi" alanı uydurulabilir ve zaman damgası
-- anlamsızlaşır. Değişmez olduğu için tetikleyici katmanı.
create or replace function public.site_ayarlari_damga()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.tek         := true;          -- tekil satır garantisi, istemci değiştiremesin
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
-- DOĞRULAMA
-- ===========================================================================
do $$
declare
  v_satir   int;
  v_izin    text;
  v_kiraci  int;
begin
  select count(*) into v_satir from public.site_ayarlari;
  if v_satir <> 1 then
    raise exception '0051: site_ayarlari''nda % satır var, 1 olmalı.', v_satir;
  end if;

  -- anon SİLEMEMELİ ve EKLEYEMEMELİ.
  select string_agg(privilege_type, ',' order by privilege_type) into v_izin
    from information_schema.role_table_grants
   where table_schema='public' and table_name='site_ayarlari' and grantee='anon';

  if v_izin is distinct from 'SELECT' then
    raise exception '0051: anon izinleri beklenenden farklı (%). Yalnızca SELECT olmalı.', coalesce(v_izin,'(yok)');
  end if;

  -- Kiracı duvarı bu tabloya EKLENMEMİŞ olmalı; eklenirse site markasız açılır.
  select count(*) into v_kiraci from pg_policy
   where polrelid = 'public.site_ayarlari'::regclass and not polpermissive;

  if v_kiraci > 0 then
    raise exception '0051: site_ayarlari''na restrictive politika eklenmiş — tanıtım sitesi oturumsuz okuyamaz.';
  end if;

  raise notice '0051 doğrulandı: tek satır, anon yalnızca okur, kiracı duvarı yok.';
end $$;
