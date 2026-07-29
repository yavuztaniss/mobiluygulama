-- Faz 5 düzeltmesi: paylaşılan tek test hesabı hem veli hem antrenör olarak test
-- edildiğinde (veli_id = antrenor_id, self-chat) `gonderen_id = auth.uid()` karşılaştırması
-- hangi "şapkayla" gönderildiğini ayırt edemiyor — gerçek iki farklı hesapta bu hiç sorun
-- değil (gonderen_id zaten tek anlamlı), ama test/demo senaryosunda mesajlar hep "benim"
-- görünüyordu. Mesajın gönderildiği andaki gerçek rolü ayrıca kaydediyoruz.

alter table mesaj add column gonderen_rol text not null default 'veli' check (gonderen_rol in ('veli', 'antrenor'));

-- Seed mesajlarını gerçek rolleriyle düzelt (BASE_CHAT mock'undaki who:'c' (antrenör) /
-- who:'p' (veli) sırasına göre — bkz. 0010_mesajlasma.sql).
update mesaj set gonderen_rol = 'antrenor'
where konusma_id = '93000000-0000-0000-0000-000000000001'
  and metin in (
    'Merhaba Elif Hanım, Ali bugün şut çalışmasında çok iyiydi. Kısa videosunu veli kanalına yükledim.',
    'Cuma antrenmanı 30 dk erken başlayacak, 16:30''da salonda olalım.'
  );

-- Test sırasında uygulama üzerinden gönderilen mesajların rolünü de düzelt.
update mesaj set gonderen_rol = 'antrenor' where metin = 'Faz 5 Realtime test mesajı - antrenör tarafından';
