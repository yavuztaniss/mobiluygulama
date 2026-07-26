-- Faz 1: temel kimlik/organizasyon şeması — şube, branş, hizmet türü, grup, sporcular,
-- veli↔sporcu ve antrenör↔sporcu ilişkileri. Diğer tüm alanlar (finans, yoklama,
-- etkinlik, mesaj, bildirim, mağaza, servis, bireysel ders, hakediş, başvurular)
-- bu fazda hâlâ mock kalıyor — sonraki fazlarda ayrı migration'larla eklenecek.

-- ---------------------------------------------------------------------------
-- Yardımcı fonksiyon: RLS politikalarında tekrar tekrar profiles sorgusu
-- yazmamak için. security definer ile profiles'ın kendi RLS'ine takılmadan
-- çağıranın rolünü döndürür.
create or replace function public.current_profile_role()
returns text
language sql stable
security definer set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Kurum / organizasyon kataloğu

create table sube (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  alt_bilgi text
);

create table brans (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  ikon text
);

create table hizmet_turu (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aciklama text,
  ikon text
);

create table kurum_brans_secimi (
  sube_id uuid not null references sube(id) on delete cascade,
  brans_id uuid not null references brans(id) on delete cascade,
  primary key (sube_id, brans_id)
);

create table kurum_hizmet_turu_secimi (
  sube_id uuid not null references sube(id) on delete cascade,
  hizmet_turu_id uuid not null references hizmet_turu(id) on delete cascade,
  primary key (sube_id, hizmet_turu_id)
);

create table grup (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  brans_id uuid references brans(id),
  sube_id uuid references sube(id)
);

-- profiles.sube_id zaten uuid idi (0001_profiles.sql), şimdi gerçek FK bağlanıyor.
alter table profiles add constraint profiles_sube_id_fkey foreign key (sube_id) references sube(id);

-- ---------------------------------------------------------------------------
-- Sporcular (birleşik roster — bkz. Faz 1 planındaki "Ali Kaya problemi" notu:
-- isimle eşleştirme yapılmıyor, her satır kendi gerçek uuid'siyle var oluyor).
-- veli_ad/veli_telefon/veli_yakinlik ve odeme_durumu bilinçli olarak burada
-- düz metin/sütun olarak tutuluyor (bugünkü mock Sporcu tipiyle birebir) —
-- her veli için gerçek profiles satırı olmadığından tam ilişkisel hale
-- getirmek ileri bir faz konusu; RLS'i sağlayan gerçek ilişki veli_sporcu'dur.

create table sporcular (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  numara int,
  brans_id uuid references brans(id),
  grup_id uuid references grup(id),
  sube_id uuid references sube(id),
  odeme_durumu text not null default 'guncel' check (odeme_durumu in ('guncel', 'gecikmis')),
  veli_ad text,
  veli_telefon text,
  veli_yakinlik text,
  dogum_yili int,
  kayit_tarihi text,
  created_at timestamptz not null default now()
);

create table veli_sporcu (
  veli_id uuid not null references profiles(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  yakinlik text,
  primary key (veli_id, sporcu_id)
);

create table sporcu_antrenor (
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  antrenor_id uuid not null references profiles(id) on delete cascade,
  primary key (sporcu_id, antrenor_id)
);

-- ---------------------------------------------------------------------------
-- RLS

alter table sube enable row level security;
alter table brans enable row level security;
alter table hizmet_turu enable row level security;
alter table kurum_brans_secimi enable row level security;
alter table kurum_hizmet_turu_secimi enable row level security;
alter table grup enable row level security;
alter table sporcular enable row level security;
alter table veli_sporcu enable row level security;
alter table sporcu_antrenor enable row level security;

-- Katalog tabloları: herkes okuyabilir, yalnızca yönetici yazabilir.
create policy "sube: giriş yapan herkes okur" on sube for select using (auth.uid() is not null);
create policy "sube: yönetici yazar" on sube for all using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

create policy "brans: giriş yapan herkes okur" on brans for select using (auth.uid() is not null);
create policy "brans: yönetici yazar" on brans for all using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

create policy "hizmet_turu: giriş yapan herkes okur" on hizmet_turu for select using (auth.uid() is not null);
create policy "hizmet_turu: yönetici yazar" on hizmet_turu for all using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

create policy "kurum_brans_secimi: giriş yapan herkes okur" on kurum_brans_secimi for select using (auth.uid() is not null);
create policy "kurum_brans_secimi: yönetici yazar" on kurum_brans_secimi for all using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

create policy "kurum_hizmet_turu_secimi: giriş yapan herkes okur" on kurum_hizmet_turu_secimi for select using (auth.uid() is not null);
create policy "kurum_hizmet_turu_secimi: yönetici yazar" on kurum_hizmet_turu_secimi for all using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

create policy "grup: giriş yapan herkes okur" on grup for select using (auth.uid() is not null);
create policy "grup: yönetici yazar" on grup for all using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

-- Sporcular: yönetici tümünü görür/yazar; antrenör kendine bağlı sporcuları görür;
-- veli kendine bağlı sporcuları görür.
create policy "sporcular: yönetici tümünü görür" on sporcular for select
  using (current_profile_role() = 'yonetici');
create policy "sporcular: antrenör bağlı olduklarını görür" on sporcular for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = sporcular.id and sa.antrenor_id = auth.uid()));
create policy "sporcular: veli bağlı olduklarını görür" on sporcular for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = sporcular.id and vs.veli_id = auth.uid()));
create policy "sporcular: yönetici ekler/günceller" on sporcular for insert
  with check (current_profile_role() = 'yonetici');
