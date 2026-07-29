-- Faz 7: Bireysel Ders + Hakediş + Başvurular gerçek tablolara taşınıyor.
-- Bireysel ders slot durumu ayrı bir tabloda tutulmuyor — antrenman/yoklama deseniyle
-- aynı: müsaitlik − rezervasyon − antrenman(grup) canlı birleştiriliyor.

-- ---------------------------------------------------------------------------
-- Önceden hiç eklenmemiş bir gözetim politikası: `profiles` tablosunda bugüne kadar
-- yalnızca "kendi profilini görür" (0001) + Faz 5'in veli↔antrenör ilişki-bazlı 2 ek
-- politikası vardı — yönetici'nin diğer roller sağlamlarını (antrenör adı vb.) görebileceği
-- hiçbir yol yoktu. Hakediş ekranı (aşağıda) gerçek antrenör adını `profiles`'tan join'lemek
-- zorunda olduğu için bu artık gerekli — diğer her tabloda zaten var olan "yönetici tümünü
-- görür" deseninin `profiles`'a eklenmemiş hali, saf katkı (mevcut erişimi daraltmıyor).
create policy "profiles: yönetici tümünü görür" on profiles for select
  using (private.current_profile_role() = 'yonetici');

-- ---------------------------------------------------------------------------
-- Bireysel Ders

create table bireysel_antrenor (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null unique references profiles(id) on delete cascade,
  brans_id uuid references brans(id),
  deneyim_yil int not null default 0,
  puan numeric(2,1),
  bio text,
  musait boolean not null default true,
  tek_fiyat numeric not null,
  paket_fiyat numeric not null,
  paket_ders_sayisi int not null default 10,
  varsayilan_tesis text,
  created_at timestamptz not null default now()
);

create table bireysel_musaitlik (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  gun_index int not null check (gun_index between 0 and 6),
  baslangic_saat text not null,
  bitis_saat text not null,
  aktif boolean not null default true,
  unique (antrenor_id, gun_index)
);

create table bireysel_istisna (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  tarih date not null,
  aciklama text,
  created_at timestamptz not null default now(),
  unique (antrenor_id, tarih)
);

-- (antrenor, sporcu) skalasında — mock'taki "paket kime ait belirsiz" bug'ı düzeliyor.
-- Her satış yeni satır, üzerine yazılmıyor.
create table bireysel_paket (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  toplam int not null,
  kalan int not null check (kalan >= 0),
  tutar numeric not null,
  created_at timestamptz not null default now()
);

create table bireysel_rezervasyon (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id),
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  tarih date not null,
  saat text not null,
  sure_dk int not null default 60,
  tesis text,
  odeme_tipi text not null check (odeme_tipi in ('tek', 'paket')),
  paket_id uuid references bireysel_paket(id),
  tutar numeric not null,
  odeme_notu text,
  durum text not null default 'onay_bekliyor'
    check (durum in ('onay_bekliyor', 'onaylandi', 'reddedildi', 'tamamlandi', 'iptal', 'gelmedi')),
  sonuc_zamani timestamptz,
  created_at timestamptz not null default now(),
  check ((odeme_tipi = 'paket' and paket_id is not null) or (odeme_tipi = 'tek' and paket_id is null))
);

-- Aynı antrenörün aynı saatini iki kişi kapamasın diye — reddedildi/iptal hariç.
create unique index bireysel_rezervasyon_slot_uniq on bireysel_rezervasyon (antrenor_id, tarih, saat)
  where durum not in ('reddedildi', 'iptal');

alter table bireysel_antrenor enable row level security;
alter table bireysel_musaitlik enable row level security;
alter table bireysel_istisna enable row level security;
alter table bireysel_paket enable row level security;
alter table bireysel_rezervasyon enable row level security;

create policy "bireysel_antrenor: giriş yapan herkes okur" on bireysel_antrenor for select
  using (auth.uid() is not null);
create policy "bireysel_antrenor: yönetici yazar" on bireysel_antrenor for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "bireysel_antrenor: yönetici günceller" on bireysel_antrenor for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "bireysel_antrenor: antrenör kendi kaydını günceller" on bireysel_antrenor for update
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());

create policy "bireysel_musaitlik: giriş yapan herkes okur" on bireysel_musaitlik for select
  using (auth.uid() is not null);
create policy "bireysel_musaitlik: antrenör kendi kaydını yönetir" on bireysel_musaitlik for all
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());
create policy "bireysel_musaitlik: yönetici tümünü yönetir" on bireysel_musaitlik for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "bireysel_istisna: giriş yapan herkes okur" on bireysel_istisna for select
  using (auth.uid() is not null);
