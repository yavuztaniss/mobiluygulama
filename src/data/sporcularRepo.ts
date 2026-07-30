import { supabase } from '../lib/supabase';
import type { GelisimNotu, KatalogSecenegi, OdemeKaydi, Sporcu, SporcuDetay, YoklamaAyi, YoklamaGunu } from './types';

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AY_UZUN = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const YONTEM_AD: Record<string, string> = { kart: 'Kredi kartı', havale: 'Havale / EFT', elden: 'Elden' };

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDateTR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

type SporcuRow = {
  id: string;
  ad: string;
  aktif: boolean;
  veli_ad: string | null;
  veli_telefon: string | null;
  veli_yakinlik: string | null;
  grup_id: string | null;
  brans_id: string | null;
  grup: { ad: string } | null;
  brans: { ad: string } | null;
};

// Ödeme durumu artık sporcular.odeme_durumu statik kolonundan DEĞİL, gerçek odeme
// tablosundan türetiliyor: açık (durum='gecikti') satırı olan sporcu 'gecikmis' sayılır.
function mapRow(row: SporcuRow, gecikmisIds: Set<string>): Sporcu {
  return {
    id: row.id,
    init: initialsOf(row.ad),
    ad: row.ad,
    // 0024 öncesi kurulan projelerde kolon gelmeyebilir — undefined'ı pasif saymayalım.
    aktif: row.aktif !== false,
    grupId: row.grup_id,
    grup: row.grup?.ad ?? '',
    bransId: row.brans_id,
    brans: row.brans?.ad ?? '',
    odemeDurumu: gecikmisIds.has(row.id) ? 'gecikmis' : 'guncel',
    veliAd: row.veli_ad ?? '',
    veliTelefon: row.veli_telefon ?? '',
    veliYakinlik: row.veli_yakinlik ?? 'Veli',
  };
}

const SELECT_SPORCU =
  'id, ad, aktif, veli_ad, veli_telefon, veli_yakinlik, grup_id, brans_id, grup:grup(ad), brans:brans(ad)';

// Tek toplu sorgu: geciken ödemesi olan sporcu id'leri (N+1 yok — liste tarafında
// client-side eşlenir).
async function getGecikmisSporcuIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('odeme').select('sporcu_id').eq('durum', 'gecikti');
  if (error) throw error;
  return new Set(((data ?? []) as { sporcu_id: string }[]).map((r) => r.sporcu_id));
}

// Varsayılan görünüm YALNIZCA aktif sporcular (0024 yumuşak silme) — panelin
// sporcular listesiyle aynı davranış. Pasife alınan kayıt silinmiyor, sadece
// gizleniyor; `pasifleriDahilEt` ile geri getiriliyor.
export async function getSporcular(opts?: { pasifleriDahilEt?: boolean }): Promise<Sporcu[]> {
  let query = supabase.from('sporcular').select(SELECT_SPORCU).order('ad');
  if (!opts?.pasifleriDahilEt) query = query.eq('aktif', true);
  const [{ data, error }, gecikmisIds] = await Promise.all([query, getGecikmisSporcuIds()]);
  if (error) throw error;
  return (data as unknown as SporcuRow[]).map((r) => mapRow(r, gecikmisIds));
}

// Sporcu ekleme/düzenleme formlarının seçim listeleri. Serbest metin yerine
// GERÇEK id ile seçim yapılması için var (bkz. addSporcu başlığı).
export async function getGruplar(): Promise<KatalogSecenegi[]> {
  // Pasife alınmış grup (0024) yeni sporcuya atanamamalı — panelin ekleme
  // formuyla aynı filtre.
  const { data, error } = await supabase.from('grup').select('id, ad').eq('aktif', true).order('ad');
  if (error) throw error;
  return (data ?? []) as KatalogSecenegi[];
}

export async function getBranslar(): Promise<KatalogSecenegi[]> {
  const { data, error } = await supabase.from('brans').select('id, ad').order('ad');
  if (error) throw error;
  return (data ?? []) as KatalogSecenegi[];
}