create policy "sporcular: yönetici günceller" on sporcular for update
  using (current_profile_role() = 'yonetici') with check (current_profile_role() = 'yonetici');

create policy "veli_sporcu: yönetici tümünü görür" on veli_sporcu for select
  using (current_profile_role() = 'yonetici');
create policy "veli_sporcu: veli kendi bağını görür" on veli_sporcu for select
  using (veli_id = auth.uid());
create policy "veli_sporcu: yönetici yazar" on veli_sporcu for insert
  with check (current_profile_role() = 'yonetici');
create policy "veli_sporcu: yönetici siler" on veli_sporcu for delete
  using (current_profile_role() = 'yonetici');

create policy "sporcu_antrenor: yönetici tümünü görür" on sporcu_antrenor for select
  using (current_profile_role() = 'yonetici');
create policy "sporcu_antrenor: antrenör kendi bağını görür" on sporcu_antrenor for select
  using (antrenor_id = auth.uid());
create policy "sporcu_antrenor: yönetici yazar" on sporcu_antrenor for insert
  with check (current_profile_role() = 'yonetici');
create policy "sporcu_antrenor: yönetici siler" on sporcu_antrenor for delete
  using (current_profile_role() = 'yonetici');

-- ---------------------------------------------------------------------------
-- Seed veri — mock/yonetici.ts, mock/kurum.ts, mock/sporcular.ts, mock/antrenor.ts
-- ile birebir eşleşecek şekilde (bkz. Faz 1 plan dosyası).

insert into sube (id, ad, alt_bilgi) values
  ('10000000-0000-0000-0000-000000000001', 'Merkez', '184 sporcu · 6 branş'),
  ('10000000-0000-0000-0000-000000000002', 'Karşıyaka Sahil', '96 sporcu · 4 branş'),
  ('10000000-0000-0000-0000-000000000003', 'Bostanlı', '58 sporcu · 3 branş');

insert into brans (id, ad, ikon) values
  ('20000000-0000-0000-0000-000000000001', 'Futbol', '⚽'),
  ('20000000-0000-0000-0000-000000000002', 'Basketbol', '🏀'),
  ('20000000-0000-0000-0000-000000000003', 'Voleybol', '🏐'),
  ('20000000-0000-0000-0000-000000000004', 'Tenis', '🎾'),
  ('20000000-0000-0000-0000-000000000005', 'Yüzme', '🏊'),
  ('20000000-0000-0000-0000-000000000006', 'Jimnastik', '🤸'),
  ('20000000-0000-0000-0000-000000000007', 'Bale', '🩰'),
  ('20000000-0000-0000-0000-000000000008', 'Satranç', '♟️');

insert into hizmet_turu (id, ad, aciklama, ikon) values
  ('30000000-0000-0000-0000-000000000001', 'Çok Branşlı Spor Okulu', 'Birden fazla branş tek çatı altında', '🏟️'),
  ('30000000-0000-0000-0000-000000000002', 'Fitness / Spor Salonu', 'Üyelik tabanlı salon ve stüdyolar', '🏋️');

insert into kurum_brans_secimi (sube_id, brans_id)
  select '10000000-0000-0000-0000-000000000001', id from brans
  where ad in ('Futbol', 'Basketbol', 'Voleybol', 'Tenis', 'Yüzme', 'Jimnastik');

insert into kurum_hizmet_turu_secimi (sube_id, hizmet_turu_id) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');

insert into grup (id, ad, brans_id, sube_id) values
  ('40000000-0000-0000-0000-000000000001', 'U12 Basketbol', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', 'U14 Basketbol', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', 'U12 Yüzme', '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000004', 'U10 Jimnastik', '20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000005', 'U12 Voleybol', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000006', 'U10 Yüzme', '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000007', 'U11 Basketbol', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');

