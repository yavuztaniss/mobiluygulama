-- =============================================================================
-- 03_ilk_yonetici.sql — Kulübün ilk yönetici hesabını yetkilendirir (ZORUNLU)
-- =============================================================================
--
-- NEDEN GEREKLİ:
--   Güvenlik gereği kayıt olan HERKES 'veli' rolüyle açılır — handle_new_user()
--   trigger'ı istemciden gelen rol bilgisini bilerek yok sayar (bkz. 01_sema.sql,
--   "handle_new_user" bölümü). Bu, kimsenin kendini yönetici yapamamasını sağlar.
--
--   Ama bu kural yeni bir kurulumu KİLİTLER: panele yalnızca yönetici/muhasebeci
--   girebilir, yeni yönetici davet etmek de yönetici olmayı gerektirir. Yani ilk
--   yönetici, veritabanı üzerinden bir kez elle yetkilendirilmek zorundadır.
--
-- ÇALIŞTIRMA SIRASI:
--   1) kurulum/01_sema.sql
--   2) kurulum/02_katalog.sql
--   3) kurulum/03_ilk_yonetici.sql   <-- bu dosya
--
-- ÖN KOŞUL — ÖNCE HESAP OLUŞTURULMALI:
--   Bu dosya var olan bir hesabı yetkilendirir, sıfırdan hesap OLUŞTURMAZ.
--   Kulüp yöneticisi önce hesabını açmalı. İki yol var:
--     a) Mobil uygulamadan "Kayıt Ol" ile kendi e-postası ve şifresiyle, veya
--     b) Supabase paneli > Authentication > Users > "Add user" ile.
--   Hesap oluştuktan sonra aşağıdaki e-postayı değiştirip bu dosyayı çalıştırın.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BURAYI DEĞİŞTİRİN: kulübün ilk yöneticisinin e-posta adresi
-- -----------------------------------------------------------------------------
do $$
declare
  hedef_eposta text := 'yonetici@kulup.com';   -- <<< DEĞİŞTİRİN
  hedef_ad     text := 'Kulüp Yöneticisi';     -- <<< DEĞİŞTİRİN (profil adı)
  hedef_id     uuid;
begin
  select id into hedef_id from auth.users where email = hedef_eposta;

  if hedef_id is null then
    raise exception
      'Bu e-postaya sahip bir kullanıcı yok: %. Önce hesabı oluşturun (uygulamadan Kayıt Ol ya da Supabase > Authentication > Add user), sonra bu dosyayı tekrar çalıştırın.',
      hedef_eposta;
  end if;

  -- Trigger (on_profile_role_protect) yalnızca `authenticated` rolündeki
  -- isteklerde rol değişimini engeller; SQL Editor `postgres` rolüyle çalıştığı
  -- için bu güncelleme geçer — trigger'ı devre dışı bırakmaya gerek YOKTUR.
  update profiles
     set role = 'yonetici',
         ad   = coalesce(nullif(ad, ''), hedef_ad)
   where id = hedef_id;

  if not found then
    -- profiles satırı normalde handle_new_user trigger'ı ile otomatik oluşur;
    -- hesap trigger kurulmadan önce açıldıysa satır eksik olabilir.
    insert into profiles (id, role, ad) values (hedef_id, 'yonetici', hedef_ad);
    raise notice 'profiles satırı yoktu, yönetici olarak oluşturuldu: %', hedef_eposta;
  else
    raise notice 'Yönetici yetkisi verildi: %', hedef_eposta;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- DOĞRULAMA — en az bir yönetici olmalı
-- -----------------------------------------------------------------------------
do $$
declare
  yonetici_sayisi int;
begin
  select count(*) into yonetici_sayisi from profiles where role = 'yonetici';
  if yonetici_sayisi = 0 then
    raise exception 'Hiç yönetici yok — kurulum kilitli kalır, yukarıdaki bloğu kontrol edin.';
  end if;
  raise notice 'Kurulum tamam: % yönetici hesabı var.', yonetici_sayisi;
end $$;


-- =============================================================================
-- Kurulum tamamlandı. Bundan sonrası panelden:
--   • Ayarlar > Genel        → kulüp adı, iletişim bilgileri
--   • Ayarlar > Kullanıcılar → diğer yönetici/muhasebeci hesaplarını davet et
--   • Gruplar                → antrenman gruplarını oluştur
--   • Antrenörler            → antrenörleri davet et
--   • Sporcular              → sporcuları ekle
--
-- Yönetici dışındaki roller (antrenör, muhasebeci) panelden davet edilir;
-- veliler uygulamadan kendileri kayıt olur.
-- =============================================================================
