-- Security Advisor: "Function ... has a role mutable search_path" — 0016'daki
-- 4 trigger fonksiyonu search_path'i çağırandan miras alıyordu. Gövdelerindeki
-- tüm referanslar ya şema-nitelikli (private.current_profile_role) ya da
-- pg_catalog built-in'i (coalesce, is distinct from, enum/int operatörleri)
-- olduğu için boş (en sıkı) search_path güvenle çalışır — davranış değişmez,
-- yalnızca olası bir search_path zehirlenmesi yolu kapanır.
-- (0001'deki handle_new_user zaten 'set search_path = public' ile sabitli.)

alter function public.protect_profile_role() set search_path = '';
alter function public.protect_bireysel_paket() set search_path = '';
alter function public.protect_konusma_taraflar() set search_path = '';
alter function public.protect_bireysel_rezervasyon() set search_path = '';
