-- ===========================================================================
-- 0031 — Kullanıcı engelleme ve içerik şikâyeti (App Store Guideline 1.2)
-- ===========================================================================
-- NEDEN ZORUNLU
--   Apple, kullanıcı üretimi içerik barındıran her uygulamada DÖRT şeyi
--   istiyor: (a) uygunsuz içeriği süzme yöntemi, (b) şikâyet mekanizması ve
--   şikâyetlere zamanında yanıt, (c) kötüye kullanan kullanıcıyı ENGELLEME,
--   (d) geliştiriciye ulaşılabilecek iletişim bilgisi.
--
--   Bu uygulamada veli ↔ antrenör serbest metin yazışması var ve konu REŞİT
--   OLMAYAN ÇOCUKLAR. İncelemede tam olarak bakılan yer burası; hiçbiri
--   olmadığı için gönderim büyük olasılıkla reddedilirdi.
--
--   Bu migration (b) ve (c)'yi kuruyor. (a) süzme: kulüp yöneticisi zaten tüm
--   mesajları okuyabiliyor ve şikâyetler ona düşüyor — insan denetimi. (d)
--   iletişim bilgisi mağaza kaydında ve kulüp iletişim ekranında.
--
-- TASARIM KARARI — ENGELLEME KONUŞMAYI SİLMEZ, YAZMAYI DURDURUR.
--   Silmek iki tarafın da geçmişini yok ederdi; oysa taraflardan biri
--   şikâyetçi ve kanıta ihtiyacı olabilir. Engelleme yalnızca yeni mesaj
--   yazılmasını engelliyor, üstelik ÇİFT YÖNLÜ: A, B'yi engellediyse B de A'ya
--   yazamaz. Tek yönlü olsaydı engellenen taraf yazmaya devam eder, engelleyen
--   de bunu görmezdi — engellemenin anlamı kalmazdı.
--
-- ÇALIŞTIRMA: 0030'dan sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) engelleme
-- ===========================================================================
create table if not exists public.engelleme (
  engelleyen_id uuid not null references public.profiles(id) on delete cascade,
  engellenen_id uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  kulup_id      uuid not null default private.current_kulup_id() references public.kulup(id),
  primary key (engelleyen_id, engellenen_id),
  -- Kendini engellemek anlamsız; kontrolü veritabanına bırakmak, her istemci
  -- sürümünde tekrar hatırlamaktan güvenli.
  constraint engelleme_kendini_check check (engelleyen_id <> engellenen_id)
);

create index if not exists engelleme_engellenen_idx on public.engelleme (engellenen_id);
create index if not exists engelleme_kulup_id_idx   on public.engelleme (kulup_id);

-- ⚠ GRANT AÇIKÇA VERİLİYOR — YENİ TABLO KURAN HER MIGRATION BUNU YAPMALI.
-- kurulum/01_sema.sql'in sonundaki `grant all on all tables in schema public`
-- yalnızca O AN var olan tablolara uygulanır; sonradan gelen migration'ların
-- tabloları bu grant'ı ALMAZ. Sonuç, RLS'ten önce gelen ve teşhisi zor bir
-- hata: "permission denied for table engelleme" — politikalar doğru olsa bile.
-- (Bu tam olarak yaşandı: testte engelleme kaydı oluşturulamadı.)
-- İzinlerin gerçek daraltıcısı GRANT değil RLS'tir; 01_sema'daki aynı gerekçe.
grant all on public.engelleme to anon, authenticated, service_role;

alter table public.engelleme enable row level security;

-- Kiracı duvarı (0021 ŞABLON-A): `to` yan tümcesi YOK, fonksiyon select ile sarılı.
drop policy if exists "kulup izolasyonu" on public.engelleme;
create policy "kulup izolasyonu" on public.engelleme
  as restrictive for all
  using (kulup_id = (select private.current_kulup_id()))
  with check (kulup_id = (select private.current_kulup_id()));

-- Kullanıcı YALNIZCA kendi engellemelerini yönetir. Başkasının engel listesini
-- okumak da yazmak da mümkün değil.
drop policy if exists "engelleme: kendi listesini yönetir" on public.engelleme;
create policy "engelleme: kendi listesini yönetir" on public.engelleme for all
  using (engelleyen_id = auth.uid())
  with check (engelleyen_id = auth.uid());

-- ⚠ ÇİFT YÖNLÜ ETKİ İÇİN OKUMA GENİŞLETİLMİYOR.
-- "Beni kim engelledi" bilgisi kullanıcıya AÇILMIYOR: engellendiğini bilmek
-- çoğu üründe bilinçli olarak gizlenir. Engelin çift yönlü çalışması aşağıdaki
-- private.engel_var() fonksiyonuyla sağlanıyor — fonksiyon SECURITY DEFINER
-- olduğu için RLS'e takılmadan iki yönü de görebiliyor.


-- ===========================================================================
-- 2) private.engel_var() — mesaj politikalarının dayanağı
-- ===========================================================================
-- İki kullanıcı arasında HERHANGİ BİR yönde engel var mı?
--
-- SECURITY DEFINER: engelleme satırını yalnızca engelleyen okuyabiliyor (bölüm
-- 1). Politikanın içinden normal bir sorgu yazılsaydı, engellenen taraf için
-- satır GÖRÜNMEZ olur ve engel onun tarafında hiç uygulanmazdı — tam da
-- kaçınılmak istenen durum.
--
-- private şemasında: PostgREST yalnızca public'i yayımlar, bu fonksiyon
-- /rest/v1/rpc üzerinden çağrılamaz. Çağrılabilseydi "beni kim engelledi"
-- sorusunu yanıtlayan bir uç olurdu.
create or replace function private.engel_var(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.engelleme e
     where (e.engelleyen_id = a and e.engellenen_id = b)
        or (e.engelleyen_id = b and e.engellenen_id = a)
  )
