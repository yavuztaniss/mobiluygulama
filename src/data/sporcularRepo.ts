import { supabase } from '../lib/supabase';
import type { GelisimNotu, OdemeKaydi, Sporcu, SporcuDetay, YoklamaGunu } from './types';

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
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
  veli_ad: string | null;
  veli_telefon: string | null;
  veli_yakinlik: string | null;
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
    grup: row.grup?.ad ?? '',
    brans: row.brans?.ad ?? '',
    odemeDurumu: gecikmisIds.has(row.id) ? 'gecikmis' : 'guncel',
    veliAd: row.veli_ad ?? '',
    veliTelefon: row.veli_telefon ?? '',
    veliYakinlik: row.veli_yakinlik ?? 'Veli',
  };
}

const SELECT_SPORCU = 'id, ad, veli_ad, veli_telefon, veli_yakinlik, grup:grup(ad), brans:brans(ad)';

// Tek toplu sorgu: geciken ödemesi olan sporcu id'leri (N+1 yok — liste tarafında
// client-side eşlenir).
async function getGecikmisSporcuIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('odeme').select('sporcu_id').eq('durum', 'gecikti');
  if (error) throw error;
  return new Set(((data ?? []) as { sporcu_id: string }[]).map((r) => r.sporcu_id));
}

export async function getSporcular(): Promise<Sporcu[]> {
  const [{ data, error }, gecikmisIds] = await Promise.all([
    supabase.from('sporcular').select(SELECT_SPORCU).order('ad'),
    getGecikmisSporcuIds(),
  ]);
  if (error) throw error;
  return (data as unknown as SporcuRow[]).map((r) => mapRow(r, gecikmisIds));
}

// Sporcunun grubuna ait antrenmanlar + kendi yoklama satırlarından takvim ve oran.
// Hiç yoklama kaydı yoksa null döner (ekran '—' / boş durum gösterir — uydurma yok).
async function getGercekYoklama(
  sporcuId: string,
  grupId: string | null
): Promise<{ calDays: YoklamaGunu[]; yoklamaOrani: number } | null> {
  if (!grupId) return null;

  // İçinde bulunulan AY ile sınırlı — tüm tarihçe alınırsa farklı ayların aynı gün
  // numaraları tek takvim grid'inde çakışır (duplicate key + yanıltıcı takvim).
  const simdi = new Date();
  const ayBasi = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-01`;
  const aySonu = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-31`;
  const { data: antrenmanlar } = await supabase
    .from('antrenman')
    .select('id, tarih')
    .eq('grup_id', grupId)
    .gte('tarih', ayBasi)
    .lte('tarih', aySonu)
    .order('tarih');
  const aRows = (antrenmanlar ?? []) as { id: string; tarih: string }[];
  if (aRows.length === 0) return null;

  const antrenmanIds = aRows.map((a) => a.id);
  const { data: yoklamaRows } = await supabase
    .from('yoklama')
    .select('antrenman_id, durum')
    .eq('sporcu_id', sporcuId)
    .in('antrenman_id', antrenmanIds);
  const yRows = (yoklamaRows ?? []) as { antrenman_id: string; durum: string | null }[];
  if (yRows.length === 0) return null;

  const attCount = yRows.filter((y) => y.durum === 'katildi').length;
  const missCount = yRows.filter((y) => y.durum === 'katilmadi').length;
  const yoklamaOrani = attCount + missCount > 0 ? Math.round((attCount / (attCount + missCount)) * 100) : 0;

  const calDays: YoklamaGunu[] = aRows.map((a) => {
    const y = yRows.find((r) => r.antrenman_id === a.id);
    const durum: YoklamaGunu['durum'] = y?.durum === 'katildi' ? 'katildi' : y?.durum === 'katilmadi' ? 'gelmedi' : 'planli';
    return { gun: new Date(a.tarih + 'T00:00:00').getDate(), durum };
  });

  return { calDays, yoklamaOrani };
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
export async function getSporcuDetay(id: string): Promise<SporcuDetay> {
  const { data, error } = await supabase
    .from('sporcular')
    .select(`${SELECT_SPORCU}, grup_id, created_at, sube:sube(ad)`)
    .eq('id', id)
    .single();
  if (error) throw new Error('Sporcu bulunamadı');
  const row = data as unknown as SporcuRow & {
    grup_id: string | null;
    created_at: string;
    sube: { ad: string } | null;
  };

  const [odemeQ, gelisimQ, planQ, yoklama, subeAd] = await Promise.all([
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
    getGercekYoklama(id, row.grup_id),
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
    yoklamaOrani: yoklama?.yoklamaOrani ?? null,
    aylikAidat: planFiyat != null ? formatTL(Number(planFiyat)) : '—',
    kayitTarihi,
    calDays: yoklama?.calDays ?? [],
    odemeGecmisi,
    gelisimNotlari,
  };
}

export async function addSporcu(input: {
  ad: string;
  grup: string;
  brans: string;
  veliAd: string;
  veliTelefon: string;
}): Promise<Sporcu> {
  // Girilen grup/branş adını mevcut kataloglardan bulur; yoksa boş bırakır
  // (Faz 1'de yeni branş/grup oluşturma akışı yok — bkz. Kurum Branşları ekranı).
  const [{ data: brans }, { data: grup }] = await Promise.all([
    supabase.from('brans').select('id').eq('ad', input.brans).maybeSingle(),
    supabase.from('grup').select('id').eq('ad', input.grup).maybeSingle(),
  ]);
  const { data, error } = await supabase
    .from('sporcular')
    .insert({
      ad: input.ad,
      brans_id: brans?.id ?? null,
      grup_id: grup?.id ?? null,
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
  input: { ad: string; grup: string; veliAd: string; veliTelefon: string; veliYakinlik: string }
): Promise<Sporcu> {
  const { data: grup } = await supabase.from('grup').select('id').eq('ad', input.grup).maybeSingle();
  const [{ data, error }, { data: gecikenRow }] = await Promise.all([
    supabase
      .from('sporcular')
      .update({
        ad: input.ad,
        grup_id: grup?.id ?? null,
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
