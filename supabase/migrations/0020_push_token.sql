-- 0020: Push bildirim altyapısı — Expo push token kaydı.
-- Mobil uygulama (fiziksel cihaz + EAS projectId varsa) oturum açılınca kendi
-- Expo push token'ını buraya yazar; duyuru gönderilirken hedef velilerin
-- token'larına Expo Push API (exp.host) üzerinden bildirim yollanır.
-- Web'de ve EAS yapılandırması olmadan token üretilmez — tablo boş kalır,
-- gönderim adımı sessizce atlanır (push altyapısı uygulamayı asla kırmaz).

create table push_token (
  token text primary key,          -- ExponentPushToken[...] — cihaz başına tek
  user_id uuid not null references profiles(id) on delete cascade,
  platform text,                   -- 'ios' | 'android'
  updated_at timestamptz not null default now()
);

alter table push_token enable row level security;

-- Herkes yalnızca kendi cihaz kaydını yazar/okur/siler.
create policy "push_token: kullanıcı kendi token'ını yönetir" on push_token for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Duyuru gönderirken hedef velilerin token'larını okumak yöneticinin işi.
create policy "push_token: yönetici tümünü okur" on push_token for select
  using (private.current_profile_role() = 'yonetici');

-- Expo "DeviceNotRegistered" dönen ölü token'ları gönderim sonrası temizlemek için.
create policy "push_token: yönetici ölü token'ları siler" on push_token for delete
  using (private.current_profile_role() = 'yonetici');

-- Cihaz devri: aynı telefonda A çıkıp B girdiğinde token hâlâ A'nın satırında
-- kayıtlıdır; B'nin insert'i PK çakışmasına, upsert'i ise RLS reddine takılırdı
-- (satır A'ya ait). Token cihazı temsil eder — token'ı sunan son kullanıcı
-- cihazın sahibidir: INSERT'ten önce aynı token'ın eski satırı (sahibi kim
-- olursa olsun) SECURITY DEFINER ile silinir.
create or replace function public.push_token_devral()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.push_token where token = new.token;
  return new;
end;
$$;

revoke execute on function public.push_token_devral() from public;
revoke execute on function public.push_token_devral() from anon;
revoke execute on function public.push_token_devral() from authenticated;

drop trigger if exists on_push_token_devral on public.push_token;
create trigger on_push_token_devral
  before insert on public.push_token
  for each row execute procedure public.push_token_devral();
