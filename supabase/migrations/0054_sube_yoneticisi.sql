-- ===========================================================================
-- 0054 — Şube yöneticisi rolü + şube duvarı
-- ===========================================================================
-- İSTEK
--   "Kulübün belli şubeleri olacak, ana kulüp adı altında herkesin bilgisi
--    görünecek, sonra şubelere dağılımı olacak. Şubelerin yöneticileri olacak,
--    onların izinleri kısıtlı olacak — mesela sadece veli gruplandırma gibi —
--    onlar oranın yönetimini sağlayacak."
--   Ek kararlar: şube yöneticisi VELİ DAVET EDEBİLİR (kendi şubesine).
--   Duyuru: kulüp yöneticisi tüm kulübe VEYA seçtiği şubeye; şube yöneticisi
--   yalnızca kendi şubesine.
--
-- MİMARİ: KULÜP DUVARININ İÇİNE İKİNCİ BİR DUVAR
--   0021 her tabloya restrictive bir KİRACI duvarı koydu (kulup_id). Bu dosya
--   onun İÇİNE ikinci bir restrictive duvar ekliyor: ŞUBE. İki duvar AND'lenir,
--   yani şube yöneticisi önce kendi kulübüne, sonra kendi şubesine hapsolur.
--
--   Duvar "rol şube yöneticisi DEĞİLSE serbest" biçiminde yazıldı:
--     using (private.current_profile_role() <> 'sube_yoneticisi'
--            or <şube koşulu>)
--   Böylece kulüp yöneticisi, muhasebeci, antrenör ve veli için davranış
--   HİÇ DEĞİŞMİYOR — mevcut politikaların tamamı olduğu gibi geçerli kalıyor.
--   Tersi yazılsaydı (herkese şube koşulu) kulüp yöneticisi kendi kulübünün
--   yarısını göremez hâle gelirdi.
--
-- ⚠ RESTRICTIVE POLİTİKALARDA `to authenticated` YAZILMAZ.
--   Restrictive politika yalnızca ADLANDIRDIĞI rollere uygulanır; `to
--   authenticated` yazılsaydı anon anahtarla gelen istekte duvar HİÇ
--   ÇALIŞMAZDI. 0021'de bu tuzak yakalanmıştı, aynısı burada da geçerli.
--
-- ⚠⚠ EN SİNSİ TUZAK — ENUM DEĞERİ AYNI İŞLEMDE KULLANILAMAZ
--   PostgreSQL'de `alter type ... add value` ile eklenen değer AYNI
--   TRANSACTION içinde KULLANILAMAZ ("unsafe use of new value of enum type").
--   Supabase SQL Editor dosyayı tek parça çalıştırdığı için bu gerçek bir risk.
--   Bu yüzden aşağıdaki hiçbir yerde `'sube_yoneticisi'::app_role` YAZILMIYOR:
--     · politikalar private.current_profile_role() ile karşılaştırıyor, o da
--       zaten TEXT döndürüyor → enum literali yok,
--     · davet.rol kısıtı `rol::text = any(array[...])` biçiminde yeniden
--       yazıldı → enum literali yok.
--   Böylece dosya tek seferde, tek transaction'da sorunsuz çalışıyor.
--
-- ÇALIŞTIRMA: 0053'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Rol
-- ---------------------------------------------------------------------------
alter type app_role add value if not exists 'sube_yoneticisi';


-- ---------------------------------------------------------------------------
-- 2) duyuru.sube_id — NULL = tüm kulüp
-- ---------------------------------------------------------------------------
alter table public.duyuru add column if not exists sube_id uuid;

do $d54$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'duyuru_sube_kulup_fkey'
                    and conrelid = 'public.duyuru'::regclass) then
    alter table public.duyuru
      add constraint duyuru_sube_kulup_fkey
      foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
      -- ⚠ kolon listesi ŞART (0039): listesiz SET NULL kulup_id'yi de NULL
      --   yapar ve şube silme tümden patlar.
      on delete set null (sube_id);
  end if;
end $d54$;

create index if not exists duyuru_sube_idx on public.duyuru (sube_id) where sube_id is not null;

