-- ===========================================================================
-- 0039 — Şube silme kilidi: bileşik FK'de SET NULL kiracı anahtarını da siliyor
-- ===========================================================================
-- BAĞLAM — 0038'İN KENDİ AÇTIĞI HATA.
--   0038, 7 tabloda `sube_id` FK'sini bileşik hale getirdi:
--       foreign key (sube_id, kulup_id) references sube(id, kulup_id)
--         on delete set null
--   Amaç açıktı ve yorumda da yazıyor: "şube silinirse ona bağlı sporcu/grup
--   SİLİNMEZ, yalnızca şube bağı boşalır."
--
--   Ama `ON DELETE SET NULL` bileşik bir yabancı anahtarda FK'nin TÜM
--   kolonlarını NULL yapar — yalnızca gönderme yaptığın kolonu değil. Yani
--   Postgres `sube_id`'yi de `kulup_id`'yi de NULL'a çekmeye çalışıyordu.
--   `kulup_id` her tabloda NOT NULL olduğu için silme kısıtla reddediliyordu:
--
--       null value in column "kulup_id" of relation "sporcular"
--       violates not-null constraint
--
--   SONUÇ: içinde tek bir sporcu bile olan şube SİLİNEMİYORDU. Panel silme
--   onayında "1 sporcu şubesiz kalacak, kayıtlar SİLİNMEZ" diye söz veriyor,
--   sonra işlem hatayla düşüyordu — arayüzün vaat ettiği davranışı veritabanı
--   reddediyor.
--
--   NASIL YAKALANDI: sporcusu olan bir şubeyi panelden silme denemesiyle.
--   0038 uygulandığında test edilen tek yol "yabancı kulübün şubesi
--   reddediliyor mu" idi; silme yolu hiç denenmemişti. Boş şube sorunsuz
--   siliniyor, dolu şube patlıyor — yani hatanın görünmesi için verinin
--   dolu olması gerekiyordu.
--
-- ÇÖZÜM: PostgreSQL 15 ile gelen kolon listeli biçim.
--       on delete set null (sube_id)
--   Yalnızca sayılan kolonlar NULL'a çekilir; `kulup_id` dokunulmadan kalır.
--   Kiracı bütünlüğü (0038'in asıl işi) aynen korunuyor — bileşik FK duruyor,
--   yalnızca silme davranışı daraltılıyor.
--
--   SÜRÜM ŞARTI: Supabase PostgreSQL 15+ çalıştırıyor (yerelde 17.6), kolon
--   listeli SET NULL orada mevcut. 14 ve öncesinde bu sözdizimi HATA verir;
--   o durumda tek alternatif FK'yi RESTRICT yapıp boşaltmayı tetikleyiciyle
--   yapmaktır (bilinçli olarak tercih edilmedi: tetikleyici, veritabanının
--   kendi verdiği garantiyi uygulama koduna taşırdı).
--
-- KAPSAM: yalnızca `set null` davranışlı 7 FK. `kurum_brans_secimi` ve
--   `kurum_hizmet_turu_secimi` CASCADE ve öyle KALMALI — onlar "bu şubede şu
--   branş açık" seçim satırları; şube gidince seçimin kendisi anlamsızlaşır.
--
-- ÇALIŞTIRMA: 0038'den sonra, tekrar çalıştırılabilir.
-- ===========================================================================

alter table public.sporcular   drop constraint if exists sporcular_sube_kulup_fkey;
alter table public.sporcular   add  constraint sporcular_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);

alter table public.grup        drop constraint if exists grup_sube_kulup_fkey;
alter table public.grup        add  constraint grup_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);

alter table public.aidat_plani drop constraint if exists aidat_plani_sube_kulup_fkey;
alter table public.aidat_plani add  constraint aidat_plani_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);

alter table public.urun        drop constraint if exists urun_sube_kulup_fkey;
alter table public.urun        add  constraint urun_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);

alter table public.servis_rota drop constraint if exists servis_rota_sube_kulup_fkey;
alter table public.servis_rota add  constraint servis_rota_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);

alter table public.basvuru     drop constraint if exists basvuru_sube_kulup_fkey;
alter table public.basvuru     add  constraint basvuru_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);

alter table public.profiles    drop constraint if exists profiles_sube_kulup_fkey;
alter table public.profiles    add  constraint profiles_sube_kulup_fkey
  foreign key (sube_id, kulup_id) references public.sube(id, kulup_id)
  on delete set null (sube_id);


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
-- confdelsetcols: SET NULL'ın hangi kolonlara uygulanacağı. Boş dizi = "hepsi"
-- (hatalı hâli). Aşağıdaki sorgu, 7 FK'nin de TEK kolon listelediğini ve o
-- kolonun `sube_id` olduğunu doğrular.
do $$
declare v_hatali int;
begin
  select count(*) into v_hatali
  from pg_constraint c
  where c.contype = 'f'
    and c.confrelid = 'public.sube'::regclass
    and c.confdeltype = 'n'
    and coalesce(array_length(c.confdelsetcols, 1), 0) <> 1;

  if v_hatali > 0 then
    raise exception 'Şube FK''lerinden %''i hâlâ tüm kolonları NULL yapıyor.', v_hatali;
  end if;

  raise notice '0039 tamam: şube silme artık yalnızca sube_id kolonunu boşaltıyor.';
end $$;
