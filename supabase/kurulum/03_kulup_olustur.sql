-- =============================================================================
-- 03_kulup_olustur.sql — Kulübü oluşturur (ZORUNLU, çok kiracılı kurulumun kalbi)
-- =============================================================================
--
-- NEDEN AYRI BİR DOSYA:
--   0021 ile sistem çok kiracılı oldu: 41 tablonun kulup_id kolonu NOT NULL.
--   Bir kulüp kaydı olmadan ne şube, ne kurum ayarı, ne mobil bayrak, ne de
--   KULLANICI oluşturulabilir (handle_new_user sistemde kulüp yoksa exception
--   atar). Bu yüzden kulüp kaydı, platform kataloğundan SONRA ve ilk hesap
--   açılmadan ÖNCE, ayrı bir adımda kurulur.
--
--   Bu dosya, eski 02_katalog.sql'in kulübe AİT bölümlerini (merkez şube,
--   kurum_ayarlari, mobil özellik bayrakları) da devraldı.
--
-- ÇALIŞTIRMA SIRASI:
--   1) kurulum/01_sema.sql
--   2) kurulum/02_katalog.sql
--   3) kurulum/03_kulup_olustur.sql   <-- bu dosya
--   4) İLK YÖNETİCİNİN HESABINI AÇIN (uygulamadan "Kayıt Ol" ya da
--      Supabase > Authentication > Users > "Add user")
--   5) kurulum/04_ilk_yonetici.sql
--   6) (yalnızca demo/satış ortamında) demo/karsiyaka_demo.sql
--
-- ✔ Bu altı adım YETERLİDİR: 01_sema.sql migration 0001–0025'in nihai halini
--   içerir. app/supabase/migrations/ altındaki dosyaları ayrıca çalıştırmayın.
--
-- ⚠ SQL EDITOR'DA (postgres rolüyle) ÇALIŞTIRILIR.
--   Bu bağlamda auth.uid() NULL'dur, dolayısıyla kolonların
--   `default private.current_kulup_id()` değeri de NULL üretir. Bu yüzden
--   aşağıdaki her insert kulup_id'yi AÇIKÇA yazar (0021 UYARI 2).
--
-- IDEMPOTENT: aynı slug ile ikinci kez çalıştırıldığında yeni kulüp AÇMAZ, var
-- olan kaydı bulur ve eksik parçaları (şube / ayarlar / bayraklar / branş
-- seçimleri) tamamlar. Var olan satırlar EZİLMEZ — panelden yapılmış
-- değişiklikler (kapatılmış bir bayrak, düzeltilmiş kulüp adı) korunur.
--
-- İKİNCİ, ÜÇÜNCÜ KULÜP: bu dosya ilk kulüp içindir. Sonraki kulüpler süper-admin
-- panelinden (service_role ile) açılır; elle açılacaksa aşağıdaki DEĞİŞTİRİN
-- bloğunu yeni kulübe göre doldurup dosyayı tekrar çalıştırmak yeterlidir —
-- MERKEZ_SUBE_ID notunu (bölüm 2) mutlaka okuyun.
-- =============================================================================


