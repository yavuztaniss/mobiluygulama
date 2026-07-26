-- Faz 3: Yoklama + Gelişim gerçek tabloya taşınıyor. Antrenör'ün gerçek zamanlı
-- yoklama alma ekranı, Yönetici'nin Sporcu Detayı'ndaki aylık takvim ve Veli'nin
-- aylık takvimi artık aynı `antrenman`/`yoklama` tablosunu okuyor — üç ayrı,
-- birbirinden habersiz sabit fixture yerine tek gerçek kaynak.
--
-- Not: tablo adı "ders" değil "antrenman" — Faz 7'nin bireysel ders (ücretli 1:1)
-- kavramıyla isim çakışmasın diye.

create table antrenman (
  id uuid primary key default gen_random_uuid(),
  grup_id uuid not null references grup(id),
  tarih date not null default current_date,
  saat1 text,
  saat2 text,
  tesis text,
  yoklama_kaydedildi boolean not null default false,
  yoklama_kayit_zamani text,
  created_at timestamptz not null default now(),
  unique (grup_id, tarih)
);

create table yoklama (
  id uuid primary key default gen_random_uuid(),
  antrenman_id uuid not null references antrenman(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durum text check (durum in ('katildi', 'katilmadi')),
  izinli boolean not null default false,
  izin_detay text,
  created_at timestamptz not null default now(),
  unique (antrenman_id, sporcu_id)
);

create table beceri (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  brans_id uuid references brans(id),
  sira int not null default 0
);

-- Sporcu başına TEK aktif değerlendirme (mock'ta da geçmiş tutulmuyordu, gönder/kilit-aç
-- aynı satırı değiştiriyordu) — unique(sporcu_id) get-or-create karmaşıklığını ortadan kaldırıyor.
create table gelisim_degerlendirme (
  id uuid primary key default gen_random_uuid(),
  sporcu_id uuid not null unique references sporcular(id) on delete cascade,
  antrenor_id uuid references profiles(id),
  not_metni text not null default '',
  gonderildi boolean not null default false,
  tarih date,
  created_at timestamptz not null default now()
);

create table gelisim_beceri_seviye (
  degerlendirme_id uuid not null references gelisim_degerlendirme(id) on delete cascade,
  beceri_id uuid not null references beceri(id),
  seviye int not null check (seviye between 1 and 5),
  primary key (degerlendirme_id, beceri_id)
);

alter table antrenman enable row level security;
alter table yoklama enable row level security;
alter table beceri enable row level security;
alter table gelisim_degerlendirme enable row level security;
alter table gelisim_beceri_seviye enable row level security;

-- antrenman
create policy "antrenman: yönetici tümünü görür" on antrenman for select
  using (private.current_profile_role() = 'yonetici');
create policy "antrenman: antrenör kendi grubunu görür" on antrenman for select
  using (exists (
    select 1 from sporcu_antrenor sa join sporcular s on s.id = sa.sporcu_id
    where s.grup_id = antrenman.grup_id and sa.antrenor_id = auth.uid()
  ));
create policy "antrenman: veli bağlı sporcusunun grubunu görür" on antrenman for select
  using (exists (
    select 1 from veli_sporcu vs join sporcular s on s.id = vs.sporcu_id
    where s.grup_id = antrenman.grup_id and vs.veli_id = auth.uid()
  ));
create policy "antrenman: yönetici yazar" on antrenman for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "antrenman: yönetici günceller" on antrenman for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "antrenman: antrenör kendi grubunu günceller" on antrenman for update
  using (exists (
    select 1 from sporcu_antrenor sa join sporcular s on s.id = sa.sporcu_id
    where s.grup_id = antrenman.grup_id and sa.antrenor_id = auth.uid()
  ))
  with check (exists (
    select 1 from sporcu_antrenor sa join sporcular s on s.id = sa.sporcu_id
    where s.grup_id = antrenman.grup_id and sa.antrenor_id = auth.uid()
  ));

-- yoklama
create policy "yoklama: yönetici tümünü görür" on yoklama for select
  using (private.current_profile_role() = 'yonetici');
create policy "yoklama: antrenör kendi sporcusunu görür" on yoklama for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "yoklama: veli bağlı sporcusunu görür" on yoklama for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = yoklama.sporcu_id and vs.veli_id = auth.uid()));
create policy "yoklama: yönetici yazar" on yoklama for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "yoklama: antrenör kendi sporcusu için yazar" on yoklama for insert
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "yoklama: yönetici günceller" on yoklama for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "yoklama: antrenör kendi sporcusunu günceller" on yoklama for update
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()))
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = yoklama.sporcu_id and sa.antrenor_id = auth.uid()));

