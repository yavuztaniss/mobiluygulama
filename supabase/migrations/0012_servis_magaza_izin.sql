-- Faz 6: Servis + Mağaza gerçek tablolara taşınıyor, Veli'nin İzin Bildir'i gerçek
-- `yoklama` yazma izniyle bağlanıyor. Takvim (Yönetici) için yeni tablo gerekmiyor —
-- zaten var olan `antrenman`/`etkinlik`'i birleştiren bir repo rewrite'ı yeterli.

-- ---------------------------------------------------------------------------
-- Servis (rota/durak/sporcu) — gerçek U12 Basketbol roster'ından (Faz 1) gerçek bir
-- alt küme kullanılıyor, mock'taki ~34 icat isim taşınmıyor (bkz. "Ali Kaya problemi").

create table servis_rota (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  sofor text not null,
  plaka text not null,
  arac text not null,
  alt text,
  durum_txt text not null default 'Planlandı',
  yolda boolean not null default false,
  konum_saat text,
  konum_hiz text,
  sube_id uuid references sube(id),
  created_at timestamptz not null default now()
);

create table servis_durak (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references servis_rota(id) on delete cascade,
  ad text not null,
  sub text,
  saat text,
  sira int not null default 0,
  durum text not null default 'bekliyor' check (durum in ('gecti', 'suan', 'bekliyor'))
);

create table servis_sporcu (
  rota_id uuid not null references servis_rota(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durak_id uuid references servis_durak(id),
  primary key (rota_id, sporcu_id)
);

alter table servis_rota enable row level security;
alter table servis_durak enable row level security;
alter table servis_sporcu enable row level security;

create policy "servis_rota: yönetici tümünü yönetir" on servis_rota for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "servis_rota: veli çocuğunun rotasını görür" on servis_rota for select
  using (exists (
    select 1 from servis_sporcu ss join veli_sporcu vs on vs.sporcu_id = ss.sporcu_id
    where ss.rota_id = servis_rota.id and vs.veli_id = auth.uid()
  ));

create policy "servis_durak: yönetici tümünü yönetir" on servis_durak for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "servis_durak: veli çocuğunun rotasının duraklarını görür" on servis_durak for select
  using (exists (
    select 1 from servis_sporcu ss join veli_sporcu vs on vs.sporcu_id = ss.sporcu_id
    where ss.rota_id = servis_durak.rota_id and vs.veli_id = auth.uid()
  ));

create policy "servis_sporcu: yönetici tümünü yönetir" on servis_sporcu for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "servis_sporcu: veli kendi çocuğunu görür" on servis_sporcu for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = servis_sporcu.sporcu_id and vs.veli_id = auth.uid()));

-- Seed — 2 rota, U12 Basketbol'un 14 gerçek sporcusu (13 roster + Ali'nin kardeşi Zeynep) 7+7.
-- Ali+Zeynep Kaya (demo veli hesabının gerçek çocukları) bilinçli olarak Rota 1'e ("yolda: true")
-- konuldu, demo hesap Servis tab'ında gerçek/canlı bir rota görsün diye.
insert into servis_rota (id, ad, sofor, plaka, arac, alt, durum_txt, yolda, konum_saat, konum_hiz) values
  ('94000000-0000-0000-0000-000000000001', 'Mavişehir – Merkez Hattı', 'Hasan Usta', '35 KSO 112', 'Mercedes Sprinter', 'Sabah seferi · 07:30 kalkış', 'Yolda', true, '07:49', '32 km/s'),
  ('94000000-0000-0000-0000-000000000002', 'Karşıyaka – Merkez Hattı', 'Ayşe Yıldırım', '35 KSO 220', 'Ford Transit', 'Akşam seferi · 17:45 kalkış', 'Bekliyor', false, null, null);

