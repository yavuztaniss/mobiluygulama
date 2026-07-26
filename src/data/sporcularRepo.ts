import { supabase } from '../lib/supabase';
import { buildSporcuDetay } from './mock/sporcular';
import type { Sporcu, SporcuDetay, YoklamaGunu } from './types';

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

type SporcuRow = {
  id: string;
  ad: string;
  odeme_durumu: 'guncel' | 'gecikmis';
  veli_ad: string | null;
  veli_telefon: string | null;
  veli_yakinlik: string | null;
  grup: { ad: string } | null;
  brans: { ad: string } | null;
};

function mapRow(row: SporcuRow): Sporcu {
  return {
    id: row.id,
    init: initialsOf(row.ad),
    ad: row.ad,
    grup: row.grup?.ad ?? '',
    brans: row.brans?.ad ?? '',
    odemeDurumu: row.odeme_durumu,
    veliAd: row.veli_ad ?? '',
    veliTelefon: row.veli_telefon ?? '',
    veliYakinlik: row.veli_yakinlik ?? 'Veli',
  };
}

const SELECT_SPORCU = 'id, ad, odeme_durumu, veli_ad, veli_telefon, veli_yakinlik, grup:grup(ad), brans:brans(ad)';

export async function getSporcular(): Promise<Sporcu[]> {
  const { data, error } = await supabase.from('sporcular').select(SELECT_SPORCU).order('ad');
  if (error) throw error;
  return (data as unknown as SporcuRow[]).map(mapRow);
}

// Yoklama tablosu Faz 3'te yalnızca U12 Basketbol için seed edildi (bkz.
// supabase/migrations/0008_yoklama_gelisim.sql) — gerçek veri varsa buildSporcuDetay'ın
// sabit CAL_DAYS/%86 fixture'ının üzerine yazılır, yoksa fallback olarak kalır.
async function getGercekYoklama(sporcuId: string): Promise<{ calDays: YoklamaGunu[]; yoklamaOrani: number } | null> {
  const { data: sporcuRow } = await supabase.from('sporcular').select('grup_id').eq('id', sporcuId).maybeSingle();
  const grupId = (sporcuRow as { grup_id: string | null } | null)?.grup_id;
  if (!grupId) return null;

  const { data: antrenmanlar } = await supabase.from('antrenman').select('id, tarih').eq('grup_id', grupId).order('tarih');
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

export async function getSporcuDetay(id: string): Promise<SporcuDetay> {
  const { data, error } = await supabase.from('sporcular').select(SELECT_SPORCU).eq('id', id).single();
  if (error) throw new Error('Sporcu bulunamadı');
  const detay = buildSporcuDetay(mapRow(data as unknown as SporcuRow));
  const gercekYoklama = await getGercekYoklama(id);
  return gercekYoklama ? { ...detay, ...gercekYoklama } : detay;
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
  return mapRow(data as unknown as SporcuRow);
}

export async function updateSporcuBilgi(
  id: string,
  input: { ad: string; grup: string; veliAd: string; veliTelefon: string; veliYakinlik: string }
): Promise<Sporcu> {
  const { data: grup } = await supabase.from('grup').select('id').eq('ad', input.grup).maybeSingle();
  const { data, error } = await supabase
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
    .single();
  if (error) throw error;
  return mapRow(data as unknown as SporcuRow);
}
