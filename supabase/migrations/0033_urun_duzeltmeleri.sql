-- ===========================================================================
-- 0033 — Ürün düzeltmeleri: gecikme görünümü, gelişim dönemi, kadro görünürlüğü
-- ===========================================================================
-- Üçü de aynı sınıftan: ŞEMA HAZIR, EKRAN HAZIR, ARADAKİ BAĞ YOK. Sonuç,
-- kullanıcının çalıştığını sandığı ama hiçbir şey yapmayan yüzeyler.
--
--   1) odeme_gorunum      — 'gecikti' durumunu HİÇBİR KOD YAZMIYOR. Dokuz okuma
--                           noktası ve tüm gecikme rozetleri kalıcı olarak ölü.
--   2) gelisim dönemi     — unique(sporcu_id) geçmiş tutmayı engelliyor;
--                           antrenör notu güncelleyince öncekini kalıcı siliyor.
--   3) maç kadrosu        — veli için tek SELECT politikası yok; antrenörün
--                           "Yayınla" düğmesi hiçbir şey yayınlamıyor.
--
-- ÇALIŞTIRMA: 0032'den sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) odeme_gorunum — EFEKTİF ÖDEME DURUMU
-- ===========================================================================
-- SORUN
--   odeme.durum kolonunun 'gecikti' değeri kod tabanında HİÇ YAZILMIYOR —
--   yalnızca okunuyor (sporcularRepo, veliRepo, yoneticiRepo, panelin aidatlar
--   / cari / genel-bakis / sporcular ekranları, CSV çıktısı, sporcu detayı).
--   Yani panelin "Geciken Ödeme" kartı sonsuza kadar 0, velinin GECİKTİ rozeti
--   hiç yanmıyor. Demo sırasında müşteri "geciken: 0" yazan bir tahsilat ekranı
--   görüyor.
--
-- NEDEN KOLON GÜNCELLEMEK YERİNE GÖRÜNÜM
--   Gecikme bir DURUM DEĞİŞİKLİĞİ değil, ZAMANIN GEÇMESİDİR. Kolonu güncellemek
--   için her gün çalışan bir işe (pg_cron) ihtiyaç olurdu; iş çalışmadığı gün
--   veri yine yanlış olurdu. Görünüm her sorguda doğru cevabı verir ve
--   bakım gerektirmez.
--
-- security_invoker = on: alttaki odeme tablosunun RLS'i ve kiracı duvarı aynen
-- geçerli (0027'deki aynı gerekçe).
create or replace view public.odeme_gorunum
with (security_invoker = on) as
select
  o.*,
  -- Efektif durum: ödenmişse ödenmiş; son ödeme tarihi geçmiş ve hâlâ
  -- bekliyorsa gecikmiş. son_odeme_tarihi NULL ise (tarihi belirlenmemiş
  -- tahakkuk) gecikme hesaplanamaz, 'bekliyor' kalır.
  case
    when o.durum = 'odendi' then 'odendi'
    when o.durum = 'bekliyor' and o.son_odeme_tarihi is not null
         and o.son_odeme_tarihi < current_date then 'gecikti'
    else o.durum
  end as efektif_durum,
  -- Kaç gün gecikti (yaşlandırma raporu için). Gecikmemişse 0.
  case
    when o.durum = 'bekliyor' and o.son_odeme_tarihi is not null
         and o.son_odeme_tarihi < current_date
    then (current_date - o.son_odeme_tarihi)
    else 0
  end as gecikme_gun
from public.odeme o;

comment on view public.odeme_gorunum is
  'Ödeme + efektif_durum (gecikti hesaplanır, yazılmaz) + gecikme_gun (0033). security_invoker=on → odeme tablosunun RLS''i aynen geçerli. Gecikme zamanın geçmesidir; kolon güncellemek her gün çalışan bir iş gerektirirdi.';

grant select on public.odeme_gorunum to authenticated;


-- ===========================================================================
-- 2) GELİŞİM DEĞERLENDİRMESİ — DÖNEM
-- ===========================================================================
-- SORUN
--   `sporcu_id uuid not null unique` → sporcu başına TEK satır. Antrenör
--   değerlendirmeyi güncellediğinde önceki dönem KALICI OLARAK SİLİNİYOR.
--   Oysa bir spor okulunun veliye satabileceği en güçlü cümle tam da geçmişe
--   dayanıyor: "çocuğunuz eylülde 2 seviyesindeydi, şimdi 4".
--   Arayüzdeki arşiv modalı da bu yüzden hiçbir zaman açılamayan ölü koddu.
--
-- DÖNEM = AY. Hakediş tablosundaki `donem_ay date` deseninin aynısı ve
-- ekranın zaten kullandığı dil ("Temmuz dönemi").

alter table public.gelisim_degerlendirme
  add column if not exists donem_ay date not null default date_trunc('month', current_date)::date;