create policy "bireysel_istisna: antrenör kendi kaydını yönetir" on bireysel_istisna for all
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());
create policy "bireysel_istisna: yönetici tümünü yönetir" on bireysel_istisna for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- bireysel_paket: paket satın alma self-servis değil (Faz 2'nin "ödeme yalnızca kulüp
-- tarafından işlenir" kararıyla tutarlı) — INSERT yalnızca yönetici. Veli'nin UPDATE hakkı
-- yalnızca var olan paketten rezervasyon anında 1 ders düşürmekle sınırlı.
create policy "bireysel_paket: yönetici tümünü görür" on bireysel_paket for select
  using (private.current_profile_role() = 'yonetici');
create policy "bireysel_paket: antrenör kendi sattığını görür" on bireysel_paket for select
  using (antrenor_id = auth.uid());
create policy "bireysel_paket: veli bağlı sporcusunu görür" on bireysel_paket for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_paket.sporcu_id and vs.veli_id = auth.uid()));
create policy "bireysel_paket: yönetici ekler" on bireysel_paket for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "bireysel_paket: veli kendi sporcusunun paketini günceller" on bireysel_paket for update
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_paket.sporcu_id and vs.veli_id = auth.uid()))
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_paket.sporcu_id and vs.veli_id = auth.uid()));
create policy "bireysel_paket: yönetici günceller" on bireysel_paket for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

create policy "bireysel_rezervasyon: yönetici tümünü görür" on bireysel_rezervasyon for select
  using (private.current_profile_role() = 'yonetici');
create policy "bireysel_rezervasyon: antrenör kendi rezervasyonunu görür" on bireysel_rezervasyon for select
  using (antrenor_id = auth.uid());
create policy "bireysel_rezervasyon: veli bağlı sporcusunu görür" on bireysel_rezervasyon for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid()));

create policy "bireysel_rezervasyon: veli kendi sporcusu için rezervasyon açar" on bireysel_rezervasyon for insert
  with check (
    durum = 'onay_bekliyor'
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );
create policy "bireysel_rezervasyon: yönetici ekler" on bireysel_rezervasyon for insert
  with check (private.current_profile_role() = 'yonetici');

-- antrenör: bekleyen/onaylı bir satırı onaylar/reddeder/sonuçlandırır (tamamlandı/iptal/gelmedi).
create policy "bireysel_rezervasyon: antrenör onaylar/reddeder/sonuçlandırır" on bireysel_rezervasyon for update
  using (antrenor_id = auth.uid() and durum in ('onay_bekliyor', 'onaylandi'))
  with check (antrenor_id = auth.uid());

-- veli: yalnızca kendi bekleyen/onaylı rezervasyonunu iptal edebilir.
create policy "bireysel_rezervasyon: veli kendi rezervasyonunu iptal eder" on bireysel_rezervasyon for update
  using (
    durum in ('onay_bekliyor', 'onaylandi')
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  )
  with check (
    durum = 'iptal'
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );

create policy "bireysel_rezervasyon: yönetici günceller" on bireysel_rezervasyon for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- ---------------------------------------------------------------------------
-- Hakediş — grup dersi bordrosu, gerçek antrenman satır sayısından hesaplanıyor.
-- Tetikleyici/RPC yok, sadece RLS + repo sırayla sorgular (bkz. plan dosyası).

create table antrenor_grup_ucret (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  grup_id uuid not null references grup(id) on delete cascade,
  ders_ucreti numeric not null,
  created_at timestamptz not null default now(),
  unique (antrenor_id, grup_id)
);

create table hakedis (
  id uuid primary key default gen_random_uuid(),
  antrenor_id uuid not null references profiles(id) on delete cascade,
  donem_ay date not null,
  tutar numeric not null default 0,
  odendi boolean not null default false,
  odendi_tarihi date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (antrenor_id, donem_ay)
);

create table hakedis_kalem (
  id uuid primary key default gen_random_uuid(),
  hakedis_id uuid not null references hakedis(id) on delete cascade,
  grup_id uuid references grup(id),
  ders_sayisi int not null,
  birim_ucret numeric not null,
  tutar numeric not null,
  created_at timestamptz not null default now()
);

alter table antrenor_grup_ucret enable row level security;
alter table hakedis enable row level security;
alter table hakedis_kalem enable row level security;

create policy "antrenor_grup_ucret: yönetici tümünü görür" on antrenor_grup_ucret for select
  using (private.current_profile_role() = 'yonetici');
create policy "antrenor_grup_ucret: antrenör kendi ücretini görür" on antrenor_grup_ucret for select
  using (antrenor_id = auth.uid());
create policy "antrenor_grup_ucret: yönetici yazar" on antrenor_grup_ucret for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "antrenor_grup_ucret: yönetici günceller" on antrenor_grup_ucret for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "antrenor_grup_ucret: yönetici siler" on antrenor_grup_ucret for delete
  using (private.current_profile_role() = 'yonetici');

create policy "hakedis: yönetici tümünü görür" on hakedis for select
  using (private.current_profile_role() = 'yonetici');
create policy "hakedis: antrenör kendi hakedişini görür" on hakedis for select
  using (antrenor_id = auth.uid());
create policy "hakedis: yönetici ekler" on hakedis for insert
  with check (private.current_profile_role() = 'yonetici');
-- Kilit: odendi=true olan satır USING'e takılır, hiçbir güncelleme (yeniden hesaplama dahil) geçemez.
create policy "hakedis: yönetici günceller (kilitli değilse)" on hakedis for update
  using (private.current_profile_role() = 'yonetici' and odendi = false)
  with check (private.current_profile_role() = 'yonetici');

