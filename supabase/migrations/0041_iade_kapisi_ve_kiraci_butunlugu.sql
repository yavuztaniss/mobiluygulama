-- ===========================================================================
-- 0041 — 0040'ın kırdığı iade akışını onar + bireysel derste kiracı bütünlüğü
-- ===========================================================================
-- Kaynak: 0040 uygulandıktan sonra 11 bağımsız ajanla yapılan saldırı ve
-- karşı-test turu. Bulguların hepsi yerelde ölçülerek doğrulandı.
--
--
-- ===========================================================================
-- 1) 0040 MEŞRU BİR AKIŞI KIRDI — ANTRENÖRÜN "REDDET"İ HAKKI YAKIYOR
-- ===========================================================================
-- 0040, `paket_iade`'ye `and new.tarih > current_date` ekledi. Koşul
-- `new.durum in ('reddedildi','iptal')` BLOĞUNUN TAMAMINA uygulanıyor —
-- yani yalnızca velinin iptaline değil, ANTRENÖRÜN REDDİNE de.
--
-- ÖLÇÜLDÜ:
--   Veli bugüne rezervasyon açar (durum 'onay_bekliyor')   kalan 5 → 4
--   Antrenör reddeder (ders HİÇ onaylanmadı, HİÇ verilmedi) kalan 4 → 4  ← KAYIP
--   Karşı-test: aynı akış yarın tarihli olduğunda            kalan 4 → 5  ✓
--   Fark tam olarak tarih koşulundan geliyor.
--
-- NEDEN KENAR DURUM DEĞİL: rezervasyon ekranı içinde bulunulan haftanın
--   Pazartesi–Pazar'ını sunuyor (bireyselRepo.ts weekDays()) ve geçmiş günleri
--   elemiyor; veli INSERT politikasında da tarih koşulu yok. Yani "bugüne ya da
--   bu haftanın geçmiş bir gününe rezervasyon" günlük akışın parçası.
--
-- NEDEN SESSİZ: antrenöre `UPDATE 1` dönüyor, ekranda "reddedildi" yazıyor.
--   Kimse kaybı görmüyor. Rezervasyon 'reddedildi' olduğu için kulüp de tahsil
--   etmiyor — para tek taraflı kayboluyor. 0040'ın kapattığı sömürünün
--   (kulüp bedava ders veriyor) tam aynadaki hâli.
--
-- 0040'IN TELAFİ İDDİASI DA YANLIŞTI: başlıkta "meşru aynı gün iptali antrenör
--   ya da yönetici üzerinden yapılır" deniyordu. Ölçüldü: İKİSİ DE iade
--   üretmiyor (antrenörün bugünkü reddi 4→4, yöneticinin bugünkü iptali 4→4).
--   Antrenörün `bireysel_paket` üzerinde UPDATE politikası zaten yok; yöneticinin
--   var ama panelde `bireysel_paket`'e yazan TEK BİR EKRAN YOK (tüm kullanım
--   SELECT). Yani belgelenen kaçış yolu sahada mevcut değildi.
--
-- ÇÖZÜM — KOŞULU TARİHE DEĞİL "DERS TÜKETİLDİ Mİ"YE BAĞLA:
--   · `old.durum = 'onay_bekliyor'` → ders hiç onaylanmadı, dolayısıyla hiç
--     verilmedi. Tarihi ne olursa olsun iade edilir. Antrenörün reddi ve
--     velinin bekleyen rezervasyonu iptali bu dala düşüyor.
--   · aksi hâlde (onaylanmış ders) `least(old.tarih, new.tarih) > current_date`
--     → yalnızca gelecekteki onaylı ders iade edilir.
--
--   `least(old.tarih, new.tarih)` ŞART — 0040 yalnızca `new.tarih`'e bakıyordu.
--   Ölçüldü: tek UPDATE'te `set tarih = current_date + 5, durum = 'iptal'`
--   yazınca geçmiş dersin iadesi geliyordu. Veli ve antrenör bunu yapamıyor
--   (`protect_bireysel_rezervasyon` tarih değişimini kesiyor) ama yönetici
--   yapabiliyordu; yetki kazancı değil ama 0040'ın "tetikleyici herkesi bağlar"
--   iddiasını yanlışlayan bir bütünlük açığı.
--
--   Yalnızca `new.durum = 'reddedildi'` muafiyeti DAHA ZAYIF olurdu: antrenör
--   verdiği geçmiş dersi 'reddedildi' işaretleyip veliyle anlaşarak iade
--   üretebilirdi. `old.durum = 'onay_bekliyor'` şartı bunu kesiyor — reddedilen
--   ders tanım gereği hiç onaylanmamıştır.

