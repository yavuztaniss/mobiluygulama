import { buildSporcuDetay, MOCK_SPORCULAR } from './mock/sporcular';
import type { Sporcu, SporcuDetay } from './types';

const DELAY_MS = 300;
let sporcular: Sporcu[] = [...MOCK_SPORCULAR];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getSporcular(): Promise<Sporcu[]> {
  return delay(sporcular);
}

export async function getSporcuDetay(id: string): Promise<SporcuDetay> {
  const sporcu = sporcular.find((s) => s.id === id);
  if (!sporcu) throw new Error('Sporcu bulunamadı');
  return delay(buildSporcuDetay(sporcu));
}

export async function addSporcu(input: {
  ad: string;
  grup: string;
  brans: string;
  veliAd: string;
  veliTelefon: string;
}): Promise<Sporcu> {
  const init = input.ad
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const yeni: Sporcu = {
    id: 's' + (sporcular.length + 1) + '-' + Date.now(),
    init,
    ad: input.ad,
    grup: input.grup,
    brans: input.brans,
    odemeDurumu: 'guncel',
    veliAd: input.veliAd,
    veliTelefon: input.veliTelefon,
    veliYakinlik: 'Veli',
  };
  sporcular = [yeni, ...sporcular];
  return delay(yeni);
}

export async function updateSporcuBilgi(
  id: string,
  input: { ad: string; grup: string; veliAd: string; veliTelefon: string; veliYakinlik: string }
): Promise<Sporcu> {
  const idx = sporcular.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('Sporcu bulunamadı');
  const init = input.ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const guncel: Sporcu = { ...sporcular[idx], ...input, init };
  sporcular = sporcular.map((s, i) => (i === idx ? guncel : s));
  return delay(guncel);
}
