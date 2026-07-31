-- ===========================================================================
-- 0046 — WhatsApp gönderim tavanı: hız sınırı ÇAĞRIYI sayıyor, MESAJI değil
-- ===========================================================================
-- NASIL OLDU
--   0044, public.wa_duyuru_kuyruga_al sarmalayıcısına açık bir gerekçeyle hız
--   sınırı koydu:
--     "Yönetici hesabı ele geçirilirse tek istekte binlerce mesaj kuyruğa
--      girmesin."
--   Konulan kontrol private.hiz_kontrol('wa_gonderim', 20, '1 hour'). Ama
--   hiz_kontrol bir ÇAĞRIDA sayacı BİR artırır; p_alicilar dizisinin uzunluğuna
--   hiç bakmaz. Kontrolün yazılı amacı ile yaptığı iş ayrışıyor: "tek istekte
--   binlerce mesaj" tam olarak hâlâ mümkün.
--
-- NASIL YAKALANDI — ÖLÇÜLDÜ (yerel Docker, yönetici JWT'si, begin/rollback)
--   select public.wa_duyuru_kuyruga_al(
--            'duyuru','tanitim',
--            (select jsonb_agg(jsonb_build_object('telefon','5'||lpad((300000000+g)::text,9,'0')))
--               from generate_series(1,5000) g));
--     → 5000
--   select count(*), count(distinct alici_telefon) from public.wa_giden;
--     → 5000 | 5000
--   Numaraların HİÇBİRİ kulübe ait değil; wa_kuyruga_al alıcıyı kulübün
--   velileriyle karşılaştırmıyor. 20 çağrı/saat ile tavan: 100.000 mesaj/saat.
--
-- ETKİ
--   · PARA: her mesaj Meta tarafından kulübün faturasına yazılır.
--   · KALICI HASAR: rastgele numaralara şablon mesajı = spam. Meta kalite
--     derecesini numara bazında düşürür; düşen derece günlük limiti kısar,
--     tekrarında numara bloke olur. Kulübün veli iletişim kanalı yanar.
--   · KİMLİĞE BÜRÜNME: mesaj kulübün DOĞRULANMIŞ işletme adıyla gider.
--   Aktör: yöneticinin kendisi ya da çalınmış bir yönetici oturumu. Kiracı
--   sınırı aşılmıyor — kırılan değişmez PARA ve İTİBAR.
--
-- NEDEN BU ÇÖZÜM — VE KATMAN SEÇİMİ
--   Tavan bir PARA değişmezi. Bu şemadaki kural: para ile ilgili değişmez RLS'e
--   değil TETİKLEYİCİYE konur — RLS'i service_role baypas eder ve
--   createAdminClient() çağıran her panel yolu tavanın dışında kalırdı. Bu
--   yüzden asıl kapı public.wa_giden üzerinde bir AFTER INSERT tetikleyici:
--   veli, yönetici, service_role, cron ve postgres — hepsine işler.
--
--   TAVAN SALDIRGAN TARAFINDAN AYARLANAMAZ OLMALI:
--     kulüp başına 24 saatlik tavan = greatest(coalesce(wa_hesap.gunluk_limit,0), 2000)
--   wa_hesap üzerinde istemciye YAZMA POLİTİKASI YOK (0043 §9; ölçüldü:
--   yönetici "update wa_hesap set aktif=false" → UPDATE 0) ve wa_baglanti_kur
--   bu kolona dokunmuyor. Tavanı yalnızca sunucu tarafı (Meta sağlık kontrolü)
--   yükseltebilir. Meta tier'ı 10.000 olan büyük bir kulüp otomatik 10.000'e
--   çıkar; hiç ölçülmemiş bir kulüp 2.000'de kalır.
--
--   2000 NEDEN GÜVENLİ TABAN: referans kulüpte 22 sporcu → 13 tekil veli
--   (0043'te ölçülmüş). 2000, gerçekçi en büyük tek duyurudan bir mertebe
--   büyük, kötüye kullanımdan iki mertebe küçük.
--
--   SEÇİLMEYEN ALTERNATİFLER
--   · "hiz_kontrol'ü alıcı sayısı kadar çağır": 5000 alıcıda 5000 UPDATE ve
--     service_role yolunu hiç kapatmaz.
--   · "alıcıları kulübün velileriyle sınırla": tur='davet' meşru olarak kulüpte
--     KAYITLI OLMAYAN bir numaraya gider. Bu kural meşru akışı kırardı (0037'de
--     tam olarak bu hata yapıldı) — o yüzden alıcı kimliği değil HACİM sınırlanıyor.
--   · "RLS politikasına koy": service_role baypas eder.
--
-- ===========================================================================
-- İKİNCİ KONU — net._http_response'ta biriken kiracılar arası veri
-- ===========================================================================
--   0042 şunu yazmıştı: "0043 ile WhatsApp trafiği de buradan geçecek;
--   kapatılmazsa bir veli kulübün WhatsApp API yanıtlarını (mesaj kimlikleri,
--   başka velilerin numaraları) okuyabilir." Doğru ve hâlâ geçerli:
--     select relacl from pg_class where relname='_http_response';
--       → {supabase_admin=arwdDxtm/supabase_admin, =arwdDxtm/supabase_admin}
--       ("=" PUBLIC demek: anon ve authenticated dahil)
--   İzni geri almak MÜMKÜN DEĞİL (yerelde ölçüldü, 0042 ile aynı sonuç):
--     revoke select on net.http_request_queue from public;
--       → WARNING: no privileges could be revoked for "http_request_queue"
--     alter table net.http_request_queue enable row level security;
--       → ERROR: must be owner of table http_request_queue
--
--   ELİMİZDEKİ TEK KALDIRAÇ: satırı SİLMEK. PUBLIC'in d (DELETE) izni olduğu
--   için postgres sahibi olmasa da silebiliyor. wa_yanit_isle zaten dakikada
--   bir çalışıp yanıtı işliyor; artık işlediği satırı bırakmak yerine siliyor.
--   Yanıtın PUBLIC'e açık kaldığı pencere 6 SAAT'ten ~1 DAKİKA'ya iniyor.
--
--   BU TAM ÇÖZÜM DEĞİL: isteğin KENDİSİ (net.http_request_queue.headers,
--   içinde "Bearer <jeton>") hâlâ PUBLIC'e açık bir tabloda, pg_net işçisi onu
--   silene kadar duruyor. O tarafta veritabanı içinden yapılabilecek bir şey
--   yok; çözüm platform seviyesinde (Supabase destek talebi) ya da gönderimi
--   veritabanının dışına taşımakta.
--
--   KARŞI-TEST: wa_yanit_isle'nin HER dalı wa_giden.durum'u 'gonderildi'
--   dışına çekiyor, yani işlenmiş satır bir daha bu döngüye girmiyor; silinen
--   yanıta ikinci kez ihtiyaç yok. wa_yetim_topla yalnızca durumu HÂLÂ
--   'gonderildi' olan satırlara bakıyor — onların yanıtı hiç düşmemiş.
--
-- ÇALIŞTIRMA: 0044'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) PARA DEĞİŞMEZİ — TETİKLEYİCİ (herkese işler, service_role dahil)
-- ===========================================================================
create or replace function private.wa_giden_tavan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_tavan int;
  v_var   int;
begin
  for r in select kulup_id, count(*)::int as adet from yeni group by kulup_id loop
    -- Tavan sunucu tarafından belirlenir; istemci wa_hesap'a yazamaz.
    select greatest(coalesce(h.gunluk_limit, 0), 2000) into v_tavan
      from public.wa_hesap h where h.kulup_id = r.kulup_id;
    v_tavan := coalesce(v_tavan, 2000);

    -- AFTER tetikleyici: yeni satırlar bu sayıma ZATEN dahil.
    select count(*)::int into v_var
      from public.wa_giden g
     where g.kulup_id = r.kulup_id
       and g.created_at > now() - interval '24 hours';

    if v_var > v_tavan then
      raise exception
        'WhatsApp gönderim tavanı aşıldı: son 24 saatte % mesaj, tavan %. Toplu gönderimi bölün ya da limitin yükseltilmesi için destek ile görüşün.',
        v_var, v_tavan
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end;
$$;

-- YENİ FONKSİYON = YENİ REVOKE. PostgreSQL her yeni fonksiyona EXECUTE'u
-- varsayılan olarak PUBLIC'e verir; 0044'ün doğrulama bloğu private.wa_* deseni
-- altındaki her fonksiyonu tarıyor ve bu satır olmadan 0044 bir daha
-- çalıştırılamaz hâle geliyor (ölçüldü: "0044: private.wa_giden_tavan() hâlâ
-- authenticated tarafından çağrılabiliyor"). Tetikleyici gövdesi doğrudan
-- çağrılınca zaten hata verir, ama kural kuraldır.
revoke all on function private.wa_giden_tavan() from public, anon, authenticated;

drop trigger if exists wa_giden_tavan on public.wa_giden;
create trigger wa_giden_tavan
  after insert on public.wa_giden
  referencing new table as yeni
  for each statement execute function private.wa_giden_tavan();


-- ===========================================================================
-- 2) SARMALAYICI — tek çağrıda alıcı sayısı sınırı
-- ===========================================================================
-- Tetikleyici zaten kapıyı tutuyor; buradaki sınır (a) 10 milyon elemanlı bir
-- jsonb'nin belleği şişirmesini iş YAPILMADAN önce durduruyor, (b) istemciye
-- anlaşılır bir hata veriyor. Gövde 0044'teki ile aynı; yalnızca bu kontroller
-- eklendi.
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
declare
  v_kulup uuid;
  v_adet  int;
begin
  if private.current_profile_role() <> 'yonetici' then
    raise exception 'WhatsApp mesajı yalnızca kulüp yöneticisi gönderebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  v_kulup := private.current_kulup_id();
  if v_kulup is null then
    raise exception 'Kulüp bulunamadı.';
  end if;

  if p_alicilar is null or jsonb_typeof(p_alicilar) <> 'array' then
    raise exception 'Alıcı listesi bir dizi olmalı.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- 0046: hız sınırı ÇAĞRI sayıyor, mesaj değil. Alıcı tavanı olmadan tek
  -- istekte 5000 mesaj kuyruğa girebiliyordu (ölçüldü).
  v_adet := jsonb_array_length(p_alicilar);
  if v_adet > 1000 then
    raise exception 'Tek gönderimde en fazla 1000 alıcı olabilir (% gönderildi). Listeyi bölün.', v_adet
      using errcode = 'check_violation';
  end if;

  perform private.hiz_kontrol('wa_gonderim', 20, interval '1 hour',
    'Çok fazla WhatsApp gönderimi denendi. Bir saat içinde en fazla 20 gönderim yapılabilir.');

  return private.wa_kuyruga_al(v_kulup, p_tur, p_sablon_ad, p_alicilar, 'duyuru', p_kaynak_id);
end;
$$;

revoke all     on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) from public, anon;
grant  execute on function public.wa_duyuru_kuyruga_al(text, text, jsonb, uuid) to authenticated;


-- ===========================================================================
-- 3) net._http_response — işlenen yanıt satırını sil (pencere 6 saat → ~1 dk)
-- ===========================================================================
-- Gövde 0043'teki ile aynı; tek fark: her daldan sonra yanıt satırı siliniyor.
create or replace function private.wa_yanit_isle()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_kod   int;
  v_islem int := 0;
