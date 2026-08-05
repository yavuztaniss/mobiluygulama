-- ===========================================================================
-- 0057 — kulup-logo: listeleme herkese açıktı, kulübe daraltıldı
-- ===========================================================================
-- NASIL ÇIKTI
--   Supabase danışmanı (Advisors → Security) 0055'ten sonra uyardı:
--     "Public bucket kulup-logo has 1 broad SELECT policy on storage.objects,
--      allowing clients to list all files. Public buckets don't need this for
--      object URL access."
--
-- UYARININ HAKLI OLDUĞU ÖLÇÜLDÜ
--   Politika dururken anon rolü kovayı LİSTELEYEBİLİYORDU:
--     POST /storage/v1/object/list/kulup-logo   (anon anahtarla)
--     → [{"name":"caa2ae8e-ede3-4bf8-8f97-d3a22b55e11e", ...}]
--   Klasör adları kulüp kimlikleri olduğu için bu, SİSTEMDEKİ TÜM KULÜPLERİN
--   SAYISINI VE KİMLİKLERİNİ herkese açıyordu. Tek kulüpte zararsız görünüyor;
--   elli kulüple tam bir müşteri listesi. Kimlik bilmek veri vermiyor (kiracı
--   duvarı current_kulup_id() ile çalışıyor), sızan şey ticari bilgi.
--
-- ⚠⚠ DANIŞMANIN ÖNERDİĞİ ÇÖZÜM YANLIŞTI — ÖLÇEREK YAKALANDI
--   Danışman "public bucket'lar bu politikaya ihtiyaç duymaz" diyor ve bu
--   GÖRSEL ERİŞİMİ için doğru: /storage/v1/object/public/... yolu RLS'e hiç
--   bakmıyor, politika düşürüldükten sonra da HTTP 200 dönüyor (ölçüldü).
--
--   Ama politikayı tümden düşürünce YÜKLEME KIRILDI:
--     POST /storage/v1/object/kulup-logo/<kulup>/logo.png  (x-upsert: true)
--     → 403 "new row violates row-level security policy"
--   Sebep: Storage'ın upsert yolu var olan nesneyi GÖREBİLMEK zorunda; SELECT
--   olmadan mevcut satırı bulamıyor ve INSERT'e düşüp politikaya çarpıyor.
--
--   Yani doğru düzeltme KALDIRMAK değil DARALTMAK: kimse listeleyemesin ama
--   yönetici KENDİ klasörünü görebilsin.
--
-- ÖLÇÜLEN SON DURUM (dar politika kurulduktan sonra)
--   yönetici upsert            → ÇALIŞIYOR
--   yönetici listeleme         → 1 klasör (yalnızca kendi kulübü)
--   anon listeleme             → 403, reddedildi
--   genel URL (simge)          → HTTP 200
--
-- ⚠ ANON'UN REDDİ "permission denied for function current_profile_role" ile
--   geliyor. Davranış fail-closed ve doğru; mesaj iç fonksiyon adını veriyor
--   ama bu şemanın geneliyle tutarlı (0021'den beri aynı desen).
--
-- ÇALIŞTIRMA: 0056'dan sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

-- Geniş politika kaldırılıyor.
drop policy if exists "kulup-logo: herkes okur" on storage.objects;

-- Yerine dar olanı: yalnızca o kulübün yöneticisi, yalnızca kendi klasörü.
-- Yazma politikalarıyla AYNI koşul — yetki tek bir yerden okunuyor, iki ayrı
-- kural birbirinden ayrışamıyor.
drop policy if exists "kulup-logo: yönetici kendi klasörünü görür" on storage.objects;
create policy "kulup-logo: yönetici kendi klasörünü görür"
  on storage.objects for select
  using (
    bucket_id = 'kulup-logo'
    and (select private.current_profile_role()) = 'yonetici'
    and (storage.foldername(name))[1] = (select private.current_kulup_id())::text
  );


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare v_genis int; v_toplam int;
begin
  select count(*) into v_genis from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects' and p.polname = 'kulup-logo: herkes okur';
  if v_genis <> 0 then
    raise exception '0057: geniş listeleme politikası hâlâ duruyor.';
  end if;

  -- 4 politika olmalı: select(dar) + insert + update + delete.
  -- Yükleme SELECT'e bağlı olduğu için sayı 4'ten azsa panel sessizce kırılır.
  select count(*) into v_toplam from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects' and p.polname like 'kulup-logo:%';
  if v_toplam <> 4 then
    raise exception '0057: 4 politika bekleniyordu, % bulundu — yükleme kırılabilir.', v_toplam;
  end if;

  raise notice '0057 doğrulandı: listeleme kulübe daraltıldı, 4 politika yerinde.';
end $$;
