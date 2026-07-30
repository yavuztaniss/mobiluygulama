-- ===========================================================================
-- 0035 — 0034'teki yönetici kilidinin baypas edilebilir olması (DÜZELTME)
-- ===========================================================================
-- HATA
--   0034'ün tetikleyicisi yetkiyi VERİTABANI ROLÜNDEN okuyordu:
--
--     if private.current_profile_role() = 'yonetici' then reddet
--
--   Bu, isteğin `authenticated` rolüyle geldiği varsayımına dayanıyordu. Oysa
--   panelin kendi davet ucu (admin-panel/app/api/admin/kullanici-davet/route.ts)
--   satırı `service_role` ile yazıyor — çünkü kulup_id'yi açıkça geçmesi
--   gerekiyor. service_role bağlamında auth.uid() NULL, dolayısıyla
--   current_profile_role() de NULL: koşul hiç tutmuyor ve kilit AÇILIYOR.
--
--   Sonuç: kulüp yöneticisi, Ayarlar > Kullanıcılar ekranından istediği kadar
--   yönetici hesabı davet etmeye devam edebiliyordu. 0034 yalnızca hiç
--   kullanılmayan doğrudan-istemci yolunu kapatmıştı.
--
--   Yerelde ölçüldü: service_role ile yapılan yönetici daveti GEÇTİ.
--
-- DOĞRU YAKLAŞIM: YETKİYİ VERİTABANI ROLÜNDEN DEĞİL, SATIRIN KENDİSİNDEN OKU.
--   Her iki yol da davet satırına `olusturan_id` yazıyor:
--     · platform konsolu → platform_admin'in kimliği
--     · kulüp paneli     → kulüp yöneticisinin kimliği
--   Tetikleyici artık O KİŞİNİN ROLÜNE bakıyor. Hangi veritabanı rolüyle
--   yazıldığı önemsiz hale geliyor; yetkinin kaynağı isteğin taşıdığı kimlik.
--
--   FAIL-CLOSED: olusturan_id NULL ise (kimin yaptığı bilinmiyorsa) REDDEDİLİR.
--   Bilinmeyen bir kaynağın yönetici üretmesine izin vermek, kilidin tamamını
--   anlamsız kılardı.
--
-- ⚠ ARTIK RİSK: doğrudan SQL erişimi olan biri (Supabase SQL Editor) hâlâ
--   yönetici üretebilir. Bu kabul edilebilir — o erişime sahip olan zaten
--   veritabanının sahibidir ve kilidin kendisini de kaldırabilir. Kilit
--   uygulama yollarını kapatmak içindir, veritabanı sahibine karşı değil.
--
-- ÇALIŞTIRMA: 0034'ten sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

create or replace function public.protect_yonetici_daveti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kilitli    boolean;
  v_olusturan  app_role;
begin
  if new.rol <> 'yonetici' then
    return new;   -- antrenör/muhasebeci/veli daveti serbest
  end if;

  select k.yonetici_davet_kilitli into v_kilitli
    from public.kulup k where k.id = new.kulup_id;

  if coalesce(v_kilitli, true) = false then
    return new;   -- bu kulüp için kilit açılmış
  end if;

  -- YETKİ SATIRDAN OKUNUYOR (0034'teki hatanın düzeltmesi).
  -- Fonksiyon SECURITY DEFINER olduğu için profiles'ı RLS'e takılmadan okur;
  -- bu şart, çünkü kulüp yöneticisi platform_admin satırını göremez.
  select p.role into v_olusturan
    from public.profiles p where p.id = new.olusturan_id;

  if v_olusturan = 'platform_admin' then
    return new;
  end if;

  raise exception 'Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından açılabilir. Yeni yönetici için sağlayıcınızla iletişime geçin.'
    using errcode = 'insufficient_privilege';
end;
$$;

-- Tetikleyici 0034'te kurulmuştu; create or replace function gövdeyi yerinde
-- değiştirdiği için yeniden bağlamaya gerek yok.

-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
--   -- service_role + olusturan_id YOK → REDDEDİLMELİ (fail-closed)
--   set local role service_role;
--   insert into public.davet (kulup_id, rol, ad) values ('<kulup>','yonetici','X');
--     → ERROR
--
--   -- service_role + olusturan_id = KULÜP YÖNETİCİSİ → REDDEDİLMELİ
--   insert into public.davet (kulup_id, rol, ad, olusturan_id)
--   values ('<kulup>','yonetici','X','<yonetici-uuid>');
--     → ERROR
--
--   -- service_role + olusturan_id = PLATFORM_ADMIN → GEÇMELİ
--   insert into public.davet (kulup_id, rol, ad, olusturan_id)
--   values ('<kulup>','yonetici','X','<platform-admin-uuid>');
--     → OK
-- ===========================================================================