-- Küme A — antrenör (Mert Demir) tarafındaki U12 Basketbol roster'ı (13 sporcu)
insert into sporcular (id, ad, numara, brans_id, grup_id, sube_id, veli_ad, veli_telefon) values
  ('50000000-0000-0000-0000-000000000001', 'Ali Kaya',       7, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Elif Kaya',      '0532 417 88 21'),
  ('50000000-0000-0000-0000-000000000002', 'Emir Şahin',     4, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Burak Şahin',    '0533 221 44 09'),
  ('50000000-0000-0000-0000-000000000003', 'Kerem Yılmaz',   9, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Aslı Yılmaz',    '0535 620 11 47'),
  ('50000000-0000-0000-0000-000000000004', 'Deniz Aksoy',   11, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Merve Aksoy',    '0536 802 93 15'),
  ('50000000-0000-0000-0000-000000000005', 'Arda Güneş',    12, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Hakan Güneş',    '0532 774 20 63'),
  ('50000000-0000-0000-0000-000000000006', 'Yusuf Demirel',  8, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Nalan Demirel',  '0538 411 96 27'),
  ('50000000-0000-0000-0000-000000000007', 'Ege Aydın',     23, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Serkan Aydın',   '0533 908 55 12'),
  ('50000000-0000-0000-0000-000000000008', 'Can Polat',     10, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Selin Polat',    '0532 111 22 33'),
  ('50000000-0000-0000-0000-000000000009', 'Baran Koç',      6, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Emre Koç',       '0533 444 55 66'),
  ('5000000a-0000-0000-0000-000000000001', 'Kaan Erdem',    15, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Derya Erdem',    '0535 777 88 99'),
  ('5000000b-0000-0000-0000-000000000001', 'Toprak Sezer',   3, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Onur Sezer',     '0536 123 45 67'),
  ('5000000c-0000-0000-0000-000000000001', 'Umut Karaca',   14, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Gamze Karaca',   '0532 987 65 43'),
  ('5000000d-0000-0000-0000-000000000001', 'Mert Can Öz',    5, '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Aylin Öz',       '0533 456 78 90');

-- Zeynep Kaya (Ali'nin kardeşi, Küme A) — U12_SPORCULAR'da (antrenör roster'ı)
-- hiç yer almıyordu ama Veli tarafındaki mock (VELI_PROFIL.cocuklar) onu her
-- zaman Elif Kaya'nın ikinci çocuğu olarak listeliyordu; demo veli hesabının
-- iki çocuğunun da gerçek satırı olsun diye burada ayrıca ekleniyor.
insert into sporcular (id, ad, brans_id, grup_id, sube_id, veli_ad, veli_telefon) values
  ('50000016-0000-0000-0000-000000000001', 'Zeynep Kaya', '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Elif Kaya', '0532 417 88 21');

-- Küme B — yönetici tarafındaki genel roster (8 sporcu; bazı isimler Küme A ile
-- aynı ama gerçekte FARKLI kişiler — bkz. plan dosyasındaki "Ali Kaya problemi").
insert into sporcular (id, ad, brans_id, grup_id, sube_id, odeme_durumu, veli_ad, veli_telefon, veli_yakinlik) values
  ('5000000e-0000-0000-0000-000000000001', 'Mert Aydın',   '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'gecikmis', 'Serkan Aydın', '0532 417 88 21', 'Baba'),
  ('5000000f-0000-0000-0000-000000000001', 'Ali Kaya',     '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'guncel',   'Fatma Kaya',   '0533 221 44 09', 'Anne'),
  ('50000010-0000-0000-0000-000000000001', 'Zeynep Kaya',  '20000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'guncel',   'Fatma Kaya',   '0533 221 44 09', 'Anne'),
  ('50000011-0000-0000-0000-000000000001', 'Berk Tan',     '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'gecikmis', 'Hakan Tan',    '0535 620 11 47', 'Baba'),
  ('50000012-0000-0000-0000-000000000001', 'Ece Yıldız',   '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'guncel',   'Derya Yıldız', '0536 802 93 15', 'Anne'),
  ('50000013-0000-0000-0000-000000000001', 'Cem Demir',    '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'guncel',   'Onur Demir',   '0532 774 20 63', 'Baba'),
  ('50000014-0000-0000-0000-000000000001', 'Defne Arslan', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'gecikmis', 'Seda Arslan',  '0538 411 96 27', 'Anne'),
  ('50000015-0000-0000-0000-000000000001', 'Kerem Tunç',   '20000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'guncel',   'Murat Tunç',   '0533 908 55 12', 'Baba');

-- Demo veli hesabı (bu oturumda oluşturulan test kaydı) Küme A'daki Ali/Zeynep
-- Kaya'ya bağlanıyor — mesajlaşma/servis/bireysel-ders hikayesi o kümeye kurulu.
-- Hesap yoksa (email eşleşmezse) bu insert'ler sessizce hiçbir şey yapmaz.
insert into veli_sporcu (veli_id, sporcu_id, yakinlik)
  select u.id, '50000000-0000-0000-0000-000000000001', 'Anne'
  from auth.users u where u.email = 'karsiyaka.test.20260721@gmail.com'
  on conflict do nothing;

insert into veli_sporcu (veli_id, sporcu_id, yakinlik)
  select u.id, '50000016-0000-0000-0000-000000000001', 'Anne'
  from auth.users u where u.email = 'karsiyaka.test.20260721@gmail.com'
  on conflict do nothing;

-- Küme A'nın antrenörü Mert Demir henüz gerçek bir Supabase Auth hesabına sahip
-- değil (yalnızca devSignInAs ile test ediliyor) — sporcu_antrenor bağları,
-- gerçek bir antrenör hesabı oluşturulduğunda elle veya bir sonraki fazda eklenecek.
