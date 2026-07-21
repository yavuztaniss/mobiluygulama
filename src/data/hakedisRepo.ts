import { MOCK_HAKEDIS } from './mock/antrenorHakedis';
import type { AntrenorHakedis } from './types';

const DELAY_MS = 300;
let hakedisler = [...MOCK_HAKEDIS];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getHakedisler(): Promise<AntrenorHakedis[]> {
  return delay(hakedisler);
}

export async function odeHakedis(id: string): Promise<void> {
  hakedisler = hakedisler.map((h) => (h.id === id ? { ...h, odendi: true } : h));
  await delay(null);
}
