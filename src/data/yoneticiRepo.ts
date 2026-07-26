import { supabase } from '../lib/supabase';
import { MOCK_OZET, MOCK_SUBELER } from './mock/yonetici';
import { DUYURU_TASLAK_VARSAYILAN } from './mock/duyuru';
import type { DuyuruGonderSonuc, DuyuruHedefi, DuyuruTaslak, DuyuruTuru, Sube, YoneticiOzet } from './types';

// NOT: Özet/şube kısmı hâlâ mock veri döndürüyor (bkz. proje notu — Yönetici Özet
// tab'ındaki şube seçici gerçek `sube` tablosuyla henüz eşleşmiyor, Faz 4 kapsamı dışı).
const DELAY_MS = 350;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getSubeler(): Promise<Sube[]> {
  return delay(MOCK_SUBELER);
}

export async function getOzet(subeId: string): Promise<YoneticiOzet> {
  const ozet = MOCK_OZET[subeId];
  if (!ozet) throw new Error('Şube bulunamadı');
  return delay(ozet);
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

export async function getDuyuruTaslak(): Promise<DuyuruTaslak> {
  return delay(DUYURU_TASLAK_VARSAYILAN);
}

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
