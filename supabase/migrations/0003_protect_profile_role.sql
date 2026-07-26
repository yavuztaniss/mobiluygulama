-- Güvenlik açığı: profiles UPDATE politikasında WITH CHECK yoktu, yani auth.uid()=id
-- sağlayan herhangi bir kullanıcı kendi satırındaki role sütununu 'yonetici' yapıp
-- admin yetkisi kazanabilirdi. İki katmanlı çözüm:
--   1) WITH CHECK ekleyerek politika tam (USING + WITH CHECK) hale getiriliyor.
--   2) BEFORE UPDATE trigger'ı ile role sütununun normal kullanıcı güncellemesiyle
--      hiç değişemeyeceği garanti altına alınıyor (WITH CHECK tek başına eski/yeni
--      değeri karşılaştıramaz, bu yüzden trigger gerekiyor).

drop policy if exists "profiles: kullanıcı kendi profilini günceller" on profiles;
create policy "profiles: kullanıcı kendi profilini günceller"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role <> old.role then
    raise exception 'role alanı bu şekilde değiştirilemez';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_role_protect on public.profiles;
create trigger on_profile_role_protect
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();