-- Mevcut satırların dönemi: değerlendirme gönderildiyse gönderim tarihi, yoksa
-- oluşturulma tarihi. Varsayılanın (bugünün ayı) hepsini aynı aya yığmasını
-- engelliyor — eski kayıtlar kendi ayına düşsün.
update public.gelisim_degerlendirme
   set donem_ay = date_trunc('month', coalesce(tarih, created_at::date))::date
 where donem_ay = date_trunc('month', current_date)::date
   and coalesce(tarih, created_at::date) < date_trunc('month', current_date)::date;

-- Eski tekillik kısıtını kaldır, dönem bazlısını koy.
-- Kısıt adı Postgres'in ürettiği varsayılan: <tablo>_<kolon>_key
alter table public.gelisim_degerlendirme drop constraint if exists gelisim_degerlendirme_sporcu_id_key;
alter table public.gelisim_degerlendirme drop constraint if exists gelisim_degerlendirme_sporcu_donem_uniq;
alter table public.gelisim_degerlendirme add constraint gelisim_degerlendirme_sporcu_donem_uniq
  unique (sporcu_id, donem_ay);

comment on column public.gelisim_degerlendirme.donem_ay is
  'Değerlendirmenin ait olduğu ay (ayın 1''i). Sporcu başına dönem başına tek satır (0033). Eskiden sporcu başına TEK satır vardı ve her güncelleme öncekini siliyordu.';

-- Sporcu detayında dönemleri tarihe göre listelemek için.
create index if not exists gelisim_degerlendirme_sporcu_donem_idx
  on public.gelisim_degerlendirme (sporcu_id, donem_ay desc);


-- ===========================================================================
-- 3) MAÇ KADROSU VELİYE AÇILIYOR
-- ===========================================================================
-- SORUN
--   mac_kadro ve mac_kadro_sporcu üzerinde YALNIZCA yönetici ve antrenör
--   politikaları var; veli için tek satır yok. Yani antrenörün maç kadrosunu
--   "Yayınla" düğmesi bugün hiçbir şey yayınlamıyor — kadro hiçbir velinin
--   göremediği bir yere yazılıyor.
--   Maç günü velinin en çok sorduğu soru "çocuğum kadroda mı".
--
-- YAYINLANDI ŞARTI KRİTİK: antrenör kadroyu kurarken üzerinde oynuyor
-- (sporcu ekliyor, çıkarıyor). Yayınlanmamış kadronun veliye görünmesi,
-- "çocuğum kadrodaydı, sonra çıkarılmış" tartışmasını doğurur. Veli yalnızca
-- yayınlanmış kadroyu görür.
drop policy if exists "mac_kadro: veli yayınlanmış kadroyu görür" on public.mac_kadro;
create policy "mac_kadro: veli yayınlanmış kadroyu görür" on public.mac_kadro for select
  using (
    mac_kadro.yayinlandi
    and exists (
      select 1
        from public.etkinlik e
        join public.sporcular s on s.grup_id = e.grup_id
        join public.veli_sporcu vs on vs.sporcu_id = s.id
       where e.id = mac_kadro.etkinlik_id
         and vs.veli_id = auth.uid()
    )
  );

-- Veli kadro SATIRLARINDAN yalnızca KENDİ ÇOCUĞUNUNKİNİ görür.
-- Tüm kadroyu göstermek başka velilerin çocuklarının seçilip seçilmediğini
-- ifşa ederdi — kulüp içi bir hassasiyet ve gereksiz bir veri paylaşımı.
drop policy if exists "mac_kadro_sporcu: veli kendi çocuğunu görür" on public.mac_kadro_sporcu;
create policy "mac_kadro_sporcu: veli kendi çocuğunu görür" on public.mac_kadro_sporcu for select
  using (
    exists (
      select 1 from public.veli_sporcu vs
       where vs.sporcu_id = mac_kadro_sporcu.sporcu_id
         and vs.veli_id = auth.uid()
    )
    and exists (
      select 1 from public.mac_kadro mk
       where mk.id = mac_kadro_sporcu.mac_kadro_id
         and mk.yayinlandi
    )
  );


-- ===========================================================================
-- 4) DOĞRULAMA
-- ===========================================================================
--   -- Gecikme görünümü:
--   select efektif_durum, count(*) from public.odeme_gorunum group by 1;
--
--   -- Gelişim dönemi:
--   select conname from pg_constraint
--    where conrelid = 'public.gelisim_degerlendirme'::regclass and contype = 'u';
--     → gelisim_degerlendirme_sporcu_donem_uniq görünmeli,
--       gelisim_degerlendirme_sporcu_id_key GÖRÜNMEMELİ
--
--   -- Veli kadroyu görüyor mu (veli oturumunda):
--   select count(*) from public.mac_kadro;              -- yayınlanmışlar
--   select count(*) from public.mac_kadro_sporcu;       -- yalnızca kendi çocuğu
-- ===========================================================================
