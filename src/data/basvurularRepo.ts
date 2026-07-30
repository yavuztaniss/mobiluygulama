import { supabase } from '../lib/supabase';
import { avatarColorAt } from '../theme/avatarPalette';
import type { Basvuru, BasvuruDurum } from './types';

// Faz 7'de gerçek `basvuru` tablosuna taşındı (bkz.
// supabase/migrations/0013_bireysel_hakedis_basvurular.sql) — yapılandırılmış alanlar
// (dogum_yili/brans_id/grup_id/sube_id), eski serbest-metin altBilgi/detay değil.
// Onaylama artık gerçek `sporcular` satırı oluşturuyor (eskiden yalnızca durum flip'i,
// hiçbir gerçek etkisi yoktu).

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function zamanEtiketi(createdAt: string): string {
  const farkSaat = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
  if (farkSaat < 1) return 'az önce';
  if (farkSaat < 24) return `${farkSaat} saat önce`;
  const gun = Math.floor(farkSaat / 24);
  if (gun === 1) return 'dün';
  return `${gun} gün önce`;
}

type BasvuruRow = {
  id: string;
  ad: string;
  dogum_yili: number | null;
  brans_id: string | null;
  grup_id: string | null;
  sube_id: string | null;
  veli_ad: string | null;
  veli_telefon: string | null;
  tag: 'DENEME' | 'KAYIT';
  durum: BasvuruDurum;
  detay_notu: string | null;
  sporcu_id: string | null;
  // Başvuruyu açan veli. Yalnızca veli akışında dolar (veliBasvuruOlustur);
  // yönetici tarafından girilen başvurularda NULL'dur. Onayda veli_sporcu
  // bağının kime kurulacağını bu alan belirliyor.
  created_by: string | null;
  created_at: string;
  brans: { ad: string } | null;
  grup: { ad: string } | null;
};

export async function getBasvurular(): Promise<Basvuru[]> {
  const { data, error } = await supabase
    .from('basvuru')
    .select('id, ad, dogum_yili, brans_id, grup_id, sube_id, veli_ad, veli_telefon, tag, durum, detay_notu, sporcu_id, created_at, brans:brans(ad), grup:grup(ad)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as BasvuruRow[]).map((b, i) => {
    const palette = avatarColorAt(i);
    const altParcalar = [b.dogum_yili, b.grup?.ad ?? b.brans?.ad, b.tag === 'DENEME' ? 'deneme dersi' : 'doğrudan kayıt'].filter(Boolean);
    return {
      id: b.id,
      init: initialsOf(b.ad),
      ad: b.ad,
      altBilgi: altParcalar.join(' · '),
      detay: b.detay_notu ?? '',
      veli: b.veli_ad ?? '',
      when: zamanEtiketi(b.created_at),
      tag: b.tag,
      avBg: palette.avBg,
      avFg: palette.avFg,
      durum: b.durum,
      grupId: b.grup_id,
    };
  });
}