begin
  for r in
    select g.id, g.kulup_id, g.deneme, g.alici_telefon, g.istek_id,
           y.status_code, y.content, y.error_msg, y.timed_out
      from public.wa_giden g
      join net._http_response y on y.id = g.istek_id
     where g.durum = 'gonderildi'
     limit 500
  loop
    v_islem := v_islem + 1;

    if r.timed_out or r.error_msg is not null then
      update public.wa_giden
         set durum = case when r.deneme >= 3 then 'basarisiz' else 'bekliyor' end,
             sonraki_deneme = now() + (interval '2 minutes' * r.deneme),
             hata_metni = coalesce(r.error_msg, 'zaman aşımı')
       where id = r.id;

    elsif r.status_code between 200 and 299 then
      update public.wa_giden
         set durum = 'kabul_edildi',
             wamid = r.content::jsonb #>> '{messages,0,id}',
             hata_kodu = null, hata_metni = null
       where id = r.id;

    else
      v_kod := nullif(r.content::jsonb #>> '{error,code}', '')::int;

      if v_kod in (190, 200) then
        update public.wa_hesap
           set aktif = false,
               devre_disi_sebep = 'Erişim jetonu geçersiz (Meta hata ' || v_kod || '). Panelden yeniden bağlanın.'
         where kulup_id = r.kulup_id;
        update public.wa_giden
           set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = 'Erişim jetonu geçersiz'
         where id = r.id;

      elsif v_kod = 131026 then
        insert into public.wa_onay (kulup_id, telefon, durum, kaynak)
        values (r.kulup_id, r.alici_telefon, 'whatsapp_yok', 'Meta 131026')
        on conflict (kulup_id, telefon) do update set durum = 'whatsapp_yok', guncelleme = now();
        update public.wa_giden
           set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = 'Numara WhatsApp kullanmıyor'
         where id = r.id;

      elsif v_kod in (4, 80007, 130429, 131000, 131016, 131056, 131057) or r.status_code >= 500 then
        update public.wa_giden
           set durum = case when r.deneme >= 5 then 'basarisiz' else 'bekliyor' end,
               sonraki_deneme = now() + (interval '5 minutes' * r.deneme),
               hata_kodu = v_kod, hata_metni = left(r.content, 300)
         where id = r.id;

      else
        update public.wa_giden
           set durum = 'basarisiz', hata_kodu = v_kod, hata_metni = left(r.content, 300)
         where id = r.id;
      end if;
    end if;

    -- 0046: yanıt işlendi; PUBLIC'e açık tabloda 6 saat daha durmasın.
    delete from net._http_response where id = r.istek_id;
  end loop;

  return v_islem;
end;
$$;

revoke all     on function private.wa_yanit_isle() from public, anon, authenticated;
grant  execute on function private.wa_yanit_isle() to service_role;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'wa_giden_tavan'
                   and tgrelid = 'public.wa_giden'::regclass) then
    raise exception '0046: wa_giden_tavan tetikleyicisi kurulmadı.';
  end if;
  if has_function_privilege('authenticated', 'private.wa_yanit_isle()', 'EXECUTE') then
    raise exception '0046: wa_yanit_isle yeniden authenticated rolüne açıldı.';
  end if;
  if not has_function_privilege('authenticated',
       'public.wa_duyuru_kuyruga_al(text,text,jsonb,uuid)', 'EXECUTE') then
    raise exception '0046: sarmalayıcı authenticated tarafından çağrılamıyor — fazla kısıldı.';
  end if;
  raise notice '0045 tamam: gönderim tavanı tetikleyicide, alıcı sınırı sarmalayıcıda, yanıt satırları temizleniyor.';
end $$;
