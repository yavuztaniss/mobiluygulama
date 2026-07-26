-- Faz 4: Duyurular + Etkinlikler + Maç Kadrosu gerçek tabloya taşınıyor. Yönetici'nin
-- "Duyuru Gönder" ekranı artık gerçekten Veli'ye ulaşıyor (eskiden fire-and-forget'ti);
-- Yönetici'nin ve Veli'nin birbirinden habersiz iki ayrı "Etkinlik" sistemi tek tabloda
-- birleşti; Antrenör'ün Maç Kadrosu'u artık gerçek bir maça (etkinlik) bağlı.

create table duyuru (
  id uuid primary key default gen_random_uuid(),
  baslik text not null,
  mesaj text not null,
  tur text not null default 'genel' check (tur in ('kamp', 'servis', 'basari', 'genel')),
  tum_veliler boolean not null default true,
  sms_ile boolean not null default false,
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table duyuru_hedef (
  duyuru_id uuid not null references duyuru(id) on delete cascade,
  grup_id uuid not null references grup(id),
  primary key (duyuru_id, grup_id)
);

create table etkinlik (
  id uuid primary key default gen_random_uuid(),
  tur text not null check (tur in ('mac', 'turnuva', 'kamp')),
  baslik text not null,
  grup_id uuid references grup(id),
  tesis text,
  tarih date not null,
  saat text,
  lcv_istenir boolean not null default false,
  ucretli boolean not null default false,
  tutar numeric,
  aciklama text,
  rakip text,
  skor_biz int,
  skor_rakip int,
  sonuc text check (sonuc in ('galibiyet', 'maglubiyet', 'beraberlik')),
  sonuc_notu text,
  olusturan_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table etkinlik_katilim (
  etkinlik_id uuid not null references etkinlik(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'katilir', 'katilmaz')),
  updated_at timestamptz not null default now(),
  primary key (etkinlik_id, sporcu_id)
);

create table mac_kadro (
  id uuid primary key default gen_random_uuid(),
  etkinlik_id uuid not null unique references etkinlik(id) on delete cascade,
  yayinlandi boolean not null default false,
  created_at timestamptz not null default now()
);

create table mac_kadro_sporcu (
  mac_kadro_id uuid not null references mac_kadro(id) on delete cascade,
  sporcu_id uuid not null references sporcular(id) on delete cascade,
  secili boolean not null default false,
  primary key (mac_kadro_id, sporcu_id)
);

alter table duyuru enable row level security;
alter table duyuru_hedef enable row level security;
alter table etkinlik enable row level security;
alter table etkinlik_katilim enable row level security;
alter table mac_kadro enable row level security;
alter table mac_kadro_sporcu enable row level security;

-- duyuru
create policy "duyuru: yönetici tümünü görür" on duyuru for select
  using (private.current_profile_role() = 'yonetici');
create policy "duyuru: veli hedefindeyse görür" on duyuru for select
  using (
    auth.uid() is not null
    and (
      tum_veliler = true
      or exists (
        select 1 from duyuru_hedef dh
        join sporcular s on s.grup_id = dh.grup_id
        join veli_sporcu vs on vs.sporcu_id = s.id
        where dh.duyuru_id = duyuru.id and vs.veli_id = auth.uid()
      )
    )
  );
create policy "duyuru: yönetici yazar" on duyuru for insert
  with check (private.current_profile_role() = 'yonetici');

create policy "duyuru_hedef: giriş yapan herkes okur" on duyuru_hedef for select using (auth.uid() is not null);
create policy "duyuru_hedef: yönetici yazar" on duyuru_hedef for insert
  with check (private.current_profile_role() = 'yonetici');

-- etkinlik
create policy "etkinlik: yönetici tümünü görür" on etkinlik for select
  using (private.current_profile_role() = 'yonetici');
create policy "etkinlik: antrenör kendi grubunu görür" on etkinlik for select
  using (
    grup_id is null
    or exists (
      select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
      where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
    )
  );
create policy "etkinlik: veli kendi grubunu görür" on etkinlik for select
  using (
    grup_id is null
    or exists (
      select 1 from sporcular s join veli_sporcu vs on vs.sporcu_id = s.id
      where s.grup_id = etkinlik.grup_id and vs.veli_id = auth.uid()
    )
  );
create policy "etkinlik: yönetici yazar" on etkinlik for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "etkinlik: yönetici günceller" on etkinlik for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

-- etkinlik_katilim (veli RSVP'si)
create policy "etkinlik_katilim: yönetici tümünü görür" on etkinlik_katilim for select
  using (private.current_profile_role() = 'yonetici');
create policy "etkinlik_katilim: antrenör kendi sporcusunu görür" on etkinlik_katilim for select
  using (exists (select 1 from sporcu_antrenor sa where sa.sporcu_id = etkinlik_katilim.sporcu_id and sa.antrenor_id = auth.uid()));
create policy "etkinlik_katilim: veli kendi sporcusunu görür" on etkinlik_katilim for select
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()));
create policy "etkinlik_katilim: veli kendi sporcusu için yazar" on etkinlik_katilim for insert
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()));
create policy "etkinlik_katilim: veli kendi sporcusunu günceller" on etkinlik_katilim for update
  using (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()))
  with check (exists (select 1 from veli_sporcu vs where vs.sporcu_id = etkinlik_katilim.sporcu_id and vs.veli_id = auth.uid()));

