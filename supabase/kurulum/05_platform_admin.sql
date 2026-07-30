-- =============================================================================
-- 05_platform_admin.sql — Süper-admin (platform sahibi) hesabını yetkilendirir
-- =============================================================================
--
-- BU DOSYA KİMİN İÇİN: yazılımın SAHİBİ için, kulüpler için değil.
--   platform_admin, /platform konsolunu (admin-panel/app/(platform)/**) açan
--   tek roldür: kulüp açma, askıya alma, abonelik yönetimi. Supabase projesi
--   başına bir kez çalıştırılır; her yeni kulüpte tekrarlanmaz.
--
-- NEDEN GEREKLİ:
--   Hiçbir kayıt akışı platform_admin ÜRETMEZ ve üretemez:
--     · handle_new_user() davetsiz kaydı her zaman 'veli' açar,
--     · davet tablosundaki rol kısıtı platform_admin'i BEYAZ LİSTE DIŞINDA
--       bırakır (0022 bölüm 2.2) — yani davet yolu platform sahipliğine
--       yükselmek için kullanılamaz.
--   Bu bilinçli: aksi halde davet linkini ele geçiren biri tüm kulüplerin
--   sahibi olurdu. Bedeli, ilk platform hesabının veritabanından bir kez elle
--   yetkilendirilmesidir — 04_ilk_yonetici.sql'in aynı mantığı.
--
-- ÇALIŞTIRMA SIRASI (temiz bir Supabase projesinde):
--   1) kurulum/01_sema.sql
--   2) kurulum/02_katalog.sql
--   3) kurulum/03_kulup_olustur.sql        ← EN AZ BİR KULÜP OLMALI, bkz. aşağı
--   4) PLATFORM HESABINI AÇIN (ön koşul)
--   5) kurulum/05_platform_admin.sql       <-- bu dosya
--   6) kurulum/04_ilk_yonetici.sql         (kulübün kendi yöneticisi için)
--
--   ⚠ NEDEN ÖNCE BİR KULÜP GEREKİYOR: handle_new_user() sistemde hiç kulüp
--     yokken açık bir exception atar ("Kulüp tanımlı değil"), yani SIFIR kulüplü
--     bir projede HİÇBİR hesap açılamaz — platform hesabı dahil. Bu yüzden
--     03_kulup_olustur.sql en az bir kez çalışmalıdır. Pratikte bu ilk kulüp
--     zaten senin kendi kulübün ya da demo kulübü olur. Sonraki tüm kulüpler
--     /platform konsolundan açılır, bir daha SQL'e dönülmez.
--
-- ÖN KOŞUL — ÖNCE HESAP OLUŞTURULMALI:
--   Bu dosya var olan bir hesabı yetkilendirir, sıfırdan hesap OLUŞTURMAZ.
--   Supabase paneli > Authentication > Users > "Add user" ile kendi e-postanla
--   bir hesap aç (şifreyi sen belirle), sonra aşağıdaki e-postayı değiştir.
--
-- ⚠ AYRI BİR E-POSTA KULLAN:
--   Bu hesap platform_admin olduktan sonra HİÇBİR kulüp verisini göremez ve
--   kulüp paneline giremez — 0021'in restrictive kiracı duvarı onu fail-closed
--   yapar (kulup_id NULL). Kendi kulübünü de yönetiyorsan İKİ AYRI HESABA
--   ihtiyacın var: biri platform konsolu, biri kulüp paneli. Aynı hesabı
--   platform_admin yaparsan kendi kulübünün panelinden düşersin.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BURAYI DEĞİŞTİRİN: platform sahibinin (senin) e-posta adresi
-- -----------------------------------------------------------------------------
do $$
declare
  hedef_eposta text := 'platform@ornek.com';   -- <<< DEĞİŞTİRİN
  hedef_ad     text := 'Platform Yöneticisi';  -- <<< DEĞİŞTİRİN (profil adı)

  hedef_id     uuid;
  v_eski_rol   text;
  v_eski_kulup uuid;
  v_veri_adet  int;
begin
  -- --- 1) Hesap var mı?
  select id into hedef_id from auth.users where email = hedef_eposta;

  if hedef_id is null then
    raise exception
      'Bu e-postaya sahip bir kullanıcı yok: %. Önce Supabase > Authentication > Users > "Add user" ile hesabı açın, sonra bu dosyayı tekrar çalıştırın.',
      hedef_eposta;
  end if;

  -- --- 2) Mevcut durumu oku (uyarı üretmek için).
  select role::text, kulup_id into v_eski_rol, v_eski_kulup
    from public.profiles where id = hedef_id;

  -- Bu hesap bir kulübün TEK yöneticisiyse, platform_admin yapmak o kulübü
  -- yöneticisiz bırakır: kimse panele giremez, yeni yönetici davet edemez ve
  -- kurtarma yolu yine SQL olur. Sessizce yapmak yerine burada DURUYORUZ.
  if v_eski_rol = 'yonetici' and v_eski_kulup is not null then
    select count(*) into v_veri_adet
      from public.profiles
     where role = 'yonetici' and kulup_id = v_eski_kulup and id <> hedef_id;

    if v_veri_adet = 0 then
      raise exception
        'Bu hesap (%) şu anda bir kulübün TEK yöneticisi (kulup_id=%). platform_admin yapılırsa o kulüp yöneticisiz kalır ve panele kimse giremez. Önce o kulübe ikinci bir yönetici davet edin, ya da platform için AYRI bir e-posta kullanın.',
        hedef_eposta, v_eski_kulup;
    end if;

    raise warning 'Bu hesap "%" kulübünün yöneticisiydi; platform_admin olduktan sonra o kulüp paneline GİREMEZ. Kulüpte % yönetici daha var, kilitlenme olmayacak.',
      v_eski_kulup, v_veri_adet;
  end if;

  -- --- 3) Rolü ver + kulup_id'yi BOŞALT.
  -- kulup_id NULL olmak ZORUNDA (0026 check kısıtı bunu ayrıca zorluyor):
  -- dolu kalırsa restrictive kiracı duvarı o kulüp için AÇILIR ve süper-admin
  -- o kulübün verisini anon key ile okumaya başlar. Tasarımın tamamı bu alanın
  -- NULL olmasına dayanıyor.
  --
  -- Trigger (on_profile_role_protect) yalnızca `authenticated` rolündeki
  -- isteklerde rol/kulüp değişimini engeller; SQL Editor `postgres` ile
  -- çalıştığı için bu güncelleme geçer.
  update public.profiles
     set role     = 'platform_admin',
         ad       = coalesce(nullif(ad, ''), hedef_ad),
         kulup_id = null
   where id = hedef_id;

  if not found then
    insert into public.profiles (id, role, ad, kulup_id)
    values (hedef_id, 'platform_admin', hedef_ad, null);
    raise notice 'profiles satırı yoktu, platform_admin olarak oluşturuldu: %', hedef_eposta;
  else
    raise notice 'Platform yetkisi verildi: %', hedef_eposta;
  end if;

  perform set_config('kurulum.platform_profil', hedef_id::text, false);
end $$;


-- -----------------------------------------------------------------------------
-- DOĞRULAMA
-- -----------------------------------------------------------------------------
do $$
declare
  v_profil    uuid := nullif(current_setting('kurulum.platform_profil', true), '')::uuid;
  v_rol       text;
  v_kulup     uuid;
  v_kisit     int;
  v_toplam    int;
begin
  if v_profil is null then
    raise exception 'Hedef hesap okunamadı — bu dosya baştan sona TEK SEFERDE çalıştırılmalı.';
  end if;

  select role::text, kulup_id into v_rol, v_kulup from public.profiles where id = v_profil;

  if v_rol is distinct from 'platform_admin' then
    raise exception 'Rol atanamadı (şu an: %).', coalesce(v_rol, '(profil yok)');
  end if;

  -- Bu iki kontrol birbirinin yedeği: kısıt varsa NULL zaten garantidir, ama
  -- kısıt 0026 çalıştırılmadan da bu dosya çalışabilir (eski bir kurulum).
  if v_kulup is not null then
    raise exception 'kulup_id boşaltılamadı (kulup_id=%). Bu hesap o kulübün verisini anon key ile OKUYABİLİR — düzeltilmeden bırakılmamalı.', v_kulup;
  end if;

  select count(*) into v_kisit from pg_constraint
   where conname = 'profiles_platform_admin_kulupsuz';

  if v_kisit = 0 then
    raise warning 'profiles_platform_admin_kulupsuz kısıtı yok (0026 çalıştırılmamış). Kural bugün sağlanıyor ama ileride bozulabilir.';
  end if;

  select count(*) into v_toplam from public.profiles where role = 'platform_admin';

  raise notice 'Platform kurulumu tamam: % platform_admin hesabı var, hepsi kulüpsüz. Panel girişi: /login → /platform', v_toplam;
end $$;


-- =============================================================================
-- Bundan sonrası /platform konsolundan:
--   • Kulüpler > Yeni Kulüp  → kulüp + şube + ayarlar + bayraklar + yönetici daveti
--   • Kulüp detayı           → askıya alma (abonelik kesme anahtarı), plan, limit
--
-- Bu hesapla kulüp paneline (/) GİREMEZSİN — bilerek. Kendi kulübünü yönetmek
-- için ayrı bir yönetici hesabı kullan (kurulum/04_ilk_yonetici.sql).
-- =============================================================================
