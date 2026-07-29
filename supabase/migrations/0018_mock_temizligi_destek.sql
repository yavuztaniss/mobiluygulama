-- 0018: Mock temizliği destek şeması (2026-07-29 denetimi sonrası)
--
-- 1) Veli "Sporcu Ekle" (deneme dersi başvurusu) akışı gerçekleştiriliyor:
--    ekran şimdiye dek hiçbir yere yazmıyordu (400ms setTimeout + sahte onay).
--    Veli artık kendi adına DENEME başvurusu ekleyebilir ve kendi başvurularının
--    durumunu görebilir — Yönetici > Başvurular zaten bu tabloyu okuyor/onaylıyor.

create policy "basvuru: veli kendi başvurusunu ekler" on basvuru for insert
  with check (
    created_by = auth.uid()
    and private.current_profile_role() = 'veli'
    and tag = 'DENEME'
    and durum = 'bekliyor'
    and sporcu_id is null
  );

create policy "basvuru: veli kendi başvurusunu görür" on basvuru for select
  using (created_by = auth.uid());

-- 2) Servis ekranlarındaki "Ara" butonları boş `tel:` açıyordu — şoföre ait
--    gerçek bir telefon kolonu ekleniyor (boşsa uygulama butonu gizler).
--    Yönetici rota formundan doldurulabilir; mevcut satırlarda null kalır.

alter table servis_rota add column if not exists sofor_telefon text;

-- 3) Veli, çocuğunun antrenörünü hiç göremiyordu: sporcu_antrenor'da veli için
--    SELECT politikası yoktu (0004 yalnızca yönetici + antrenörün kendisi) —
--    ana sayfadaki "bugünkü antrenman" antrenör satırı, gelişim ekranındaki koç
--    bilgisi ve mesaj rehberi bu yüzden gerçek veli hesabında hep boş kalıyordu
--    (paylaşılan test hesabı aynı anda antrenör de olduğu için fark edilmemişti).

create policy "sporcu_antrenor: veli bağlı sporcusunun antrenörünü görür" on sporcu_antrenor for select
  using (exists (
    select 1 from veli_sporcu vs
    where vs.sporcu_id = sporcu_antrenor.sporcu_id and vs.veli_id = auth.uid()
  ));
