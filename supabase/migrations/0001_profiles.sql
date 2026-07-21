-- Faz 0: kullanıcı profilleri + rol bazlı auth temeli

create type app_role as enum ('yonetici', 'veli', 'antrenor');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null,
  ad text not null,
  telefon text,
  sube_id uuid,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: kullanıcı kendi profilini okur"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: kullanıcı kendi profilini günceller"
  on profiles for update
  using (auth.uid() = id);

-- auth.users'a yeni kayıt olduğunda profiles satırını user_metadata'dan otomatik oluştur.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, ad)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'veli'),
    coalesce(new.raw_user_meta_data ->> 'ad', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