do $$
declare
  -- ===========================================================================
  -- BURAYI DEĞİŞTİRİN — kulübün kimlik ve iletişim bilgileri
  -- ===========================================================================
  p_kulup_adi      text   := 'Spor Kulübü';        -- <<< DEĞİŞTİRİN (panelde görünen ad)
  p_slug           text   := 'spor-kulubu';        -- <<< DEĞİŞTİRİN (tekil, küçük harf, tireli)
  p_plan           text   := 'standart';           -- serbest metin: standart / pro / deneme...
  p_sporcu_limiti  int    := null;                 -- null = sınırsız (süper-admin panelinin alanı)
  p_abonelik_bitis date   := null;                 -- null = süresiz; deneme sürecinde bitiş tarihi

  p_sube_adi       text   := 'Merkez';             -- ilk (ve bugün tek) şubenin adı
  p_telefon        text   := null;                 -- kurum iletişim bilgileri — panelden de girilebilir
  p_eposta         text   := null;
  p_adres          text   := null;
  p_para_birimi    text   := 'TRY';                -- 'TRY' | 'USD' | 'EUR'

  -- Kulübün AÇTIĞI branşlar. Platform kataloğundaki (02_katalog.sql) adlarla
  -- birebir eşleşmeli: Futbol, Basketbol, Voleybol, Tenis, Yüzme, Jimnastik,
  -- Bale, Satranç. Panelden "Kurum Branşları" ekranından da değiştirilebilir.
  p_branslar       text[] := array['Futbol', 'Basketbol'];   -- <<< DEĞİŞTİRİN
  -- ===========================================================================

  -- app/src/data/kurumRepo.ts içindeki sabit MERKEZ_SUBE_ID. Mobil uygulama
  -- bugün tek şube varsayımıyla çalışıyor ve bu id'yi koda gömülü tutuyor;
  -- ilk kulübün şubesi bu id ile açılmazsa "Kurum Branşları" ekranı boş gelir ve
  -- branş açmaya çalışıldığında FK ihlali (23503) verir.
  c_merkez_sube_id constant uuid := '10000000-0000-0000-0000-000000000001';

  v_kulup  uuid;
  v_sube   uuid;
  v_durum  text;
  v_brans  uuid;
  v_ad     text;
  v_eklendi int := 0;
