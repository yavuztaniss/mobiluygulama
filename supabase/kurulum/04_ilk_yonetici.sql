-- =============================================================================
-- 04_ilk_yonetici.sql — Kulübün ilk yönetici hesabını yetkilendirir (ZORUNLU)
-- =============================================================================
--
-- NEDEN GEREKLİ:
--   Güvenlik gereği davetsiz kayıt olan HERKES 'veli' rolüyle açılır —
--   handle_new_user() trigger'ı istemciden gelen rol bilgisini bilerek yok sayar
--   (bkz. 01_sema.sql bölüm 13.2). Bu, kimsenin kendini yönetici yapamamasını
--   sağlar.
--
--   Ama bu kural yeni bir kurulumu KİLİTLER: panele yalnızca yönetici/muhasebeci
--   girebilir, yeni yönetici davet etmek de yönetici olmayı gerektirir. Yani ilk
--   yönetici, veritabanı üzerinden bir kez elle yetkilendirilmek zorundadır.
--   Sonraki tüm kullanıcılar panelden davet linkiyle (0022) eklenir.
--
-- ÇALIŞTIRMA SIRASI:
--   1) kurulum/01_sema.sql
--   2) kurulum/02_katalog.sql
--   3) kurulum/03_kulup_olustur.sql
--   4) İLK YÖNETİCİNİN HESABINI AÇIN (aşağıdaki ön koşul)
--   5) kurulum/04_ilk_yonetici.sql   <-- bu dosya
--   6) (yalnızca demo/satış ortamında) demo/karsiyaka_demo.sql
--
--   ✔ Bu altı adım YETERLİDİR: 01_sema.sql migration 0001–0025'in nihai halini
--     içerir. app/supabase/migrations/ altındaki dosyaları ayrıca çalıştırmayın.
--
-- ÖN KOŞUL — ÖNCE HESAP OLUŞTURULMALI:
--   Bu dosya var olan bir hesabı yetkilendirir, sıfırdan hesap OLUŞTURMAZ.
--   Kulüp yöneticisi önce hesabını açmalı. İki yol var:
--     a) Mobil uygulamadan "Kayıt Ol" ile kendi e-postası ve şifresiyle, veya
--     b) Supabase paneli > Authentication > Users > "Add user" ile.
--   Hesap oluştuktan sonra aşağıdaki e-postayı değiştirip bu dosyayı çalıştırın.
--
--   ⚠ Hesap 03_kulup_olustur.sql'den SONRA açılmalıdır: handle_new_user()
--     sistemde hiç kulüp yoksa açık bir exception atar, hesap oluşmaz.
--
-- =============================================================================
-- ÇOK KİRACILILIK NOTU (0021 + 0022)
--   Yöneticinin profiles.kulup_id'si DOLU olmak zorundadır. NULL kalırsa 55
--   restrictive politikada `kulup_id = NULL` karşılaştırması NULL üretir ve satır
--   reddedilir: kullanıcı giriş yapar, KENDİ PROFİLİNİ bile okuyamaz. Sessiz ve
--   teşhisi zor bir kilitlenmedir.
--   Normalde kulup_id'yi handle_new_user() doldurur (tek kulüp varsa otomatik,
--   davet linkiyle gelindiyse davetten). Aşağıdaki blok yine de GARANTİLER:
--   kulup_id boşsa kulübe bağlar, doğrulama bölümü de açıkça kontrol eder.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BURAYI DEĞİŞTİRİN: kulübün ilk yöneticisinin e-posta adresi
-- -----------------------------------------------------------------------------
do $$
declare
  hedef_eposta text := 'yonetici@kulup.com';   -- <<< DEĞİŞTİRİN
  hedef_ad     text := 'Kulüp Yöneticisi';     -- <<< DEĞİŞTİRİN (profil adı)
  -- Birden fazla kulüp varsa hangisine bağlanacağı buradan belirtilir.
  -- null bırakılırsa sistemde TEK kulüp olması beklenir (ilk kurulum durumu).
  hedef_slug   text := null;                   -- ör. 'spor-kulubu'

  hedef_id     uuid;
  v_kulup      uuid;
  v_durum      text;
  v_mevcut     uuid;
  v_adet       int;