// VELİ–SPORCU BAĞI — onayın görünmeyen ama en kritik yarısı.
//
// Veli tarafı çocuk listesini YALNIZCA veli_sporcu üzerinden okur
// (src/context/ChildContext.tsx). Bu bağ kurulmazsa sporcu satırı oluşsa bile
// veli ekranında çocuk HİÇ görünmez: yoklama, aidat, servis, mesaj — hiçbiri
// açılmaz. Onay "başarılı" göründüğü ve hata çıkmadığı için de fark edilmesi zor.
//
// Neden ROL KONTROLÜ var: bugün basvuru.created_by yalnızca veli akışında
// dolduruluyor (veliBasvuruOlustur), ama ileride panele "yönetici adına başvuru
// gir" ekranı eklenirse created_by bir yöneticiyi gösterirdi ve o yönetici
// sessizce çocuğun velisi yapılırdı. Kontrol o hatayı yapısal olarak imkânsız
// kılıyor. Yönetici tüm profilleri okuyabiliyor (01_sema "profiles: yönetici
// tümünü görür"), ek yetki gerekmiyor.
//
// Neden UPSERT değil INSERT + 23505 toleransı: veli_sporcu üzerinde UPDATE
// politikası YOK (yalnızca select/insert/delete). Upsert'in ON CONFLICT yolu
// gereksiz yere UPDATE yetkisi gerektirebilirdi; burada istenen davranış zaten
// "varsa dokunma".
async function veliSporcuBaginiKur(veliId: string | null, sporcuId: string): Promise<void> {
  if (!veliId) return;

  const { data: profilRow } = await supabase.from('profiles').select('role').eq('id', veliId).maybeSingle();
  if ((profilRow as { role: string } | null)?.role !== 'veli') return;

  // kulup_id yazılmıyor: tablonun `default private.current_kulup_id()` değeri
  // onaylayan yöneticinin kulübünü doldurur (0021 deseni). Sporcu da az önce
  // aynı oturumda oluşturuldu, yani bileşik FK'ler zorunlu olarak tutar.
  const { error } = await supabase.from('veli_sporcu').insert({ veli_id: veliId, sporcu_id: sporcuId });

  // 23505 = unique_violation. Bağ zaten varsa (geri al → tekrar onayla) bu
  // beklenen bir sonuçtur, hata değil.
  if (error && (error as { code?: string }).code !== '23505') throw error;
}

