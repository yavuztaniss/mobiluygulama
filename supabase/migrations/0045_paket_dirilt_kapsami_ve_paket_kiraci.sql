-- ===========================================================================
-- 0045 — 0041'in diriltme kapısındaki delik + paket_id'de kiracı bütünlüğü
-- ===========================================================================
-- Kaynak: 0041 sonrası para akışı denetimi. Üç bulgu da yerelde ÖLÇÜLDÜ.
--
--
-- ===========================================================================
-- 1) DİRİLTME DÖNGÜSÜ HÂLÂ AÇIK — 0041 yalnızca iki hedef durumu kapatmış
-- ===========================================================================
-- 0041, `paket_dirilt`'i şu koşulla kurdu:
--     old.durum in ('reddedildi','iptal') and new.durum in ('onay_bekliyor','onaylandi')
-- Oysa `paket_iade` iade setinden ÇIKIŞI değil, iade setine GİRİŞİ ölçüyor:
--     new.durum in ('reddedildi','iptal') and old.durum not in ('reddedildi','iptal')
-- İki koşul simetrik değil. Aradaki fark tam olarak iki durum: 'tamamlandi' ve
-- 'gelmedi'. Bu ikisine dönüldüğünde düşüm YAPILMIYOR, sonraki iptalde ise
-- iade YAPILIYOR — 0041'in kapattığını iddia ettiği sonsuz hak üretimi aynen
-- duruyor, sadece 'onaylandi' yerine 'tamamlandi' kullanılıyor.
--
-- ÖLÇÜLDÜ (toplam=10, kalan=5, tek rezervasyon, yönetici JWT'si):
--   insert                                kalan 5 -> 4
--   onay_bekliyor -> iptal (iade)               -> 5
--   iptal -> tamamlandi (DÜŞÜM YOK)             -> 5   <-- delik
--   tamamlandi -> iptal (iade)                  -> 6
--   iptal -> gelmedi -> iptal                   -> 7
--   iki tur daha                                -> 9   (tavan toplam=10)
--   karşılaştırma: iptal -> onaylandi           -> 8   (0041'in yolu çalışıyor)
-- Yani rezervasyon hâlâ ayakta ve pakette 9 hak var: 10 derslik pakete 10+
-- ders sığdırılıyor.
--
-- KİM: yönetici (ve service_role). Veli ile antrenörün 'iptal'/'reddedildi'
-- satırında UPDATE politikası yok — ölçüldü, UPDATE 0 dönüyor. 0041 aynı
-- aktörü "düzeltilmeye değer" saymıştı; bu onun tamamlanmamış hâli.
--
-- KÖTÜ NİYET GEREKMİYOR: antrenör yanlışlıkla reddettiğinde (iade +1) yönetici
-- "ders aslında yapıldı" deyip 'tamamlandi' işaretler. Bu tek tıkla hem iade
-- edilen hak pakette kalır hem ders finans raporuna ve antrenör hakedişine
-- girer (finansRepo.getFinansOzet ve bireyselRepo.brutForMonth
-- durum='tamamlandi' satırlarının tutarını topluyor).
--
-- ÇÖZÜM: koşulu paket_iade'nin AYNASI yap. İade seti tek kavram olarak
-- tanımlanıyor:
--   · iade   = iade setine giriş  -> +1
--   · dirilt = iade setinden çıkış -> -1
-- Hedef durumu tek tek saymak yerine "iade setinde değil" demek, ileride yeni
-- bir durum eklendiğinde (örn. 'ertelendi') deliği kendiliğinden kapatır.
-- Listeyi genişletmek seçilmedi: 0041 zaten liste sayarak buraya düştü.

create or replace function public.paket_dirilt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kalan int;
begin
  if new.odeme_tipi <> 'paket' or new.paket_id is null then
    return new;
  end if;

  -- İADE SETİNDEN ÇIKIŞ = hak yeniden tüketiliyor.
  -- (0044) Eskiden new.durum in ('onay_bekliyor','onaylandi') idi ve
  -- 'tamamlandi'/'gelmedi' hedefleri düşümsüz geçiyordu.
  if old.durum in ('reddedildi', 'iptal')
     and new.durum not in ('reddedildi', 'iptal') then

    select kalan into v_kalan
      from public.bireysel_paket
     where id = new.paket_id
       for update;                       -- paket_dus ile aynı kilit deseni

    if coalesce(v_kalan, 0) <= 0 then
      raise exception 'Pakette kalan ders hakkı yok; rezervasyon yeniden aktifleştirilemez.'
        using errcode = 'check_violation';
    end if;

    update public.bireysel_paket
       set kalan = kalan - 1
     where id = new.paket_id;
  end if;

  return new;
end;
$$;


-- ===========================================================================
-- 2) paket_id KİRACIYA BAĞLI DEĞİL — BAŞKA KULÜBÜN PAKETİ BOŞALTILABİLİYOR
-- ===========================================================================
-- 0041, antrenor_id için bileşik FK kurdu ama paket_id düz FK olarak kaldı:
--     bireysel_rezervasyon_paket_id_fkey  FOREIGN KEY (paket_id) -> bireysel_paket(id)
-- "Böyle bir paket var mı" diye soruyor, "BENİM kulübümün paketi mi" diye
-- sormuyor. paket_iade ve paket_dirilt ise SECURITY DEFINER: gövdedeki
-- `update bireysel_paket ... where id = new.paket_id` RLS'i tamamen baypas
-- ediyor ve kiracı kontrolü hiçbir yerde yapılmıyor. (paket_dus sporcu
-- eşleşmesi arıyor ve INSERT yolunu kapatıyor; UPDATE yolunda o kontrol yok.)
--
-- ÖLÇÜLDÜ (A kulübü yöneticisinin gerçek JWT'si, B kulübünün paketi kalan=8):
--   select ... from bireysel_paket where id = <B paketi>   -> 0 satır (RLS sağlam)
--   update bireysel_rezervasyon set paket_id = <B paketi>  -> UPDATE 1  <-- duvar yok
--   update ... set tarih = current_date - 5                -> UPDATE 1
--   iptal -> onaylandi -> iptal -> onaylandi -> iptal -> onaylandi
--   B kulübünün paketi: kalan 8 -> 6   (her diriltme -1, geçmiş tarihte iade yok)
-- Döngü kalan=0'a kadar sürdürülebiliyor: başka bir kulübün velisinin PARASINI
-- ÖDEDİĞİ ders hakları siliniyor ve kurban tarafta hiçbir iz kalmıyor
-- (rezervasyon satırı A kulübünde, B onu göremiyor).
--
-- ÇÖZÜM — KATMAN SEÇİMİ:
--   · Kiracı bütünlüğü bir GÜVENLİK DEĞİŞMEZİ -> yeri FK. FK herkesi bağlar:
--     veli, yönetici, service_role, postgres. RLS politikası seçilseydi
--     service_role yolu (panel createAdminClient()) açık kalırdı; üstelik
--     tetikleyicilerin SECURITY DEFINER gövdesi RLS'i zaten baypas ettiği için
--     hiçbir şey değişmezdi.
--   · Sporcu/antrenör eşleşmesi (kulüp İÇİ bütünlük) -> tetikleyici; FK ile
--     ifade edilemez, çünkü iki tablo arasında değer eşitliği aranıyor.
--
-- Aynı boşluk sporcu_id kolonlarında da var: bireysel_rezervasyon ve
-- bireysel_paket sporcular'a düz FK ile bağlı. Şemadaki DİĞER tüm sporcu
-- bağları (veli_sporcu, sporcu_antrenor, servis_sporcu, etkinlik_katilim,
-- mac_kadro_sporcu) bileşik; bu ikisi istisna kalmış. Aynı migration'da
-- kapatılıyor.

-- Bozuk satır varsa FK eklenemez; önce görünür kılınıyor (0041 deseni).
do $$
declare v_bozuk int;
begin
  select count(*) into v_bozuk
    from public.bireysel_rezervasyon r
    join public.bireysel_paket p on p.id = r.paket_id
   where p.kulup_id is distinct from r.kulup_id;
  if v_bozuk > 0 then
    raise warning '% adet rezervasyon başka kulübün paketine bağlı; paket_id boşaltılıyor.', v_bozuk;
    -- odeme_tipi ile paket_id arasında CHECK var: paket_id boşalırsa tip 'tek' olmalı.
    update public.bireysel_rezervasyon r
       set paket_id = null, odeme_tipi = 'tek'
      from public.bireysel_paket p
     where p.id = r.paket_id and p.kulup_id is distinct from r.kulup_id;
  end if;
end $$;

-- ⚠ SIRA ÖNEMLİ — FK ÖNCE DÜŞÜRÜLÜR. Benzersizlik kısıtını taşıyan indekse
--   bağlı bir FK varken `drop constraint` şu hatayı verir:
--     cannot drop constraint bireysel_paket_id_kulup_uniq ... because other
--     objects depend on it
--   Ölçüldü: migration ikinci kez çalıştırıldığında tam burada patlıyordu.
--   Migration'lar SQL Editor'da elle çalıştırıldığı için yarıda kalan bir
--   denemenin tekrarlanabilmesi gerekiyor; bu yüzden sıra düzeltildi.
alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_paket_id_fkey;
alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_paket_kulup_fkey;

-- Bileşik FK için hedefte (id, kulup_id) benzersizliği gerekiyor. id zaten PK;
-- bu kısıt yalnızca FK'yi mümkün kılmak için (profiles_id_kulup_uniq deseni).
alter table public.bireysel_paket drop constraint if exists bireysel_paket_id_kulup_uniq;
alter table public.bireysel_paket add  constraint bireysel_paket_id_kulup_uniq unique (id, kulup_id);

-- ON DELETE bilinçli olarak NO ACTION (mevcut davranışın aynısı): paketi silmek
-- rezervasyonu sessizce koparmamalı. Sporcu silindiğinde iki tablo da
-- sporcular'dan CASCADE ile birlikte düşüyor; RI kontrolü ifade sonunda
-- yapıldığı için sıralama sorun çıkarmıyor (mevcut düz FK ile aynı davranış).
alter table public.bireysel_rezervasyon add  constraint bireysel_rezervasyon_paket_kulup_fkey
  foreign key (paket_id, kulup_id) references public.bireysel_paket(id, kulup_id);

-- sporcu_id — şemadaki diğer sporcu bağlarıyla aynı hizaya getiriliyor.
do $$
declare v_bozuk int;
begin
  select count(*) into v_bozuk from public.bireysel_rezervasyon r
    join public.sporcular s on s.id = r.sporcu_id where s.kulup_id is distinct from r.kulup_id;
  if v_bozuk > 0 then
    raise exception '% adet rezervasyon başka kulübün sporcusuna bağlı; elle incelenmeli.', v_bozuk;
  end if;
  select count(*) into v_bozuk from public.bireysel_paket b
    join public.sporcular s on s.id = b.sporcu_id where s.kulup_id is distinct from b.kulup_id;
  if v_bozuk > 0 then
    raise exception '% adet paket başka kulübün sporcusuna bağlı; elle incelenmeli.', v_bozuk;
  end if;
end $$;

alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_sporcu_id_fkey;
alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_sporcu_kulup_fkey;
alter table public.bireysel_rezervasyon add  constraint bireysel_rezervasyon_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;

alter table public.bireysel_paket drop constraint if exists bireysel_paket_sporcu_id_fkey;
alter table public.bireysel_paket drop constraint if exists bireysel_paket_sporcu_kulup_fkey;
alter table public.bireysel_paket add  constraint bireysel_paket_sporcu_kulup_fkey
  foreign key (sporcu_id, kulup_id) references public.sporcular(id, kulup_id) on delete cascade;


-- ===========================================================================
-- 3) PAKET–SPORCU–ANTRENÖR EŞLEŞMESİ UPDATE YOLUNDA HİÇ KONTROL EDİLMİYORDU
-- ===========================================================================
-- paket_dus (0037) bu üç bağı doğruluyor ama YALNIZCA INSERT'te. Yönetici
-- protect_bireysel_rezervasyon'dan muaf olduğu için paket_id / sporcu_id /
-- antrenor_id'yi UPDATE ile serbestçe değiştirebiliyor. Bileşik FK kiracı
-- duvarını kurdu; kulüp İÇİNDEKİ karışıklığı (X çocuğunun paketinden Y
-- çocuğunun dersi düşer) FK ifade edemez, tetikleyici gerekiyor.
--
-- Tetikleyici seçildi çünkü bu bir bütünlük değişmezi: service_role ve postgres
-- dahil herkese uygulanmalı. RLS'e konsaydı panelin service_role yolu muaf
-- kalırdı.
--
-- ⚠ new.antrenor_id is not null ŞART: antrenör profili silindiğinde FK
--    "on delete set null (antrenor_id)" rezervasyonu NULL'a çekiyor. Bu da bir
--    UPDATE'tir; koşul konmasaydı tetikleyici o UPDATE'i "paket başka
--    antrenörün" diye reddeder ve HESAP SİLME KIRILIRDI. 0038/0039'da tam
--    olarak bu sınıf hata yaşandı; aşağıda ayrıca karşı-test edildi.
create or replace function public.protect_rezervasyon_paket_baglilik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sporcu uuid;
  v_ant    uuid;
begin
  if new.paket_id is null then
    return new;
  end if;

  -- İlgili alanların hiçbiri değişmediyse doğrulama gereksiz: durum
  -- güncellemeleri (sıcak yol) bu sorguyu hiç çalıştırmasın.
  if new.paket_id     is not distinct from old.paket_id
     and new.sporcu_id   is not distinct from old.sporcu_id
     and new.antrenor_id is not distinct from old.antrenor_id then
    return new;
  end if;

  select bp.sporcu_id, bp.antrenor_id into v_sporcu, v_ant
    from public.bireysel_paket bp where bp.id = new.paket_id;

  if v_sporcu is null then
    raise exception 'Paket bulunamadı.';
  end if;

  if v_sporcu is distinct from new.sporcu_id then
    raise exception 'Bu paket bu sporcuya ait değil.';
  end if;

  if v_ant is not null and new.antrenor_id is not null
     and v_ant is distinct from new.antrenor_id then
    raise exception 'Bu paket başka bir antrenör için alınmış.';
  end if;

  return new;
end;
$$;

-- AD SIRASI ÖNEMLİ: aynı zamanlamadaki tetikleyiciler ada göre çalışır.
-- "...paket_baglilik" < "...paket_dirilt" olduğu için doğrulama düşümden ÖNCE
-- çalışır; geçersiz bir paket_id ile kalan azaltılmaz.
drop trigger if exists on_rezervasyon_paket_baglilik on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_baglilik
  before update on public.bireysel_rezervasyon
  for each row execute procedure public.protect_rezervasyon_paket_baglilik();


-- ===========================================================================
-- 4) paket_dus BEFORE INSERT -> AFTER INSERT
-- ===========================================================================
-- BEFORE INSERT tetikleyicileri, satır ÇATIŞMA NEDENİYLE HİÇ YAZILMASA BİLE
-- çalışır. `insert ... on conflict do nothing` (PostgREST'in
-- "Prefer: resolution=ignore-duplicates" başlığı bunu üretir) gönderildiğinde
-- paket düşüyor ama rezervasyon oluşmuyor.
--   ÖLÇÜLDÜ: kalan 4 -> 3, rezervasyon satır sayısı 1 (yeni satır YOK).
-- Bugün mobil istemci düz .insert() kullanıyor, yani sahada tetiklenmiyor; ama
-- bir yeniden-deneme/upsert eklendiği gün velinin ödediği ders sessizce yanardı.
-- Yön saldırgana değil kullanıcıya zarar veriyor; "açık" değil "tuzak" olarak
-- ele alındı ve kapatıldı.
--
-- AFTER INSERT'te tetikleyici yalnızca GERÇEKTEN YAZILAN satır için çalışır.
-- Eşzamanlılık garantisi değişmiyor: `for update` kilidi aynı transaction
-- içinde alınıyor, ikinci istek kilidi bekleyip güncel kalanı okuyor. Fonksiyon
-- NEW'i değiştirmediği için BEFORE olması zaten gerekmiyordu.
-- `on conflict do update` yolunda da doğru: o satır için INSERT tetikleyicisi
-- değil UPDATE tetikleyicileri çalışır — düşüm bir kez (gerçek insert'te)
-- yapılmıştır, iade de onu geri verir.
drop trigger if exists on_rezervasyon_paket_dus on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_dus
  after insert on public.bireysel_rezervasyon
  for each row execute procedure public.paket_dus();


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
begin
  if position('new.durum not in (''reddedildi'', ''iptal'')' in pg_get_functiondef('public.paket_dirilt'::regproc)) = 0 then
    raise exception '0045: paket_dirilt iade-setinden-çıkış koşulunu taşımıyor.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bireysel_rezervasyon_paket_kulup_fkey') then
    raise exception '0045: paket_id bileşik FK''si yok.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bireysel_rezervasyon_sporcu_kulup_fkey') then
    raise exception '0045: rezervasyon sporcu bileşik FK''si yok.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bireysel_paket_sporcu_kulup_fkey') then
    raise exception '0045: paket sporcu bileşik FK''si yok.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'on_rezervasyon_paket_baglilik') then
    raise exception '0045: paket bağlılık tetikleyicisi kurulmamış.';
  end if;
  -- tgtype 2. bit = BEFORE. AFTER olmalı.
  if exists (select 1 from pg_trigger where tgname = 'on_rezervasyon_paket_dus' and (tgtype & 2) = 2) then
    raise exception '0045: paket_dus hâlâ BEFORE INSERT.';
  end if;

  raise notice '0044 tamam: diriltme kapsamı, paket_id kiracı FK''si, sporcu bileşik FK''leri, bağlılık tetikleyicisi, paket_dus AFTER INSERT.';
end $$;
