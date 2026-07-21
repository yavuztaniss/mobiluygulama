import { MOCK_OZET, MOCK_SUBELER } from './mock/yonetici';
import { DUYURU_HEDEFLERI, DUYURU_TASLAK_VARSAYILAN } from './mock/duyuru';
import type { DuyuruGonderSonuc, DuyuruHedefi, DuyuruTaslak, Sube, YoneticiOzet } from './types';

// NOT: Şu an mock veri döndürüyor. Supabase bağlandığında bu fonksiyonların
// gövdesi değişecek, çağıran ekranlar (async + loading/error) aynı kalacak.
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

export async function getDuyuruHedefleri(): Promise<DuyuruHedefi[]> {
  return delay(DUYURU_HEDEFLERI);
}

export async function getDuyuruTaslak(): Promise<DuyuruTaslak> {
  return delay(DUYURU_TASLAK_VARSAYILAN);
}

export function duyuruHedefSayisi(hedefIds: string[]): number {
  if (hedefIds.includes('tum')) return DUYURU_HEDEFLERI.find((h) => h.id === 'tum')!.veliSayisi;
  return DUYURU_HEDEFLERI.filter((h) => hedefIds.includes(h.id)).reduce((a, h) => a + h.veliSayisi, 0);
}

export async function duyuruGonder(input: { hedefIds: string[]; baslik: string; mesaj: string; smsIle: boolean }): Promise<DuyuruGonderSonuc> {
  return delay({ veliSayisi: duyuruHedefSayisi(input.hedefIds), smsIle: input.smsIle });
}