// Onayla — grupId verilmezse başvurunun kendi grup_id'si (varsa) kullanılır. Başvuru daha
// önce onaylanıp gerçek bir sporcu_id'ye sahipse (ör. "Geri Al" sonrası tekrar onaylanıyor)
// ikinci bir sporcu satırı oluşturulmaz, yalnızca durum tekrar 'onaylandi' yapılır.
export async function onaylaBasvuru(basvuruId: string, grupId?: string | null): Promise<void> {
  const { data, error: e0 } = await supabase.from('basvuru').select('*').eq('id', basvuruId).single();
  if (e0) throw e0;
  const b = data as BasvuruRow;

  if (b.sporcu_id) {
    const { error } = await supabase.from('basvuru').update({ durum: 'onaylandi' }).eq('id', basvuruId);
    if (error) throw error;
    // Bu dal aynı zamanda ONARIM yolu: bu düzeltmeden ÖNCE onaylanmış
    // başvuruların bağı hiç kurulmamıştı. Yönetici "Geri Al → Onayla"
    // yaptığında eksik bağ burada tamamlanır.
    await veliSporcuBaginiKur(b.created_by, b.sporcu_id);
    return;
  }

  const finalGrupId = grupId ?? b.grup_id;
  const { data: sporcu, error: e1 } = await supabase
    .from('sporcular')
    .insert({
      ad: b.ad,
      dogum_yili: b.dogum_yili,
      brans_id: b.brans_id,
      grup_id: finalGrupId,
      sube_id: b.sube_id,
      veli_ad: b.veli_ad,
      veli_telefon: b.veli_telefon,
      // toISOString UTC'ye çevirir — 00:00-03:00 arası onaylarda kayıt tarihi bir gün
      // geri yazılırdı; yerel bileşenlerden kur (projedeki todayStr deseni).
      kayit_tarihi: (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
    })
    .select('id')
    .single();
  if (e1) throw e1;

  const yeniSporcuId = (sporcu as { id: string }).id;

  const { error: e2 } = await supabase
    .from('basvuru')
    .update({ durum: 'onaylandi', sporcu_id: yeniSporcuId, grup_id: finalGrupId })
    .eq('id', basvuruId);
  if (e2) throw e2;

  // SIRA: basvuru.sporcu_id mühürlendikten SONRA. Bağ kurulurken hata çıkarsa
  // (ör. ağ koptu) başvuru yine de onaylanmış ve sporcuya bağlanmış olur; yönetici
  // "Geri Al → Onayla" ile yukarıdaki onarım dalından bağı tamamlayabilir.
  // Ters sırada olsaydı sporcu satırı oluşmuş ama başvuru 'bekliyor' kalmış olur,
  // ikinci onay ikinci bir sporcu satırı üretirdi.
  await veliSporcuBaginiKur(b.created_by, yeniSporcuId);
}

export async function reddetBasvuru(basvuruId: string): Promise<void> {
  const { error } = await supabase.from('basvuru').update({ durum: 'reddedildi' }).eq('id', basvuruId);
  if (error) throw error;
}

export async function geriAlBasvuru(basvuruId: string): Promise<void> {
  const { error } = await supabase.from('basvuru').update({ durum: 'bekliyor' }).eq('id', basvuruId);
  if (error) throw error;
}

// ---- Veli tarafı (Sporcu Ekle / deneme dersi başvurusu) ----
// 0018 politikaları: veli kendi adına DENEME başvurusu ekleyebilir (created_by = auth.uid())
// ve yalnızca kendi başvurularını görebilir — Yönetici > Başvurular aynı tabloyu onaylıyor.

export type BransSecenek = { id: string; ad: string };

// Katalogdaki TÜM branşlar değil, kurumun gerçekten sunduğu branşlar (kurum_brans_secimi,
// Yönetici > Kurum Branşları'ndan yönetilir) — yoksa veli, kulübün hiç açmadığı bir
// branşa başvuru oluşturabilirdi. Politika: "giriş yapan herkes okur" (0004).
export async function getBranslar(): Promise<BransSecenek[]> {
  const { data, error } = await supabase.from('kurum_brans_secimi').select('brans:brans(id, ad)');
  if (error) throw error;
  const secenekler = ((data ?? []) as unknown as { brans: BransSecenek | null }[])
    .map((r) => r.brans)
    .filter(Boolean) as BransSecenek[];
  return secenekler.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

export type VeliBasvuru = {
  id: string;
  ad: string;
  altBilgi: string;
  durum: BasvuruDurum;
  when: string;
};

export async function getVeliBasvurulari(): Promise<VeliBasvuru[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const veliId = sessionData.session?.user.id;
  if (!veliId) return [];
  const { data, error } = await supabase
    .from('basvuru')
    .select('id, ad, dogum_yili, durum, created_at, brans:brans(ad)')
    .eq('created_by', veliId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { id: string; ad: string; dogum_yili: number | null; durum: BasvuruDurum; created_at: string; brans: { ad: string } | null }[]).map(
    (b) => ({
      id: b.id,
      ad: b.ad,
      altBilgi: [b.brans?.ad, b.dogum_yili].filter(Boolean).join(' · '),
      durum: b.durum,
      when: zamanEtiketi(b.created_at),
    })
  );
}

export async function veliBasvuruOlustur(input: {
  ad: string;
  dogumYili: number | null;
  bransId: string;
  tercihNotu: string;
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const veliId = sessionData.session?.user.id;
  if (!veliId) throw new Error('Oturum bulunamadı — yeniden giriş yapın.');

  // Veli iletişim bilgisi başvuruya profiles'tan kopyalanır (onayda sporcular satırına taşınıyor).
  const { data: profilRow } = await supabase.from('profiles').select('ad, telefon').eq('id', veliId).maybeSingle();
  const profil = profilRow as { ad: string; telefon: string | null } | null;

  const { error } = await supabase.from('basvuru').insert({
    ad: input.ad,
    dogum_yili: input.dogumYili,
    brans_id: input.bransId,
    veli_ad: profil?.ad ?? null,
    veli_telefon: profil?.telefon ?? null,
    tag: 'DENEME',
    durum: 'bekliyor',
    detay_notu: input.tercihNotu.trim() ? `Tercih edilen gün/saat: ${input.tercihNotu.trim()}` : null,
    created_by: veliId,
  });
  if (error) throw error;
}
