-- ===========================================================================
-- 0034 — Yönetici hesaplarını platform sahibinin kontrolüne alma
-- ===========================================================================
-- ÖNCE ZATEN GARANTİ ALTINDA OLAN (bu migration'ın DEĞİŞTİRMEDİĞİ)
--   · Davetsiz kayıt olan HERKES 'veli' açılır — handle_new_user'ın son satırı
--     rolü sabit yazar, istemciden gelen hiçbir değere bakmaz.
--   · Rol raw_user_meta_data'dan HİÇ okunmaz (0016'nın kazanımı). Kayıt
--     isteğine data:{role:'yonetici'} koymak hiçbir şey değiştirmez.
--   · davet_rol_check platform_admin'i beyaz listeye ALMAZ: davet yolu
--     platform sahipliğine yükselmek için kullanılamaz.
--   Yani "insanlar kayıt olurken yönetici olamasın" isteği ZATEN sağlanıyordu.
--
-- KAPATILAN GERÇEK AÇIK
--   Bir kulübün yöneticisi, kendi kulübü için rol='yonetici' davet
--   oluşturabiliyordu. Tek kulüplü bir üründe bu doğal bir yetki; ama yazılım
--   LİSANSLA SATILDIĞINDA başka bir anlama geliyor: müşteri kulüp, platform
--   sahibinden habersiz istediği kadar yönetici hesabı üretebilir. Kaç yönetici
--   koltuğu satıldığının bir anlamı kalmaz ve kulüp değişikliklerinden haberdar
--   olunmaz.
--
-- ÇÖZÜM: KULÜP BAZINDA KİLİT, GENEL YASAK DEĞİL.
--   `kulup.yonetici_davet_kilitli` varsayılan olarak AÇIK (true): yalnızca
--   platform_admin yönetici daveti çıkarabilir. Ama kulüp bazında açılabiliyor,
--   çünkü katı bir yasak operasyonel olarak tehlikeli: kulübün tek yöneticisi
--   ayrılırsa kulüp kilitlenir ve kurtarma yolu her seferinde platform sahibinin
--   müdahalesi olur. Büyük bir müşteriye "kendi yöneticilerinizi siz yönetin"
--   demek isteyeceksin; o zaman tek alan değiştirilir.
--
-- ⚠ NE DEĞİŞMİYOR: kulüp yöneticisi antrenör, muhasebeci ve veli davet etmeye
--   DEVAM EDİYOR. Kilit yalnızca 'yonetici' rolünü kapsıyor — günlük işleyiş
--   etkilenmiyor.
--
-- ÇALIŞTIRMA: 0033'ten sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) KULÜP BAZINDA YÖNETİCİ DAVETİ KİLİDİ
-- ===========================================================================
alter table public.kulup
  add column if not exists yonetici_davet_kilitli boolean not null default true;

comment on column public.kulup.yonetici_davet_kilitli is
  'true (varsayılan) = bu kulüp için yönetici davetini YALNIZCA platform_admin çıkarabilir (0034). Kulübün kendi yöneticileri antrenör/muhasebeci/veli davet etmeye devam eder. Büyük müşteride false yapılabilir.';

-- Kilidi uygulayan tetikleyici.
--
-- POLİTİKA DEĞİL TETİKLEYİCİ: mevcut "davet: yönetici kendi kulübünün
-- davetlerini yönetir" politikası tüm rolleri kapsıyor; onu rol bazında
-- bölmek politikayı okunmaz hale getirirdi. Tetikleyici hem kuralı tek yerde
-- topluyor hem de reddi AÇIKLAMALI bir mesajla veriyor — RLS reddi yalnızca
-- "satır politikayı ihlal ediyor" der ve kulüp yöneticisi sebebi anlamaz.
--
-- SECURITY DEFINER: current_profile_role() ve kulup okuması, davet eden
-- kullanıcının kendi yetkisiyle çalışsa da doğru sonuç verir; ama service_role
-- (platform konsolu) bağlamında auth.uid() NULL olduğu için rol 'yonetici'
-- çıkmaz ve kilit oradan geçer — istenen davranış tam olarak bu.
create or replace function public.protect_yonetici_daveti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kilitli boolean;
  v_rol     text;
begin
  if new.rol <> 'yonetici' then
    return new;   -- antrenör/muhasebeci/veli daveti serbest
  end if;

  select k.yonetici_davet_kilitli into v_kilitli
    from public.kulup k where k.id = new.kulup_id;

  if coalesce(v_kilitli, true) = false then
    return new;   -- bu kulüp için kilit açılmış
  end if;

  -- private.current_profile_role() oturumdaki rolü verir. service_role ile
  -- (platform konsolu) auth.uid() NULL olduğu için NULL döner — o yol serbest.
  v_rol := private.current_profile_role();

  if v_rol = 'yonetici' then
    raise exception 'Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından açılabilir. Yeni yönetici için sağlayıcınızla iletişime geçin.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists on_davet_yonetici_kontrol on public.davet;
