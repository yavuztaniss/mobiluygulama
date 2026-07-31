-- ===========================================================================
-- 0038 — Şube: kiracı bütünlüğü, indeksler ve NULL anlamı
-- ===========================================================================
-- BAĞLAM
--   `sube` tablosu ve 9 tablodaki `sube_id` kolonu 0004'ten beri var, ama şube
--   fiilen hiç kullanılmıyordu: panelde şube ekranı yok, hiçbir form sube_id
--   yazmıyor, hiçbir liste şubeye göre filtrelemiyor. Kolonlar üretimde NULL
--   kalıyor. Bu migration şubeyi ANLAMLI hale getirmenin veritabanı ayağı.
--
-- 1) KİRACI BÜTÜNLÜĞÜ — bu migration'ın asıl güvenlik işi.
--    sube_id FK'lerinin 7'si DÜZ: `references sube(id)`. Yani bir kulüp
--    yöneticisi, başka bir kulübün şube UUID'sini bilirse kendi sporcusunu O
--    şubeye etiketleyebiliyordu. RLS bunu yakalamıyor: WITH CHECK yalnızca
--    `kulup_id`'ye bakıyor, `sube_id`'ye bakmıyor.
--
--    Bugüne kadar zararı sınırlıydı (şube hiçbir yerde kullanılmıyordu), ama
--    şube filtreleri ve raporları devreye girdiği anda anlamı değişiyor:
--    yabancı şubeye etiketlenmiş bir sporcu kendi kulübünün şube filtresinde
--    KAYBOLUR. Sessiz veri kaybı.
--
--    Çözüm 0021'in bağ tablolarında kullandığı desenin aynısı: bileşik FK.
--    `sube` üzerinde gereken benzersizlik (id, kulup_id) zaten var
--    (sube_id_kulup_uniq).
--
-- 2) NULL BİLEREK KORUNUYOR — backfill YAPILMIYOR.
--    NULL'ı "kulübün ilk şubesi" ile doldurmak cazip ama YANLIŞ olurdu:
--      · aidat_plani / urun / servis_rota'da NULL zaten ANLAMLI: "tüm kulüp"
--        (03_kulup_olustur.sql'in kendi yorumu bunu söylüyor).
--      · sporcular / grup'ta NULL "şube atanmamış" demektir ve bu bir EKSİKTİR.
--        Sessizce doldurmak eksiği gizler; panel bunu görünür kılıp kulübün
--        düzeltmesini sağlıyor ("Şube atanmamış" rozeti + filtre).
--    Tek şubeli kulüpte sürtünme olmasın diye ATAMA arayüzde çözülüyor: tek
--    şube varsa formlar onu varsayılan seçiyor, iki+ şube varsa seçim isteniyor.
--
-- ÇALIŞTIRMA: 0037'den sonra, tekrar çalıştırılabilir.
-- ===========================================================================


-- ===========================================================================
-- 1) BİLEŞİK YABANCI ANAHTARLAR
-- ===========================================================================
-- Desen 0021 bölüm 7.2 ile birebir aynı: önce düz FK düşürülüyor (aynı kolon
-- iki FK taşımasın), sonra bileşik olan ekleniyor.
--
-- `on delete set null`: şube silinirse ona bağlı sporcu/grup SİLİNMEZ, yalnızca
-- şube bağı boşalır. Cascade olsaydı bir şubeyi kapatmak o şubenin tüm
-- sporcularını silerdi — kulübün asla istemeyeceği bir davranış.

alter table public.sporcular   drop constraint if exists sporcular_sube_id_fkey;
alter table public.sporcular   drop constraint if exists sporcular_sube_kulup_fkey;
alter table public.sporcular   add  constraint sporcular_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;

alter table public.grup        drop constraint if exists grup_sube_id_fkey;
alter table public.grup        drop constraint if exists grup_sube_kulup_fkey;
alter table public.grup        add  constraint grup_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;