// YUMUŞAK SİLME (0024). Gerçek DELETE bilinçli olarak yok: sporcular(id)'ye bağlı
// FK'lerin çoğu ON DELETE CASCADE (odeme, yoklama, gelisim_degerlendirme…), yani
// silme ödeme ve yoklama geçmişini de götürürdü. Panelde de aynı davranış var
// (admin-panel/app/(panel)/sporcular/actions.ts:sporcuAktifDegistir).
export async function setSporcuAktif(id: string, aktif: boolean): Promise<void> {
  const { error } = await supabase
    .from('sporcular')
    .update({ aktif, pasif_tarihi: aktif ? null : new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// --- Ay anahtarı yardımcıları -----------------------------------------------
// Anahtar biçimi 'YYYY-MM'. Takvim tek ayla sınırlı: tüm tarihçe alınırsa farklı
// ayların aynı gün numaraları tek grid'de çakışır (yanıltıcı takvim).

export function buAyAnahtari(): string {
  // toISOString() UTC'ye çevirdiği için ayın ilk/son gününde bir önceki ayı
  // verebilir — yerel bileşenlerden kuruluyor (repo genelindeki aynı desen).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' anahtarını `delta` ay kaydırır (negatif = geçmiş). */
export function ayKaydir(ayAnahtari: string, delta: number): string {
  const [yil, ay] = ayAnahtari.split('-').map(Number);
  const d = new Date(yil, ay - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ayEtiketleri(ayAnahtari: string): { etiket: string; kisaEtiket: string } {
  const [yil, ay] = ayAnahtari.split('-').map(Number);
  return {
    etiket: `${AY_UZUN[ay - 1]} ${yil}`,
    kisaEtiket: AY_KISA[ay - 1].toLocaleUpperCase('tr-TR'),
  };
}

// Ay sonu için '-31' KULLANILMAZ: Şubat'ta '2026-02-31' geçersiz bir tarih
// literali olduğundan sorgu Postgres tarafında hata verirdi. Bunun yerine
// [ayın 1'i, sonraki ayın 1'i) yarı açık aralığı kullanılıyor.
function aySinirlari(ayAnahtari: string): { basi: string; sonrakiAyBasi: string } {
  return { basi: `${ayAnahtari}-01`, sonrakiAyBasi: `${ayKaydir(ayAnahtari, 1)}-01` };
}

// Sporcunun grubuna ait antrenmanlar + kendi yoklama satırlarından TEK BİR AYIN
// takvimi ve katılım oranı. Uydurma yok: grup bağı ya da o ayda antrenman yoksa
// takvim boş, hiç yoklama işaretlenmemişse oran null döner (ekran '—' gösterir).
export async function getSporcuYoklamaAyi(
  sporcuId: string,
  grupId: string | null,
  ayAnahtari: string
): Promise<YoklamaAyi> {
  const { etiket, kisaEtiket } = ayEtiketleri(ayAnahtari);
  const bos: YoklamaAyi = { ay: ayAnahtari, etiket, kisaEtiket, calDays: [], yoklamaOrani: null };
  if (!grupId) return bos;

  const { basi, sonrakiAyBasi } = aySinirlari(ayAnahtari);
  const { data: antrenmanlar, error } = await supabase
    .from('antrenman')
    .select('id, tarih')
    .eq('grup_id', grupId)
    .gte('tarih', basi)
    .lt('tarih', sonrakiAyBasi)
    .order('tarih');
  if (error) throw error;
  const aRows = (antrenmanlar ?? []) as { id: string; tarih: string }[];
  if (aRows.length === 0) return bos;

  const { data: yoklamaRows, error: eYoklama } = await supabase
    .from('yoklama')
    .select('antrenman_id, durum')
    .eq('sporcu_id', sporcuId)
    .in('antrenman_id', aRows.map((a) => a.id));
  if (eYoklama) throw eYoklama;
  const yRows = (yoklamaRows ?? []) as { antrenman_id: string; durum: string | null }[];

  const attCount = yRows.filter((y) => y.durum === 'katildi').length;
  const missCount = yRows.filter((y) => y.durum === 'katilmadi').length;

  const calDays: YoklamaGunu[] = aRows.map((a) => {
    const y = yRows.find((r) => r.antrenman_id === a.id);
    const durum: YoklamaGunu['durum'] = y?.durum === 'katildi' ? 'katildi' : y?.durum === 'katilmadi' ? 'gelmedi' : 'planli';
    return { gun: new Date(a.tarih + 'T00:00:00').getDate(), durum };
  });

  return {
    ay: ayAnahtari,
    etiket,
    kisaEtiket,
    calDays,
    // Hiç işaretlenmemiş ay için 0 yazmak "hiç gelmedi" gibi okunurdu — null.
    yoklamaOrani: attCount + missCount > 0 ? Math.round((attCount / (attCount + missCount)) * 100) : null,
  };
}


type OdemeSatiri = {
  id: string;
  aciklama: string;
  tutar: number;
  durum: 'bekliyor' | 'gecikti' | 'odendi';
  yontem: string;
  son_odeme_tarihi: string | null;
  odendi_tarihi: string | null;
  created_at: string;
};

// created_at UTC timestamptz — slice(0,10) TR'de 00:00-03:00 arası önceki günü verir.
function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapOdemeKaydi(o: OdemeSatiri): OdemeKaydi {
  let detay: string;
  if (o.durum === 'odendi') {
    const tarih = formatDateTR(o.odendi_tarihi ?? localDateStr(o.created_at));
    detay = `${tarih} · ${YONTEM_AD[o.yontem] ?? o.yontem}`;
  } else if (o.durum === 'gecikti') {
    if (o.son_odeme_tarihi) {
      const gecikmeGun = Math.max(
        0,
        Math.floor((Date.now() - new Date(o.son_odeme_tarihi + 'T00:00:00').getTime()) / 86400000)
      );
      detay = `${gecikmeGun} gün gecikti · Son ödeme: ${formatDateTR(o.son_odeme_tarihi)}`;
    } else {
      detay = 'Ödeme gecikti';
    }
  } else {
    detay = o.son_odeme_tarihi ? `Son ödeme tarihi: ${formatDateTR(o.son_odeme_tarihi)}` : 'Ödeme bekleniyor';
  }
  return { id: o.id, baslik: o.aciklama, tutar: formatTL(Number(o.tutar)), durum: o.durum, detay };
}

// Detay artık tamamen gerçek tablolardan: odeme (geçmiş + aylık aidat planı),
// gelisim_degerlendirme (+profiles antrenör adı — yönetici RLS ile okuyabilir),
// antrenman/yoklama (takvim + oran), sporcular.created_at (kayıt), sube.ad.
// `ayAnahtari` verilmezse içinde bulunulan ay. Ekran ay ileri/geri oklarıyla
// yalnızca takvimi tazelemek için getSporcuYoklamaAyi'yi doğrudan çağırır —
// tüm detayı yeniden çekmez.
export async function getSporcuDetay(id: string, ayAnahtari?: string): Promise<SporcuDetay> {
  const ay = ayAnahtari ?? buAyAnahtari();
  // Pasif sporcunun detayı da açılabilmeli (0024) — `aktif` filtresi YOK.
  const { data, error } = await supabase
    .from('sporcular')
    .select(`${SELECT_SPORCU}, created_at, sube:sube(ad)`)
    .eq('id', id)
    .single();
  if (error) throw new Error('Sporcu bulunamadı');
  const row = data as unknown as SporcuRow & {
    created_at: string;
    sube: { ad: string } | null;
  };

  const [odemeQ, gelisimQ, planQ, takvim, subeAd] = await Promise.all([
    supabase
      .from('odeme')
      .select('id, aciklama, tutar, durum, yontem, son_odeme_tarihi, odendi_tarihi, created_at')
      .eq('sporcu_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('gelisim_degerlendirme')
      .select('not_metni, tarih, created_at, antrenor:profiles(ad)')
      .eq('sporcu_id', id)
      .maybeSingle(),
    supabase
      .from('odeme')
      .select('aidat_plani:aidat_plani(fiyat)')
      .eq('sporcu_id', id)
      .not('aidat_plani_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getSporcuYoklamaAyi(id, row.grup_id, ay),
    // Şube bağı yoksa uydurma bir şube adı gösterme — '—' (addSporcu sube_id yazmıyor).
    Promise.resolve(row.sube?.ad ?? '—'),
  ]);
  if (odemeQ.error) throw odemeQ.error;

  const odemeGecmisi = ((odemeQ.data ?? []) as unknown as OdemeSatiri[]).map(mapOdemeKaydi);

  const g = gelisimQ.data as unknown as {
    not_metni: string;
    tarih: string | null;
    created_at: string;
    antrenor: { ad: string } | null;
  } | null;
  const gelisimNotlari: GelisimNotu[] =
    g && g.not_metni
      ? [{ metin: g.not_metni, yazan: g.antrenor?.ad ?? 'Antrenör', tarih: formatDateTR(g.tarih ?? localDateStr(g.created_at)) }]
      : [];

  // Aylık aidat: sporcunun en son aidat planı bağlı ödemesindeki plan fiyatı — yoksa '—'.
  const planFiyat = (planQ.data as unknown as { aidat_plani: { fiyat: number } | null } | null)?.aidat_plani?.fiyat;

  const kayit = new Date(row.created_at);
  const kayitTarihi = `${AY_KISA[kayit.getMonth()]} '${String(kayit.getFullYear()).slice(2)}`;

  return {
    ...mapRow(row, new Set<string>(odemeGecmisi.some((o) => o.durum === 'gecikti') ? [id] : [])),
    sube: subeAd,
    aylikAidat: planFiyat != null ? formatTL(Number(planFiyat)) : '—',
    kayitTarihi,
    takvim,
    odemeGecmisi,
    gelisimNotlari,
  };
}

// Grup ve branş GERÇEK id ile geliyor (uuid), ada göre eşleme YOK.
// Eskiden serbest metin alınıp `.eq('ad', input.brans)` ile aranıyordu; en ufak
// yazım farkında (küçük/büyük harf, fazladan boşluk, "Basketbol U14" vs
// "U14 Basketbol") eşleşme boş dönüyor ve sporcu SESSİZCE grupsuz/branşsız
// kaydediliyordu. Panel bu işi baştan id ile yapıyor
// (admin-panel/app/(panel)/sporcular/actions.ts) — mobil de ona hizalandı.
export async function addSporcu(input: {
  ad: string;
  grupId: string | null;
  bransId: string | null;
  veliAd: string;
  veliTelefon: string;
}): Promise<Sporcu> {
  const { data, error } = await supabase
    .from('sporcular')
    .insert({
      ad: input.ad,
      brans_id: input.bransId,
      grup_id: input.grupId,
      veli_ad: input.veliAd,
      veli_telefon: input.veliTelefon,
      veli_yakinlik: 'Veli',
    })
    .select(SELECT_SPORCU)
    .single();
  if (error) throw error;
  // Yeni eklenen sporcunun henüz ödeme kaydı yok → 'guncel'.
  return mapRow(data as unknown as SporcuRow, new Set<string>());
}

export async function updateSporcuBilgi(
  id: string,
  input: { ad: string; grupId: string | null; veliAd: string; veliTelefon: string; veliYakinlik: string }
): Promise<Sporcu> {
  const [{ data, error }, { data: gecikenRow }] = await Promise.all([
    supabase
      .from('sporcular')
      .update({
        ad: input.ad,
        grup_id: input.grupId,
        veli_ad: input.veliAd,
        veli_telefon: input.veliTelefon,
        veli_yakinlik: input.veliYakinlik,
      })
      .eq('id', id)
      .select(SELECT_SPORCU)
      .single(),
    supabase.from('odeme').select('id').eq('sporcu_id', id).eq('durum', 'gecikti').limit(1).maybeSingle(),
  ]);
  if (error) throw error;
  return mapRow(data as unknown as SporcuRow, gecikenRow ? new Set([id]) : new Set<string>());
}