insert into servis_durak (id, rota_id, ad, sub, saat, sira, durum) values
  ('95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'Mavişehir Meydan', '3 sporcu biniş', '07:30', 0, 'gecti'),
  ('95000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000001', 'Atakent Durağı', '4 sporcu biniş', '07:42', 1, 'suan'),
  ('95000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000001', 'Merkez Tesis', 'Varış · 7 sporcu iniş', '08:05', 2, 'bekliyor'),
  ('95000000-0000-0000-0000-000000000004', '94000000-0000-0000-0000-000000000002', 'Karşıyaka Çarşı', '4 sporcu biniş', '17:45', 0, 'bekliyor'),
  ('95000000-0000-0000-0000-000000000005', '94000000-0000-0000-0000-000000000002', 'Alaybey Durağı', '3 sporcu biniş', '17:58', 1, 'bekliyor'),
  ('95000000-0000-0000-0000-000000000006', '94000000-0000-0000-0000-000000000002', 'Merkez Tesis', 'Varış · 7 sporcu iniş', '18:15', 2, 'bekliyor');

insert into servis_sporcu (rota_id, sporcu_id, durak_id) values
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001'), -- Ali Kaya
  ('94000000-0000-0000-0000-000000000001', '50000016-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001'), -- Zeynep Kaya
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '95000000-0000-0000-0000-000000000001'), -- Emir Şahin
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', '95000000-0000-0000-0000-000000000002'), -- Kerem Yılmaz
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', '95000000-0000-0000-0000-000000000002'), -- Deniz Aksoy
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', '95000000-0000-0000-0000-000000000002'), -- Arda Güneş
  ('94000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000006', '95000000-0000-0000-0000-000000000002'), -- Yusuf Demirel
  ('94000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000007', '95000000-0000-0000-0000-000000000004'), -- Ege Aydın
  ('94000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000008', '95000000-0000-0000-0000-000000000004'), -- Can Polat
  ('94000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000009', '95000000-0000-0000-0000-000000000004'), -- Baran Koç
  ('94000000-0000-0000-0000-000000000002', '5000000a-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000004'), -- Kaan Erdem
  ('94000000-0000-0000-0000-000000000002', '5000000b-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005'), -- Toprak Sezer
  ('94000000-0000-0000-0000-000000000002', '5000000c-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005'), -- Umut Karaca
  ('94000000-0000-0000-0000-000000000002', '5000000d-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000005'); -- Mert Can Öz

-- ---------------------------------------------------------------------------
-- Mağaza — Yönetici (u1-u4) ve Veli (m1-m6) tarafındaki iki ayrı katalog tek `urun`
-- tablosunda birleşiyor. Sepette birden fazla farklı ürün+beden olabildiği için
-- (ekran kodu doğrulandı) siparis + siparis_kalem ayrımı gerekli.

create table urun (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  aciklama text,
  kategori text not null check (kategori in ('Forma', 'Giyim', 'Aksesuar')),
  fiyat numeric not null,
  stok int not null default 0,
  aktif boolean not null default true,
  badge text,
  jersey boolean not null default false,
  sube_id uuid references sube(id),
  created_at timestamptz not null default now()
);

create table siparis (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null references sporcular(id),
  tutar numeric not null,
  durum text not null default 'hazirlaniyor' check (durum in ('hazirlaniyor', 'hazir', 'teslim')),
  created_at timestamptz not null default now()
);

create table siparis_kalem (
  id uuid primary key default gen_random_uuid(),
  siparis_id uuid not null references siparis(id) on delete cascade,
  urun_id uuid not null references urun(id),
  beden text,
  adet int not null default 1,
  birim_fiyat numeric not null,
  not_metni text
);

alter table urun enable row level security;
alter table siparis enable row level security;
alter table siparis_kalem enable row level security;

create policy "urun: giriş yapan herkes okur" on urun for select using (auth.uid() is not null);
create policy "urun: yönetici yazar" on urun for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "siparis: yönetici tümünü yönetir" on siparis for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "siparis: veli bağlı sporcusunu görür" on siparis for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = siparis.sporcu_id and vs.veli_id = auth.uid()));
create policy "siparis: veli kendi sporcusu için sipariş açar" on siparis for insert
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = siparis.sporcu_id and vs.veli_id = auth.uid()));

