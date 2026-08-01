-- ===========================================================================
-- 0050 — push_token_devral çapraz kiracı satır siliyordu
-- ===========================================================================
-- NASIL ÇIKTI
--   Güvenlik denetimi turu. 0020'nin cihaz devri tetikleyicisi şuydu:
--
--     create function public.push_token_devral() ... security definer
--     begin
--       delete from public.push_token where token = new.token;   -- KİRACI YOK
--       return new;
--     end;
--
--   Fonksiyon SECURITY DEFINER ve sahibi postgres → RLS'i ve 0021'in restrictive
--   kiracı duvarını TÜMÜYLE baypas ediyor. Silme koşulu ise yalnızca istemcinin
--   gönderdiği `new.token` metni. 0020'deki `revoke execute ... from
--   authenticated` bu yolu KAPATMIYOR: PostgreSQL bir tetikleyiciyi ateşlerken
--   fonksiyon üzerinde EXECUTE izni ARAMAZ (0049'un kendi tespiti).
--
-- SÖMÜRÜLEREK KANITLANDI (yerel, iki kulüp, transaction + rollback)
--   B kulübünün velisi cihazını kaydediyor  → B kulübünde token satırı = 1
--   A kulübünün velisi AYNI token metniyle kayıt yapıyor:
--     insert into push_token (user_id, token, kulup_id, platform)
--     values ('<A velisi>', 'ExponentPushToken[KURBAN-B-CIHAZI]', '<A kulübü>', 'android');
--   Ölçülen:
--     ONCE : B kulubunde token satiri = 1
--     SONRA: B kulubunde token satiri = 0      <-- BAŞKA KULÜBÜN SATIRI SİLİNDİ
--     SONRA: A kulubunde ayni token   = 1
--
--   Saldırganın token METNİNİ bilmesi gerekiyor ve bu erişilebilir bir bilgi:
--   `push_token: yönetici tümünü okur` politikası kulüp yöneticisine kendi
--   kulübündeki token metinlerini açık veriyor. Yani gerçekçi senaryo şu —
--   aile A kulübünden ayrılıp B'ye geçiyor; A'nın yöneticisi ayrılırken gördüğü
--   token'ı saklıyor ve tek INSERT ile B'deki satırı siliyor, istediği sıklıkta
--   tekrarlıyor. B kulübünün velisi antrenman iptali ve maç saati bildirimlerini
--   HİÇ almıyor, B kulübü de sebebini göremiyor (satır kendiliğinden yok olmuş
--   görünüyor). Bir kulübün, yazılım üzerinden başka bir kulübün müşterisine
--   zarar verebilmesi ürünün en ağır hata sınıfı.
--
-- SİLME NEDEN VAR — KALDIRILAMAZ
--   `token` PRIMARY KEY ve tüm kulüplerde tekil. Bir cihaz başka kullanıcıya
--   geçtiğinde eski satır silinmezse iki şey olur: (1) INSERT PK'ye çarpar,
--   (2) satır kalırsa eski kulübün bildirimleri artık BAŞKASININ telefonuna
--   düşer. İkincisi bu açıktan da beterdir. Yani silme kaldırılamaz, yalnızca
--   kiracıyla SINIRLANABİLİR.
--
-- NEDEN TETİKLEYİCİ KATMANI
--   Bu bir GÜVENLİK DEĞİŞMEZİ, iş kuralı değil: hiçbir bağlamda — veli, yönetici,
--   service_role, postgres — bir kulübün yazması başka kulübün satırını
--   silmemeli. RLS'e konamaz, çünkü silmeyi yapan SECURITY DEFINER gövdesi
--   RLS'i zaten baypas ediyor. GRANT'e konamaz, çünkü tetikleyici EXECUTE
--   aramıyor. Kural, silmenin yapıldığı yere yazılmak zorunda.
--
-- ⚠ BİLİNÇLİ OLARAK KABUL EDİLEN BEDEL — KULÜPLER ARASI CİHAZ DEVRİ
--   Daraltmadan sonra, A kulübünde kayıtlı bir cihaz B kulübünde kaydolmak
--   isterse silme hiçbir şey silmez ve INSERT birincil anahtara çarpar.
--   pushRepo.ts hatayı SESSİZCE yutuyor (`if (!error)`), yani bu haliyle
--   kulüp değiştiren ailede push hiç çalışmaz ve KİMSE SEBEBİNİ GÖREMEZ.
--
--   Bu yüzden çarpışma bare 23505 olarak bırakılmıyor; aşağıda açık bir mesajla
--   yükseltiliyor. Sessiz bir arıza yerine, kaydı okunduğunda ne olduğu anlaşılan
--   bir hata bırakmak, bu bedeli ödenebilir kılan tek şey.
--
--   Bugün canlıda kırılan bir akış YOK: EAS projectId tanımlı olmadığı için push
--   hiçbir derlemede çalışmıyor (bkz. pushRepo.ts'in kendi koşulları). Yani açık
--   şimdi kapanıyor, cihaz devri sorunu ise push gerçekten açılmadan önce
--   çözülmeli — doğru çözüm cihaz sahipliğini kanıtlayan bir el sıkışma, ki bu
--   veritabanı katmanında üretilemez.
--
-- ÇALIŞTIRMA: 0049'dan sonra. Tekrar çalıştırılabilir.
-- ===========================================================================

create or replace function public.push_token_devral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yabanci_kulup uuid;
begin
  -- 1) AYNI KİRACI İÇİNDE cihaz devri — 0020'nin asıl amacı. Kullanıcı
  --    değişse bile (telefon başkasına geçti, çıkış yapıp başka hesapla
  --    girildi) eski satır gider ve bildirim yanlış kişiye düşmez.
  delete from public.push_token
   where token = new.token
     and kulup_id = new.kulup_id;

  -- 2) BAŞKA KİRACIDA aynı token duruyor mu? Duruyorsa SİLMİYORUZ (açığın ta
  --    kendisi buydu) ama sessiz bir PK çarpışması da bırakmıyoruz.
  select kulup_id into v_yabanci_kulup
    from public.push_token
   where token = new.token
   limit 1;

  if v_yabanci_kulup is not null then
    raise exception
      'Bu cihaz başka bir kulüpte kayıtlı. Kayıt için önce diğer kulüpteki oturumdan çıkış yapılmalı.'
      using errcode = 'unique_violation',
            hint = 'push_token.token birincil anahtardır ve kulüpler arasında tekildir; '
                   'çapraz kiracı devri 0050 ile bilerek engellenmiştir.';
  end if;

  return new;
end;
$$;

revoke all on function public.push_token_devral() from public, anon, authenticated;

comment on function public.push_token_devral() is
  '0050: cihaz devri YALNIZCA aynı kulüp içinde. Çapraz kiracı silme bir '
  'güvenlik açığıydı (ölçüldü: B kulübünün satırı 1->0), kapatıldı.';


-- ===========================================================================
-- DOĞRULAMA
-- ===========================================================================
do $$
declare
  v_govde text;
begin
  select prosrc into v_govde from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'push_token_devral';

  if v_govde is null then
    raise exception '0050: push_token_devral bulunamadı.';
  end if;

  -- Kiracı koşulunun gövdede GERÇEKTEN durduğunu doğrula. Bu satır olmadan
  -- fonksiyon eski, açık hâline dönmüş demektir.
  if position('kulup_id = new.kulup_id' in v_govde) = 0 then
    raise exception '0050: kiracı koşulu gövdede yok — açık hâlâ açık.';
  end if;

  raise notice '0050 doğrulandı: cihaz devri kulüple sınırlandı.';
end $$;
