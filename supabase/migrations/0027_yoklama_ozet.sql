-- ===========================================================================
-- 0027_yoklama_ozet.sql — Sporcu başına katılım özeti (sunucu tarafı toplama)
-- ===========================================================================
-- SORUN
--   Mobil uygulamada antrenörün sporcu listesi, katılım yüzdesini hesaplamak
--   için TÜM KADRONUN TÜM YOKLAMA GEÇMİŞİNİ çekiyordu:
--
--     supabase.from('yoklama').select('sporcu_id, durum').in('sporcu_id', ids)
--
--   İki ayrı arıza üretiyor:
--
--   1) SESSİZ YANLIŞ SONUÇ — PostgREST'in varsayılan satır limiti 1000'dir ve
--      limit aşıldığında HATA DÖNMEZ, sessizce ilk 1000 satırı verir. Satır
--      sayısı kadroyla değil ZAMANLA büyüyor: 22 sporcu × haftada 3 antrenman
--      ≈ 264 satır/ay, yani dördüncü ayda sınır aşılıyor. Aşıldığı andan
--      itibaren bazı sporcuların yüzdesi eksik veriyle hesaplanıyor ve ekranda
--      hiçbir uyarı çıkmıyor. (Aynı tuzak panelde bulunup düzeltilmişti —
--      admin-panel/lib/sayfali-okuma.ts.)
--
--   2) GEREKSİZ TRAFİK — bir yüzde hesaplamak için bir sezonluk satırı telefona
--      indirmek, mobil veriyle çalışan bir uygulamada başlı başına yanlış.
--
-- ÇÖZÜM: SAYFALAMA DEĞİL, TOPLAMA.
--   Sayfalama (panelin yolu) doğruyu verir ama trafiği çözmez: 5.000 satırı
--   5 istekte indirmek yine 5.000 satırdır. Burada istemcinin ihtiyacı satırlar
--   değil İKİ SAYI olduğu için toplama sunucuda yapılıyor; telefona sporcu
--   başına tek satır iniyor ve satır sayısı kadro boyutuyla sınırlı kalıyor —
--   yani 1000 sınırına zamanla yaklaşan bir büyüme kalmıyor.
--
-- GÜVENLİK: security_invoker = on
--   Görünüm ÇAĞIRANIN yetkileriyle çalışır, yani alttaki yoklama tablosunun
--   RLS'i aynen geçerlidir: 9 permissive politika (yönetici/antrenör/veli
--   ayrımı) + "kulup izolasyonu" restrictive kiracı duvarı. Varsayılan
--   (security_definer) davranışta görünüm SAHİBİNİN yetkisiyle çalışırdı ve
--   TÜM KULÜPLERİN yoklamasını sızdıran bir arka kapı olurdu — bu tek satır,
--   0021'in tüm kiracı izolasyonunun bu görünümde de geçerli kalmasını sağlıyor.
--
-- ÇALIŞTIRMA: herhangi bir zamanda, tekrar çalıştırılabilir.
-- ===========================================================================

-- `durum is null` = henüz işaretlenmemiş satır (yoklama açık ama alınmamış).
-- Yüzdeye dahil edilmemeli, yoksa alınmamış her yoklama "katılmadı" sayılır ve
-- yüzde yapay olarak düşer. Bu filtre eski istemci kodundaki
-- `.not('durum','is',null)` çağrısının aynısı.
create or replace view public.sporcu_yoklama_ozet
with (security_invoker = on) as
select
  y.sporcu_id,
  count(*)::int                                          as toplam,
  count(*) filter (where y.durum = 'katildi')::int       as katildi
from public.yoklama y
where y.durum is not null
group by y.sporcu_id;

comment on view public.sporcu_yoklama_ozet is
  'Sporcu başına katılım toplamı (0027). security_invoker=on → alttaki yoklama tablosunun RLS''i ve kiracı duvarı aynen geçerlidir. İstemci yüzdeyi toplam/katildi''dan hesaplar; ham yoklama satırlarını çekmez (PostgREST 1000 satır tuzağı).';

-- anon'a VERİLMİYOR: oturumsuz bir istemcinin katılım verisine erişmesi için
-- hiçbir sebep yok. authenticated için RLS zaten kimin neyi göreceğini belirliyor.
grant select on public.sporcu_yoklama_ozet to authenticated;

-- ===========================================================================
-- DOĞRULAMA
--   -- Görünüm ve güvenlik kipi
--   select relname, reloptions from pg_class where relname = 'sporcu_yoklama_ozet';
--     → {security_invoker=on} görünmeli
--
--   -- Antrenör oturumunda yalnızca kendi sporcuları dönmeli:
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<antrenor-uuid>","role":"authenticated"}', true);
--   select * from public.sporcu_yoklama_ozet;
-- ===========================================================================
