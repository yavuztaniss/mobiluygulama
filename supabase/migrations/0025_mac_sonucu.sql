-- ===========================================================================
-- 0025_mac_sonucu.sql — Maç sonucu girişi: antrenöre KISITLI etkinlik UPDATE
-- ===========================================================================
-- NEDEN BU MIGRATION
--   0009 `etkinlik` tablosuna skor_biz / skor_rakip / sonuc / sonuc_notu
--   kolonlarını ekledi ve seed ile 3 geçmiş maç sonucu yazdı. Veli tarafı bu
--   satırları okuyor (app/src/data/veliRepo.ts → getEtkinlikSonuclari), ama
--   uygulamada bu kolonlara YAZAN tek bir ekran yoktu: seed'in dışında sonuç
--   üretmek mümkün değildi. Bu migration yazma tarafını açar.
--
--   Yönetici zaten yazabiliyordu (0009: "etkinlik: yönetici günceller"), o
--   politikaya DOKUNULMUYOR. Eksik olan antrenördü: maç kadrosunu zaten o
--   yönetiyor (0009'daki mac_kadro politikaları), maçın başında/sonunda sahada
--   olan da o. Skoru girmek için yöneticiyi beklemek akışı kırıyordu.
--
-- İKİ KATMANLI ÇÖZÜM — neden tek başına RLS yetmiyor
--   RLS SATIR düzeyinde çalışır, KOLON düzeyinde değil. Antrenöre etkinlik
--   üzerinde UPDATE verildiği anda aynı satırın tarih'ini, tesis'ini, ucretli /
--   tutar alanlarını da değiştirebilir hâle gelir — yani veli uygulamasındaki
--   ödeme tutarını. Kolon bazlı GRANT de çare değil: yönetici ve antrenör aynı
--   `authenticated` Postgres rolünü paylaşıyor, grant ikisini birden keserdi.
--   Bu yüzden 0003/0016'daki desen tekrarlanıyor:
--     1) Politika  → HANGİ SATIR (kendi grubunun, oynanmış maçı)
--     2) Trigger   → HANGİ KOLONLAR (yalnızca 4 sonuç alanı)
--
-- ÇOK KİRACILILIK
--   0021 bölüm 9.1'deki `"kulup izolasyonu"` RESTRICTIVE politikası etkinlik
--   tablosunda FOR ALL kurulu. Restrictive politikalar permissive olanlarla AND
--   ile birleştiği için aşağıdaki yeni permissive politika kulüp duvarını
--   DELMEZ: erişim = (rol kuralları OR'lanmış) AND (kulup_id eşleşmesi).
--   Bu dosyada kiracı kontrolü tekrarlanmıyor, gereksiz olurdu.
--
-- ⚠ SIFIRDAN KURULUM
--   supabase/kurulum/01_sema.sql bu politikayı ve trigger'ı HENÜZ İÇERMİYOR
--   (0024'teki aynı uyarı geçerli). Yeni bir kulüp projesi bu migration'sız
--   kurulursa antrenörün "Sonucu Gir" aksiyonu sessizce 0 satır günceller
--   (RLS reddi PostgREST'te hata değil, boş sonuçtur). Kurulum paketi
--   güncellenene kadar bu dosya kurulumdan sonra elle çalıştırılmalıdır.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) POLİTİKA — antrenör kendi grubunun oynanmış maçını günceller
-- ---------------------------------------------------------------------------
-- Sahiplik testi 0009'daki "mac_kadro: antrenör kendi grubunu günceller"
-- politikasının birebir aynısı: antrenörün, etkinliğin grubunda en az bir
-- sporcusu olmalı (sporcular → sporcu_antrenor).
--
-- İKİ BİLİNÇLİ DARALTMA:
--   · `grup_id is not null` — 0009'un SELECT politikasında antrenör
--     `grup_id is null` (tüm gruplar) etkinliklerini de GÖREBİLİYOR. Görmek
--     zararsız; ama kulüp geneline açık bir etkinliğin sahibi hiçbir antrenör
--     değildir, yazma hakkı yöneticide kalmalı.
--   · `tarih <= current_date` — sonuç ancak oynanmış maça girilir. Aynı gün
--     oynanan maç için akşam giriş yapılabilsin diye `<` değil `<=`.
--     (Yöneticinin 0009'daki politikasında böyle bir kısıt yok, o dokunulmadı.)
drop policy if exists "etkinlik: antrenör kendi grubunun maç sonucunu girer" on etkinlik;
create policy "etkinlik: antrenör kendi grubunun maç sonucunu girer" on etkinlik for update
  using (
    tur = 'mac'
    and grup_id is not null
    and tarih <= current_date
    and exists (
      select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
      where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
    )
  )
  with check (
    tur = 'mac'
    and grup_id is not null
    and tarih <= current_date
    and exists (
      select 1 from sporcular s join sporcu_antrenor sa on sa.sporcu_id = s.id
      where s.grup_id = etkinlik.grup_id and sa.antrenor_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 2) TRIGGER — yönetici dışındaki kullanıcı yalnızca sonuç alanlarını değiştirir
-- ---------------------------------------------------------------------------
-- KOLONLARI TEK TEK SAYMAK YERİNE to_jsonb FARKI:
--   0016'daki protect_bireysel_paket() değişmemesi gereken kolonları tek tek
--   sayıyor. Orada tablo kapalı bir küme; burada değil — etkinlik tablosuna
--   0021 zaten kulup_id ekledi, ileride başka kolonlar da eklenebilir. Kolon
--   sayan bir gövde, yeni eklenen her kolonu SESSİZCE serbest bırakırdı
--   (fail-open). İzinli 4 alanı jsonb'den düşürüp geri kalanı bütün olarak
--   karşılaştırmak fail-closed davranır: yarın eklenen kolon otomatik korunur.
--
-- SONUÇ ↔ SKOR TUTARLILIĞI BİLİNÇLİ OLARAK ZORLANMIYOR: `sonuc` değeri normal
-- akışta skordan türetiliyor (bkz. sonucTuret, app/src/data/etkinlikRepo.ts),
-- ama hükmen galibiyet gibi skorla uyuşmayan meşru durumlar var. Değer kümesi
-- 0009'daki check constraint ile zaten kapalı.
create or replace function public.protect_etkinlik_sonuc()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and coalesce(private.current_profile_role()::text, '') <> 'yonetici' then
    if to_jsonb(new) - 'skor_biz' - 'skor_rakip' - 'sonuc' - 'sonuc_notu'
       is distinct from
       to_jsonb(old) - 'skor_biz' - 'skor_rakip' - 'sonuc' - 'sonuc_notu' then
      raise exception 'etkinlikte yalnızca maç sonucu alanları güncellenebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_etkinlik_sonuc_protect on public.etkinlik;
create trigger on_etkinlik_sonuc_protect
  before update on public.etkinlik
  for each row execute procedure public.protect_etkinlik_sonuc();


-- ---------------------------------------------------------------------------
-- 3) İNDEKS — "sonucu girilmemiş geçmiş maçlar" sorgusu
-- ---------------------------------------------------------------------------
-- Her iki sonuç ekranının da açılış sorgusu şu biçimde:
--   where kulup_id = ? and tur = 'mac' and tarih < ? and sonuc is null
-- Kısmi indeks yalnızca sonucu bekleyen satırları tutar; sonuç girildiği anda
-- satır indeksten düşer, yani indeks sezon boyunca küçük kalır.
create index if not exists etkinlik_sonuc_bekleyen_idx
  on public.etkinlik (kulup_id, tarih desc)
  where tur = 'mac' and sonuc is null;


-- ---------------------------------------------------------------------------
-- DOĞRULAMA (migration'dan sonra elle çalıştırılabilir)
--
--   -- Politika oluştu mu? → 1 satır, cmd = UPDATE
--   select policyname, cmd, permissive from pg_policies
--    where tablename = 'etkinlik' and policyname like '%maç sonucunu girer%';
--
--   -- Trigger duruyor mu? → on_etkinlik_sonuc_protect görünmeli
--   select tgname from pg_trigger
--    where tgrelid = 'public.etkinlik'::regclass and not tgisinternal;
--
--   -- Antrenör hesabıyla (authenticated), kendi grubunun geçmiş maçı için:
--   --   PATCH /rest/v1/etkinlik?id=eq.<mac_id>
--   --        {"skor_biz":64,"skor_rakip":58,"sonuc":"galibiyet","sonuc_notu":"..."}
--   --   → 1 satır dönmeli.
--   --   PATCH /rest/v1/etkinlik?id=eq.<mac_id> {"tutar":0}
--   --   → 'etkinlikte yalnızca maç sonucu alanları güncellenebilir' hatası.
--   --   PATCH /rest/v1/etkinlik?id=eq.<baska_grubun_maci> {"skor_biz":1}
--   --   → 0 satır (RLS reddi; PostgREST bunu hata olarak döndürmez).
-- ---------------------------------------------------------------------------
