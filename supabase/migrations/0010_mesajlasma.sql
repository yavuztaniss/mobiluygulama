-- Faz 5: Mesajlaşma gerçek tabloya ve Supabase Realtime'a taşınıyor. Veli tarafında
-- tüm uygulamada TEK global mesaj dizisi vardı, yalnızca id'si tam olarak 'k1' olan
-- konuşmaya bağlıydı; Antrenör tarafında mesaj gönderme ekran-lokal React state'iydi,
-- hiçbir yere kaydolmuyordu. Gerçek zemin `sporcu_antrenor` ⋈ `veli_sporcu` üzerinden
-- (hangi veli hangi antrenörle gerçekten bağlantılı) zaten Faz 1'den beri var.

create table konusma (
  id uuid primary key default gen_random_uuid(),
  veli_id uuid not null references profiles(id),
  antrenor_id uuid not null references profiles(id),
  son_mesaj text,
  son_mesaj_zaman timestamptz,
  veli_okundu_zaman timestamptz,
  antrenor_okundu_zaman timestamptz,
  created_at timestamptz not null default now(),
  unique (veli_id, antrenor_id)
);

create table mesaj (
  id uuid primary key default gen_random_uuid(),
  konusma_id uuid not null references konusma(id) on delete cascade,
  gonderen_id uuid not null references profiles(id),
  metin text not null,
  created_at timestamptz not null default now()
);

alter table konusma enable row level security;
alter table mesaj enable row level security;

-- konusma
create policy "konusma: veli kendi görür" on konusma for select
  using (veli_id = auth.uid());
create policy "konusma: antrenör kendi görür" on konusma for select
  using (antrenor_id = auth.uid());
create policy "konusma: yönetici tümünü görür" on konusma for select
  using (private.current_profile_role() = 'yonetici');

create policy "konusma: veli gerçek antrenörüyle açar" on konusma for insert
  with check (
    veli_id = auth.uid()
    and exists (
      select 1 from sporcu_antrenor sa join veli_sporcu vs on vs.sporcu_id = sa.sporcu_id
      where sa.antrenor_id = konusma.antrenor_id and vs.veli_id = auth.uid()
    )
  );

create policy "konusma: veli kendi thread'ini günceller" on konusma for update
  using (veli_id = auth.uid()) with check (veli_id = auth.uid());
create policy "konusma: antrenör kendi thread'ini günceller" on konusma for update
  using (antrenor_id = auth.uid()) with check (antrenor_id = auth.uid());

-- mesaj
create policy "mesaj: konusma katılımcısı okur" on mesaj for select
  using (exists (
    select 1 from konusma k where k.id = mesaj.konusma_id
    and (k.veli_id = auth.uid() or k.antrenor_id = auth.uid())
  ));
create policy "mesaj: yönetici tümünü okur" on mesaj for select
  using (private.current_profile_role() = 'yonetici');
create policy "mesaj: katılımcı yazar" on mesaj for insert
  with check (
    gonderen_id = auth.uid()
    and exists (
      select 1 from konusma k where k.id = mesaj.konusma_id
      and (k.veli_id = auth.uid() or k.antrenor_id = auth.uid())
    )
  );

-- Yeni sohbet rehberi + konuşma listesinde karşı tarafın adını göstermek için —
-- gerçek sporcu_antrenor ⋈ veli_sporcu ilişkisine dayanıyor, konuşma var olmadan önce bile.
create policy "profiles: veli kendi antrenörünü görür" on profiles for select
  using (
    exists (
      select 1 from sporcu_antrenor sa join veli_sporcu vs on vs.sporcu_id = sa.sporcu_id
      where sa.antrenor_id = profiles.id and vs.veli_id = auth.uid()
    )
  );
create policy "profiles: antrenör bağlı velisini görür" on profiles for select
  using (
    exists (
      select 1 from sporcu_antrenor sa join veli_sporcu vs on vs.sporcu_id = sa.sporcu_id
      where vs.veli_id = profiles.id and sa.antrenor_id = auth.uid()
    )
  );

-- Realtime — chat ekranı açıkken postgres_changes INSERT event'ine konusma_id filtresiyle abone olunacak.
alter publication supabase_realtime add table mesaj;

-- Seed — demo hesap (yavuzttaniss@gmail.com) hem veli hem antrenör olarak test edildiği
-- için kendisiyle (veli_id=antrenor_id) 1 konuşma + BASE_CHAT mock'undan 3 mesaj.
insert into konusma (id, veli_id, antrenor_id, son_mesaj, son_mesaj_zaman)
select '93000000-0000-0000-0000-000000000001', u.id, u.id,
  'Merhaba hocam, harika haber! Cuma erken geliriz.', now() - interval '2 hours'
from auth.users u where u.email = 'yavuzttaniss@gmail.com'
on conflict do nothing;

insert into mesaj (konusma_id, gonderen_id, metin, created_at)
select '93000000-0000-0000-0000-000000000001', u.id, m.metin, now() - m.once
from auth.users u
cross join (values
  ('Merhaba Elif Hanım, Ali bugün şut çalışmasında çok iyiydi. Kısa videosunu veli kanalına yükledim.', interval '3 hours'),
  ('Cuma antrenmanı 30 dk erken başlayacak, 16:30''da salonda olalım.', interval '2 hours 10 minutes'),
  ('Merhaba hocam, harika haber! Cuma erken geliriz.', interval '2 hours')
) as m(metin, once)
where u.email = 'yavuzttaniss@gmail.com';