begin
  -- --- 1) Hesap var mı?
  select id into hedef_id from auth.users where email = hedef_eposta;

  if hedef_id is null then
    raise exception
      'Bu e-postaya sahip bir kullanıcı yok: %. Önce hesabı oluşturun (uygulamadan Kayıt Ol ya da Supabase > Authentication > Add user), sonra bu dosyayı tekrar çalıştırın.',
      hedef_eposta;
  end if;

  -- --- 2) Hedef kulübü çöz.
  if hedef_slug is not null then
    select id, durum into v_kulup, v_durum from public.kulup where slug = hedef_slug;
    if v_kulup is null then
      raise exception 'Bu slug ile kulüp yok: %. kurulum/03_kulup_olustur.sql çalıştırıldı mı?', hedef_slug;
    end if;
  else
    select count(*) into v_adet from public.kulup;
    if v_adet = 0 then
      raise exception 'Hiç kulüp yok. Önce kurulum/03_kulup_olustur.sql çalıştırılmalı.';
    elsif v_adet > 1 then
      raise exception 'Sistemde % kulüp var; hangisine bağlanacağı belirsiz. Yukarıdaki hedef_slug değişkenini doldurun.', v_adet;
    end if;
    select id, durum into v_kulup, v_durum from public.kulup;
  end if;

  -- --- 3) Rolü ver + kulup_id'yi GARANTİLE.
  -- Trigger (on_profile_role_protect) yalnızca `authenticated` rolündeki
  -- isteklerde rol/şube/kulüp değişimini engeller; SQL Editor `postgres` rolüyle
  -- çalıştığı için bu güncelleme geçer — trigger'ı devre dışı bırakmaya gerek YOK.
  --
  -- kulup_id yalnızca BOŞSA yazılıyor (coalesce): kullanıcı zaten bir kulübe
  -- bağlıysa bu dosya onu başka bir kulübe TAŞIMAZ. Yanlış kulüpteyse önce
  -- durumu inceleyin — sessizce kiracı değiştirmek veri sızıntısı üretir.
  update public.profiles
     set role     = 'yonetici',
         ad       = coalesce(nullif(ad, ''), hedef_ad),
         kulup_id = coalesce(kulup_id, v_kulup)
   where id = hedef_id
   returning kulup_id into v_mevcut;

  if not found then
    -- profiles satırı normalde handle_new_user trigger'ı ile otomatik oluşur;
    -- hesap trigger kurulmadan önce açıldıysa satır eksik olabilir.
    insert into public.profiles (id, role, ad, kulup_id)
    values (hedef_id, 'yonetici', hedef_ad, v_kulup);
    v_mevcut := v_kulup;
    raise notice 'profiles satırı yoktu, yönetici olarak oluşturuldu: %', hedef_eposta;
  else
    raise notice 'Yönetici yetkisi verildi: %', hedef_eposta;
  end if;

  if v_mevcut is distinct from v_kulup then
    raise warning 'Yönetici zaten BAŞKA bir kulübe bağlıydı (kulup_id=%), taşınmadı. Hedef kulüp: %.', v_mevcut, v_kulup;
  end if;

  if v_durum <> 'aktif' then
    -- NOT: RAISE'in biçim dizesi yalnızca `%` yer tutucusunu tanır (`%L` / `%I`
    -- format() fonksiyonuna aittir), o yüzden tırnaklar elle yazılıyor.
    raise warning 'Hedef kulübün durumu ''%'' — yönetici giriş yapar ama hiçbir veri göremez. Açmak için: update public.kulup set durum = ''aktif'' where id = ''%'';', v_durum, v_kulup;
  end if;

  -- --- 4) Hedefi aşağıdaki doğrulama bloğuna aktar.
  -- PL/pgSQL değişkenleri DO blokları arasında taşınmaz; doğrulama ayrı bir
  -- blokta olduğu için hedef kiracıyı oturum değişkeniyle geçiriyoruz. Aksi
  -- halde doğrulama TÜM kulüpleri sayar ve ikinci bir kulüp kurulurken, bu
  -- kurulum yarım kalmış olsa bile "Kurulum tamam" der (yanlış pozitif).
  perform set_config('kurulum.hedef_kulup',  v_kulup::text,  false);
  perform set_config('kurulum.hedef_profil', hedef_id::text, false);
end $$;


