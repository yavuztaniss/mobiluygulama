-- ===========================================================================
-- 0036 — Para tutarları sunucuda belirlenir (istemciden kabul edilmez)
-- ===========================================================================
-- AÇIK
--   Sipariş tutarı ve bireysel ders ücreti İSTEMCİDE hesaplanıp veritabanına
--   yazılıyordu:
--     · magazaRepo.olusturSiparis → `tutar` sepetten, `birim_fiyat` sepetteki
--       fiyattan geliyor.
--     · bireyselRepo.rezervasyonOlustur → `tutar`, istemcinin daha önce okuduğu
--       tek_fiyat / paket_fiyat değerinden geliyor.
--   RLS bu tablolarda yalnızca SAHİPLİĞE bakıyor ("kendi sporcusunun siparişi
--   mi"), TUTARA hiç bakmıyor ve tetikleyici de yoktu.
--
--   Sömürü: değiştirilmiş bir istemci `birim_fiyat: 0.01` gönderir; sipariş
--   geçer, kulübün sipariş listesinde 1 kuruş görünür. Ödeme havale/EFT ile
--   yapıldığı için kulüp tahsilatı DOĞRUDAN bu rakamdan yapıyor — yani bu bir
--   raporlama hatası değil, doğrudan para kaybı.
--
-- ÇÖZÜM: REDDETMEK DEĞİL, ÜZERİNE YAZMAK.
--   Tetikleyici istemcinin gönderdiği tutarı doğrulamıyor; ONU YOK SAYIP
--   yetkili kaynaktan yeniden yazıyor. Doğrulama seçilseydi istemcinin kuruş
--   kuruş aynı sonucu üretmesi gerekirdi (yuvarlama, indirim, fiyat değişikliği)
--   ve her uyumsuzluk kullanıcıya anlamsız bir hata olarak dönerdi. Üzerine
--   yazmak hem saldırgana hem de HATALI İSTEMCİYE karşı çalışıyor.
--
-- FİYAT ANLIK OKUNUYOR, DONDURULMUYOR — bilinçli.
--   Sipariş satırı ürünün O ANKİ fiyatını saklıyor (birim_fiyat kolonu zaten
--   var); kulüp sonradan fiyatı değiştirse bile eski sipariş etkilenmiyor.
--   Doğru davranış bu: sipariş bir sözleşmedir.
--
-- BÖLÜMLER
--   1) siparis_kalem — birim fiyat üründen, adet pozitif, ürün aktif
--   2) siparis.tutar — kalemlerden türetilir, istemci yazamaz
--   3) bireysel_rezervasyon.tutar — antrenörün ilan ettiği ücretten
--   4) Doğrulama
--
-- ÇALIŞTIRMA: 0035'ten sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) siparis_kalem — BİRİM FİYAT ÜRÜNDEN
-- ===========================================================================
-- adet için CHECK: negatif adet toplamı da negatif yapardı ("−5 forma" ile
-- siparişi bedavaya getirmek). Kolonun kısıtı yoktu.
alter table public.siparis_kalem drop constraint if exists siparis_kalem_adet_check;
alter table public.siparis_kalem add constraint siparis_kalem_adet_check check (adet > 0);

create or replace function public.siparis_kalem_fiyatla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fiyat numeric;
begin
  select u.fiyat into v_fiyat
    from public.urun u where u.id = new.urun_id;

  if v_fiyat is null then
    raise exception 'Ürün bulunamadı.';
  end if;

  -- AKTİFLİK KONTROLÜ BURADA DEĞİL, RLS POLİTİKASINDA.
  -- İki kez yanlış yere konuldu, ikisi de sessizce çalışmadı:
  --   · current_user = 'authenticated' → bu fonksiyon SECURITY DEFINER, gövdede
  --     current_user ÇAĞIRANI DEĞİL SAHİBİNİ (postgres) verir; koşul hiç tutmadı.
  --   · auth.uid() is not null → demo/seed dosyaları kiracı bağlamı kurabilmek
  --     için kasten bir yönetici kimliği set ediyor; orada da auth.uid() dolu.
  -- Doğru ayrım "kim çağırdı" değil, KURALIN CİNSİ:
  --   · fiyatın üründen yazılması bir GÜVENLİK DEĞİŞMEZİdir → herkese uygulanır,
  --     yeri tetikleyicidir (aşağıda).
  --   · "pasif ürün sipariş edilemez" bir İŞ KURALIdır → yalnızca gerçek
  --     kullanıcıya uygulanmalı, yeri RLS politikasıdır. RLS zaten postgres ve
  --     service_role için baypas edilir, yani seed ve veri taşıma etkilenmez.

  -- İSTEMCİNİN GÖNDERDİĞİ DEĞER YOK SAYILIYOR.
  new.birim_fiyat := v_fiyat;
  return new;
end;
$$;

drop trigger if exists on_siparis_kalem_fiyatla on public.siparis_kalem;
create trigger on_siparis_kalem_fiyatla
  before insert or update on public.siparis_kalem
  for each row execute procedure public.siparis_kalem_fiyatla();


-- ===========================================================================
-- 1b) PASİF ÜRÜN SİPARİŞİ — RLS POLİTİKASINDA
-- ===========================================================================
-- İş kuralı politikada, güvenlik değişmezi tetikleyicide (yukarıdaki gerekçe).
-- RLS yalnızca gerçek kullanıcıya uygulanır; seed ve veri taşıma etkilenmez.
drop policy if exists "siparis_kalem: veli kendi siparişine kalem ekler" on public.siparis_kalem;
create policy "siparis_kalem: veli kendi siparişine kalem ekler" on public.siparis_kalem for insert
  with check (
    exists (
      select 1 from public.siparis s join public.veli_sporcu vs on vs.sporcu_id = s.sporcu_id
      where s.id = siparis_kalem.siparis_id and vs.veli_id = auth.uid()
    )
    and exists (select 1 from public.urun u where u.id = siparis_kalem.urun_id and u.aktif)
  );