-- beceri: brans/grup deseniyle aynı (herkes okur, yönetici yazar)
create policy "beceri: giriş yapan herkes okur" on beceri for select using (auth.uid() is not null);
create policy "beceri: yönetici yazar" on beceri for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- gelisim_degerlendirme: veli yalnızca gönderilmiş (gonderildi=true) olanı görür —
-- taslak notu veliye sızmasın (bugünkü UI'daki "gönder" adımının anlamı budur).
create policy "gelisim: yönetici tümünü görür" on gelisim_degerlendirme for select
  using (private.current_profile_role() = 'yonetici');
create policy "gelisim: antrenör kendi sporcusunu görür" on gelisim_degerlendirme for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "gelisim: veli gönderilmiş olanı görür" on gelisim_degerlendirme for select
  using (gonderildi = true and exists (select 1 from veli_sporcu vs where vs.sporcu_id = gelisim_degerlendirme.sporcu_id and vs.veli_id = auth.uid()));
create policy "gelisim: yönetici yazar" on gelisim_degerlendirme for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "gelisim: antrenör kendi sporcusu için yazar" on gelisim_degerlendirme for insert
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "gelisim: yönetici günceller" on gelisim_degerlendirme for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "gelisim: antrenör kendi sporcusunu günceller" on gelisim_degerlendirme for update
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()))
  with check (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gelisim_degerlendirme.sporcu_id and sa.antrenor_id = auth.uid()));

-- gelisim_beceri_seviye: erişim üst tablo (gelisim_degerlendirme) üzerinden aynı kurallarla
create policy "gelisim_seviye: degerlendirme üzerinden okur" on gelisim_beceri_seviye for select
  using (exists (
    select 1 from gelisim_degerlendirme gd where gd.id = gelisim_beceri_seviye.degerlendirme_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gd.sporcu_id and sa.antrenor_id = auth.uid())
      or (gd.gonderildi = true and exists (select 1 from veli_sporcu vs where vs.sporcu_id = gd.sporcu_id and vs.veli_id = auth.uid()))
    )
  ));
create policy "gelisim_seviye: yönetici ve antrenör yazar" on gelisim_beceri_seviye for all
  using (exists (
    select 1 from gelisim_degerlendirme gd where gd.id = gelisim_beceri_seviye.degerlendirme_id
    and (private.current_profile_role() = 'yonetici' or exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gd.sporcu_id and sa.antrenor_id = auth.uid()))
  ))
  with check (exists (
    select 1 from gelisim_degerlendirme gd where gd.id = gelisim_beceri_seviye.degerlendirme_id
    and (private.current_profile_role() = 'yonetici' or exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = gd.sporcu_id and sa.antrenor_id = auth.uid()))
  ));

-- Seed — sporcu_antrenor Faz 1'den beri boştu (gerçek Mert Demir hesabı yok). Test
-- hesabını veli_sporcu'daki desenin aynısıyla U12 Basketbol'un 13 sporcusuna bağlıyoruz;
-- hesap role='antrenor' yapıldığında bu bağlar RLS'i besleyecek.
insert into sporcu_antrenor (sporcu_id, antrenor_id)
select s.id, u.id
from sporcular s, auth.users u
where u.email = 'karsiyaka.test.20260721@gmail.com'
  and s.grup_id = '40000000-0000-0000-0000-000000000001'
on conflict do nothing;

-- beceri — mock'taki GELISIM_BECERI_ADLARI ile birebir, Basketbol branşı için.
insert into beceri (id, ad, brans_id, sira) values
  ('70000000-0000-0000-0000-000000000001', 'Şut Tekniği', '20000000-0000-0000-0000-000000000002', 0),
  ('70000000-0000-0000-0000-000000000002', 'Top Sürme', '20000000-0000-0000-0000-000000000002', 1),
  ('70000000-0000-0000-0000-000000000003', 'Kondisyon', '20000000-0000-0000-0000-000000000002', 2),
  ('70000000-0000-0000-0000-000000000004', 'Takım Oyunu', '20000000-0000-0000-0000-000000000002', 3);

