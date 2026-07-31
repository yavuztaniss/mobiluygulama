-- ===========================================================================
-- 0040 — Denetim bulguları: verilmiş dersin iadesi + davet tetikleyicisi kilidi
-- ===========================================================================
-- Kaynak: periyodik güvenlik denetimi (0037 sonrası tur). İki bulgu da 0037'nin
-- kendi açtığı sorunlar; ikisi de yerelde SÖMÜRÜLEREK kanıtlandı.
--
--
-- ===========================================================================
-- BULGU 1 — TEK PAKETLE SINIRSIZ DERS
-- ===========================================================================
-- 0037'nin `paket_iade` tetikleyicisi yalnızca "iade edilmemiş durumdan iade
-- edilen duruma geçiş" kontrolü yapıyor, DERSİN VERİLİP VERİLMEDİĞİNE bakmıyor.
-- Veli'nin iptal politikası da (0013) `durum in ('onay_bekliyor','onaylandi')`
-- diyor, tarih koşulu taşımıyor.
--
-- SÖMÜRÜ (ölçüldü):
--   1. Veli 5 derslik paket alır.                        kalan = 5
--   2. Geçmiş tarihli ders için rezervasyon açar,
--      antrenör onaylar, ders verilir.                   kalan = 4
--   3. Antrenör 'tamamlandi' işaretlemeden önce
--      veli kendi JWT'siyle durum='iptal' yazar.         kalan = 5   ← AÇIK
--   Ders alınmış, hak geri gelmiş. Rezervasyon 'iptal' olduğu için antrenörün
--   hakedişine de girmiyor (getKazancOzet yalnızca 'tamamlandi' sayıyor).
--   Kulüp dersi verir, hiçbir şey tahsil etmez. Döngü tekrarlanabilir.
--
--   Tek fren antrenörün dersi zamanında 'tamamlandi' işaretlemesiydi — yani
--   bir güvenlik kuralı, insanın hatırlamasına bağlıydı.
--
-- ÇÖZÜM — İKİ KATMAN, İKİ FARKLI İŞ:
--
--   (a) TETİKLEYİCİ = GÜVENLİK DEĞİŞMEZİ. "Verilmiş ders iade edilmez."
--       Herkes için geçerli: veli, antrenör, yönetici, service_role. Tetikleyici
--       seçildi çünkü RLS politikaları postgres ve service_role'ü baypas eder;
--       para ile ilgili bir değişmez orada duramaz.
--
--   (b) RLS POLİTİKASI = İŞ KURALI. "Veli geçmiş bir dersi iptal edemez."
--       Yalnızca gerçek kullanıcılar için geçerli ve doğru yer burası: iptalin
--       kendisi de yanlış, sadece iadesi değil. Geçmiş bir rezervasyonu iptale
--       çevirmek geçmişi yeniden yazmaktır ve antrenörün hakediş kaydını da
--       sessizce etkiler.
--
--       Tek katman yeterli olmazdı: yalnızca (b) olsaydı yönetici/service_role
--       yolu açık kalırdı; yalnızca (a) olsaydı veli iptali BAŞARILI olur ama
--       sessizce iade almazdı — ekranda hata görmediği için "kayboldu" derdi.
--
-- ⚠ KABUL EDİLEN KISITLAMA — AYNI GÜN İPTAL ARTIK MÜMKÜN DEĞİL.
--   Koşul `tarih > current_date`, yani veli yalnızca GELECEK GÜNE ait dersi
--   iptal edebiliyor. Sömürü tam olarak aynı gün gerçekleşiyor (derse git,
--   antrenör işaretlemeden iptal et), o yüzden kapatılması gereken tam bu aralık.
--   Meşru aynı gün iptali (çocuk hastalandı) artık antrenör ya da yönetici
--   üzerinden yapılır — ikisi de dersin gerçekten verilmediğini bilebilecek
--   taraflar. Bu bir ürün kararıdır ve bilinçlidir.
--
-- ⚠ YÖNETİCİNİN ELİ BAĞLANMIYOR. Tetikleyici yöneticinin de otomatik iadesini
--   durdurur, ama yöneticinin `bireysel_paket` üzerinde doğrudan UPDATE
--   politikası var: hakkı gerçekten geri vermesi gerekiyorsa `kalan`'ı açıkça
--   yazar. Örtük bir yan etki yerine bilinçli ve izlenebilir bir işlem — istenen
--   davranış bu.

create or replace function public.paket_iade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.odeme_tipi <> 'paket' or new.paket_id is null then
    return new;
  end if;

  if new.durum in ('reddedildi', 'iptal')
     and old.durum not in ('reddedildi', 'iptal')
     -- 0040: DERS VERİLMEMİŞ OLMALI. Bu koşul olmadan geçmiş tarihli bir
     -- rezervasyonun iptali, alınmış dersin hakkını geri veriyordu.
     and new.tarih > current_date then
    -- kalan, toplam'ı aşmasın: bozuk bir veri düzeltmesi paketi şişirmesin.
    update public.bireysel_paket
       set kalan = least(kalan + 1, toplam)
     where id = new.paket_id;
  end if;

  return new;
