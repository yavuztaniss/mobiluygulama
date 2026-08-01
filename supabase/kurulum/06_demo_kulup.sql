-- ===========================================================================
-- 06_demo_kulup.sql — SATIŞ DEMOSU İÇİN KULÜP ÜRETİCİSİ
-- ===========================================================================
-- NE İŞE YARAR
--   Demo talep eden her kulübe KENDİ demo kulübünü açar: kendi adı, kendi
--   yöneticisi, kendi sahte verisi. Prospect panele girer, kendi okulunun adını
--   görür ve istediği gibi gezer — sildiği, eklediği hiçbir şey başka bir
--   demoyu etkilemez.
--
-- NEDEN KULÜP BAŞINA
--   Tek ortak demo hesabı verilirse ilk gelen sporcuları siler, ikinci gelen
--   boş panel görür. Ürün zaten çok kiracılı olduğu için demo izolasyonu
--   bedava geliyor; kullanmamak olmaz.
--
-- NEDEN `demo/karsiyaka_demo.sql` YETMEZ
--   O dosya sabit UUID'ler kullanıyor ('10000000-0000-...'). Bir veritabanına
--   YALNIZCA BİR KEZ yüklenebilir; ikinci çağrı birincil anahtarda çakışır.
--   Buradaki üretici her çağrıda taze UUID üretiyor.
--
-- ⚠ BU DOSYA DEMO PROJESİNDE ÇALIŞTIRILIR — CANLI PROJEDE DEĞİL.
--   Demo, gerçek çocuk verisiyle aynı veritabanında durmamalı: prospect'e
--   verilen hesap yabancı birinin elinde ve araya yalnızca RLS girer. Ayrı
--   proje, patlama yarıçapını sıfırlar.
--
-- NEDEN SECURITY DEFINER DEĞİL
--   İlk sürüm ikisini de DEFINER yazmıştı. Denetim turu bunun tehlikesini
--   ölçtü: `revoke` tek katmandı ve 01_sema.sql'in toplu
--   `grant all on all routines` satırı bu dosyadan sonra çalışırsa izni GERİ
--   VERİYORDU. O noktada sıradan bir VELİ `demo_kulup_sil` çağırıp bütün
--   kulübü sildi — ölçüldü, `kulup 1 -> 0`.
--
--   İlk düzeltme fonksiyonların içine `auth.uid() is not null` kapısı koymaktı.
--   KARŞI-TEST onu da çürüttü: kapı bir OTURUM AYARINA bağlı
--   (`request.jwt.claims`), ayar aynı oturumda daha önce kurulduysa asılı
--   kalıyor ve MEŞRU kurulum çağrısı da reddediliyordu.
--
--   Doğru çözüm yapısal: bu fonksiyonlar OPERATÖR ARACI, ayrıcalık yükseltmesi
--   gerektirmiyorlar. INVOKER olarak çağıranın yetkisiyle çalışıyorlar —
--   kurulumu yapan postgres `auth.users`'a yazabiliyor, bir veli yazamıyor.
--   Koruma bir kapıdan değil, izin sisteminin kendisinden geliyor; unutulacak
--   ya da oturum durumuna takılacak bir şey kalmıyor.
--
-- ⚠ search_path'e `extensions` EKLİ — ŞART.
--   Supabase pgcrypto'yu `public'e değil `extensions` şemasına kuruyor
--   (ölçüldü: crypt, gen_salt, gen_random_bytes üçü de orada). search_path
--   yalnızca `public` olsaydı fonksiyon ilk çağrıda
--   "function gen_random_bytes(integer) does not exist" ile düşerdi — ve bu
--   yalnızca GERÇEK bir Supabase projesinde ortaya çıkardı, çünkü elle
--   kurulan test veritabanında uzantı public'e gidiyor.
-- ÖNKOŞUL: demo projesinde 01_sema.sql ve 02_katalog.sql çalıştırılmış olmalı.
--
-- KULLANIM (demo projesinin SQL Editor'ında):
--   select * from public.demo_kulup_olustur('Yıldız Spor Okulu', 'demo1@ornek.com', 'GecmisSifre123!');
--   → kulup_id, eposta, sifre döner. Bu bilgileri prospect'e verirsin.
-- ===========================================================================

-- Donus tipi degisirse create or replace yetmez; tekrar calistirilabilirlik icin once dusuruluyor.
drop function if exists public.demo_kulup_olustur(text, text, text);
create or replace function public.demo_kulup_olustur(
  p_kulup_adi text,
  p_eposta    text,
  p_sifre     text
) returns table (yeni_kulup_id uuid, giris_eposta text, giris_sifre text, sporcu_sayisi int)
language plpgsql
security invoker   -- ŞART — bkz. başlıktaki "NEDEN SECURITY DEFINER DEĞİL"
set search_path = public, extensions
as $$
declare
  v_kulup   uuid := gen_random_uuid();
  v_yon     uuid := gen_random_uuid();
  v_sube    uuid := gen_random_uuid();
  v_plan    uuid := gen_random_uuid();
  v_slug    text;
  v_brans   uuid[];
  v_gruplar uuid[] := '{}';
  v_grup    uuid;
  v_sporcu  uuid;
  v_antren  uuid;
  i         int;
  v_ad      text;
  v_token   text;
  v_veli    text;

  -- Sahte ama gerçekçi Türkçe adlar. Demo panelinde "Test 1, Test 2" görmek
  -- ürünü ucuz gösterir; gerçek isimler kullanmak ise KVKK sorunudur.
  c_adlar text[] := array[
    'Ali Kaya','Zeynep Demir','Mert Yılmaz','Elif Şahin','Kerem Aydın',
    'Defne Arslan','Burak Öztürk','Ece Yıldız','Can Polat','Ayşe Koç',
    'Emir Tan','Nil Aksoy','Yusuf Erdem','Sude Çelik','Arda Güneş',
    'Beren Kurt','Kaan Tunç','Melis Doğan','Umut Karaca','Ada Sezer'];
  c_veliler text[] := array[
    'Fatma Kaya','Murat Demir','Selin Yılmaz','Hakan Şahin','Derya Aydın',
    'Serkan Arslan','Pınar Öztürk','Emre Yıldız','Gül Polat','Okan Koç',
    'Sibel Tan','Cem Aksoy','Nurten Erdem','Volkan Çelik','Aslı Güneş',
    'Tolga Kurt','Ebru Tunç','Barış Doğan','Hande Karaca','Levent Sezer'];
  c_gruplar text[] := array['U10 Basketbol','U12 Basketbol','U14 Basketbol','U12 Voleybol','U10 Yüzme'];
begin
  if coalesce(btrim(p_kulup_adi), '') = '' then
    raise exception 'Kulüp adı boş olamaz.';
  end if;

  v_slug := lower(regexp_replace(translate(p_kulup_adi,
              'ÇĞİÖŞÜçğıöşü', 'CGIOSUcgiosu'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug) || '-' || substr(v_kulup::text, 1, 6);

  -- --- Kulüp ---------------------------------------------------------------
  -- `yonetici_davet_kilitli` BİLEREK false açılıyor; aşağıda kendi davetimizi
  -- oluşturduktan hemen sonra true'ya çekiliyor.
  insert into public.kulup (id, ad, slug, plan, durum, yonetici_davet_kilitli)
  values (v_kulup, p_kulup_adi, v_slug, 'deneme', 'aktif', false);

  -- --- Yönetici hesabı: ÜRÜNÜN KENDİ DAVET YOLUNDAN ------------------------
  -- İLK DENEMEDE auth.users'a doğrudan yazılmıştı ve ikinci demo kulübünde şu
  -- hatayla düştü:
  --   "Kayıt için davet linki gerekli: sistemde birden fazla kulüp var ve
  --    davet token'ı sunulmadı."  (handle_new_user, 0022)
  -- Yani kestirme yol, ürünün kendi kayıt kilidine takıldı — kontrol çalışıyor.
  -- Doğrusu kilidi delmek değil, kapıdan geçmek: önce davet satırı açılıyor,
  -- token `raw_user_meta_data`'ya konuyor ve profili handle_new_user kuruyor.
  -- Rol ve kulüp de davetten geliyor, yani "default kulup_id" hilesine hiç
  -- güvenilmiyor.
  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.davet (token, kulup_id, rol, ad, eposta, son_kullanma, davet_notu)
  values (v_token, v_kulup, 'yonetici', 'Demo Yönetici', lower(btrim(p_eposta)),
          now() + interval '1 hour', 'Demo kulübü otomatik kurulumu');

  -- ⚠ BOŞ STRING'LER ŞART, NULL BIRAKILAMAZ.
  --   confirmation_token / recovery_token / email_change* / phone_change* /
  --   reauthentication_token alanları NULL kalırsa GoTrue giriş isteğinde
  --   "Database error querying schema" veriyor ve hesap HİÇ kullanılamıyor.
  --   Sebep: GoTrue Go ile yazılı ve bu kolonları string'e tarıyor; NULL'ı
  --   çeviremiyor. Şemada hepsi nullable olduğu için veritabanı uyarmıyor.
  --   ÖLÇÜLDÜ: ilk sürüm bu alanları yazmıyordu, demo hesabıyla giriş
  --   denendiğinde tam bu hata alındı. Elle kurulan test veritabanında GoTrue
  --   olmadığı için testler bunu göremiyordu — ancak gerçek Supabase'de çıktı.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new,
                          email_change, email_change_token_current, phone_change,
                          phone_change_token, reauthentication_token,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_yon, 'authenticated', 'authenticated',
          lower(btrim(p_eposta)), crypt(p_sifre, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('ad', 'Demo Yönetici', 'davet_token', v_token),
          '', '', '', '', '', '', '', '',
          now(), now());

  -- identities satırı ŞART: yoksa GoTrue e-posta/şifre girişini kabul etmiyor
  -- ve giriş "e-posta veya şifre hatalı" ile düşüyor (daha önce yaşandı).
  insert into auth.identities (provider_id, user_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (v_yon::text, v_yon,
          jsonb_build_object('sub', v_yon::text, 'email', lower(btrim(p_eposta)),
                             'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());

  -- Davet tüketildi; kilit gerçek kulüplerdeki varsayılana çekiliyor.
  update public.kulup set yonetici_davet_kilitli = true where id = v_kulup;

  -- --- Bundan sonrası kiracı bağlamı gerektiriyor --------------------------
  -- Tablolardaki `default private.current_kulup_id()` auth.uid()'e bakıyor;
  -- burada oturum yok, o yüzden kulup_id'ler AÇIKÇA yazılıyor.
  insert into public.sube (id, ad, alt_bilgi, kulup_id)
  values (v_sube, 'Merkez', 'Demo tesis', v_kulup);

  select array_agg(id) into v_brans from public.brans;

  insert into public.kurum_brans_secimi (sube_id, brans_id, kulup_id)
  select v_sube, b, v_kulup from unnest(v_brans[1:4]) b
  on conflict do nothing;

  -- --- Antrenör ------------------------------------------------------------
  -- Yöneticiyle aynı gerekçe: kayıt kilidi (0022) antrenör için de geçerli,
  -- o yüzden burada da davet yolundan geçiliyor. Antrenör daveti kilide tabi
  -- değil (`yonetici_davet_kilitli` yalnızca rol='yonetici' için bakılıyor),
  -- dolayısıyla ek bir açma/kapama gerekmiyor.
  v_antren := gen_random_uuid();
  v_token  := encode(gen_random_bytes(24), 'hex');

  insert into public.davet (token, kulup_id, rol, ad, eposta, son_kullanma, davet_notu)
  values (v_token, v_kulup, 'antrenor', 'Mehmet Antrenör',
          'antrenor+' || substr(v_kulup::text,1,8) || '@demo.local',
          now() + interval '1 hour', 'Demo kulübü otomatik kurulumu');

  -- ⚠ BOŞ STRING'LER ŞART, NULL BIRAKILAMAZ.
  --   confirmation_token / recovery_token / email_change* / phone_change* /
  --   reauthentication_token alanları NULL kalırsa GoTrue giriş isteğinde
  --   "Database error querying schema" veriyor ve hesap HİÇ kullanılamıyor.
  --   Sebep: GoTrue Go ile yazılı ve bu kolonları string'e tarıyor; NULL'ı
  --   çeviremiyor. Şemada hepsi nullable olduğu için veritabanı uyarmıyor.
  --   ÖLÇÜLDÜ: ilk sürüm bu alanları yazmıyordu, demo hesabıyla giriş
  --   denendiğinde tam bu hata alındı. Elle kurulan test veritabanında GoTrue
  --   olmadığı için testler bunu göremiyordu — ancak gerçek Supabase'de çıktı.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new,
                          email_change, email_change_token_current, phone_change,
                          phone_change_token, reauthentication_token,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_antren, 'authenticated', 'authenticated',
          'antrenor+' || substr(v_kulup::text,1,8) || '@demo.local',
          crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('ad', 'Mehmet Antrenör', 'davet_token', v_token),
          '', '', '', '', '', '', '', '',
          now(), now());

  -- --- Gruplar -------------------------------------------------------------
  for i in 1 .. array_length(c_gruplar, 1) loop
    v_grup := gen_random_uuid();
    insert into public.grup (id, ad, brans_id, sube_id, kulup_id, aktif)
    values (v_grup, c_gruplar[i], v_brans[1 + (i % 4)], v_sube, v_kulup, true);
    v_gruplar := v_gruplar || v_grup;
  end loop;

  -- --- Aidat planı ---------------------------------------------------------
  insert into public.aidat_plani (id, ad, alt, fiyat, beklenen, sube_id, kulup_id)
  values (v_plan, 'Aylık Standart', 'Haftada 2 antrenman', 1500, 1500, v_sube, v_kulup);

  -- --- Sporcular + ödemeler ------------------------------------------------
  -- Telefonlar 0500 önekiyle: Türkiye'de TAHSİS EDİLMEMİŞ bir mobil önek.
  -- Demo verisinde gerçek görünen numara kullanmak, birinin yanlışlıkla
  -- yabancı bir kişiye mesaj atmasına yol açardı.
  for i in 1 .. array_length(c_adlar, 1) loop
    v_sporcu := gen_random_uuid();
    v_ad   := c_adlar[i];
    v_veli := c_veliler[i];
    v_grup := v_gruplar[1 + (i % array_length(v_gruplar, 1))];

    insert into public.sporcular (id, ad, numara, dogum_yili, brans_id, grup_id, sube_id,
                                  veli_ad, veli_telefon, veli_yakinlik, kulup_id, aktif)
    values (v_sporcu, v_ad, i, 2012 + (i % 4), v_brans[1 + (i % 4)], v_grup, v_sube,
            v_veli, '0500 ' || lpad((100 + i)::text, 3, '0') || ' 00 00',
            case when i % 2 = 0 then 'Anne' else 'Baba' end, v_kulup, true);

    insert into public.sporcu_antrenor (sporcu_id, antrenor_id, kulup_id)
    values (v_sporcu, v_antren, v_kulup) on conflict do nothing;

    -- Ödemelerin bir kısmı gecikmiş: panelin "Gecikmiş" rozeti ve muhasebe
    -- ekranı boş görünmesin, demo gerçek bir kulüp gibi dursun.
    if i % 5 = 0 then
      insert into public.odeme (sporcu_id, aciklama, tutar, yontem, durum, son_odeme_tarihi, kulup_id)
      values (v_sporcu, 'Aylık aidat', 1500, 'havale', 'gecikti', current_date - 12, v_kulup);
    else
      insert into public.odeme (sporcu_id, aciklama, tutar, yontem, durum, odendi_tarihi, kulup_id)
      values (v_sporcu, 'Aylık aidat', 1500, 'havale', 'odendi', current_date - (i % 20), v_kulup);
    end if;
  end loop;

  -- --- Antrenman + yoklama geçmişi ----------------------------------------
  -- Yoklama raporu ve grafikler boş kalmasın diye son 3 haftadan kayıt.
  for i in 1 .. 12 loop
    declare v_ant uuid := gen_random_uuid();
    begin
      insert into public.antrenman (id, grup_id, tarih, saat1, tesis,
                                    yoklama_kaydedildi, kulup_id)
      values (v_ant, v_gruplar[1 + (i % array_length(v_gruplar, 1))],
              current_date - (i * 2), '18:00', 'Merkez Salon', true, v_kulup);

      insert into public.yoklama (antrenman_id, sporcu_id, durum, kulup_id)
      select v_ant, s.id,
             case when random() < 0.88 then 'katildi' else 'katilmadi' end,
             v_kulup
        from public.sporcular s
       where s.kulup_id = v_kulup
         and s.grup_id = v_gruplar[1 + (i % array_length(v_gruplar, 1))];
    end;
  end loop;

  -- --- Kurum ayarları: beyaz etiket ---------------------------------------
  -- Prospect panele girdiğinde KENDİ kulübünün adını görüyor. Beyaz etiket
  -- zaten tek kaynaktan besleniyor; demoyu ikna edici yapan şey bu.
  insert into public.kurum_ayarlari (kulup_adi, telefon, eposta, kulup_id)
  values (p_kulup_adi, '0500 000 00 00', p_eposta, v_kulup)
  on conflict (kulup_id) do update set kulup_adi = excluded.kulup_adi;

  return query
    select v_kulup, lower(btrim(p_eposta)), p_sifre,
           (select count(*)::int from public.sporcular s where s.kulup_id = v_kulup);
end;
$$;

-- Yalnızca platform sahibi çalıştırır. authenticated'a AÇILMIYOR: bu fonksiyon
-- auth.users'a yazıyor ve kulüp açıyor — istemciye verilecek bir yetki değil.
revoke all on function public.demo_kulup_olustur(text, text, text) from public, anon, authenticated;


-- ===========================================================================
-- DEMO KULÜBÜ SİLME
-- ===========================================================================
-- Demo süresi dolan kulübü tek çağrıyla temizler. Kulüp satırındaki cascade'ler
-- veriyi götürüyor; auth.users satırları cascade kapsamında olmadığı için
-- ayrıca siliniyor.
create or replace function public.demo_kulup_sil(p_kulup_id uuid)
returns void
language plpgsql
security invoker   -- ŞART — bkz. başlıktaki "NEDEN SECURITY DEFINER DEĞİL"
set search_path = public, extensions
as $$
declare
  v_kullanicilar uuid[];
  r              record;
  v_tur          int := 0;
  v_silinen      bigint;
  v_toplam       bigint;
begin
  select array_agg(id) into v_kullanicilar from public.profiles where kulup_id = p_kulup_id;

  -- ÖNCE KULLANICILAR: auth.users silinince profiles satırı
  -- `profiles.id → auth.users(id)` cascade'iyle gidiyor.
  if v_kullanicilar is not null then
    delete from auth.users where id = any(v_kullanicilar);
  end if;

  -- KULÜBE BAĞLI TABLOLAR KATALOGDAN SÜRÜLÜYOR, SABİT LİSTEDEN DEĞİL.
  -- `kulup`'a bakan FK'lerin çoğu cascade DEĞİL (sube, aidat_plani, grup…),
  -- yani kulübü doğrudan silmek "still referenced from table sube" ile düşüyor
  -- (ölçüldü). Sabit bir tablo listesi yazmak ise 0029'da tam olarak bozulmuştu:
  -- listeye alınmayan bir tablo eklendiğinde fonksiyon sessizce çalışmaz hâle
  -- gelir. Katalogdan sürmek yeni tabloyu kendiliğinden kapsıyor.
  --
  -- Tekrarlı geçiş, bağımlılık sırasını çözmenin en basit yolu: bir turda
  -- silinemeyen satır (başka tablo ona bakıyor) sonraki turda silinir. Hiçbir
  -- şey silinmeyen tur geldiğinde bitiyor.
  loop
    v_tur    := v_tur + 1;
    v_toplam := 0;

    for r in
      select c.relname as tablo
        from pg_constraint fk
        join pg_class c on c.oid = fk.conrelid
        join pg_namespace n on n.oid = c.relnamespace
       where fk.contype = 'f'
         and fk.confrelid = 'public.kulup'::regclass
         and n.nspname = 'public'
         and c.relname <> 'kulup'
    loop
      begin
        execute format('delete from public.%I where kulup_id = $1', r.tablo) using p_kulup_id;
        get diagnostics v_silinen = row_count;
        v_toplam := v_toplam + v_silinen;
      exception when foreign_key_violation then
        null;   -- bu turda sırası gelmedi; sonraki turda denenecek
      end;
    end loop;

    exit when v_toplam = 0 or v_tur > 10;
  end loop;

  delete from public.kulup where id = p_kulup_id;
end;
$$;

revoke all on function public.demo_kulup_sil(uuid) from public, anon, authenticated;