-- -----------------------------------------------------------------------------
-- DOĞRULAMA — HEDEF KULÜPTE en az bir yönetici olmalı VE kulübe bağlı olmalı
-- -----------------------------------------------------------------------------
-- ⚠ HER SORGU HEDEF KİRACIYA DARALTILMIŞTIR. Kulüp bazında değil proje bazında
--   sayan bir doğrulama çok kiracılı bir projede yanıltıcıdır: ikinci kulübün
--   kurulumunda BİRİNCİ kulübün yöneticisi sayıma girer, blok "Kurulum tamam"
--   der ve yeni kulübün yöneticisiz kaldığı ancak panele girilince anlaşılır.
--   Hedef kulüp / hedef profil yukarıdaki bloktan oturum değişkeniyle gelir.
do $$
declare
  v_kulup         uuid := nullif(current_setting('kurulum.hedef_kulup',  true), '')::uuid;
  v_profil        uuid := nullif(current_setting('kurulum.hedef_profil', true), '')::uuid;
  v_kulup_ad      text;
  yonetici_sayisi int;
  kulupsuz_sayisi int;
  pasif_sayisi    int;
begin
  if v_kulup is null or v_profil is null then
    raise exception 'Hedef kulüp okunamadı — bu dosya baştan sona TEK SEFERDE çalıştırılmalı; hedefi yukarıdaki blok belirliyor.';
  end if;

  select ad into v_kulup_ad from public.kulup where id = v_kulup;

  select count(*) into yonetici_sayisi
    from public.profiles where role = 'yonetici' and kulup_id = v_kulup;

  if yonetici_sayisi = 0 then
    raise exception 'Hedef kulüpte (%) hiç yönetici yok — kurulum kilitli kalır, yukarıdaki bloğu kontrol edin.', v_kulup;
  end if;

  -- kulup_id'si boş yönetici = sessiz kilitlenme (restrictive politikalar
  -- NULL karşılaştırmasında her satırı reddeder). Uyarı değil HATA veriyoruz:
  -- bu durumda panel açılır ama bomboş görünür ve sebebi bulunamaz.
  -- Bu sorgu doğası gereği kulüple filtrelenemez (aranan şey zaten kulüpsüzlük),
  -- o yüzden HEDEF PROFİLE daraltıldı: başka bir kulübün kopuk yöneticisi bu
  -- kurulumu durdurmasın.
  select count(*) into kulupsuz_sayisi
    from public.profiles where id = v_profil and role = 'yonetici' and kulup_id is null;

  if kulupsuz_sayisi > 0 then
    raise exception
      'Yetkilendirilen yönetici hiçbir kulübe bağlı değil (profiles.kulup_id IS NULL). Bu hesap giriş yapar ama hiçbir veri göremez. Düzeltme: update public.profiles set kulup_id = ''%'' where id = ''%'';',
      v_kulup, v_profil;
  end if;

  -- Kulübü 'aktif' olmayan yönetici de aynı sonucu yaşar; burada exception değil
  -- uyarı, çünkü bu bilinçli bir askıya alma da olabilir.
  select count(*) into pasif_sayisi
    from public.profiles p
    join public.kulup k on k.id = p.kulup_id
   where p.role = 'yonetici' and p.kulup_id = v_kulup and k.durum <> 'aktif';

  if pasif_sayisi > 0 then
    raise warning 'Hedef kulübün durumu ''aktif'' değil — % yönetici giriş yapar ama hiçbir veri göremez.', pasif_sayisi;
  end if;

  raise notice 'Kurulum tamam: "%" kulübünde % yönetici hesabı var, hepsi kulübe bağlı.', coalesce(v_kulup_ad, v_kulup::text), yonetici_sayisi;
end $$;


-- =============================================================================
-- Kurulum tamamlandı. Bundan sonrası panelden:
--   • Ayarlar > Genel        → kulüp adı, iletişim bilgileri
--   • Davetler               → yönetici/muhasebeci/antrenör/veli davet linkleri
--   • Gruplar                → antrenman gruplarını oluştur
--   • Sporcular              → sporcuları ekle
--
-- Yönetici dışındaki roller (antrenör, muhasebeci, veli) panelden ÜRETİLEN DAVET
-- LİNKİYLE eklenir: rol ve kulüp bilgisi davet kaydından gelir, istemciden değil
-- (0022). Sistemde tek kulüp varsa veliler davetsiz de kayıt olabilir; birden
-- fazla kulüp varsa davet linki ZORUNLUDUR.
-- =============================================================================
