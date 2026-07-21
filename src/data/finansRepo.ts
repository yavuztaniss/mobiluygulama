import { buildFinansOzet, MOCK_PLANLAR, MOCK_TAHSILATLAR } from './mock/finans';
import { findChildIdByAd, kaydetOdeme } from './paymentLedger';
import type { AidatPlani, FinansOzet, OdemeYontemi } from './types';

const DELAY_MS = 300;
let tahsilatlar = [...MOCK_TAHSILATLAR];
let planlar: AidatPlani[] = [...MOCK_PLANLAR];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getFinansOzet(): Promise<FinansOzet> {
  return delay(buildFinansOzet(tahsilatlar, planlar));
}

export async function updateAidatPlani(id: string, input: { ad: string; alt: string; fiyat: string; beklenen: string }): Promise<AidatPlani> {
  const idx = planlar.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('Plan bulunamadı');
  const guncel: AidatPlani = { ...planlar[idx], ...input };
  planlar = planlar.map((p, i) => (i === idx ? guncel : p));
  return delay(guncel);
}

export async function addAidatPlani(input: { ad: string; alt: string; fiyat: string; beklenen: string }): Promise<AidatPlani> {
  const yeni: AidatPlani = { id: 'p' + Date.now(), ...input };
  planlar = [...planlar, yeni];
  return delay(yeni);
}

export async function recordPayment(input: {
  sporcuAd: string;
  aciklama: string;
  tutar: string;
  yontem: OdemeYontemi;
}): Promise<void> {
  tahsilatlar = [
    {
      id: 't' + Date.now(),
      ad: input.sporcuAd,
      ne: input.aciklama,
      sub: 'Az önce',
      tutar: input.tutar,
      yontem: input.yontem,
      grup: 'Bugün',
    },
    ...tahsilatlar,
  ];
  // Veli tarafındaki aidat durumunu da güncelle (tek kaynak: paymentLedger).
  const childId = findChildIdByAd(input.sporcuAd);
  if (childId) kaydetOdeme(childId, input.tutar, input.yontem);
  await delay(null);
}
