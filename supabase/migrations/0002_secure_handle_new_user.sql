-- Supabase Security Advisor uyarısı: handle_new_user() SECURITY DEFINER olduğu için
-- public şemada varsayılan olarak anon/authenticated rollerine EXECUTE izni açık kalıyor,
-- bu da /rest/v1/rpc/handle_new_user üzerinden dışarıdan çağrılabilir hale getiriyor.
-- Fonksiyon yalnızca auth.users insert trigger'ı tarafından çağrılmalı; trigger'ın
-- çalışması bu izne bağlı değil, o yüzden güvenle kaldırılabilir.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
