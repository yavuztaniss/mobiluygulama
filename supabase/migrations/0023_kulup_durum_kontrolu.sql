-- ===========================================================================
-- 0023_kulup_durum_kontrolu.sql — current_kulup_id() abonelik kill-switch'i
-- ===========================================================================
-- NEDEN:
--   0021, private.current_kulup_id() fonksiyonunu düz "profiles.kulup_id'yi
--   döndür" biçiminde bıraktı; kulüp durumu kontrolü yorumda "bilinçli olarak
--   kapalı" notuyla duruyordu. Sonrasında kurulum paketi (kurulum/01_sema.sql)
--   fonksiyonu durum kontrollü hâliyle yazdı. Yani iki kurulum yolu FARKLI şema
--   üretiyordu: migration'larla güncellenen mevcut proje ile sıfırdan kurulan
--   yeni proje aynı davranmıyordu.
--
--   Bu dosya ikisini eşitler ve kill-switch'i açar.
--
-- NE İŞE YARIYOR:
--   Kulübün durumu 'aktif' değilse fonksiyon NULL döner. 55 restrictive
--   izolasyon politikasının tamamı `kulup_id = (select private.current_kulup_id())`
--   biçiminde olduğu için NULL karşılaştırması hiçbir satırı eşleştirmez —
--   kullanıcı kendi profilini bile göremez, yazma da yapamaz.
--
--   Böylece aboneliği biten kulübün erişimi TEK satırlık bir güncellemeyle
--   kapanır:  update kulup set durum = 'askida' where id = '...';
--   Geri açmak da aynı şekilde:  update kulup set durum = 'aktif' where id = '...';
--
-- ⚠ 'deneme' DURUMU DA KAPALIDIR
--   kulup.durum kolonunun varsayılanı 'deneme'. Yani `insert into kulup (ad)`
--   ile açılan bir kulübün kullanıcıları giriş yapar ama HİÇBİR ŞEY göremez.
--   Kulüp açan her akış durumu AÇIKÇA 'aktif' yazmalıdır (süper-admin paneli ve
--   kurulum/03_kulup_olustur.sql bunu yapıyor). Deneme süreci `durum` ile değil,
--   `plan` + `abonelik_bitis` alanlarıyla ifade edilmelidir.
-- ===========================================================================

create or replace function private.current_kulup_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.kulup_id
    from public.profiles p
    join public.kulup k on k.id = p.kulup_id
   where p.id = auth.uid()
     and k.durum = 'aktif'
$$;

revoke execute on function private.current_kulup_id() from public;
revoke execute on function private.current_kulup_id() from anon;
grant  execute on function private.current_kulup_id() to authenticated;


-- ---------------------------------------------------------------------------
-- Mevcut kulüpleri aktifleştir.
-- 0021'in veri taşıması kulübü kolon varsayılanıyla ('deneme') oluşturmuş
-- olabilir; bu migration durum kontrolünü devreye soktuğu için o kulüp aniden
-- erişilemez hâle gelirdi. Halihazırda çalışan kurulumlar etkilenmesin diye
-- var olan tüm kulüpler 'aktif' yapılıyor.
-- ---------------------------------------------------------------------------
update kulup set durum = 'aktif' where durum <> 'aktif';


-- ---------------------------------------------------------------------------
-- DOĞRULAMA
--   select id, ad, durum from kulup;                    -- hepsi 'aktif' olmalı
--   -- Kill-switch denemesi (kendi hesabınızla, uygulamadan):
--   update kulup set durum = 'askida' where id = '<kulup_id>';
--   -- Uygulamayı yenileyin: hiçbir veri görünmemeli.
--   update kulup set durum = 'aktif'  where id = '<kulup_id>';
-- ---------------------------------------------------------------------------
