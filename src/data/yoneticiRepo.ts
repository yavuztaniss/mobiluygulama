import { supabase } from '../lib/supabase';
import type { DuyuruGonderSonuc, DuyuruHedefi, DuyuruTuru, Sube, YoneticiOzet } from './types';

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// toISOString() UTC'ye çevirdiği için UTC+3'te 00:00-03:00 arası bir önceki günü
// verir — yerel bileşenlerden kurulur (aynı desen: antrenorRepo.todayStr).
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ayBasiStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Şubeler artık gerçek `sube` tablosundan geliyor.
export async function getSubeler(): Promise<Sube[]> {
  const { data, error } = await supabase.from('sube').select('id, ad, alt_bilgi').order('ad');
  if (error) throw error;
  return ((data ?? []) as { id: string; ad: string; alt_bilgi: string | null }[]).map((s) => ({
    id: s.id,
    ad: s.ad,
    altBilgi: s.alt_bilgi ?? '',
  }));
}

// Özet KPI'ları gerçek tablolardan hesaplanır.
// NOT (şube filtresi): odeme/yoklama/antrenman tablolarında şube bağı olmadığından
// KPI'lar TÜM KURUM için hesaplanır — subeId yalnızca başlıkta gösterilen şube
// adını seçer (null/eşleşme yoksa ilk şube). Şube bazlı kırılım ileri faz konusu.
export async function getOzet(subeId: string | null): Promise<YoneticiOzet> {
  const bugun = new Date();
  const altiAyOnce = ayBasiStr(new Date(bugun.getFullYear(), bugun.getMonth() - 5, 1));

  const [
    { data: subeRows, error: eSube },
    { count: sporcuSayisi, error: eSporcu },
    { count: yeniSporcu, error: eYeni },
    { data: odemeRows, error: eOdeme },
    { data: gecikenRows, error: eGeciken },
    { count: katilanSayisi, error: eKatilan },
    { count: yoklamaSayisi, error: eYoklama },
    { count: bugunAntrenman, error: eAntrenman },
  ] = await Promise.all([
    supabase.from('sube').select('id, ad').order('ad'),
    supabase.from('sporcular').select('id', { count: 'exact', head: true }),
    // created_at timestamptz — düz 'YYYY-MM-01' string'i UTC gece yarısı sayılır; yerel
    // ay başının gerçek UTC anını (toISOString) göndererek 00:00-03:00 sınır kaçağı önlenir.
    supabase
      .from('sporcular')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(bugun.getFullYear(), bugun.getMonth(), 1).toISOString()),
    supabase.from('odeme').select('tutar, odendi_tarihi').eq('durum', 'odendi').gte('odendi_tarihi', altiAyOnce),
    supabase.from('odeme').select('tutar').eq('durum', 'gecikti'),
    supabase.from('yoklama').select('id', { count: 'exact', head: true }).eq('durum', 'katildi'),
    supabase.from('yoklama').select('id', { count: 'exact', head: true }).not('durum', 'is', null),
    supabase.from('antrenman').select('id', { count: 'exact', head: true }).eq('tarih', todayStr()),
  ]);
  const hata = eSube || eSporcu || eYeni || eOdeme || eGeciken || eKatilan || eYoklama || eAntrenman;
  if (hata) throw hata;

  const subeler = (subeRows ?? []) as { id: string; ad: string }[];
  const sube = subeler.find((s) => s.id === subeId) ?? subeler[0];

  // Son 6 ayın tahsilat serisi — odendi_tarihi'nin YYYY-MM anahtarına göre gruplanır.
  const aylikTahsilat = new Map<string, number>();
  ((odemeRows ?? []) as { tutar: number; odendi_tarihi: string | null }[]).forEach((o) => {
    if (!o.odendi_tarihi) return;
    const key = o.odendi_tarihi.slice(0, 7);
    aylikTahsilat.set(key, (aylikTahsilat.get(key) ?? 0) + Number(o.tutar));
  });
  const tahsilatSonAltiAy = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - (5 - i), 1);
    return { ay: AY_KISA[d.getMonth()], tutar: aylikTahsilat.get(ayKey(d)) ?? 0 };
  });

  const buAyKey = ayKey(bugun);
  const buAyIslem = ((odemeRows ?? []) as { odendi_tarihi: string | null }[]).filter(
    (o) => o.odendi_tarihi?.slice(0, 7) === buAyKey
  ).length;

  const geciken = (gecikenRows ?? []) as { tutar: number }[];
  const gecikenToplam = geciken.reduce((a, g) => a + Number(g.tutar), 0);

  // Tarih etiketi bugünden üretilir ('Salı, 29 Temmuz' formatı).
  const gunAdi = bugun.toLocaleDateString('tr-TR', { weekday: 'long' });
  const gunAy = bugun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  return {
    subeAd: sube?.ad ?? '—',
    tarihEtiketi: `${gunAdi}, ${gunAy} · Yönetim Paneli`,
    kpiSporcu: sporcuSayisi ?? 0,
    kpiSporcuArtis: `+${yeniSporcu ?? 0} bu ay`,
    kpiTahsilat: formatTL(aylikTahsilat.get(buAyKey) ?? 0),
    kpiTahsilatAlt: `${buAyIslem} işlem`,
    kpiGeciken: geciken.length,
    kpiGecikenTutar: geciken.length ? `${formatTL(gecikenToplam)} toplam` : '',
    yoklamaOrani: (yoklamaSayisi ?? 0) > 0 ? Math.round(((katilanSayisi ?? 0) / (yoklamaSayisi ?? 1)) * 100) : 0,
    bugunAntrenman: bugunAntrenman ?? 0,
    tahsilatSonAltiAy,
  };
}