-- mac_kadro / mac_kadro_sporcu — Faz 3'teki antrenman/yoklama RLS deseninin birebir tekrarı
create policy "mac_kadro: yönetici tümünü görür" on mac_kadro for select
  using (private.current_profile_role() = 'yonetici');
create policy "mac_kadro: antrenör kendi grubunu görür" on mac_kadro for select
  using (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ));
create policy "mac_kadro: yönetici yazar" on mac_kadro for insert
  with check (private.current_profile_role() = 'yonetici');
create policy "mac_kadro: antrenör kendi grubu için yazar" on mac_kadro for insert
  with check (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ));
create policy "mac_kadro: yönetici günceller" on mac_kadro for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');
create policy "mac_kadro: antrenör kendi grubunu günceller" on mac_kadro for update
  using (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ))
  with check (exists (
    select 1 from etkinlik e
    join sporcular s on s.grup_id = e.grup_id
    join sporcu_antrenor sa on sa.sporcu_id = s.id
    where e.id = mac_kadro.etkinlik_id and sa.antrenor_id = auth.uid()
  ));

create policy "mac_kadro_sporcu: erişim mac_kadro üzerinden" on mac_kadro_sporcu for select
  using (exists (
    select 1 from mac_kadro mk join etkinlik e on e.id = mk.etkinlik_id
    where mk.id = mac_kadro_sporcu.mac_kadro_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = e.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  ));
create policy "mac_kadro_sporcu: yönetici ve antrenör yazar" on mac_kadro_sporcu for all
  using (exists (
    select 1 from mac_kadro mk join etkinlik e on e.id = mk.etkinlik_id
    where mk.id = mac_kadro_sporcu.mac_kadro_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = e.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  ))
  with check (exists (
    select 1 from mac_kadro mk join etkinlik e on e.id = mk.etkinlik_id
    where mk.id = mac_kadro_sporcu.mac_kadro_id
    and (
      private.current_profile_role() = 'yonetici'
      or exists (
        select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
        where s.grup_id = e.grup_id and sa.antrenor_id = auth.uid()
      )
    )
  ));

-- Seed — TUM_DUYURULAR mock'undan: biri herkese, biri U12 Basketbol'a hedeflenmiş.
insert into duyuru (id, baslik, mesaj, tur, tum_veliler, sms_ile) values
  ('90000000-0000-0000-0000-000000000001', 'Yaz Kampı Erken Kayıt İndirimi', 'Foça Yaz Kampı kayıtları açıldı! 1 Ağustos''a kadar %15 erken kayıt indirimi geçerli. Detaylar ve kayıt formu uygulamada.', 'kamp', true, true),
  ('90000000-0000-0000-0000-000000000002', 'U12 takımımız İzmir il şampiyonu!', 'Finalde 64–58''lik galibiyetle kupayı kaldırdık', 'basari', false, false);

insert into duyuru_hedef (duyuru_id, grup_id) values
  ('90000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');

-- Seed — Etkinlik: 1 yaklaşan maç + 1 yaklaşan turnuva (tüm gruplar) + geçmiş 3 maç sonucu
-- (ETKINLIK_SONUCLARI mock'uyla birebir).
insert into etkinlik (id, tur, baslik, grup_id, tesis, tarih, saat, lcv_istenir, ucretli, tutar, rakip) values
  ('91000000-0000-0000-0000-000000000001', 'mac', 'Bornova U12', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis · Salon 1', current_date + 2, '11:00', true, false, null, 'Bornova U12'),
  ('91000000-0000-0000-0000-000000000002', 'turnuva', 'Ege Kupası U12', null, 'Bornova Spor Salonu', current_date + 10, '09:00', true, true, 3825, null);

insert into etkinlik (tur, baslik, grup_id, tesis, tarih, rakip, skor_biz, skor_rakip, sonuc, sonuc_notu) values
  ('mac', 'Lig Maçı', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis', current_date - 11, 'Bornova SK', 64, 58, 'galibiyet', 'İl şampiyonu olduk 🏆'),
  ('mac', 'Lig Maçı', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis', current_date - 18, 'Karşıyaka Yıldız', 52, 41, 'galibiyet', 'Yarı final galibiyeti'),
  ('mac', 'Lig Maçı', '40000000-0000-0000-0000-000000000001', 'Merkez Tesis', current_date - 27, 'Alsancak Gençlik', 38, 45, 'maglubiyet', 'Grup maçı');

-- Etkinlik katılım — Ali Kaya mock'taki e1/e2 durumlarıyla aynı (bekliyor/katilir),
-- roster'ın geri kalanı Maç Kadrosu'nun LCV listesi boş görünmesin diye karışık.
insert into etkinlik_katilim (etkinlik_id, sporcu_id, durum) values
  ('91000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'bekliyor'),
  ('91000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'katilir');

with roster_sirali as (
  select id, row_number() over (order by ad) as rn
  from sporcular
  where grup_id = '40000000-0000-0000-0000-000000000001'
    and id <> '50000000-0000-0000-0000-000000000001'
)
insert into etkinlik_katilim (etkinlik_id, sporcu_id, durum)
select '91000000-0000-0000-0000-000000000001', id,
  case when rn % 3 = 0 then 'katilir' when rn % 3 = 1 then 'katilmaz' else 'bekliyor' end
from roster_sirali;
