-- ===========================================================================
-- 0028_odeme_bilgisi.sql — Kulübün banka bilgisi (veli ödemesini nereye yapacak?)
-- ===========================================================================
-- SORUN
--   Veli uygulaması aidat ekranında "banka havalesi" ile ödeme yapılacağını
--   söylüyor (app/app/(veli)/(tabs)/odemeler.tsx) ama NEREYE yatırılacağını
--   hiçbir yerde yazmıyor — çünkü şemada IBAN alanı yok. Veli ya kulübü arıyor
--   ya da ödemeyi geciktiriyor; ikisi de kulübün tahsilatını doğrudan
--   yavaşlatıyor ve uygulamanın çözmesi beklenen sorunun ta kendisi.
--
--   Bu, uygulama içi ödeme (iyzico vb.) ile karıştırılmamalı: ürün bilinçli
--   olarak havale/EFT ile çalışıyor. Havale ile çalışan bir üründe IBAN'ın
--   olmaması, ödeme sağlayıcısının olmamasından çok daha temel bir eksik.
--
-- ÇÖZÜM
--   kurum_ayarlari'na üç alan: iban, iban_sahibi (hesap adı — bankalar
--   çoğunlukla ad eşleşmesi ister), odeme_aciklamasi (kulübün veliye söylemek
--   istediği serbest not: "açıklamaya sporcunun adını yazın" gibi).
--
-- GÜVENLİK NOTU
--   IBAN GİZLİ BİR BİLGİ DEĞİLDİR — zaten veliye gösterilmek için var. Ama
--   kurum_ayarlari kiracı duvarının arkasında (0021), yani bir kulübün IBAN'ını
--   yalnızca o kulübün kullanıcıları görebilir. Ek politika gerekmiyor: tablonun
--   mevcut politikaları aynen geçerli.
--
-- ÇALIŞTIRMA: herhangi bir zamanda, tekrar çalıştırılabilir.
-- ===========================================================================

alter table public.kurum_ayarlari add column if not exists iban text;
alter table public.kurum_ayarlari add column if not exists iban_sahibi text;
alter table public.kurum_ayarlari add column if not exists odeme_aciklamasi text;

comment on column public.kurum_ayarlari.iban is
  'Kulübün tahsilat IBAN''ı. Veli uygulamasındaki ödeme ekranında gösterilir (0028). Boşsa ekranda "kulübünüzle iletişime geçin" yazar.';
comment on column public.kurum_ayarlari.iban_sahibi is
  'IBAN''ın ait olduğu hesap adı. Bankalar havalede ad eşleşmesi istediği için IBAN tek başına yetmez.';
comment on column public.kurum_ayarlari.odeme_aciklamasi is
  'Kulübün veliye ödeme hakkında söylemek istediği serbest not (ör. "açıklamaya sporcunun adını yazın").';

-- ===========================================================================
-- DOĞRULAMA
--   select column_name from information_schema.columns
--    where table_name = 'kurum_ayarlari'
--      and column_name in ('iban', 'iban_sahibi', 'odeme_aciklamasi');
--   → 3 satır dönmeli
-- ===========================================================================
