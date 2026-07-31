-- ===========================================================================
-- 0044 — KRİTİK: WhatsApp motorunun iç fonksiyonları herkese açıktı
-- ===========================================================================
-- NASIL OLDU
--   PostgreSQL `create function` ile oluşturulan her fonksiyona EXECUTE iznini
--   VARSAYILAN OLARAK PUBLIC'e verir. 0043'te dört iç fonksiyon yazıldı ve
--   hiçbirinden bu varsayılan geri alınmadı. `authenticated` rolünün `private`
--   şeması üzerinde USAGE yetkisi var (kiracı duvarı `private.current_kulup_id()`
--   çağırdığı için OLMAK ZORUNDA), dolayısıyla fonksiyonlar doğrudan
--   çağrılabilir hâle geldi.
--
--   0043'te `public.wa_baglanti_kur` için revoke YAZILDI ama `private`
--   şemasındaki dördü unutuldu. Aynı dosyada bir yerde doğru yapılıp başka
--   yerde atlanması, bu hatanın neden kolayca gözden kaçtığını da açıklıyor.
--
-- NASIL YAKALANDI
--   Periyodik güvenlik denetimi turu. Önce izinler ölçüldü:
--     select proname, has_function_privilege('authenticated', oid, 'EXECUTE')
--       from pg_proc ... where nspname='private' and proname like 'wa\_%';
--       → wa_gonder | t,  wa_kuyruga_al | t,  wa_yanit_isle | t,  wa_yetim_topla | t
--   Sonra SÖMÜRÜLDÜ (veli JWT'si, transaction + rollback):
--     1. VELİ  private.wa_kuyruga_al(<kulup_id>, 'duyuru', ...)  → 1 satır eklendi
--     2. VELİ  private.wa_gonder(10)                              → 1 mesaj gönderildi
--     3. VELİ  private.wa_yetim_topla('0 seconds')                → çağırdı
--   Karşı-test: `wa_baglanti_kur` reddetti (rol kontrolü tutuyor), `anon`
--   reddedildi (private şemasında USAGE yok). Yani açık tam olarak dört
--   fonksiyonda.
--
-- ETKİSİ — KRİTİK
--   Bir VELİ, kulübün DOĞRULANMIŞ WhatsApp Business numarasından, istediği
--   telefon numarasına, istediği şablon parametreleriyle mesaj gönderebiliyordu.
--   Sonuçları:
--     · Kimliğe bürünme: mesaj kulübün adıyla gidiyor.
--     · Para: her mesaj kulübün faturasına yazılıyor.
--     · KALICI HASAR: Meta kalite derecesini numara bazında tutuyor. Spam
--       gönderimi dereceyi düşürür, düşen derece günlük mesaj limitini kısar ve
--       en kötü hâlde numara tamamen bloke olur. Yani veli, kulübün veli
--       iletişim kanalını kalıcı olarak yakabilirdi.
--   `wa_kuyruga_al` kulüp kimliğini PARAMETRE olarak aldığı için hedef kendi
--   kulübüyle de sınırlı değildi — başka bir kulübün id'si bilinirse o kulübün
--   numarasından da gönderilebilirdi.
--
-- NEDEN BU ÇÖZÜM
--   İki katman:
--
--   (1) EXECUTE İZNİNİ GERİ AL. Bu fonksiyonlar İÇ fonksiyonlar; yalnızca cron
--       (postgres olarak) ve aşağıdaki public sarmalayıcı çağırmalı. Şema
--       düzeyindeki USAGE geri alınamaz — kiracı duvarı `private`'a bağlı —
--       o yüzden fonksiyon düzeyinde alınıyor. `private.davet_coz` zaten böyle
--       yapılmış; bu, o dosyada kurulan doğru deseni geri kalanına uygulamak.
--
--   (2) FONKSİYONUN KENDİSİ DE KULÜBÜ DOĞRULASIN. İzin geri alınsa bile,
--       ileride biri yanlışlıkla yeniden grant verirse ya da başka bir definer
--       fonksiyon bunu çağırırsa savunma sürsün. `wa_kuyruga_al` artık çağıranın
--       oturumunda bir kulüp varsa onunla parametrenin EŞLEŞMESİNİ şart koşuyor.
--       Oturumda kulüp yoksa (cron/postgres bağlamı, auth.uid() NULL) kontrol
--       atlanıyor — arka plan işi çalışmaya devam etsin diye.
--
--   (3) UYGULAMANIN ÇAĞIRACAĞI YOL: `public.wa_duyuru_kuyruga_al`.
--       Kulüp kimliğini PARAMETRE OLARAK ALMIYOR — oturumdan türetiyor. Bir
--       fonksiyonun kiracı kimliğini dışarıdan alması, bu şemadaki en tehlikeli
--       desen; sarmalayıcı o parametreyi tamamen ortadan kaldırıyor.
--
-- ÇALIŞTIRMA: 0043'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) İÇ FONKSİYONLARIN EXECUTE İZNİ GERİ ALINIYOR
-- ===========================================================================
revoke all on function private.wa_kuyruga_al(uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function private.wa_gonder(int)                                     from public, anon, authenticated;
revoke all on function private.wa_yanit_isle()                                    from public, anon, authenticated;
revoke all on function private.wa_yetim_topla(interval)                           from public, anon, authenticated;

-- service_role sunucu tarafı bir bakım yolu için çağırabilsin (RLS'i zaten
-- baypas eden platform rolü; buradan bir yetki KAZANMIYOR).
grant execute on function private.wa_gonder(int)      to service_role;
grant execute on function private.wa_yanit_isle()     to service_role;
grant execute on function private.wa_yetim_topla(interval) to service_role;


-- ===========================================================================
-- 2) DERİNLEMESİNE SAVUNMA — fonksiyon kendi kiracı sınırını da koysun
-- ===========================================================================
-- Gövde 0043'teki ile aynı; başına kulüp doğrulaması eklendi.
create or replace function private.wa_kuyruga_al(
  p_kulup_id     uuid,
  p_tur          text,
  p_sablon_ad    text,
  p_alicilar     jsonb,
  p_kaynak_tablo text default null,
  p_kaynak_id    uuid default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eklenen int := 0;
  v_aktif   boolean;
  v_oturum  uuid;
begin
  -- 0044: KİRACI DOĞRULAMASI.
  -- Oturumda bir kulüp varsa (gerçek kullanıcı), parametreyle eşleşmek ZORUNDA.
  -- Oturumda kulüp yoksa (cron / postgres bağlamı, auth.uid() NULL) kontrol
  -- atlanır — arka plan işleri çalışmaya devam etsin.
  v_oturum := private.current_kulup_id();
  if v_oturum is not null and v_oturum <> p_kulup_id then
    raise exception 'Başka bir kulübün WhatsApp kuyruğuna yazılamaz.'
      using errcode = 'insufficient_privilege';
  end if;

  select aktif into v_aktif from public.wa_hesap where kulup_id = p_kulup_id;
  if coalesce(v_aktif, false) = false then
    return 0;   -- bağlantı yok ya da askıda: sessizce atlanır, çağıran akış bozulmaz
  end if;

  with ham as (
    select private.telefon_e164(a->>'telefon')      as tel,
           nullif(a->>'sporcu_id', '')::uuid        as sporcu_id,
           coalesce(a->'parametreler', '[]'::jsonb) as parametreler
      from jsonb_array_elements(p_alicilar) a
  ),
  -- TEKİLLEŞTİRME: aynı numaraya bir kez (ölçüldü: 22 sporcu → 13 tekil veli).
  tekil as (
    select distinct on (tel) tel, sporcu_id, parametreler
      from ham where tel is not null order by tel, sporcu_id
  ),
  -- ONAY SÜZGECİ: kaydı olmayan numara gönderilebilir sayılır; açıkça
  -- 'reddedildi' ya da 'whatsapp_yok' işaretliyse atlanır.
  izinli as (
    select t.* from tekil t
      left join public.wa_onay o on o.kulup_id = p_kulup_id and o.telefon = t.tel
     where coalesce(o.durum, 'onayli') = 'onayli'
  )
  insert into public.wa_giden (kulup_id, tur, sablon_ad, parametreler,
                               alici_telefon, alici_sporcu_id, kaynak_tablo, kaynak_id)
  select p_kulup_id, p_tur, p_sablon_ad, i.parametreler, i.tel, i.sporcu_id,
         p_kaynak_tablo, p_kaynak_id
    from izinli i;

  get diagnostics v_eklenen = row_count;
  return v_eklenen;
end;
$$;

revoke all on function private.wa_kuyruga_al(uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;


-- ===========================================================================
-- 3) UYGULAMANIN ÇAĞIRACAĞI GÜVENLİ YOL
-- ===========================================================================
-- Kulüp kimliğini PARAMETRE ALMIYOR — oturumdan türetiyor. Sömürülen açığın
-- kökü tam olarak "kiracı kimliğini dışarıdan almak"tı; sarmalayıcı o
-- parametreyi ortadan kaldırıyor.
create or replace function public.wa_duyuru_kuyruga_al(
  p_tur       text,
  p_sablon_ad text,
  p_alicilar  jsonb,
  p_kaynak_id uuid default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_kulup uuid;
begin
  if private.current_profile_role() <> 'yonetici' then
    raise exception 'WhatsApp mesajı yalnızca kulüp yöneticisi gönderebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  v_kulup := private.current_kulup_id();
  if v_kulup is null then
    raise exception 'Kulüp bulunamadı.';
  end if;

  -- Kötüye kullanım freni: toplu gönderim ucu, hız sınırının en çok gerektiği
  -- yerlerden biri (0032). Yönetici hesabı ele geçirilirse tek istekte binlerce
  -- mesaj kuyruğa girmesin.
  perform private.hiz_kontrol('wa_gonderim', 20, interval '1 hour',
    'Çok fazla WhatsApp gönderimi denendi. Bir saat içinde en fazla 20 gönderim yapılabilir.');

  return private.wa_kuyruga_al(v_kulup, p_tur, p_sablon_ad, p_alicilar, 'duyuru', p_kaynak_id);
end;
$$;

revoke all     on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) from public, anon;
grant  execute on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) to authenticated;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname like 'wa\_%'
  loop
    if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception '0044: private.%() hâlâ authenticated tarafından çağrılabiliyor.', r.proname;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      raise exception '0044: private.%() hâlâ anon tarafından çağrılabiliyor.', r.proname;
    end if;
  end loop;

  if not has_function_privilege('authenticated',
       'public.wa_duyuru_kuyruga_al(text,text,jsonb,uuid)', 'EXECUTE') then
    raise exception '0044: güvenli sarmalayıcı authenticated tarafından çağrılamıyor — fazla kısıldı.';
  end if;

  raise notice '0044 tamam: iç WhatsApp fonksiyonları kapatıldı, güvenli sarmalayıcı açık.';
end $$;