// Duyuru hedef kitlesi artık gerçek `grup` tablosundan geliyor — her grubun gerçek
// (distinct) veli sayısı `veli_sporcu` join'iyle hesaplanıyor. "tum" sabit seçeneği
// tüm velilerin distinct sayısını temsil ediyor.
export async function getDuyuruHedefleri(): Promise<DuyuruHedefi[]> {
  const [{ data: gruplar, error: e1 }, { data: baglar, error: e2 }] = await Promise.all([
    supabase.from('grup').select('id, ad').order('ad'),
    supabase.from('veli_sporcu').select('veli_id, sporcu:sporcular(grup_id)'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const veliSetPerGrup = new Map<string, Set<string>>();
  const tumVeliler = new Set<string>();
  (baglar as any[] ?? []).forEach((b) => {
    tumVeliler.add(b.veli_id);
    const grupId = b.sporcu?.grup_id;
    if (!grupId) return;
    if (!veliSetPerGrup.has(grupId)) veliSetPerGrup.set(grupId, new Set());
    veliSetPerGrup.get(grupId)!.add(b.veli_id);
  });

  return [
    { id: 'tum', ad: 'Tüm Veliler', veliSayisi: tumVeliler.size },
    ...((gruplar ?? []) as { id: string; ad: string }[]).map((g) => ({
      id: g.id,
      ad: g.ad,
      veliSayisi: veliSetPerGrup.get(g.id)?.size ?? 0,
    })),
  ];
}

// getDuyuruTaslak kaldırıldı — duyuru formu boş açılıyor (örnek metin placeholder olarak ekranda).

export function duyuruHedefSayisi(hedefler: DuyuruHedefi[], hedefIds: string[]): number {
  if (hedefIds.includes('tum')) return hedefler.find((h) => h.id === 'tum')?.veliSayisi ?? 0;
  return hedefler.filter((h) => hedefIds.includes(h.id)).reduce((a, h) => a + h.veliSayisi, 0);
}

export async function duyuruGonder(input: {
  hedefIds: string[];
  baslik: string;
  mesaj: string;
  tur: DuyuruTuru;
  smsIle: boolean;
}): Promise<DuyuruGonderSonuc> {
  const tumVeliler = input.hedefIds.includes('tum');
  const { data: duyuru, error } = await supabase
    .from('duyuru')
    .insert({ baslik: input.baslik, mesaj: input.mesaj, tur: input.tur, tum_veliler: tumVeliler, sms_ile: input.smsIle })
    .select('id')
    .single();
  if (error) throw error;

  if (!tumVeliler && input.hedefIds.length > 0) {
    const rows = input.hedefIds.map((grupId) => ({ duyuru_id: duyuru.id, grup_id: grupId }));
    const { error: e2 } = await supabase.from('duyuru_hedef').insert(rows);
    if (e2) throw e2;
  }

  const hedefler = await getDuyuruHedefleri();
  return { veliSayisi: duyuruHedefSayisi(hedefler, input.hedefIds), smsIle: input.smsIle };
}
