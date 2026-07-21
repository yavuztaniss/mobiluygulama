import {
  BEKLEME_LISTESI_BASLANGIC,
  BRANSLAR,
  HIZMET_TURLERI,
  SECILI_BRANSLAR_VARSAYILAN,
  SECILI_HIZMET_VARSAYILAN,
} from './mock/kurum';
import type { BagimsizAntrenorBasvurusu, Brans, HizmetTuruSecenegi, KurumBranslariDurumu } from './types';

const DELAY_MS = 300;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getBranslar(): Promise<Brans[]> {
  return delay(BRANSLAR);
}

export async function getHizmetTurleri(): Promise<HizmetTuruSecenegi[]> {
  return delay(HIZMET_TURLERI);
}

let seciliBranslar = [...SECILI_BRANSLAR_VARSAYILAN];
let seciliHizmetTurleri = [...SECILI_HIZMET_VARSAYILAN];

export async function getKurumBranslariDurumu(): Promise<KurumBranslariDurumu> {
  return delay({ seciliBranslar, seciliHizmetTurleri });
}

export async function toggleBrans(id: string): Promise<void> {
  seciliBranslar = seciliBranslar.includes(id) ? seciliBranslar.filter((x) => x !== id) : [...seciliBranslar, id];
  await delay(null);
}

export async function toggleHizmetTuru(id: string): Promise<void> {
  seciliHizmetTurleri = seciliHizmetTurleri.includes(id)
    ? seciliHizmetTurleri.filter((x) => x !== id)
    : [...seciliHizmetTurleri, id];
  await delay(null);
}

export async function kurumBranslariKaydet(): Promise<void> {
  await delay(null);
}

let beklemeSirasi = BEKLEME_LISTESI_BASLANGIC;
export async function bagimsizAntrenoreKatil(_basvuru: BagimsizAntrenorBasvurusu): Promise<{ sira: number }> {
  beklemeSirasi += 1;
  return delay({ sira: beklemeSirasi });
}