end;
$$;

-- (b) Veli yalnızca GELECEK bir dersi iptal edebilir.
drop policy if exists "bireysel_rezervasyon: veli kendi rezervasyonunu iptal eder" on public.bireysel_rezervasyon;
create policy "bireysel_rezervasyon: veli kendi rezervasyonunu iptal eder" on public.bireysel_rezervasyon for update
  using (
    durum in ('onay_bekliyor', 'onaylandi')
    -- 0040: geçmiş ders iptal edilemez (bkz. başlık, Bulgu 1).
    and tarih > current_date
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  )
  with check (
    durum = 'iptal'
    and tarih > current_date
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );


-- ===========================================================================
-- BULGU 2 — 0040 ÖNCESİ TETİKLEYİCİ MEŞRU YÖNETİCİ DAVETLERİNİ ÖLDÜRÜYOR
-- ===========================================================================
-- 0037, `protect_yonetici_daveti` tetikleyicisini `before insert` iken
-- `before insert OR UPDATE` yaptı. Amaç doğruydu: bir daveti sonradan
-- `rol='yonetici'` yapmayı da engellemek.
--
-- Ama tetikleyici artık davet satırının HER UPDATE'inde çalışıyor — kaydın
-- tüketildiği anda `handle_new_user` içinde atılan mühür UPDATE'i dahil
-- (`update davet set kullanildi_at = now()`). O anda kural sıfırdan yeniden
-- değerlendiriliyor ve `olusturan_id`'nin rolü tekrar sorgulanıyor.
--
-- SONUÇ — İKİ ÖLÇÜLMÜŞ SENARYO:
--   1. Platform, kulübün kilidini geçici açar; kulüp ikinci yöneticisini davet
--      eder; platform kilidi geri kapatır. Davetli linke tıkladığında kayıt
--      'Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından açılabilir.'
--      hatasıyla düşer. Mühür UPDATE'i `auth.users` INSERT'iyle aynı
--      transaction'da olduğu için HESAP HİÇ AÇILMAZ.
--   2. `davet.olusturan_id` NULL'a düşerse (FK `on delete set null`;
--      platform_admin profili silinirse) bekleyen yönetici daveti kalıcı olarak
--      ölür. Yani konsolun akışı, davet anında değil KAYIT ANINDA
--      platform_admin profilinin hâlâ var olmasına bağlı hale gelmişti.
--
-- ÇÖZÜM: tetikleyicinin işi "rolü yöneticiye ÇEVİRMEYİ" engellemek, "var olan
-- bir yönetici davetine dokunmayı" değil. Rol değişmeyen UPDATE'ler erken
-- çıkıyor.
--
-- BAYPAS AÇILMIYOR:
--   · `antrenor → yonetici` UPDATE'i rol DEĞİŞTİĞİ için hâlâ yakalanıyor.
--   · Zaten `rol='yonetici'` olan satır, oluşturulduğu anda bu tetikleyiciden
--     ve RLS WITH CHECK'ten geçmiş demektir; sonradan `expires_at` ya da
--     `kullanildi_at` değiştirmek hiçbir yetki kazandırmaz.
--   · `kulup_id`'yi başka kulübe kaydırma denemesi restrictive kiracı duvarına
--     takılır (hem USING hem WITH CHECK `kulup_id = current_kulup_id()`).
--   · 0037'nin RLS WITH CHECK katmanı INSERT+UPDATE'te aynen duruyor.

create or replace function public.protect_yonetici_daveti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kilitli   boolean;
  v_olusturan app_role;
begin
  -- 0040: ROL DEĞİŞMEYEN UPDATE'LER ERKEN ÇIKAR.
  -- Kayıt anındaki mühür UPDATE'i buradan geçiyor; olmasaydı davet
  -- tüketilemez ve hesap hiç açılamazdı (bkz. başlık, Bulgu 2).
  if TG_OP = 'UPDATE' and new.rol is not distinct from old.rol then
    return new;
  end if;

  if new.rol <> 'yonetici' then
    return new;
  end if;

  select k.yonetici_davet_kilitli into v_kilitli
    from public.kulup k where k.id = new.kulup_id;

  if coalesce(v_kilitli, true) = false then
    return new;
  end if;

  select p.role into v_olusturan
    from public.profiles p where p.id = new.olusturan_id;

  if v_olusturan = 'platform_admin' then
    return new;
  end if;

  raise exception 'Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından açılabilir. Yeni yönetici için sağlayıcınızla iletişime geçin.'
    using errcode = 'insufficient_privilege';
end;
$$;


