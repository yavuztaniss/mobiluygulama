-- Faz 2: Finans/Ödemeler gerçek tabloya taşınıyor. Tek `odeme` tablosu hem
-- Yönetici'nin "Tahsilatlar" listesini (durum='odendi') hem Veli'nin güncel
-- aidat durumu + geçmişini (aynı sporcuya ait satırlar) besliyor — artık
-- paymentLedger.ts'teki gibi ayrı, isimle eşleştirilen bir kaynak yok.

create table aidat_plani (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alt text,
  fiyat numeric not null,
  beklenen numeric,
  sube_id uuid references sube(id)
);

create table odeme (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  aciklama text not null,
  tutar numeric not null,
  yontem text not null check (yontem in ('kart', 'havale', 'elden')),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'gecikti', 'odendi')),
  son_odeme_tarihi date,
  odendi_tarihi date,
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table aidat_plani enable row level security;
alter table odeme enable row level security;

create policy "aidat_plani: giriş yapan herkes okur" on aidat_plani for select using (auth.uid() is not null);
create policy "aidat_plani: yönetici yazar" on aidat_plani for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "odeme: yönetici tümünü görür" on odeme for select
  using (private.current_profile_role() = 'yonetici');
create policy "odeme: veli bağlı sporcusunu görür" on odeme for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = odeme.sporcu_id and vs.veli_id = auth.uid()));
create policy "odeme: yönetici yazar" on odeme for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "odeme: yönetici günceller" on odeme for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- Seed — MOCK_PLANLAR (src/data/mock/finans.ts) ile birebir.
insert into aidat_plani (ad, alt, fiyat, beklenen) values
  ('Basketbol Aylık', 'U12-U14 · haftada 3 gün', 1250, 43750),
  ('Yüzme Aylık', 'U10-U12 · haftada 2 gün', 1100, 30800),
  ('Jimnastik Aylık', 'U8-U10 · haftada 3 gün', 950, 19000),
  ('Voleybol Aylık', 'U12 · haftada 2 gün', 1050, 21000);

-- Küme B (Yönetici roster) — bugünkü MOCK_TAHSILATLAR ile aynı 5 kayıt, tarihler
-- migration ne zaman çalıştırılırsa çalıştırılsın "güncel" görünsün diye bugüne göreli.
insert into odeme (sporcu_id, aciklama, tutar, yontem, durum, odendi_tarihi) values
  ('5000000f-0000-0000-0000-000000000001', 'Temmuz aidatı', 1250, 'kart', 'odendi', current_date),
  ('50000012-0000-0000-0000-000000000001', 'Temmuz aidatı', 1050, 'havale', 'odendi', current_date),
  ('50000013-0000-0000-0000-000000000001', 'Temmuz aidatı', 1100, 'elden', 'odendi', current_date - 1),
  ('50000015-0000-0000-0000-000000000001', 'Temmuz aidatı', 1100, 'kart', 'odendi', current_date - 1),
  ('50000010-0000-0000-0000-000000000001', 'Temmuz aidatı', 950, 'kart', 'odendi', current_date - 3);

-- Küme A (Veli demo hesabının çocukları) — eskiden paymentLedger.ts'te ODEME_OZET
-- olarak tutulan geçmiş, artık gerçek satırlar. Ali: güncel aidatı gecikmiş +
-- 3 geçmiş ödeme. Zeynep: en son (Temmuz) ödemesi yapılmış + 2 geçmiş ödeme.
insert into odeme (sporcu_id, aciklama, tutar, yontem, durum, son_odeme_tarihi) values
  ('50000000-0000-0000-0000-000000000001', 'Temmuz aidatı · Basketbol U12', 1250, 'kart', 'gecikti', current_date - 4);

insert into odeme (sporcu_id, aciklama, tutar, yontem, durum, odendi_tarihi) values
  ('50000000-0000-0000-0000-000000000001', 'Haziran aidatı', 1250, 'kart', 'odendi', current_date - 30),
  ('50000000-0000-0000-0000-000000000001', 'Mayıs aidatı', 1250, 'kart', 'odendi', current_date - 60),
  ('50000000-0000-0000-0000-000000000001', 'Nisan aidatı', 1250, 'havale', 'odendi', current_date - 90),
  ('50000016-0000-0000-0000-000000000001', 'Temmuz aidatı · Yüzme U10', 1100, 'kart', 'odendi', current_date - 3),
  ('50000016-0000-0000-0000-000000000001', 'Haziran aidatı', 1100, 'kart', 'odendi', current_date - 33),
  ('50000016-0000-0000-0000-000000000001', 'Mayıs aidatı', 1100, 'kart', 'odendi', current_date - 63);
