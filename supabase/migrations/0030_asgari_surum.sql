-- ===========================================================================
-- 0030_asgari_surum.sql — Zorunlu güncelleme kapısı
-- ===========================================================================
-- NEDEN ŞİMDİ: bu kapı SONRADAN EKLENEMEZ.
--   Kontrolü yapan kod uygulamanın içindedir. Kapıyı altıncı sürümde eklersen,
--   1-5. sürümdeki telefonlarda o kod yoktur ve onlar hiçbir zaman
--   engellenemez. Yani kapı İLK mağaza sürümünde bulunmak zorunda; sonrası
--   için "artık geç" demek gerekir.
--
-- HANGİ SORUNU ÇÖZÜYOR
--   Şema değiştiren bir migration çalıştırdığında (bugüne kadar 30 tane oldu),
--   güncellemeyi almamış telefonlar eski sorguları atmaya devam eder. Sonuç
--   çoğunlukla sessizdir: PostgREST bilinmeyen kolon için hata döner, ekran
--   boş açılır ve veli "uygulama bozuldu" diye kulübü arar. Kimin hangi sürümde
--   olduğunu da bilmiyorsun.
--
-- KİRACIYA AİT DEĞİL — PLATFORMA AİT
--   Bu ayar tüm kulüpler için aynıdır (uygulama tek, kulüpler çok), bu yüzden
--   kulup_id YOK ve 0021'in restrictive kiracı duvarına dahil değil. Yazma
--   yetkisi yalnızca service_role'da: değeri süper-admin konsolu belirler.
--
-- OKUMA ANON'A AÇIK — ZORUNLU
--   Kontrol uygulama açılışında, GİRİŞTEN ÖNCE çalışır. authenticated şartı
--   koşulsaydı, oturumu olmayan (veya oturumu bozulmuş) bir kullanıcı kapıyı
--   hiç göremez ve eski sürümle kullanmaya devam ederdi. Tabloda gizli bilgi
--   yok: yalnızca bir sürüm numarası ve kullanıcıya gösterilecek metin.
--
-- ÇALIŞTIRMA: herhangi bir zamanda, tekrar çalıştırılabilir.
-- ===========================================================================

create table if not exists public.uygulama_surumu (
  -- id boolean/check(id) deseni: tabloda EN FAZLA BİR satır olabilir
  -- (kurum_ayarlari'ndaki aynı hile). İki satır olsaydı "hangisi geçerli"
  -- sorusu doğardı ve istemci rastgele birini okurdu.
  id             boolean primary key default true check (id),
  -- Bu sürümden ESKİ uygulamalar engellenir. Karşılaştırma semver mantığıyla
  -- yapılır (1.10.0 > 1.9.0), düz metin karşılaştırmasıyla değil.
  asgari_surum   text not null default '1.0.0',
  -- Kullanıcıya gösterilecek metin. Sebep her seferinde farklı olabildiği için
  -- (güvenlik yaması / veri yapısı değişikliği) sabit metin yerine alan.
  mesaj          text,
  ios_url        text,
  android_url    text,
  updated_at     timestamptz not null default now()
);

insert into public.uygulama_surumu (id, asgari_surum, mesaj)
values (true, '1.0.0', 'Uygulamanın yeni bir sürümü var. Devam etmek için güncelleyin.')
on conflict (id) do nothing;

comment on table public.uygulama_surumu is
  'Zorunlu güncelleme kapısı (0030). Tek satır. Platforma ait, kiracıya değil — kulup_id yok. Yazma yalnızca service_role.';
comment on column public.uygulama_surumu.asgari_surum is
  'Bu sürümden eski uygulamalar engellenir. app.json > expo.version ile karşılaştırılır (semver).';

alter table public.uygulama_surumu enable row level security;

-- Okuma herkese açık (yukarıdaki gerekçe). Yazma politikası YOK: politikası
-- olmayan işlem RLS altında reddedilir (fail-closed), yani anon/authenticated
-- bu tabloya yazamaz. service_role RLS'i baypas ettiği için süper-admin
-- konsolu değeri değiştirebilir.
drop policy if exists "uygulama_surumu: herkes okur" on public.uygulama_surumu;
create policy "uygulama_surumu: herkes okur" on public.uygulama_surumu for select using (true);

grant select on public.uygulama_surumu to anon, authenticated;

-- ===========================================================================
-- KULLANIM
--   -- Zorunlu güncellemeyi açmak (süper-admin, SQL Editor):
--   update public.uygulama_surumu
--      set asgari_surum = '1.2.0',
--          mesaj = 'Ödeme ekranı yenilendi; devam etmek için güncelleyin.',
--          updated_at = now();
--
--   ⚠ Değeri MAĞAZADAKİ sürüm yayınlandıktan SONRA yükselt. Önce yükseltirsen
--     kullanıcılar indirebilecekleri bir güncelleme olmadan kilitlenir.
-- ===========================================================================