-- ===========================================================================
-- BULGU 3 (ikincil) — ANTRENÖR KENDİ PUANINI VE DENEYİMİNİ YAZABİLİYOR
-- ===========================================================================
-- 0037 `protect_antrenor_ucret` ile üç ÜCRET kolonunu dondurdu ama `puan` ve
-- `deneyim_yil` açık kaldı. Ölçüldü: antrenör kendi satırında puan=5.0,
-- deneyim_yil=30 yazabiliyor.
--
-- Yetki yükseltme değil ama VELİYE GÖSTERİLEN bir sayı: bireysel ders ekranında
-- antrenör seçtirilirken puan listeleniyor. Hiçbir yerde sunucu tarafında
-- türetilmiyor, yani antrenörün yazdığı değer "kulübün verdiği puan" gibi
-- görünüyor. Ücret kolonlarıyla aynı sınıfa giriyor: kişi kendi vitrinini
-- kendi yazamamalı.
--
-- ⚠ 0037'NİN GÖVDE YAPISI AYNEN KORUNUYOR — İKİ KOLON EKLENİYOR, BAŞKA HİÇBİR ŞEY.
--   İlk denemede gövde "yönetici ise geç, değilse reddet" biçiminde yeniden
--   yazılmıştı ve `current_user = 'authenticated'` koruması düşmüştü. Ölçüldü:
--   o hâlde postgres (superuser) ve service_role bile ücret güncelleyemiyordu —
--   `private.current_profile_role()` o bağlamlarda NULL döndüğü için koşul
--   yöneticiye denk gelmiyor ve raise'e düşüyordu. Yani düzeltme, veri onarımı
--   ve platform yollarını kilitliyordu. 0037'nin kendi hatası da tam bu sınıftandı;
--   bir tetikleyicinin HANGİ ROLLERDE çalıştığı, neyi engellediği kadar önemli.
--
--   Tek bilinçli sıkılaştırma: `coalesce(..., '')`. Çıplak
--   `private.current_profile_role() <> 'yonetici'` ifadesi, profil satırı
--   okunamayan bir authenticated kullanıcı için NULL üretiyor, NULL da koşulu
--   yanlış yapıp kontrolü TAMAMEN ATLATIYORDU. Aynı desen zaten
--   `protect_bireysel_rezervasyon`'da (0016) kullanılıyor.
create or replace function public.protect_antrenor_ucret()
returns trigger
language plpgsql                -- SECURITY INVOKER (varsayılan) — ŞART.
                                -- DEFINER olsaydı gövdedeki current_user çağıranı
                                -- değil fonksiyon SAHİBİNİ verirdi ve koşul hiç
                                -- tutmazdı (0036'da tam olarak bu yaşandı).
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if new.tek_fiyat is distinct from old.tek_fiyat
       or new.paket_fiyat is distinct from old.paket_fiyat
       or new.paket_ders_sayisi is distinct from old.paket_ders_sayisi
       -- 0040: vitrin alanları da yöneticinin tekelinde.
       or new.puan is distinct from old.puan
       or new.deneyim_yil is distinct from old.deneyim_yil then
      raise exception 'Ücret, puan ve deneyim bilgisini yalnızca kulüp yöneticisi değiştirebilir.';
    end if;
  end if;
  return new;
end;
$$;


-- ===========================================================================
-- BULGU 4 (ikincil) — anon TRUNCATE YAPABİLİYOR
-- ===========================================================================
-- `grant all on all tables in schema public to anon` TRUNCATE'i de içeriyor ve
-- RLS TRUNCATE'i KAPSAMAZ. Yerelde ölçüldü: `set role anon; truncate
-- public.sporcular cascade;` çalıştı ve 16 tabloya yayıldı.
--
-- BUGÜN SÖMÜRÜLEBİLİR DEĞİL: PostgREST hiçbir zaman TRUNCATE üretmiyor, yani
-- anon API anahtarıyla ulaşılamıyor. Yine de "izinlerin gerçek daraltıcısı GRANT
-- değil RLS'tir" gerekçesi TAM OLARAK BU FİİL İÇİN geçerli değil — tek satırlık
-- bir kapatma, gelecekte doğrudan bağlantı açan bir entegrasyonun tek komutla
-- veritabanını boşaltmasını engelliyor.
revoke truncate on all tables in schema public from anon, authenticated;


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
begin
  -- Bulgu 1: tetikleyici tarih koşulu taşıyor mu?
  if position('new.tarih > current_date' in pg_get_functiondef('public.paket_iade'::regproc)) = 0 then
    raise exception '0040: paket_iade tarih koşulunu taşımıyor.';
  end if;

  -- Bulgu 2: rol değişmeyen UPDATE erken çıkıyor mu?
  if position('TG_OP = ''UPDATE''' in pg_get_functiondef('public.protect_yonetici_daveti'::regproc)) = 0 then
    raise exception '0040: protect_yonetici_daveti UPDATE muafiyetini taşımıyor.';
  end if;

  -- Bulgu 3: puan/deneyim korunuyor mu?
  if position('new.puan' in pg_get_functiondef('public.protect_antrenor_ucret'::regproc)) = 0 then
    raise exception '0040: protect_antrenor_ucret puan kolonunu korumuyor.';
  end if;

  raise notice '0040 tamam: iade tarih koşulu, davet UPDATE muafiyeti, puan/deneyim kilidi, anon TRUNCATE iptali.';
end $$;
