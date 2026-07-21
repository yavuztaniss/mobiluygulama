import { MOCK_ROTALAR } from './mock/servis';
import type { ServisRota } from './types';

const DELAY_MS = 300;
let rotalar: ServisRota[] = [...MOCK_ROTALAR];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getRotalar(): Promise<ServisRota[]> {
  return delay(rotalar);
}

export async function getRotaDetay(id: string): Promise<ServisRota> {
  const rota = rotalar.find((r) => r.id === id);
  if (!rota) throw new Error('Rota bulunamadı');
  return delay(rota);
}

export async function addRota(input: { ad: string; sofor: string; plaka: string; arac: string; alt: string }): Promise<ServisRota> {
  const yeni: ServisRota = {
    id: 'r' + Date.now(),
    ad: input.ad,
    sofor: input.sofor,
    plaka: input.plaka,
    arac: input.arac,
    alt: input.alt,
    sporcuSayisi: 0,
    yolda: false,
    durumTxt: 'Planlandı',
    konumSaat: '—',
    konumHiz: '—',
    duraklar: [],
    sporcular: [],
  };
  rotalar = [...rotalar, yeni];
  return delay(yeni);
}