begin
  -- ---------------------------------------------------------------------------
  -- 1) KULÜP KAYDI
  -- ---------------------------------------------------------------------------
  -- durum AÇIKÇA 'aktif' yazılıyor, kolon varsayılanı ('deneme') KULLANILMIYOR.
  -- Gerekçe: private.current_kulup_id() yalnızca durum = 'aktif' kulüpleri
  -- döndürür (01_sema.sql bölüm 2). Kulüp 'deneme' veya 'askida' iken fonksiyon
  -- NULL döner ve 55 restrictive politikanın tamamı fail-closed olur — kulübün
  -- kullanıcıları giriş yapar ama HİÇBİR ŞEY göremez. Bu davranış bilinçlidir:
  -- abonelik kill-switch'i tek UPDATE'tir (`update kulup set durum='askida'`).
  -- Deneme süreci durum ile değil, plan + abonelik_bitis ile ifade edilir.
  select id, durum into v_kulup, v_durum from public.kulup where slug = p_slug;

  if v_kulup is null then
    insert into public.kulup (ad, slug, durum, plan, sporcu_limiti, abonelik_bitis)
    values (p_kulup_adi, p_slug, 'aktif', p_plan, p_sporcu_limiti, p_abonelik_bitis)
    returning id into v_kulup;
    raise notice 'Kulüp oluşturuldu: % (slug=%, durum=aktif)', p_kulup_adi, p_slug;
  else
    raise notice 'Kulüp zaten var, yeniden oluşturulmadı: % (slug=%)', p_kulup_adi, p_slug;
    if v_durum <> 'aktif' then
      raise warning 'Kulübün durumu ''%'' — kullanıcıları hiçbir veri göremez. Açmak için: update public.kulup set durum = ''aktif'' where slug = %L;', v_durum, p_slug;
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- 2) MERKEZ ŞUBE — ZORUNLU
  -- ---------------------------------------------------------------------------
  -- Kulübün en az bir şubesi OLMAK ZORUNDA: grup, sporcular, aidat_plani,
  -- servis_rota, urun, basvuru ve profiles tablolarının tamamı sube'ye FK ile
  -- bağlı.
  --
  -- Sabit id yalnızca BOŞSA kullanılır. İkinci kulüpte id zaten dolu olacağı için
  -- rastgele bir uuid üretilir — bu durumda kurumRepo.ts'teki sabit yüzünden o
  -- kulüpte "Kurum Branşları" ekranı çalışmaz (0021 artık risk R2). Kalıcı çözüm
  -- kodun şubeyi kulüpten türetmesidir; bu dosya durumu en azından GÖRÜNÜR kılar.
  select id into v_sube from public.sube where kulup_id = v_kulup order by ad limit 1;

  if v_sube is null then
    if exists (select 1 from public.sube where id = c_merkez_sube_id) then
      v_sube := gen_random_uuid();
      raise warning 'Sabit MERKEZ_SUBE_ID başka bir kulüpte kullanılmış; bu kulübe rastgele şube id''si verildi (%). app/src/data/kurumRepo.ts''teki sabit bu kulüpte çalışmaz.', v_sube;
    else
      v_sube := c_merkez_sube_id;
    end if;

    insert into public.sube (id, ad, alt_bilgi, kulup_id)
    values (v_sube, p_sube_adi, null, v_kulup);
    raise notice 'Şube oluşturuldu: % (%)', p_sube_adi, v_sube;
  else
    raise notice 'Şube zaten var, yeniden oluşturulmadı: %', v_sube;
  end if;

  -- ---------------------------------------------------------------------------
  -- 3) KURUM AYARLARI — kulüp başına tekil satır
  -- ---------------------------------------------------------------------------
  -- 0021 bölüm 10.1: PK artık (kulup_id); `id boolean check(id)` kolonu uygulama
  -- kodundaki `.eq('id', true).single()` çağrıları bozulmasın diye duruyor.
  -- on conflict do nothing: panelden düzeltilmiş bir kulüp adı EZİLMEZ.
  insert into public.kurum_ayarlari (id, kulup_adi, telefon, eposta, adres, para_birimi, kulup_id)
  values (true, p_kulup_adi, p_telefon, p_eposta, p_adres, p_para_birimi, v_kulup)
  on conflict (kulup_id) do nothing;

  -- ---------------------------------------------------------------------------
  -- 4) MOBİL ÖZELLİK BAYRAKLARI — kulüp başına 5 satır
  -- ---------------------------------------------------------------------------
  -- Panelden aç/kapa yapılan, mobil uygulamanın açılışta okuduğu bayraklar.
  -- Bayrak SETİ sabittir; yeni bayrak mobil tarafta karşılığı olan kod
  -- gerektirdiği için migration ile gelir. Çekirdek akışlar (ana sayfa, yoklama,
  -- ödemeler, duyurular, profil) bilinçli olarak bayraklanmamıştır.
  -- Tümü AÇIK gelir; kulüp kullanmadığı modülü panelden kapatır.
  -- (Mobil taraf tabloyu okuyamazsa fail-open davranır: her şey açık.)
  insert into public.mobil_ozellik (anahtar, ad, aciklama, aktif, kulup_id) values
    ('mesajlar',      'Mesajlaşma',    'Veli ↔ antrenör mesajlaşma sekmeleri', true, v_kulup),
    ('magaza',        'Mağaza',        'Veli tarafındaki mağaza sekmesi ve sipariş akışı', true, v_kulup),
    ('servis',        'Servis Takibi', 'Veli tarafındaki servis sekmesi', true, v_kulup),
    ('bireysel_ders', 'Bireysel Ders', 'Veli bireysel ders kartı + antrenör takvim/kazanç ekranları', true, v_kulup),
    ('etkinlikler',   'Etkinlikler',   'Veli tarafındaki etkinlikler/maç takvimi ekranı', true, v_kulup)
  on conflict (kulup_id, anahtar) do nothing;

  -- ---------------------------------------------------------------------------
  -- 5) KURUM BRANŞ SEÇİMLERİ
  -- ---------------------------------------------------------------------------
  -- Branşlar platform kataloğundan (kulup_id is null) ADIYLA çözülüyor; kulübün
  -- panelden eklediği kendi branşları da (kulup_id = v_kulup) kabul ediliyor.
  foreach v_ad in array p_branslar loop
    select b.id into v_brans
      from public.brans b
     where b.ad = v_ad
       and (b.kulup_id is null or b.kulup_id = v_kulup)
     order by (b.kulup_id is null)          -- kulübe özel satır varsa o öncelikli
     limit 1;

    if v_brans is null then
      raise warning 'Branş bulunamadı, atlandı: "%". 02_katalog.sql çalıştırıldı mı? Adı birebir yazın.', v_ad;
    else
      insert into public.kurum_brans_secimi (sube_id, brans_id, kulup_id)
      values (v_sube, v_brans, v_kulup)
      on conflict (sube_id, brans_id) do nothing;
      v_eklendi := v_eklendi + 1;
    end if;
  end loop;

  raise notice 'Kulüp kurulumu tamam: kulup_id=%, sube_id=%, açılan branş sayısı=%', v_kulup, v_sube, v_eklendi;
end $$;


