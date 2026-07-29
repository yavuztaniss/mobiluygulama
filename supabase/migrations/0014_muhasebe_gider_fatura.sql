-- Web Yönetim Paneli Faz 3: Muhasebe modülü. Ödemeler/Aidatlar zaten gerçek
-- `odeme`/`aidat_plani` tablolarını kullanıyordu (bkz. 0007) — bu migration yalnızca
-- eksik iki parçayı ekliyor: giderler (kulübün kendi masrafları, hiç tablosu yoktu)
-- ve faturalar (dahili kayıt amaçlı, gerçek e-fatura entegrasyonu değil). Ayrıca
-- Aidatlar sekmesinin "Plan" kolonunun gerçek bir `aidat_plani`ya bağlanabilmesi için
-- `odeme`ye nullable bir FK ekleniyor — var olan satırlar etkilenmiyor (null kalıyor).

alter table odeme add column aidat_plani_id uuid references aidat_plani(id);

create table gider (
  id uuid primary key default gen_random_uuid(),
  tarih date not null default current_date,
  kategori text not null,
  aciklama text,
  tutar numeric not null,
  yontem text not null check (yontem in ('kart', 'havale', 'elden')),
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table fatura (
  id uuid primary key default gen_random_uuid(),
  fatura_no text not null unique,
  sporcu_id uuid not null references sporcular(id),
  tutar numeric not null,
  tarih date not null default current_date,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'odendi')),
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table gider enable row level security;
alter table fatura enable row level security;

-- Giderler ve faturalar hem kaynak hem hedef olarak tamamen dahili/yönetici işi —
-- veli/antrenör tarafında bugün karşılığı olan bir ekran yok (mobil uygulamada da
-- yok), o yüzden `odeme`nin aksine üçüncü bir role hiç açılmıyor.
create policy "gider: yönetici tam yetkili" on gider for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "fatura: yönetici tam yetkili" on fatura for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- Seed — Genel Bakış/Mali Rapor'un boş görünmemesi için birkaç gerçekçi kayıt.
insert into gider (tarih, kategori, aciklama, tutar, yontem) values
  (current_date - 3, 'Kira', 'Merkez tesis aylık kira', 45000, 'havale'),
  (current_date - 5, 'Personel', 'Antrenör maaş ödemesi', 38000, 'havale'),
  (current_date - 10, 'Malzeme', 'Basketbol topu + forma yenileme', 6200, 'kart'),
  (current_date - 20, 'Kira', 'Merkez tesis aylık kira', 45000, 'havale');

insert into fatura (fatura_no, sporcu_id, tutar, tarih, durum) values
  ('FT-2026-0001', '50000000-0000-0000-0000-000000000001', 1250, current_date - 4, 'odendi'),
  ('FT-2026-0002', '5000000f-0000-0000-0000-000000000001', 1050, current_date - 1, 'bekliyor');