create or replace function public.paket_iade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.odeme_tipi <> 'paket' or new.paket_id is null then
    return new;
  end if;

  if new.durum in ('reddedildi', 'iptal')
     and old.durum not in ('reddedildi', 'iptal')
     and (
       -- Hiç onaylanmamış ders = hiç verilmemiş ders. Her zaman iade edilir.
       old.durum = 'onay_bekliyor'
       -- Onaylanmış ders yalnızca GELECEKTEYSE iade edilir. least(): tarihi
       -- aynı UPDATE'te ileri kaydırıp iade koparma yolu kapalı (0041 başlığı).
       or least(old.tarih, new.tarih) > current_date
     ) then
    update public.bireysel_paket
       set kalan = least(kalan + 1, toplam)
     where id = new.paket_id;
  end if;

  return new;
end;
$$;


-- ===========================================================================
-- 2) DİRİLTME DÖNGÜSÜ — iptal → onaylandi → iptal her turda +1 HAK ÜRETİYOR
-- ===========================================================================
-- `paket_dus` yalnızca BEFORE INSERT'te çalışıyor. Bir rezervasyon iptal edilip
-- (iade +1) sonra tekrar 'onaylandi' yapılırsa YENİDEN DÜŞÜM OLMUYOR, ama her
-- yeni iptal `paket_iade`'yi tekrar ateşliyor.
--
-- ÖLÇÜLDÜ: 5 aktif rezervasyonla kalan 5→6→7→8→9→10; son durum toplam=10,
-- kalan=10, aktif rezervasyon=5 → fiilen 15 derslik hak.
-- Kim: yönetici (veli ve antrenör diriltemiyor — RLS `UPDATE 0` / WITH CHECK).
--
-- ÇÖZÜM: düşümü de UPDATE'e genişlet. Bir rezervasyon iade edilmiş durumdan
-- aktif duruma DÖNÜYORSA hak yeniden düşülmeli — INSERT'teki mantığın aynısı.

create or replace function public.paket_dirilt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kalan int;
begin
  if new.odeme_tipi <> 'paket' or new.paket_id is null then
    return new;
  end if;

  -- Yalnızca "iade edilmiş → yeniden aktif" geçişi. Diğer tüm durum
  -- değişiklikleri (onay_bekliyor→onaylandi→tamamlandi) düşüm gerektirmez;
  -- düşüm zaten INSERT'te yapıldı.
  if old.durum in ('reddedildi', 'iptal')
     and new.durum in ('onay_bekliyor', 'onaylandi') then

    select kalan into v_kalan
      from public.bireysel_paket
     where id = new.paket_id
       for update;                       -- paket_dus ile aynı kilit deseni

    if coalesce(v_kalan, 0) <= 0 then
      raise exception 'Pakette kalan ders hakkı yok; rezervasyon yeniden aktifleştirilemez.'
        using errcode = 'check_violation';
    end if;

    update public.bireysel_paket
       set kalan = kalan - 1
     where id = new.paket_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_rezervasyon_paket_dirilt on public.bireysel_rezervasyon;
create trigger on_rezervasyon_paket_dirilt
  before update on public.bireysel_rezervasyon
  for each row execute procedure public.paket_dirilt();


