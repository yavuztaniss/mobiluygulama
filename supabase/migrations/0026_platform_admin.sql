-- ===========================================================================
-- 0026_platform_admin.sql — Süper-admin hesabını yapısal olarak sağlama alma
-- ===========================================================================
-- BAĞLAM
--   0021 çok kiracılılığı kurarken platform_admin rolünü "kulup_id'si NULL olan
--   kullanıcı" olarak tanımladı: restrictive kiracı duvarı `kulup_id =
--   current_kulup_id()` dediği ve iki taraf da NULL olduğu için karşılaştırma
--   NULL üretir, satır reddedilir. Yani platform_admin normal API üzerinden
--   HİÇBİR kulüp verisini göremez ve yalnızca service_role paneliyle çalışır.
--   Bu bilinçli tasarımın tamamı TEK BİR VARSAYIMA dayanıyor:
--   platform_admin.kulup_id NULL'dur.
--
--   Bu varsayım bugüne kadar hiçbir yerde ZORLANMIYORDU. Bir platform_admin
--   satırına yanlışlıkla kulup_id yazılırsa (elle SQL, veri taşıma, ileride
--   yazılacak bir panel işlemi) iki şey birden bozulur:
--
--     1) GÜVENLİK: kulup_id dolduğu an restrictive duvar o kulüp için AÇILIR.
--        Süper-admin, anon key + kendi JWT'siyle o kulübün sporcularını,
--        ödemelerini, mesajlarını okumaya başlar. Tasarım "service_role dışında
--        hiçbir şey göremez" derken, kod sessizce bunun tersini yapar.
--
--     2) ERİŞİM: proxy.ts ve login/actions.ts "profil satırı OKUNAMIYORSA bu
--        kişi platform_admin olabilir" mantığını kullanıyordu. Satır okunabilir
--        hale geldiği an bu tahmin yanlışlanır ve süper-admin KENDİ konsoluna
--        giremez ("Bu panel yalnızca yönetici ve muhasebe personeli içindir").
--
--   Bu migration varsayımı veritabanı kısıtına çevirir. Uygulama tarafındaki
--   tahmin de açık rol testine dönüştürüldü (proxy.ts, login/actions.ts) —
--   ikisi birbirinin yedeği, tek başına hiçbiri yeterli değil.
--
-- BÖLÜMLER
--   1) Mevcut aykırı satırların normalleştirilmesi
--   2) CHECK kısıtı
--   3) Doğrulama
--
-- ÇALIŞTIRMA
--   0021'den sonra, herhangi bir anda. Tekrar çalıştırılabilir (idempotent).
-- ===========================================================================


-- ===========================================================================
-- 1) MEVCUT AYKIRI SATIRLAR
-- ===========================================================================
-- Kısıt eklenmeden önce mevcut veri uyumlu hale getirilmeli, aksi halde ALTER
-- TABLE "check constraint is violated by some row" ile patlar ve migration
-- yarıda kalır. Aykırı satır normalde YOKTUR (platform_admin yalnızca elle
-- oluşturuluyor); bu blok yine de sessizce değil GÜRÜLTÜLÜ davranıyor: kaç
-- satırın düzeltildiğini raporluyor, çünkü bu satırların her biri yukarıdaki
-- (1) numaralı güvenlik açığının fiilen açık olduğu anlamına gelir.
do $$
declare
  v_adet int;
begin
  update public.profiles
     set kulup_id = null
   where role = 'platform_admin'
     and kulup_id is not null;

  get diagnostics v_adet = row_count;

  if v_adet > 0 then
    raise notice '0026: % adet platform_admin satırında kulup_id doluydu, NULL''a çekildi. Bu hesaplar o kulübün verisini anon key ile OKUYABİLİYORDU.', v_adet;
  else
    raise notice '0026: aykırı platform_admin satırı yok.';
  end if;
end
$$;


-- ===========================================================================
-- 2) CHECK KISITI
-- ===========================================================================
-- Okunuşu: "rol platform_admin İSE kulup_id NULL olmalı".
--
-- TERSİ NEDEN ZORLANMIYOR (kulüp rolü ⇒ kulup_id NOT NULL):
--   Kulüp rolü taşıyan ve kulup_id'si NULL olan bir hesap TEHLİKELİ DEĞİLDİR —
--   restrictive duvar onu da fail-closed yapar, kullanıcı hiçbir şey göremez.
--   Yani bu bozuk bir hesaptır, sızdıran bir hesap değil. Kısıt olarak eklemek
--   ise gerçek bir risk taşırdı: profiles satırının kulup_id'siz oluştuğu bir
--   ara durum ileride bir kayıt akışında ortaya çıkarsa kayıt tümüyle
--   reddedilirdi. Güvenlik kazancı olmayan bir kısıt için bu takas yanlış.
--
-- Kısıt drop → add ile ekleniyor (0021/0022 deseni): "add constraint if not
-- exists" PostgreSQL'de yok, bu desen her koşulda yakınsar.
alter table public.profiles drop constraint if exists profiles_platform_admin_kulupsuz;
alter table public.profiles add constraint profiles_platform_admin_kulupsuz
  check (role <> 'platform_admin' or kulup_id is null);

comment on constraint profiles_platform_admin_kulupsuz on public.profiles is
  'platform_admin kulüpsüzdür (0026). kulup_id dolarsa 0021 restrictive kiracı duvarı o kulüp için açılır ve süper-admin kulüp verisini anon key ile okur.';


-- ===========================================================================
-- 3) DOĞRULAMA
-- ===========================================================================
--   -- Kısıt yerinde mi? (1 dönmeli)
--   select count(*) from pg_constraint
--    where conname = 'profiles_platform_admin_kulupsuz';
--
--   -- Kısıt gerçekten tutuyor mu? (hata vermeli)
--   update public.profiles set kulup_id = (select id from public.kulup limit 1)
--    where role = 'platform_admin';
--   → ERROR: new row for relation "profiles" violates check constraint
--
--   -- Süper-admin hesabı oluşturma: kurulum/05_platform_admin.sql
-- ===========================================================================