alter table public.aidat_plani drop constraint if exists aidat_plani_sube_id_fkey;
alter table public.aidat_plani drop constraint if exists aidat_plani_sube_kulup_fkey;
alter table public.aidat_plani add  constraint aidat_plani_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;

alter table public.urun        drop constraint if exists urun_sube_id_fkey;
alter table public.urun        drop constraint if exists urun_sube_kulup_fkey;
alter table public.urun        add  constraint urun_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;

alter table public.servis_rota drop constraint if exists servis_rota_sube_id_fkey;
alter table public.servis_rota drop constraint if exists servis_rota_sube_kulup_fkey;
alter table public.servis_rota add  constraint servis_rota_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;

alter table public.basvuru     drop constraint if exists basvuru_sube_id_fkey;
alter table public.basvuru     drop constraint if exists basvuru_sube_kulup_fkey;
alter table public.basvuru     add  constraint basvuru_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;

-- profiles: kulup_id NULLABLE (platform_admin kulüpsüzdür), bu yüzden bileşik
-- FK MATCH SIMPLE davranışıyla kulup_id NULL olduğunda hiç kontrol edilmez —
-- tam da istenen. Kulüplü bir profil için kontrol geçerli kalıyor.
alter table public.profiles    drop constraint if exists profiles_sube_id_fkey;
alter table public.profiles    drop constraint if exists profiles_sube_kulup_fkey;
alter table public.profiles    add  constraint profiles_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id) on delete set null;


-- ===========================================================================
-- 2) İNDEKSLER
-- ===========================================================================
-- Şube filtresi her listede `kulup_id = ? and sube_id = ?` biçiminde çalışacak;
-- kiracı duvarı zaten kulup_id predicate'i ekliyor. Bileşik indeks ikisini
-- birden karşılıyor. 0021 bölüm 8'in gerekçesiyle aynı: indekssiz kalırsa
-- restrictive politika her sorguda seq scan'e döner.
create index if not exists sporcular_kulup_sube_idx   on public.sporcular   (kulup_id, sube_id);
create index if not exists grup_kulup_sube_idx        on public.grup        (kulup_id, sube_id);
create index if not exists aidat_plani_kulup_sube_idx on public.aidat_plani (kulup_id, sube_id);
create index if not exists urun_kulup_sube_idx        on public.urun        (kulup_id, sube_id);


-- ===========================================================================
-- 3) ŞUBE ADI KULÜP İÇİNDE BENZERSİZ
-- ===========================================================================
-- İki "Merkez" şubesi, filtrede hangisinin seçildiğini anlaşılmaz kılar ve
-- raporu ikiye böler. Kulüp bazında benzersizlik yeterli: iki farklı kulüp
-- elbette "Merkez" adını kullanabilir.
create unique index if not exists sube_kulup_ad_uniq on public.sube (kulup_id, ad);


-- ===========================================================================
-- 4) DOĞRULAMA
-- ===========================================================================
--   -- FK'ler bileşik mi? (7 satır dönmeli, hepsi iki kolonlu)
--   select c.relname, pg_get_constraintdef(fk.oid) from pg_constraint fk
--     join pg_class c on c.oid = fk.conrelid
--    where fk.contype='f' and fk.confrelid='public.sube'::regclass
--    order by c.relname;
--
--   -- Yabancı kulübün şubesi atanabiliyor mu? (ATANAMAMALI)
--   update public.sporcular set sube_id = '<baska-kulubun-sube-uuid>' where id = '<sporcu>';
--     → ERROR: violates foreign key constraint "sporcular_sube_kulup_fkey"
--
--   -- Aynı kulüpte iki aynı adlı şube?
--   insert into public.sube (ad, kulup_id) values ('Merkez', '<kulup>');
--     → ERROR: duplicate key (sube_kulup_ad_uniq)
-- ===========================================================================