create policy "hakedis_kalem: erişim hakedis üzerinden okunur" on hakedis_kalem for select
  using (exists (
    select 1 from hakedis h where h.id = hakedis_kalem.hakedis_id
    and (private.current_profile_role() = 'yonetici' or h.antrenor_id = auth.uid())
  ));
create policy "hakedis_kalem: yönetici ekler (ödenmemişse)" on hakedis_kalem for insert
  with check (exists (
    select 1 from hakedis h where h.id = hakedis_kalem.hakedis_id
    and private.current_profile_role() = 'yonetici' and h.odendi = false
  ));
create policy "hakedis_kalem: yönetici siler (ödenmemişse)" on hakedis_kalem for delete
  using (exists (
    select 1 from hakedis h where h.id = hakedis_kalem.hakedis_id
    and private.current_profile_role() = 'yonetici' and h.odendi = false
  ));

-- ---------------------------------------------------------------------------
-- Başvurular — yapılandırılmış alanlar (eski serbest-metin altBilgi/detay yerine).
-- veli_ad/veli_telefon sporcular tablosundaki aynı "gerçek profiles satırı gerekmez"
-- desenini takip ediyor. sporcu_id onaylandığında doldurulur.

create table basvuru (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  dogum_yili int,
  brans_id uuid references brans(id),
  grup_id uuid references grup(id),
  sube_id uuid references sube(id),
  veli_ad text,
  veli_telefon text,
  tag text not null check (tag in ('DENEME', 'KAYIT')),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  detay_notu text,
  sporcu_id uuid references sporcular(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table basvuru enable row level security;

-- Yalnızca yönetici — personel içi başvuru takip aracı, veli/antrenör tarafına açılmıyor.
create policy "basvuru: yönetici tümünü yönetir" on basvuru for all
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- ---------------------------------------------------------------------------
-- Seed — gerçek demo hesaba (yavuzttaniss@gmail.com) bağlı.

insert into bireysel_antrenor (antrenor_id, brans_id, deneyim_yil, puan, bio, musait, tek_fiyat, paket_fiyat, paket_ders_sayisi, varsayilan_tesis)
select u.id, '20000000-0000-0000-0000-000000000002', 11, 5.0,
  'Baş antrenör · şut mekaniği ve top sürme üzerine bireysel gelişim programları hazırlar.',
  true, 700, 6200, 10, 'Salon 2'
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict (antrenor_id) do nothing;

insert into bireysel_musaitlik (antrenor_id, gun_index, baslangic_saat, bitis_saat, aktif)
select u.id, v.gun_index, v.baslangic, v.bitis, v.aktif
from auth.users u
cross join (values
  (1, '16:00', '20:00', true),
  (2, '18:00', '21:00', true),
  (4, '16:00', '17:00', true),
  (5, '09:00', '15:00', true),
  (6, '00:00', '00:00', false)
) as v(gun_index, baslangic, bitis, aktif)
where u.email = 'yavuzttaniss@gmail.com'
on conflict (antrenor_id, gun_index) do nothing;

insert into bireysel_paket (id, antrenor_id, sporcu_id, toplam, kalan, tutar)
select 'a0000000-0000-0000-0000-000000000001', u.id, '50000000-0000-0000-0000-000000000001', 10, 6, 6200
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict do nothing;

insert into bireysel_rezervasyon (antrenor_id, sporcu_id, tarih, saat, tesis, odeme_tipi, paket_id, tutar, durum, sonuc_zamani)
select u.id, '50000000-0000-0000-0000-000000000001', current_date - 7, '19:00', 'Salon 2', 'paket',
  'a0000000-0000-0000-0000-000000000001', 620, 'tamamlandi', now() - interval '7 days'
from auth.users u where u.email = 'yavuzttaniss@gmail.com';

insert into bireysel_rezervasyon (antrenor_id, sporcu_id, tarih, saat, tesis, odeme_tipi, tutar, durum)
select u.id, '50000000-0000-0000-0000-000000000001', current_date + 2, '17:00', 'Salon 2', 'tek', 700, 'onay_bekliyor'
from auth.users u where u.email = 'yavuzttaniss@gmail.com';

-- Hakediş: hakedis/hakedis_kalem seed'de yaratılmıyor — ilk açılışta repo compute-and-upsert eder.
insert into antrenor_grup_ucret (antrenor_id, grup_id, ders_ucreti)
select u.id, '40000000-0000-0000-0000-000000000001', 400
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict (antrenor_id, grup_id) do nothing;

insert into basvuru (ad, dogum_yili, brans_id, sube_id, veli_ad, veli_telefon, tag, detay_notu) values
  ('Defne Arslan', 2015, '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Seda Arslan', '0538 411 96 27', 'DENEME', 'Çar 22 Temmuz · 17:00 · Salon 1'),
  ('Mina Yaman', 2016, '20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Aslı Yaman', '0533 908 55 12', 'DENEME', 'Pzt 27 Temmuz · 16:00 · Stüdyo');
