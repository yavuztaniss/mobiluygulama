import { MOCK_SIPARISLER, MOCK_URUNLER } from './mock/magaza';
import type { MagazaSiparis, MagazaUrun, SiparisDurum } from './types';

const DELAY_MS = 300;
let urunler = [...MOCK_URUNLER];
let siparisler = [...MOCK_SIPARISLER];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getUrunler(): Promise<MagazaUrun[]> {
  return delay(urunler);
}

export async function getSiparisler(): Promise<MagazaSiparis[]> {
  return delay(siparisler);
}

export async function toggleUrunAktif(id: string): Promise<void> {
  urunler = urunler.map((u) => (u.id === id ? { ...u, aktif: !u.aktif } : u));
  await delay(null);
}

export async function addUrun(input: { ad: string; fiyat: string; stok: number }): Promise<void> {
  urunler = [{ id: 'u' + Date.now(), ad: input.ad, fiyat: input.fiyat, stok: input.stok, aktif: true }, ...urunler];
  await delay(null);
}

export async function setSiparisDurum(id: string, durum: SiparisDurum): Promise<void> {
  siparisler = siparisler.map((s) => (s.id === id ? { ...s, durum } : s));
  await delay(null);
}