-- gelisim_degerlendirme — U12 Basketbol roster'ının (Faz 1'de seed edilmiş) 13 sporcusunun
-- her biri için 1 satır; GELISIM_VARSAYILAN'da adı geçen 5'i (ali/emir/kerem/deniz/yusuf)
-- kendi değerleriyle, kalanlar varsayılan [3,3,3,3]/boş not/gonderildi=false ile.
insert into gelisim_degerlendirme (id, sporcu_id, not_metni, gonderildi, tarih) values
  ('80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '', false, null),
  ('80000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Emir hızlı hücumda çok gelişti, bireysel savunmada tempo kazanıyor.', true, current_date - 3),
  ('80000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '', false, null),
  ('80000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '', false, null),
  ('80000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000005', '', false, null),
  ('80000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000006', 'Yusuf bu ay tüm antrenmanlara katıldı; ribaunt zamanlaması belirgin iyileşti.', true, current_date - 5),
  ('80000000-0000-0000-0000-000000000007', '50000000-0000-0000-0000-000000000007', '', false, null),
  ('80000000-0000-0000-0000-000000000008', '50000000-0000-0000-0000-000000000008', '', false, null),
  ('80000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000009', '', false, null),
  ('8000000a-0000-0000-0000-000000000001', '5000000a-0000-0000-0000-000000000001', '', false, null),
  ('8000000b-0000-0000-0000-000000000001', '5000000b-0000-0000-0000-000000000001', '', false, null),
  ('8000000c-0000-0000-0000-000000000001', '5000000c-0000-0000-0000-000000000001', '', false, null),
  ('8000000d-0000-0000-0000-000000000001', '5000000d-0000-0000-0000-000000000001', '', false, null);

insert into gelisim_beceri_seviye (degerlendirme_id, beceri_id, seviye)
select v.degerlendirme_id, b.id, v.seviyeler[b.sira + 1]
from (values
  ('80000000-0000-0000-0000-000000000001'::uuid, array[4,4,3,5]),  -- ali
  ('80000000-0000-0000-0000-000000000002'::uuid, array[4,3,3,4]),  -- emir
  ('80000000-0000-0000-0000-000000000003'::uuid, array[2,3,3,4]),  -- kerem
  ('80000000-0000-0000-0000-000000000004'::uuid, array[3,3,4,3]),  -- deniz
  ('80000000-0000-0000-0000-000000000005'::uuid, array[3,3,3,3]),  -- arda
  ('80000000-0000-0000-0000-000000000006'::uuid, array[4,4,4,4]),  -- yusuf
  ('80000000-0000-0000-0000-000000000007'::uuid, array[3,3,3,3]),  -- ege
  ('80000000-0000-0000-0000-000000000008'::uuid, array[3,3,3,3]),  -- can
  ('80000000-0000-0000-0000-000000000009'::uuid, array[3,3,3,3]),  -- baran
  ('8000000a-0000-0000-0000-000000000001'::uuid, array[3,3,3,3]),  -- kaan
  ('8000000b-0000-0000-0000-000000000001'::uuid, array[3,3,3,3]),  -- toprak
  ('8000000c-0000-0000-0000-000000000001'::uuid, array[3,3,3,3]),  -- umut
  ('8000000d-0000-0000-0000-000000000001'::uuid, array[3,3,3,3])   -- mert
) as v(degerlendirme_id, seviyeler)
cross join beceri b
where b.brans_id = '20000000-0000-0000-0000-000000000002';

-- Bugünün antrenmanı — kasıtlı olarak yoklama_kaydedildi=false, antrenör canlı olarak
-- yoklama alsın diye. Deniz Aksoy için mock'taki senaryonun aynısı: önceden izinli satırı var,
-- diğer 12 kişi için henüz satır yok (işaretlenmemiş).
insert into antrenman (id, grup_id, tarih, saat1, saat2, tesis, yoklama_kaydedildi) values
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', current_date, '17:00', '18:30', 'Mavişehir Spor Salonu · Salon 2', false);

insert into yoklama (antrenman_id, sporcu_id, izinli, izin_detay) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', true, 'Hastalık · veli notu: "Ateşi var, evde dinlenecek" · 09:12');

-- Geçmiş ~4 hafta, Pzt/Çar/Cum antrenmanları (U12 Basketbol haftada 3 gün, bkz. aidat_plani) —
-- yoklama_kaydedildi=true, aylık katılım yüzdesi/takvim gerçek veriden hesaplanabilsin diye.
with gecmis as (
  insert into antrenman (grup_id, tarih, saat1, saat2, tesis, yoklama_kaydedildi, yoklama_kayit_zamani)
  select '40000000-0000-0000-0000-000000000001', d::date, '17:00', '18:30', 'Mavişehir Spor Salonu · Salon 2', true, '18:32'
  from generate_series(current_date - 28, current_date - 1, interval '1 day') d
  where extract(dow from d) in (1, 3, 5)
  returning id, tarih
),
gecmis_sirali as (
  select id, row_number() over (order by tarih) as rn from gecmis
)
insert into yoklama (antrenman_id, sporcu_id, durum)
select gs.id, s.id,
  case when s.id = '50000000-0000-0000-0000-000000000001' and gs.rn in (3, 8) then 'katilmadi' else 'katildi' end
from gecmis_sirali gs
cross join sporcular s
where s.grup_id = '40000000-0000-0000-0000-000000000001';