$$;

revoke execute on function private.engel_var(uuid, uuid) from public;
revoke execute on function private.engel_var(uuid, uuid) from anon;
-- authenticated'a EXECUTE veriliyor çünkü aşağıdaki RLS politikaları
-- kullanıcının kendi isteği içinde bu fonksiyonu çağırıyor.
grant execute on function private.engel_var(uuid, uuid) to authenticated;


-- ===========================================================================
-- 3) MESAJ YAZMAYI ENGELE BAĞLA
-- ===========================================================================
-- Mevcut "mesaj: katılımcı yazar" politikası yerine, aynı koşullara engel
-- kontrolü eklenmiş hali. Politika RESTRICTIVE değil PERMISSIVE olarak
-- değiştirilmiyor — var olanın yerine geçiyor ki mantık tek yerde kalsın.
drop policy if exists "mesaj: katılımcı yazar" on public.mesaj;
create policy "mesaj: katılımcı yazar" on public.mesaj for insert
  with check (
    gonderen_id = auth.uid()
    and exists (
      select 1 from public.konusma k
       where k.id = mesaj.konusma_id
         and (k.veli_id = auth.uid() or k.antrenor_id = auth.uid())
         -- Taraflardan biri diğerini engellediyse yazma reddedilir.
         and not private.engel_var(k.veli_id, k.antrenor_id)
    )
  );


-- ===========================================================================
-- 4) sikayet
-- ===========================================================================
-- Şikâyet KULÜP YÖNETİCİSİNE düşer, platforma değil: içeriği bilen, tarafları
-- tanıyan ve yaptırım uygulayabilecek olan kulüptür (antrenörü uyarabilir,
-- erişimini kaldırabilir — 0029). Apple'ın istediği "zamanında yanıt" da bu
-- şekilde gerçek bir sürece bağlanıyor.
create table if not exists public.sikayet (
  id             uuid primary key default gen_random_uuid(),
  sikayet_eden_id uuid not null references public.profiles(id) on delete cascade,
  -- Şikâyet edilen kişi silinirse şikâyet kaydı DURUR (denetim izi), bağ boşalır.
  hedef_id       uuid references public.profiles(id) on delete set null,
  konusma_id     uuid references public.konusma(id) on delete set null,
  sebep          text not null check (sebep in ('uygunsuz_icerik', 'taciz', 'spam', 'sahte_hesap', 'diger')),
  aciklama       text,
  durum          text not null default 'acik' check (durum in ('acik', 'incelendi', 'kapatildi')),
  yonetici_notu  text,
  created_at     timestamptz not null default now(),
  kulup_id       uuid not null default private.current_kulup_id() references public.kulup(id)
);

create index if not exists sikayet_kulup_durum_idx on public.sikayet (kulup_id, durum);

-- Yukarıdaki aynı gerekçe.
grant all on public.sikayet to anon, authenticated, service_role;

alter table public.sikayet enable row level security;

drop policy if exists "kulup izolasyonu" on public.sikayet;
create policy "kulup izolasyonu" on public.sikayet
  as restrictive for all
  using (kulup_id = (select private.current_kulup_id()))
  with check (kulup_id = (select private.current_kulup_id()));

-- Kullanıcı şikâyet OLUŞTURUR ve yalnızca KENDİ şikâyetlerini görür.
-- Güncelleme yetkisi YOK: şikâyeti açan kişi durumunu değiştiremesin.
drop policy if exists "sikayet: kullanıcı kendi şikâyetini açar" on public.sikayet;
create policy "sikayet: kullanıcı kendi şikâyetini açar" on public.sikayet for insert
  with check (sikayet_eden_id = auth.uid());

drop policy if exists "sikayet: kullanıcı kendi şikâyetini görür" on public.sikayet;
create policy "sikayet: kullanıcı kendi şikâyetini görür" on public.sikayet for select
  using (sikayet_eden_id = auth.uid());

-- Yönetici kulübün tüm şikâyetlerini görür ve durumunu günceller.
drop policy if exists "sikayet: yönetici yönetir" on public.sikayet;
create policy "sikayet: yönetici yönetir" on public.sikayet for select
  using (private.current_profile_role() = 'yonetici');

drop policy if exists "sikayet: yönetici günceller" on public.sikayet;
create policy "sikayet: yönetici günceller" on public.sikayet for update
  using (private.current_profile_role() = 'yonetici')
  with check (private.current_profile_role() = 'yonetici');


-- ===========================================================================
-- 5) DOĞRULAMA
-- ===========================================================================
--   -- Engel iki yönde de yazmayı durduruyor mu?
--   insert into public.engelleme (engelleyen_id, engellenen_id) values ('<A>','<B>');
--   -- B oturumunda A ile olan konuşmaya mesaj yazmayı dene → RLS reddetmeli.
--
--   -- Politika sayıları: engelleme 2 (1 restrictive + 1 permissive),
--   -- sikayet 5 (1 restrictive + 4 permissive)
--   select tablename, count(*) from pg_policies
--    where schemaname='public' and tablename in ('engelleme','sikayet')
--    group by tablename;
-- ===========================================================================
