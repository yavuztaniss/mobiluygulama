-- ===========================================================================
-- 0047 — mesaj.gonderen_rol ARTIK SUNUCUDA TÜRETİLİYOR
-- ===========================================================================
--
-- BU NASIL OLDU
--   `gonderen_rol` 0011'de eklendi. Gerekçesi dar ve meşruydu: aynı hesabın hem
--   veli hem antrenör olarak kullanıldığı test/demo konuşmalarında (veli_id =
--   antrenor_id) mesajın hangi "şapkayla" yazıldığını ayırt etmek. Kolon o gün
--   İSTEMCİNİN BEYANI olarak bırakıldı ve bir daha dönülmedi.
--
--   RLS mesajı yazanı doğruluyor:  gonderen_id = auth.uid()  +  gönderenin o
--   konuşmanın tarafı olması. Ama gonderen_rol hiçbir politikada geçmiyor;
--   yani KİM yazdığı doğrulanıyor, NE SIFATLA yazdığı doğrulanmıyor.
--
--   İki istemci de mesajın sahibini bu kolondan okuyor:
--     · admin-panel/app/(panel)/mesajlar/page.tsx:68 → sorgu yalnızca
--       (id, metin, gonderen_rol, created_at) seçiyor; gonderen_id HİÇ
--       okunmuyor. Satır 154: const veliMi = m.gonderen_rol === 'veli' —
--       yöneticinin "Salt izleme" ekranındaki balonun tarafı ve Veli/Antrenör
--       etiketi tamamen bu kolona bakıyor. Panelde gerçeği söyleyecek ikinci
--       bir alan yok.
--     · app/src/data/mesajRepo.ts:129 → benim: m.gonderen_rol === myRole
--
-- NASIL YAKALANDI
--   "İstemcinin yazdığı, sunucunun doğrulamadığı alan var mı" taraması
--   (app/src/data/*.ts içindeki tüm insert/update çağrıları). mesajRepo.ts:143
--   gonderen_rol'ü istemcide hesaplayıp gönderiyor; şemada ne tetikleyici ne
--   politika bu değere bakıyordu. Sonra yerelde ölçüldü.
--
-- ÖLÇÜLEN SÖMÜRÜ (yerel Docker, tek transaction, rollback)
--   Veli (Test Veli, 9d19b94f...) kendi antrenörüyle olan konuşmasına
--   gonderen_rol = 'antrenor' ile satır yazdı:
--
--     insert into public.mesaj(konusma_id, gonderen_id, gonderen_rol, metin)
--     values (<kendi konusmasi>, auth.uid(), 'antrenor', '...');
--     → INSERT 0 1   (RLS reddetmedi)
--
--   Kaydın veritabanındaki hâli:
--     gonderen_rol = antrenor | gerçek gönderen = Test Veli (role: veli)
--
--   Panelin Mesajlar ekranının çalıştırdığı sorgunun aynısı (yönetici JWT'siyle):
--     id | metin | gonderen_rol=antrenor | created_at
--   → Yönetici ekranında mesaj ANTRENÖRÜN balonunda, "Antrenör" etiketiyle çizilir.
--
--   SENARYO: veli, antrenörün ağzından uygunsuz bir cümle yazar, sonra aynı
--   antrenör hakkında şikâyet açar (0031 şikâyet modülü). Yönetici "Salt izleme"
--   ekranını delil sayar ve antrenörü işten çıkarır. Kayıt, kulübün bir personel
--   iddiasını çözerken baktığı TEK yazışma kaydı — ve tahrif edilebilir durumda.
--   Ters yön de aynı: antrenör, velinin ağzından "izin veriyorum" yazabilir.
--
-- NEDEN TETİKLEYİCİ (RLS DEĞİL)
--   Bu bir güvenlik değişmezi: "gonderen_rol, mesajı gerçekten yazanı gösterir".
--   Değişmezler tetikleyiciye konur — veli, antrenör, yönetici, service_role ve
--   postgres dahil HERKESE işler. RLS'e konsaydı service_role yolu (panelin
--   createAdminClient'i, ileride bir entegrasyon) açık kalırdı.
--
-- SEÇİLMEYEN ALTERNATİFLER
--   a) RLS WITH CHECK'e koşul eklemek: yalnızca gerçek kullanıcılara işler,
--      service_role'ü kapsamaz; ayrıca politika ifadesi konusma'ya ikinci bir
--      join daha taşırdı. Reddedildi.
--   b) Paneli gonderen_id ile çizmeye çevirmek: mobilin "benim" hesabı da aynı
--      kolona bakıyor, yani iki istemciyi de tek tek düzeltmek gerekirdi ve
--      VERİ yine yalan kalırdı (yeni yazılan satır hâlâ 'antrenor' derdi).
--      Doğru katman veri katmanı. Reddedildi.
--   c) Kolonu tamamen kaldırmak: veli_id = antrenor_id olan konuşmalarda ayrım
--      kaybolur (kolonun var olma sebebi) ve yayındaki istemciler kolonu
--      seçtiği için kırılırdı. Reddedildi.
--
-- YANLIŞ BEYANDA EXCEPTION DEĞİL, SESSİZ DÜZELTME
--   Meşru istemci zaten doğru değeri gönderiyor. Exception atmak, kolonu hiç
--   göndermeyen ya da eski hesaplayan bir istemci sürümünde mesajlaşmayı
--   TAMAMEN kırardı — 0037'de tam olarak bu hata yapılmıştı (davetleri koruyan
--   tetikleyici davetin tüketilmesini de engellemişti). Burada yanlış beyan yok
--   sayılır ve doğrusu yazılır: sömürü kapanır, hiçbir meşru akış kırılmaz.
--
--   Gönderen konuşmanın HİÇBİR tarafı değilse exception atılıyor: bu, RLS'in
--   authenticated için zaten engellediği ama service_role/postgres yolunda açık
--   kalan durumdur ve sessizce düzeltilebilecek bir "yanlış beyan" değil,
--   tutarsız veridir.
--
-- AMBİGÜ DURUM (veli_id = antrenor_id)
--   Aynı hesap konuşmanın iki tarafı ise türetme ayrım yapamaz; kolonun VAR OLMA
--   sebebi tam da budur. O satırlarda istemcinin beyanı KORUNUR.
-- ===========================================================================

create or replace function public.mesaj_gonderen_rol_turet()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  v_veli     uuid;
  v_antrenor uuid;
begin
  select k.veli_id, k.antrenor_id
    into v_veli, v_antrenor
    from public.konusma k
   where k.id = new.konusma_id;

  -- Konuşma yoksa FK zaten reddedecek; karar verilecek veri de yok.
  if v_veli is null then
    return new;
  end if;

  -- Aynı hesap iki taraf: beyan korunur (bkz. başlık, AMBİGÜ DURUM).
  if v_veli = v_antrenor then
    return new;
  end if;

  if new.gonderen_id = v_antrenor then
    new.gonderen_rol := 'antrenor';
  elsif new.gonderen_id = v_veli then
    new.gonderen_rol := 'veli';
  else
    raise exception 'mesajı yazan kişi bu konuşmanın tarafı değil'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$fn$;

drop trigger if exists on_mesaj_gonderen_rol on public.mesaj;
create trigger on_mesaj_gonderen_rol
  before insert or update on public.mesaj
  for each row execute procedure public.mesaj_gonderen_rol_turet();

-- ---------------------------------------------------------------------------
-- GEÇMİŞ VERİ ONARIMI
-- Tetikleyici konmadan önce yazılmış (ya da tahrif edilmiş) satırlar düzeltilir.
-- veli_id = antrenor_id olan konuşmalar bilinçli olarak DIŞARIDA: orada doğru
-- değer türetilemez. UPDATE yukarıdaki tetikleyiciden geçer ve aynı değeri
-- üretir — idempotent.
update public.mesaj m
   set gonderen_rol = case when m.gonderen_id = k.antrenor_id then 'antrenor' else 'veli' end
  from public.konusma k
 where k.id = m.konusma_id
   and k.veli_id is distinct from k.antrenor_id
   and m.gonderen_id in (k.veli_id, k.antrenor_id)
   and m.gonderen_rol is distinct from
       (case when m.gonderen_id = k.antrenor_id then 'antrenor' else 'veli' end);

-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
--   -- 1) Tahrif denemesi (veli, antrenör ağzından yazar) → satır 'veli' olmalı
--   begin;
--     set local role authenticated;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<veli uuid>','role','authenticated')::text, true);
--     insert into public.mesaj(konusma_id, gonderen_id, gonderen_rol, metin)
--     values ('<konusma>', '<veli uuid>', 'antrenor', 'test')
--     returning gonderen_rol;        -- → veli
--   rollback;
--
--   -- 2) Meşru akış (veli kendi sıfatıyla, antrenör kendi sıfatıyla) bozulmamalı.
--   -- 3) Tutarsız satır kalmamalı → boş dönmeli:
--   select m.id from public.mesaj m join public.konusma k on k.id = m.konusma_id
--    where k.veli_id is distinct from k.antrenor_id
--      and m.gonderen_rol is distinct from
--          (case when m.gonderen_id = k.antrenor_id then 'antrenor' else 'veli' end);
-- ===========================================================================