comment on column public.duyuru.sube_id is
  '0054: NULL = tüm kulüp (yalnızca kulüp yöneticisi), dolu = o şube.';


-- ---------------------------------------------------------------------------
-- 3) private.current_sube_id()
-- ---------------------------------------------------------------------------
-- current_kulup_id()'nin şube karşılığı. Aynı gerekçeyle SECURITY DEFINER:
-- profiles'ı okuması gerekiyor ama profiles'ın kendisi de duvarların arkasında.
-- `aktif` koşulu 0029 ile uyumlu: erişimi kaldırılmış kullanıcı NULL alır ve
-- aşağıdaki duvarlar onun için fail-closed olur.
create or replace function private.current_sube_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.sube_id from public.profiles p
   where p.id = auth.uid() and p.aktif
$$;

revoke all on function private.current_sube_id() from public, anon, authenticated;
grant execute on function private.current_sube_id() to authenticated;


-- ⚠ TÜRETİLEN ŞUBE İÇİN YARDIMCI FONKSİYONLAR — SONSUZ ÖZYİNELEME ÖNLEMİ
--   İlk sürümde `veli_sporcu` duvarı doğrudan `exists (select 1 from sporcular ...)`
--   yazıyordu ve ÖLÇÜLDÜ: "infinite recursion detected in policy for relation
--   sporcular". Sebep bir DÖNGÜ:
--     veli_sporcu politikası → sporcular'ı sorguluyor
--     sporcular'ın mevcut veli politikası → veli_sporcu'yu sorguluyor
--   Politika içinden RLS'li bir tabloyu sorgulamak, o tablonun politikalarını da
--   tetikliyor; iki taraf birbirini çağırınca Postgres döngüyü yakalayıp
--   sorguyu tümden reddediyor.
--
--   Çözüm: şubeyi SECURITY DEFINER bir fonksiyondan okumak. DEFINER gövdesi
--   RLS'i baypas ettiği için politika zinciri yeniden girilmiyor, döngü kırılıyor.
--   Aynı desen `yoklama` ve `antrenman` için de kullanılıyor — bugün orada döngü
--   olmasa bile yarın sporcular/grup politikalarına bir bağ eklenirse aynı tuzağa
--   düşülürdü.
create or replace function private.sporcu_subesi(p_sporcu uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.sube_id from public.sporcular s where s.id = p_sporcu
$$;

create or replace function private.grup_subesi(p_grup uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select g.sube_id from public.grup g where g.id = p_grup
$$;

revoke all on function private.sporcu_subesi(uuid) from public, anon, authenticated;
revoke all on function private.grup_subesi(uuid)   from public, anon, authenticated;
grant execute on function private.sporcu_subesi(uuid) to authenticated;
grant execute on function private.grup_subesi(uuid)   to authenticated;


-- ---------------------------------------------------------------------------
-- 4) ŞUBE DUVARI
-- ---------------------------------------------------------------------------
-- Fonksiyonlar `(select ...)` ile sarılıyor: InitPlan, satır başına değil
-- sorgu başına değerlendirme (0021'in aynı deseni).
--
-- Şube yöneticisinin sube_id'si NULL ise koşul hiç tutmaz ve HİÇBİR ŞEY
-- göremez — fail-closed. Şubesiz bir şube yöneticisi anlamsız olduğu için
-- doğru davranış bu.

-- 4.1 Doğrudan sube_id taşıyanlar
do $duvar$
declare
  t text;
begin
  foreach t in array array['sporcular', 'grup', 'basvuru', 'aidat_plani'] loop
    execute format('drop policy if exists "sube duvari" on public.%I', t);
    execute format($f$
      create policy "sube duvari" on public.%I as restrictive for all
      using (
        (select private.current_profile_role()) <> 'sube_yoneticisi'
        or sube_id = (select private.current_sube_id())
      )
      with check (
        (select private.current_profile_role()) <> 'sube_yoneticisi'
        or sube_id = (select private.current_sube_id())
      )
    $f$, t);
  end loop;
end $duvar$;

-- 4.2 duyuru — NULL şube (tüm kulüp) OKUNABİLİR ama şube yöneticisi YAZAMAZ.
--     Okuma serbest: şubedeki velilere de kulüp geneli duyuru gitmeli, şube
--     yöneticisinin onu görmemesi saçma olurdu.
drop policy if exists "sube duvari" on public.duyuru;
create policy "sube duvari" on public.duyuru as restrictive for all
using (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or sube_id is null
  or sube_id = (select private.current_sube_id())
)
with check (
  -- YAZMADA sube_id NULL KABUL EDİLMİYOR: şube yöneticisi tüm kulübe duyuru
  -- geçemesin. Kullanıcının kararı buydu.
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or sube_id = (select private.current_sube_id())
);

-- 4.3 antrenman — şubesi grup üzerinden türetiliyor
drop policy if exists "sube duvari" on public.antrenman;
create policy "sube duvari" on public.antrenman as restrictive for all
using (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or private.grup_subesi(antrenman.grup_id) = (select private.current_sube_id())
)
with check (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or private.grup_subesi(antrenman.grup_id) = (select private.current_sube_id())
);

-- 4.4 yoklama — şubesi sporcu üzerinden türetiliyor
--     (antrenman üzerinden de gidilebilirdi; sporcu daha kısa yol ve yoklama
--     satırının kime ait olduğu asıl soru bu.)
drop policy if exists "sube duvari" on public.yoklama;
create policy "sube duvari" on public.yoklama as restrictive for all
using (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or private.sporcu_subesi(yoklama.sporcu_id) = (select private.current_sube_id())
)
with check (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or private.sporcu_subesi(yoklama.sporcu_id) = (select private.current_sube_id())
);

-- 4.5 veli_sporcu — velinin hangi çocuğa bağlı olduğu; sporcu üzerinden
drop policy if exists "sube duvari" on public.veli_sporcu;
create policy "sube duvari" on public.veli_sporcu as restrictive for all
using (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or private.sporcu_subesi(veli_sporcu.sporcu_id) = (select private.current_sube_id())
)
with check (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or private.sporcu_subesi(veli_sporcu.sporcu_id) = (select private.current_sube_id())
);

-- 4.6 davet — şube yöneticisi YALNIZCA kendi şubesine ve YALNIZCA veli daveti
drop policy if exists "sube duvari" on public.davet;
create policy "sube duvari" on public.davet as restrictive for all
using (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or sube_id = (select private.current_sube_id())
)
with check (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or (sube_id = (select private.current_sube_id()) and rol::text = 'veli')
);


-- ---------------------------------------------------------------------------
-- 4.7 KAPILAR — permissive politikalar
-- ---------------------------------------------------------------------------
-- ⚠ BU BÖLÜM İLK SÜRÜMDE YOKTU VE TASARIM EKSİK KALMIŞTI.
--   PostgreSQL'de restrictive politikalar yalnızca DARALTIR; erişimi VEREN şey
--   permissive politikalardır. Yukarıdaki duvarları yazıp burayı atlayınca şube
--   yöneticisi KENDİ şubesinin sporcusunu bile göremedi (ölçüldü: 0 satır) ve
--   kendi şubesine veli daveti oluşturamadı (RLS reddi).
--
--   Daha sinsi olanı: aynı eksiklik bazı testleri YANLIŞ SEBEPLE geçiriyordu.
--   "ödemeler kapalı → 0 satır" duvarım çalıştığı için değil, o role hiç kapı
--   açılmadığı için 0 dönüyordu. Kapılar açıldıktan sonra o testler gerçek
--   anlamını kazanıyor.
--
-- MODEL: şube yöneticisi = kendi şubesiyle sınırlı kulüp yöneticisi.
--   Kapılar yöneticininkinin aynısı; sınırı yukarıdaki restrictive duvar koyuyor.
--   Muhasebe/bordro/mağaza ise 5. bölümdeki "tümden kapalı" duvarıyla dışarıda
--   kalıyor — kapı açılsa bile o duvar geçilmiyor.
do $kapi$
declare t text;
begin
  foreach t in array array[
    'sporcular','grup','basvuru','duyuru','antrenman','yoklama','veli_sporcu','davet','aidat_plani'
  ] loop
    execute format('drop policy if exists "sube yoneticisi yonetir" on public.%I', t);
    execute format($f$
      create policy "sube yoneticisi yonetir" on public.%I for all
      using ((select private.current_profile_role()) = 'sube_yoneticisi')
      with check ((select private.current_profile_role()) = 'sube_yoneticisi')
    $f$, t);
  end loop;

  -- Yalnızca OKUMA: şubeyi ve kulüp kimliğini görebilmeli ama değiştirememeli.
  foreach t in array array['sube','brans','kurum_ayarlari'] loop
    execute format('drop policy if exists "sube yoneticisi okur" on public.%I', t);
    execute format($f$
      create policy "sube yoneticisi okur" on public.%I for select
      using ((select private.current_profile_role()) = 'sube_yoneticisi')
    $f$, t);
  end loop;
end $kapi$;

-- profiles: kendi şubesindeki kişileri görsün. Şube duvarı burada da geçerli
-- (profiles.sube_id var), yani başka şubenin velisi/antrenörü görünmüyor.
drop policy if exists "sube yoneticisi okur" on public.profiles;
create policy "sube yoneticisi okur" on public.profiles for select
using ((select private.current_profile_role()) = 'sube_yoneticisi');

drop policy if exists "sube duvari" on public.profiles;
create policy "sube duvari" on public.profiles as restrictive for all
using (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or id = auth.uid()                                    -- kendi satırı her zaman
  or sube_id = (select private.current_sube_id())
)
with check (
  (select private.current_profile_role()) <> 'sube_yoneticisi'
  or sube_id = (select private.current_sube_id())
);


-- ---------------------------------------------------------------------------
-- 5) Erişilmemesi gereken tablolar — TÜMDEN KAPALI
-- ---------------------------------------------------------------------------
-- Muhasebe, bordro, mağaza. Bu tablolarda şube kolonu yok ve şube yöneticisinin
-- işi değil. "Şube türetilemiyor" durumunda doğru cevap "hepsini göster" değil
-- "hiçbirini gösterme".
do $kapali$
declare
  t text;
begin
  foreach t in array array['odeme', 'fatura', 'gider', 'hakedis', 'siparis', 'urun'] loop
    execute format('drop policy if exists "sube yoneticisine kapali" on public.%I', t);
    execute format($f$
      create policy "sube yoneticisine kapali" on public.%I as restrictive for all
      using ((select private.current_profile_role()) <> 'sube_yoneticisi')
      with check ((select private.current_profile_role()) <> 'sube_yoneticisi')
    $f$, t);
  end loop;
end $kapali$;


-- ---------------------------------------------------------------------------
-- 6) davet.rol kısıtı — yeni rol davet edilebilsin
-- ---------------------------------------------------------------------------
-- ⚠ `rol::text = any(array[...])` — enum literali YAZILMIYOR (bkz. başlık).
alter table public.davet drop constraint if exists davet_rol_check;
alter table public.davet add constraint davet_rol_check
  check (rol::text = any (array['veli','antrenor','muhasebeci','yonetici','sube_yoneticisi']));


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare v_adet int; v_hatali int;
begin
  select count(*) into v_adet from pg_policy
   where polname in ('sube duvari', 'sube yoneticisine kapali') and not polpermissive;
  if v_adet < 15 then
    raise exception '0054: yalnızca % şube politikası kuruldu, 15+ bekleniyordu.', v_adet;
  end if;

  -- ⚠ restrictive politikada rol adlandırılmışsa anon duvarı deler.
  select count(*) into v_hatali from pg_policy
   where polname in ('sube duvari', 'sube yoneticisine kapali')
     and not polpermissive and polroles <> '{0}';
  if v_hatali > 0 then
    raise exception '0054: % politika `to authenticated` ile yazılmış — anon duvarı deler.', v_hatali;
  end if;

  raise notice '0054 doğrulandı: % şube politikası, hepsi PUBLIC role.', v_adet;
end $$;
