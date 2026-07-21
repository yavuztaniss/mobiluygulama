import { MOCK_ETKINLIKLER } from './mock/etkinlik';
import type { Etkinlik, EtkinlikTuru } from './types';

const DELAY_MS = 300;
let etkinlikler = [...MOCK_ETKINLIKLER];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getEtkinlikler(): Promise<Etkinlik[]> {
  return delay(etkinlikler);
}

export async function publishEtkinlik(input: {
  tur: EtkinlikTuru;
  baslik: string;
  grup: string;
  tesis: string;
  tarih: string;
  saat: string;
  lcv: boolean;
  ucretli: boolean;
  tutar?: string;
}): Promise<Etkinlik> {
  const yeni: Etkinlik = { id: 'e' + Date.now(), ...input };
  etkinlikler = [yeni, ...etkinlikler];
  return delay(yeni);
}