-- ===========================================================================
-- 3) kalan ≤ toplam KISITI — TETİKLEYİCİDEKİ least() DOĞRUDAN UPDATE'İ KAPSAMIYOR
-- ===========================================================================
-- `bireysel_paket` üzerinde yalnızca `kalan >= 0` kısıtı vardı. Tavanı
-- `paket_iade` içindeki `least(kalan + 1, toplam)` koruyordu — ama yöneticinin
-- `bireysel_paket`'e DOĞRUDAN UPDATE politikası var ve o yol tetikleyiciden
-- geçmiyor. Ölçüldü: kalan 4 → 9 yazılabiliyordu (toplam 5 iken).
--
-- Kısıt veritabanı düzeyinde; hangi yoldan gelinirse gelinsin tutuyor.
-- ⚠ Var olan bozuk satır varsa kısıt eklenemez; önce onarılıyor.
update public.bireysel_paket set kalan = toplam where kalan > toplam;

alter table public.bireysel_paket drop constraint if exists bireysel_paket_kalan_tavan;
alter table public.bireysel_paket add  constraint bireysel_paket_kalan_tavan
  check (kalan <= toplam);


-- ===========================================================================
-- 4) KİRACILAR ARASI GEDİK — bireysel derste antrenor_id kiracıya bağlı değil
-- ===========================================================================
-- 0040'ın açtığı bir şey DEĞİL; denetim turunda ortaya çıkan en ağır bulgu.
--
-- `bireysel_rezervasyon.antrenor_id`, `bireysel_paket.antrenor_id` ve
-- `bireysel_antrenor.antrenor_id` yalnızca `profiles(id)`'ye bakıyordu — "böyle
-- bir kişi var mı" diye soruyor, "BENİM kulübümün antrenörü mü" diye sormuyor.
-- 0038'in `sube_id` için kurduğu bileşik FK deseni buraya uygulanmamış.
--
-- ÖLÇÜLDÜ (A kulübü velisinin gerçek JWT'siyle):
--   · B kulübünün antrenörüne rezervasyon açıldı → INSERT 0 1 (başarılı).
--   · FİYAT SIZDI: veli `bireysel_antrenor`'da 0 satır görüyor ama rezervasyona
--     yazılan tutar B'nin gerçek `tek_fiyat`'ı. `rezervasyon_fiyatla` SECURITY
--     DEFINER olduğu için kiracı duvarının arkasından kopyalıyor.
--   · TAKVİM KİLİTLENDİ: `bireysel_rezervasyon_slot_uniq (antrenor_id, tarih,
--     saat)` kiracı kırılımsız. B'nin antrenörünün saati işgal ediliyor ve
--     engelleyen satırı B tarafı ne görebiliyor ne silebiliyor.
--
-- Hafifletici: hedef antrenörün UUID'sinin bilinmesi gerekiyor. Yine de bu,
-- bir kulübün başka bir kulübün işleyişine müdahale edebilmesi demek — bu
-- üründeki en ağır hata sınıfı.
--
-- Gereken benzersizlik `profiles(id, kulup_id)` üzerinde ZATEN VAR
-- (profiles_id_kulup_uniq).
--
-- ⚠ `on delete set null (antrenor_id)` — kolon listeli biçim. Kolonsuz SET NULL
--    bileşik FK'nin TÜM kolonlarını (kulup_id dahil) NULL yapmaya çalışır ve
--    NOT NULL kısıtına takılır: 0038/0039'da tam olarak bu yaşandı.

-- Var olan kiracı-dışı satırlar varsa FK eklenemez; önce görünür kılınıyor.
do $$
declare v_bozuk int;
begin
  select count(*) into v_bozuk
    from public.bireysel_rezervasyon r
    join public.profiles p on p.id = r.antrenor_id
   where r.antrenor_id is not null and p.kulup_id is distinct from r.kulup_id;
  if v_bozuk > 0 then
    raise warning '% adet rezervasyon başka kulübün antrenörüne bağlı; antrenor_id NULL''a çekiliyor (kayıt silinmiyor).', v_bozuk;
    update public.bireysel_rezervasyon r
       set antrenor_id = null
      from public.profiles p
     where p.id = r.antrenor_id and p.kulup_id is distinct from r.kulup_id;
  end if;
end $$;

alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_antrenor_id_fkey;
alter table public.bireysel_rezervasyon drop constraint if exists bireysel_rezervasyon_antrenor_kulup_fkey;
alter table public.bireysel_rezervasyon add  constraint bireysel_rezervasyon_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references public.profiles(id, kulup_id)
  on delete set null (antrenor_id);

do $$
declare v_bozuk int;
begin
  select count(*) into v_bozuk
    from public.bireysel_paket b
    join public.profiles p on p.id = b.antrenor_id
   where b.antrenor_id is not null and p.kulup_id is distinct from b.kulup_id;
  if v_bozuk > 0 then
    raise warning '% adet paket başka kulübün antrenörüne bağlı; antrenor_id NULL''a çekiliyor.', v_bozuk;
    update public.bireysel_paket b set antrenor_id = null
      from public.profiles p
     where p.id = b.antrenor_id and p.kulup_id is distinct from b.kulup_id;
  end if;
end $$;

alter table public.bireysel_paket drop constraint if exists bireysel_paket_antrenor_id_fkey;
alter table public.bireysel_paket drop constraint if exists bireysel_paket_antrenor_kulup_fkey;
alter table public.bireysel_paket add  constraint bireysel_paket_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references public.profiles(id, kulup_id)
  on delete set null (antrenor_id);

-- bireysel_antrenor.antrenor_id NOT NULL: burada SET NULL kullanılamaz, CASCADE
-- korunuyor (profil silinirse ücret satırı da anlamsızlaşır).
delete from public.bireysel_antrenor a
 using public.profiles p
 where p.id = a.antrenor_id and p.kulup_id is distinct from a.kulup_id;

alter table public.bireysel_antrenor drop constraint if exists bireysel_antrenor_antrenor_id_fkey;
alter table public.bireysel_antrenor drop constraint if exists bireysel_antrenor_antrenor_kulup_fkey;
alter table public.bireysel_antrenor add  constraint bireysel_antrenor_antrenor_kulup_fkey
  foreign key (antrenor_id, kulup_id) references public.profiles(id, kulup_id)
  on delete cascade;

-- SLOT BENZERSİZLİĞİ KİRACIYA GÖRE. Bileşik FK artık yabancı antrenöre
-- rezervasyonu zaten reddediyor; bu indeks ikinci katman ve aynı zamanda doğru
-- olanı ifade ediyor: bir saat, BİR KULÜBÜN antrenörü için tekildir.
drop index if exists public.bireysel_rezervasyon_slot_uniq;
create unique index if not exists bireysel_rezervasyon_slot_uniq
  on public.bireysel_rezervasyon (kulup_id, antrenor_id, tarih, saat)
  where durum <> all (array['reddedildi'::text, 'iptal'::text]);


-- ===========================================================================
-- 5) service_role BİREYSEL TABLOLARDA HİÇ UPDATE YAPAMIYOR (işlevsel arıza)
-- ===========================================================================
-- 0040'ın açtığı bir şey DEĞİL, 0037 döneminden devralınan bir eksik.
-- ÖLÇÜLDÜ:
--   has_function_privilege('service_role','private.current_profile_role()','EXECUTE') = false
--   has_function_privilege('authenticated', ... ) = true
--   service_role olarak `update bireysel_antrenor set bio = '...'`
--     → ERROR: permission denied for function current_profile_role
--
-- Yani `protect_antrenor_ucret` / `protect_bireysel_rezervasyon` gibi bu
-- fonksiyonu çağıran her tetikleyici, service_role isteğini yetki hatasıyla
-- düşürüyor. Panel service_role istemcisi kullanıyor (lib/supabase/admin.ts);
-- bu tablolara yazan bir panel ekranı eklendiği gün sessizce patlardı.
--
-- GÜVENLİK ETKİSİ YOK: fonksiyon yalnızca ÇAĞIRANIN kendi rolünü döndürüyor,
-- parametre almıyor, veri sızdırmıyor. service_role zaten RLS'i baypas ediyor.
grant execute on function private.current_profile_role() to service_role;