-- ===========================================================================
-- 2) siparis.tutar — KALEMLERDEN TÜRETİLİR
-- ===========================================================================
-- Sipariş satırı kalemlerden ÖNCE yazıldığı için tutar insert anında
-- hesaplanamaz; sıfırlanıp kalemler geldikçe güncelleniyor.
create or replace function public.siparis_tutar_sifirla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- INSERT: kalem yok, tutar 0. UPDATE: kalemlerden yeniden hesapla —
  -- böylece istemcinin doğrudan `update siparis set tutar = 1` denemesi de
  -- etkisiz kalıyor.
  select coalesce(sum(sk.adet * sk.birim_fiyat), 0) into new.tutar
    from public.siparis_kalem sk where sk.siparis_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_siparis_tutar on public.siparis;
create trigger on_siparis_tutar
  before insert or update on public.siparis
  for each row execute procedure public.siparis_tutar_sifirla();

-- Kalem eklendiğinde/değiştiğinde/silindiğinde başlık tutarını tazele.
create or replace function public.siparis_tutar_tazele()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siparis uuid := coalesce(new.siparis_id, old.siparis_id);
begin
  -- Bu UPDATE, siparis üzerindeki BEFORE UPDATE tetikleyicisini çalıştırır ve
  -- o da tutarı kalemlerden hesaplar. Döngü yok: siparis tetikleyicisi
  -- siparis_kalem'e yazmıyor.
  update public.siparis set tutar = 0 where id = v_siparis;
  return null;   -- AFTER trigger, dönüş değeri kullanılmıyor
end;
$$;

drop trigger if exists on_siparis_kalem_tutar on public.siparis_kalem;
create trigger on_siparis_kalem_tutar
  after insert or update or delete on public.siparis_kalem
  for each row execute procedure public.siparis_tutar_tazele();


-- ===========================================================================
-- 3) bireysel_rezervasyon.tutar — ANTRENÖRÜN İLAN ETTİĞİ ÜCRETTEN
-- ===========================================================================
create or replace function public.rezervasyon_fiyatla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tek    numeric;
  v_paket  numeric;
  v_adet   int;
begin
  -- 0029'dan sonra antrenor_id NULL olabiliyor (antrenör hesabı silinince
  -- `on delete set null`). O UPDATE geldiğinde ücret yeniden hesaplanamaz ve
  -- hesaplanmamalı da: geçmiş rezervasyonun tutarı olduğu gibi kalmalı.
  if new.antrenor_id is null then
    return new;
  end if;

  -- Yalnızca tutarı etkileyen alanlar değiştiğinde yeniden hesapla. Durum
  -- güncellemeleri (onayla/reddet/tamamlandi) tutara dokunmasın — antrenörün
  -- ilan ettiği ücret sonradan değişse bile geçmiş rezervasyon etkilenmemeli
  -- (sipariş satırındaki aynı "sözleşme" mantığı).
  if TG_OP = 'UPDATE'
     and new.antrenor_id is not distinct from old.antrenor_id
     and new.odeme_tipi  is not distinct from old.odeme_tipi
     and new.tutar       is not distinct from old.tutar then
    return new;
  end if;

  select ba.tek_fiyat, ba.paket_fiyat, ba.paket_ders_sayisi
    into v_tek, v_paket, v_adet
    from public.bireysel_antrenor ba
   where ba.antrenor_id = new.antrenor_id;

  if v_tek is null then
    raise exception 'Bu antrenörün bireysel ders ücreti tanımlı değil.';
  end if;

  -- İSTEMCİNİN GÖNDERDİĞİ DEĞER YOK SAYILIYOR.
  if new.odeme_tipi = 'paket' then
    -- Paket dersinin birim maliyeti. nullif ile sıfıra bölme korunuyor:
    -- paket_ders_sayisi 0 olsaydı sorgu hata verirdi.
    new.tutar := round(v_paket / nullif(v_adet, 0));
  else
    new.tutar := v_tek;
  end if;

  return new;
end;
$$;

drop trigger if exists on_rezervasyon_fiyatla on public.bireysel_rezervasyon;
create trigger on_rezervasyon_fiyatla
  before insert or update on public.bireysel_rezervasyon
  for each row execute procedure public.rezervasyon_fiyatla();


-- ===========================================================================
-- 4) DOĞRULAMA
-- ===========================================================================
--   -- Sahte fiyatla sipariş: yazılan değer ÜRÜNÜN fiyatı olmalı
--   insert into public.siparis (sporcu_id) values ('<sporcu>') returning id;
--   insert into public.siparis_kalem (siparis_id, urun_id, adet, birim_fiyat)
--   values ('<siparis>', '<urun>', 2, 0.01);
--   select birim_fiyat from public.siparis_kalem where siparis_id = '<siparis>';
--     → ürünün gerçek fiyatı (0.01 DEĞİL)
--   select tutar from public.siparis where id = '<siparis>';
--     → 2 × gerçek fiyat
--
--   -- Negatif adet reddedilmeli:
--   insert into public.siparis_kalem (..., adet) values (..., -5);   → ERROR
--
--   -- Sahte ücretle rezervasyon:
--   insert into public.bireysel_rezervasyon (antrenor_id, sporcu_id, tarih, saat, odeme_tipi, tutar)
--   values ('<ant>','<spr>', current_date+1, '10:00', 'tek', 1);
--     → tutar antrenörün tek_fiyat'ı olmalı
-- ===========================================================================