create policy "siparis_kalem: erişim siparis üzerinden okunur" on siparis_kalem for select
  using (exists (
    select 1 from siparis s where s.id = siparis_kalem.siparis_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (select 1 from veli_sporcu vs where vs.sporcu_id = s.sporcu_id and vs.veli_id = auth.uid())
    )
  ));
create policy "siparis_kalem: yönetici tümünü yönetir" on siparis_kalem for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "siparis_kalem: veli kendi siparişine kalem ekler" on siparis_kalem for insert
  with check (exists (
    select 1 from siparis s join veli_sporcu vs on vs.sporcu_id = s.sporcu_id
    where s.id = siparis_kalem.siparis_id and vs.veli_id = auth.uid()
  ));

-- Seed — admin'in 4 + veli'nin 6 ürünü birleşince (forma/eşofman/çanta/matara tam eşleşiyor)
-- 6 benzersiz ürün. Matara mock'takiyle tutarlı olarak stoksuz/pasif.
insert into urun (id, ad, aciklama, kategori, fiyat, stok, aktif, badge, jersey) values
  ('96000000-0000-0000-0000-000000000001', '2026 Sezon Forması', 'İsim + numara baskısı hediye', 'Forma', 450, 32, true, 'YENİ', true),
  ('96000000-0000-0000-0000-000000000002', 'Antrenman Eşofmanı', 'Nefes alabilir kumaş', 'Giyim', 620, 18, true, null, false),
  ('96000000-0000-0000-0000-000000000003', 'Kulüp Şapkası', 'Ayarlanabilir kayış', 'Aksesuar', 240, 25, true, null, false),
  ('96000000-0000-0000-0000-000000000004', 'Spor Çantası', '40L · su geçirmez', 'Aksesuar', 380, 12, true, null, false),
  ('96000000-0000-0000-0000-000000000005', 'Kulüp Tişörtü', 'Pamuklu · unisex kesim', 'Giyim', 210, 40, true, null, false),
  ('96000000-0000-0000-0000-000000000006', 'Kulüp Matarası', '750ml · paslanmaz çelik', 'Aksesuar', 120, 0, false, null, false);

-- Demo siparişler — gerçek Ali/Zeynep Kaya'ya bağlı (isimle eşleştirilen farklı bir "Ali
-- Kaya" DEĞİL — Küme B'deki ayrı kişi, bkz. Faz 1 "Ali Kaya problemi" notu).
insert into siparis (id, sporcu_id, tutar, durum) values
  ('97000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1070, 'hazirlaniyor'),
  ('97000000-0000-0000-0000-000000000002', '50000016-0000-0000-0000-000000000001', 120, 'teslim');

insert into siparis_kalem (siparis_id, urun_id, beden, adet, birim_fiyat, not_metni) values
  ('97000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', 'M', 1, 450, '"ELİF K · —" baskısı hediye'),
  ('97000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', 'S', 1, 620, 'Standart paket'),
  ('97000000-0000-0000-0000-000000000002', '96000000-0000-0000-0000-000000000006', null, 1, 120, 'Standart paket');

-- ---------------------------------------------------------------------------
-- İzin Bildir — yeni tablo değil, mevcut `yoklama`'ya 2 yeni policy (Faz 3'te veli'nin
-- hiç yazma izni yoktu). `durum is null` hem USING hem WITH CHECK'te olduğu için veli
-- asla kendi/çocuğunun durum'unu (katıldı/katılmadı) set edemiyor veya antrenörün zaten
-- işaretlediği bir satırı değiştiremiyor — yalnızca izinli/izin_detay yazabiliyor.

create policy "yoklama: veli kendi sporcusu için izin bildirir (ekler)" on yoklama for insert
  with check (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
  );

create policy "yoklama: veli kendi sporcusunun işaretlenmemiş satırını günceller" on yoklama for update
  using (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
  )
  with check (
    durum is null
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid())
  );
