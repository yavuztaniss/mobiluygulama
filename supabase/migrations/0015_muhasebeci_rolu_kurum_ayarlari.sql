-- Web Yönetim Paneli Faz 4: Ayarlar. Kullanıcı ile netleştirildi — "Muhasebeci"
-- prototipte görünen ama karşılığı olmayan bir rol değil, gerçekten eklenen üçüncü
-- bir app_role değeri. Kapsamı bilinçli olarak dar tutuluyor: muhasebeci yalnızca
-- Muhasebe modülüne (odeme/aidat_plani/gider/fatura + sporcu adı okuma) erişebiliyor,
-- panel tarafında bu sınır proxy.ts + lib/auth/dal.ts'de ayrıca uygulanıyor. Ayrıca
-- Ayarlar > Genel için `kurum_ayarlari` (tekil satır, singleton) tablosu ekleniyor.

alter type app_role add value 'muhasebeci';

-- odeme: mevcut 3 yönetici politikasını muhasebeciyi de kapsayacak şekilde genişlet.
alter policy "odeme: yönetici tümünü görür" on odeme
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'));
alter policy "odeme: yönetici yazar" on odeme
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));
alter policy "odeme: yönetici günceller" on odeme
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

alter policy "aidat_plani: yönetici yazar" on aidat_plani
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

alter policy "gider: yönetici tam yetkili" on gider
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

alter policy "fatura: yönetici tam yetkili" on fatura
  using (private.current_profile_role() in ('yonetici', 'muhasebeci'))
  with check (private.current_profile_role() in ('yonetici', 'muhasebeci'));

-- Muhasebe sayfalarındaki sporcu adı join'leri (Aidatlar/Faturalar/Ödemeler/Cari) ve
-- sporcu seçim dropdown'ları için — muhasebecinin bugüne kadar `sporcular` üzerinde
-- hiçbir SELECT politikası yoktu.
create policy "sporcular: muhasebeci tümünü görür" on sporcular for select
  using (private.current_profile_role() = 'muhasebeci');

create table kurum_ayarlari (
  id boolean primary key default true check (id),
  kulup_adi text not null default 'Karşıyaka Spor Okulu',
  telefon text,
  eposta text,
  adres text,
  para_birimi text not null default 'TRY' check (para_birimi in ('TRY', 'USD', 'EUR')),
  updated_at timestamptz not null default now()
);

alter table kurum_ayarlari enable row level security;

create policy "kurum_ayarlari: giriş yapan herkes okur" on kurum_ayarlari for select
  using (auth.uid() is not null);
create policy "kurum_ayarlari: yönetici günceller" on kurum_ayarlari for update
  using (private.current_profile_role() = 'yonetici') with check (private.current_profile_role() = 'yonetici');

insert into kurum_ayarlari (id) values (true);