create trigger on_davet_yonetici_kontrol
  before insert on public.davet
  for each row execute procedure public.protect_yonetici_daveti();


-- ===========================================================================
-- 2) KULÜP BAŞVURUSU — "e-postanı ver, ben açayım"
-- ===========================================================================
-- Bugün yeni kulüp açmanın tek yolu, platform konsolundaki formu Yavuz'un elle
-- doldurması. Talep eden kişinin bilgisi hiçbir yerde tutulmuyor: WhatsApp'ta,
-- e-postada ya da akılda kalıyor. Bu tablo talebi kayda alıyor ve konsolda
-- "onayla" akışına bağlıyor.
--
-- PLATFORMA AİT, KİRACIYA DEĞİL: başvuru henüz bir kulübe ait değil (kulüp
-- ONAY SONRASI doğuyor). Bu yüzden kulup_id YOK ve 0021'in restrictive kiracı
-- duvarına dahil değil.
create table if not exists public.kulup_basvurusu (
  id           uuid primary key default gen_random_uuid(),
  kulup_adi    text not null,
  ad_soyad     text not null,
  eposta       text not null,
  telefon      text,
  sehir        text,
  not_metni    text,
  durum        text not null default 'yeni' check (durum in ('yeni', 'gorusuldu', 'onaylandi', 'reddedildi')),
  -- Onaylanınca açılan kulüp. Başvuru ile kulüp arasındaki iz.
  kulup_id     uuid references public.kulup(id) on delete set null,
  platform_notu text,
  created_at   timestamptz not null default now()
);

create index if not exists kulup_basvurusu_durum_idx on public.kulup_basvurusu (durum, created_at desc);

-- ⚠ YENİ TABLO KURAN HER MIGRATION KENDİ GRANT'İNİ VERMELİ (0031'de öğrenildi):
-- 01_sema sonundaki toplu grant yalnızca o an var olan tablolara uygulanır.
grant all on public.kulup_basvurusu to anon, authenticated, service_role;

alter table public.kulup_basvurusu enable row level security;

-- YAZMA HERKESE AÇIK, OKUMA HİÇ KİMSEYE.
--   Başvuru formu tanıtım sitesine konulabilsin diye anon INSERT açık. Ama
--   SELECT politikası YOK: politikası olmayan işlem RLS altında reddedilir,
--   yani ne anon ne authenticated bu tabloyu OKUYAMAZ. Okuyabilseydi tablo
--   rakiplerin müşteri adaylarını toplayabileceği bir listeye dönerdi.
--   Platform konsolu service_role ile okuyor; service_role RLS'i baypas eder.
drop policy if exists "kulup_basvurusu: herkes başvuru gönderir" on public.kulup_basvurusu;
create policy "kulup_basvurusu: herkes başvuru gönderir" on public.kulup_basvurusu for insert
  with check (true);

-- Hız sınırı (0032): açık bir uç, spam'e karşı korunmalı. Kimlik olmadığı için
-- IP'ye göre sayılıyor — bu, kimliksiz isteklerde IP'nin doğru araç olduğu
-- ender durumlardan biri.
create or replace function public.hiz_kulup_basvurusu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform private.hiz_kontrol('kulup_basvurusu', 3, interval '1 hour',
    'Kısa sürede çok fazla başvuru gönderildi. Lütfen bir süre sonra tekrar deneyin.');
  return new;
end $$;

drop trigger if exists on_kulup_basvurusu_hiz on public.kulup_basvurusu;
create trigger on_kulup_basvurusu_hiz before insert on public.kulup_basvurusu
  for each row execute procedure public.hiz_kulup_basvurusu();


-- ===========================================================================
-- 3) DOĞRULAMA
-- ===========================================================================
--   -- Kulüp yöneticisi yönetici daveti çıkarabiliyor mu? (ÇIKARAMAMALI)
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<yonetici-uuid>","role":"authenticated"}',true);
--   insert into public.davet (rol, ad) values ('yonetici','Deneme');
--     → ERROR: Yönetici hesapları yalnızca yazılım sağlayıcısı tarafından...
--   insert into public.davet (rol, ad) values ('antrenor','Deneme');
--     → GEÇMELİ (kilit yalnızca 'yonetici' rolünü kapsıyor)
--
--   -- Kilidi bir kulüp için açmak:
--   update public.kulup set yonetici_davet_kilitli = false where slug = '<slug>';
--
--   -- Başvuru tablosu okunamıyor mu? (OKUNAMAMALI)
--   select count(*) from public.kulup_basvurusu;   → 0 (politika yok)
-- ===========================================================================