-- -----------------------------------------------------------------------------
-- DOĞRULAMA — kulübün eksiksiz kurulduğunu kanıtlar.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_sorun int := 0;
begin
  if not exists (select 1 from public.kulup) then
    raise exception 'Hiç kulüp yok — yukarıdaki blok çalışmamış. Bu haliyle hiçbir kullanıcı hesabı açılamaz.';
  end if;

  for r in
    select k.id, k.ad, k.slug, k.durum,
           (select count(*) from public.sube s            where s.kulup_id = k.id) as sube_adet,
           (select count(*) from public.kurum_ayarlari ka where ka.kulup_id = k.id) as ayar_adet,
           (select count(*) from public.mobil_ozellik mo  where mo.kulup_id = k.id) as bayrak_adet,
           (select count(*) from public.kurum_brans_secimi kb where kb.kulup_id = k.id) as brans_adet
      from public.kulup k
     order by k.created_at, k.id
  loop
    raise notice 'Kulüp "%" (slug=%, durum=%): şube=%, kurum_ayarlari=%, bayrak=%, açık branş=%',
      r.ad, r.slug, r.durum, r.sube_adet, r.ayar_adet, r.bayrak_adet, r.brans_adet;

    if r.durum <> 'aktif' then
      raise warning '  → durum ''aktif'' değil: bu kulübün kullanıcıları hiçbir veri göremez (private.current_kulup_id() NULL döner).';
      v_sorun := v_sorun + 1;
    end if;
    if r.sube_adet = 0 then
      raise warning '  → şubesi yok: sporcu/grup/ürün eklenemez.';
      v_sorun := v_sorun + 1;
    end if;
    if r.ayar_adet = 0 then
      raise warning '  → kurum_ayarlari satırı yok: Ayarlar > Genel ekranı boş açılır.';
      v_sorun := v_sorun + 1;
    end if;
    if r.bayrak_adet <> 5 then
      raise warning '  → mobil_ozellik bayrak sayısı 5 değil (%): mobil taraf eksik bayrakta fail-open davranır.', r.bayrak_adet;
      v_sorun := v_sorun + 1;
    end if;
  end loop;

  if v_sorun = 0 then
    raise notice 'Kulüp kurulumu doğrulandı. Sıradaki adım: ilk yöneticinin hesabını açın, ardından kurulum/04_ilk_yonetici.sql.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- İSTEĞE BAĞLI ŞABLON — AİDAT PLANLARI  (kaynak: 0007_odeme.sql)
--
--   ⚠ Bu bölüm VARSAYILAN OLARAK ÇALIŞMAZ (yorumdadır). Her kulüp kendi aidat
--     planlarını panelden tanımlar. Aşağıdaki satır yalnızca "bir plan kaydı neye
--     benzer" sorusunu gösteren örnektir.
--
--   Kolonlar:
--     ad       : planın adı (ör. "Basketbol Aylık")
--     alt      : listede ikinci satırda görünen açıklama
--     fiyat    : sporcu başına aylık tutar
--     beklenen : o plandan ay içinde beklenen toplam tahsilat (raporlama için)
--     sube_id  : plan şubeye özelse doldurulur; null = tüm kulüp
--     kulup_id : ZORUNLU — SQL Editor'da auth.uid() NULL olduğu için kolon
--                varsayılanı NULL üretir ve NOT NULL ihlali alınır.
-- -----------------------------------------------------------------------------
-- insert into aidat_plani (ad, alt, fiyat, beklenen, sube_id, kulup_id)
-- select 'Basketbol Aylık', 'U12-U14 · haftada 3 gün', 1250, 43750, null, k.id
--   from public.kulup k where k.slug = 'spor-kulubu';


-- =============================================================================
-- Sıradaki adım (ZORUNLU):
--   1) İlk yöneticinin hesabını açın — uygulamadan "Kayıt Ol" ya da
--      Supabase > Authentication > Users > "Add user".
--      Hesap açılırken handle_new_user() tetiklenir; sistemde TEK kulüp olduğu
--      için kullanıcı otomatik olarak bu kulübe 'veli' rolüyle bağlanır.
--   2) kurulum/04_ilk_yonetici.sql — o hesabı 'yonetici' yapar.
-- =============================================================================
