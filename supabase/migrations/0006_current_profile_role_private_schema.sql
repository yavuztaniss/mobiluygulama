-- Önceki migration (0005) authenticated rolüne execute izni bırakmıştı çünkü
-- RLS politikaları buna ihtiyaç duyuyor — ama Advisor haklı olarak "authenticated
-- kullanıcılar bunu doğrudan /rest/v1/rpc/ ile çağırabiliyor" diye işaretledi.
-- Asıl temiz çözüm: fonksiyonu PostgREST'in dışa açtığı `public` şemasından
-- tamamen çıkarmak. Mevcut RLS politikaları bozulmuyor çünkü Postgres onları
-- fonksiyona OID üzerinden bağlar, şemaya göre değil — sadece PostgREST artık
-- bu fonksiyonu API endpoint'i olarak görmüyor.

create schema if not exists private;
alter function public.current_profile_role() set schema private;
