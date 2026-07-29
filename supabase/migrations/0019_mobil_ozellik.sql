-- 0019: Mobil özellik bayrakları (admin panel Faz 6 — ilk çift-repo entegrasyonu).
-- Panelden aç/kapa yapılan bayraklar; mobil uygulama açılışta okuyup ilgili
-- sekme/kartları gizler. Bayrak tablosu okunamazsa mobil taraf HER ŞEYİ AÇIK
-- varsayar (fail-open) — bayrak altyapısı hiçbir zaman uygulamayı kilitleyemez.

create table mobil_ozellik (
  anahtar text primary key,
  ad text not null,
  aciklama text,
  aktif boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table mobil_ozellik enable row level security;

-- Mobil istemciler (veli/antrenör) bayrakları okumak zorunda — katalog deseni.
create policy "mobil_ozellik: giriş yapan herkes okur" on mobil_ozellik for select
  using (auth.uid() is not null);
create policy "mobil_ozellik: yönetici yönetir" on mobil_ozellik for all
  using (private.current_profile_role() = 'yonetici')
  with check (private.current_profile_role() = 'yonetici');

-- Bayrak seti sabit — panel yalnızca aktif/pasif değiştirir, yeni bayrak eklemek
-- mobil tarafta karşılığı olan kod gerektirdiği için migration'la gelir.
-- Çekirdek akışlar (ana sayfa, yoklama, ödemeler, duyurular, profil) bilinçli
-- olarak bayraklanmadı — kapatılmaları uygulamayı anlamsızlaştırır.
insert into mobil_ozellik (anahtar, ad, aciklama, aktif) values
  ('mesajlar',      'Mesajlaşma',        'Veli ↔ antrenör mesajlaşma sekmeleri', true),
  ('magaza',        'Mağaza',            'Veli tarafındaki mağaza sekmesi ve sipariş akışı', true),
  ('servis',        'Servis Takibi',     'Veli tarafındaki servis sekmesi', true),
  ('bireysel_ders', 'Bireysel Ders',     'Veli bireysel ders kartı + antrenör takvim/kazanç ekranları', true),
  ('etkinlikler',   'Etkinlikler',       'Veli tarafındaki etkinlikler/maç takvimi ekranı', true);