-- ===========================================================================
-- 6) VELİ GEÇMİŞ GÜNE REZERVASYON AÇAMASIN
-- ===========================================================================
-- Kaybın asıl kaynağı burası: INSERT politikasında tarih koşulu yoktu, uygulama
-- ekranı da haftanın geçmiş günlerini sunuyordu. Geçmişe rezervasyon açmak
-- zaten anlamsız; kapatılınca "hak yandı" senaryolarının çoğu hiç doğmuyor.
-- ⚠ İKİ AD DA DÜŞÜRÜLÜYOR — kurulum paketi ile migration zinciri AYRI ADLAR
--   kullanıyor: 0013 "…rezervasyon aç", kurulum/01_sema.sql "…rezervasyon açar".
--   Tek adı düşürmek, diğer kaynaktan kurulmuş bir veritabanında ESKİ POLİTİKAYI
--   AYAKTA BIRAKIRDI; permissive politikalar OR'landığı için tarih koşulu
--   olmayan eski kural yeni kuralı tamamen etkisiz kılardı. (Ad sapması bu
--   migration'la ayrıca giderildi: her iki kaynakta da "…aç" kalıyor.)
drop policy if exists "bireysel_rezervasyon: veli kendi sporcusu için rezervasyon aç"   on public.bireysel_rezervasyon;
drop policy if exists "bireysel_rezervasyon: veli kendi sporcusu için rezervasyon açar" on public.bireysel_rezervasyon;
create policy "bireysel_rezervasyon: veli kendi sporcusu için rezervasyon aç" on public.bireysel_rezervasyon for insert
  with check (
    durum = 'onay_bekliyor'
    -- 0041: geçmişe rezervasyon yok. `>=` (bugün serbest): aynı gün ders almak
    -- meşru bir istek, iade kuralı zaten ayrı katmanda duruyor.
    and tarih >= current_date
    and exists (select 1 from veli_sporcu vs where vs.sporcu_id = bireysel_rezervasyon.sporcu_id and vs.veli_id = auth.uid())
  );


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
begin
  if position('old.durum = ''onay_bekliyor''' in pg_get_functiondef('public.paket_iade'::regproc)) = 0 then
    raise exception '0041: paket_iade onay_bekliyor muafiyetini taşımıyor.';
  end if;
  if position('least(old.tarih, new.tarih)' in pg_get_functiondef('public.paket_iade'::regproc)) = 0 then
    raise exception '0041: paket_iade least(old,new) koşulunu taşımıyor.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'on_rezervasyon_paket_dirilt') then
    raise exception '0041: diriltme tetikleyicisi kurulmamış.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bireysel_paket_kalan_tavan') then
    raise exception '0041: kalan <= toplam kısıtı yok.';
  end if;
  if (select count(*) from pg_constraint
       where conname in ('bireysel_rezervasyon_antrenor_kulup_fkey',
                         'bireysel_paket_antrenor_kulup_fkey',
                         'bireysel_antrenor_antrenor_kulup_fkey')) <> 3 then
    raise exception '0041: bileşik antrenör FK''lerinden eksik var.';
  end if;
  if not has_function_privilege('service_role','private.current_profile_role()','EXECUTE') then
    raise exception '0041: service_role current_profile_role çalıştıramıyor.';
  end if;

  raise notice '0041 tamam: iade kapısı onarıldı, diriltme kapatıldı, kalan tavanı, kiracı FK''leri, service_role izni, geçmişe rezervasyon kapalı.';
end $$;
