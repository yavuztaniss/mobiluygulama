-- Security Advisor uyarısı: current_profile_role() da handle_new_user() gibi
-- SECURITY DEFINER olduğu için anon dahil herkese /rest/v1/rpc/ üzerinden açıktı.
-- ANCAK bu fonksiyon handle_new_user()'dan farklı — trigger değil, doğrudan RLS
-- politikalarının USING/WITH CHECK ifadeleri içinde çağrılıyor (sube, brans,
-- hizmet_turu, grup, sporcular, veli_sporcu, sporcu_antrenor politikalarının hepsi
-- buna bağlı). Bu yüzden handle_new_user()'da yaptığımız gibi TÜM rollerden
-- execute'u kaldıramayız — authenticated rolünden kaldırırsak giriş yapmış her
-- kullanıcının bu tablolara attığı normal sorgular kırılır. Yalnızca anon/public'ten
-- kaldırıp authenticated'a açık bırakıyoruz: anonim (girişsiz) doğrudan RPC çağrısı
-- engellenir, gerçek kullanıcıların RLS değerlendirmesi bozulmaz.

revoke execute on function public.current_profile_role() from public;
revoke execute on function public.current_profile_role() from anon;
grant execute on function public.current_profile_role() to authenticated;
