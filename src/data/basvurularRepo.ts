import { MOCK_BASVURULAR } from './mock/basvurular';
import type { Basvuru, BasvuruDurum } from './types';

const DELAY_MS = 300;
let basvurular = [...MOCK_BASVURULAR];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getBasvurular(): Promise<Basvuru[]> {
  return delay(basvurular);
}

export async function setBasvuruDurum(id: string, durum: BasvuruDurum): Promise<void> {
  basvurular = basvurular.map((b) => (b.id === id ? { ...b, durum } : b));
  await delay(null);
}
