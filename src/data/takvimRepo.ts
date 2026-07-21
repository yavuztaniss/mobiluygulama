import { MOCK_TAKVIM, TESISLER } from './mock/takvim';
import type { TakvimBlok, TakvimGun } from './types';

const DELAY_MS = 300;
let gunler: TakvimGun[] = MOCK_TAKVIM.map((g) => ({ ...g, bloklar: [...g.bloklar] }));

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getTakvim(): Promise<TakvimGun[]> {
  return delay(gunler);
}

export const TESIS_LISTESI = TESISLER;

export async function addAntrenman(input: {
  gunIndex: number;
  grup: string;
  antrenor: string;
  tesis: string;
  saat1: string;
  saat2: string;
}): Promise<{ conflict: TakvimBlok | null }> {
  const gun = gunler[input.gunIndex];
  const conflict = gun.bloklar.find((b) => b.tesis === input.tesis && b.saat1 === input.saat1) ?? null;
  if (conflict) return delay({ conflict });

  const yeni: TakvimBlok = {
    id: 'b' + Date.now(),
    saat1: input.saat1,
    saat2: input.saat2,
    baslik: input.grup,
    alt: input.antrenor,
    tesis: input.tesis,
  };
  const yeniBloklar = [...gun.bloklar, yeni].sort((a, b) => a.saat1.localeCompare(b.saat1));
  gunler = gunler.map((g, i) => (i === input.gunIndex ? { ...g, bloklar: yeniBloklar } : g));
  return delay({ conflict: null });
}
