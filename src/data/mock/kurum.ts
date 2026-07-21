import type { Brans, HizmetTuruSecenegi } from '../types';

export const BRANSLAR: Brans[] = [
  { id: 'futbol', ad: 'Futbol', ikon: '⚽' },
  { id: 'basketbol', ad: 'Basketbol', ikon: '🏀' },
  { id: 'voleybol', ad: 'Voleybol', ikon: '🏐' },
  { id: 'tenis', ad: 'Tenis', ikon: '🎾' },
  { id: 'yuzme', ad: 'Yüzme', ikon: '🏊' },
  { id: 'jimnastik', ad: 'Jimnastik', ikon: '🤸' },
  { id: 'bale', ad: 'Bale', ikon: '🩰' },
  { id: 'satranc', ad: 'Satranç', ikon: '♟️' },
];

export const HIZMET_TURLERI: HizmetTuruSecenegi[] = [
  { id: 'cok-bransli', ad: 'Çok Branşlı Spor Okulu', aciklama: 'Birden fazla branş tek çatı altında', ikon: '🏟️' },
  { id: 'fitness', ad: 'Fitness / Spor Salonu', aciklama: 'Üyelik tabanlı salon ve stüdyolar', ikon: '🏋️' },
];

// Karşıyaka Spor Okulu — MOCK_SUBELER'daki "Merkez · 6 branş" ile tutarlı varsayılan seçim.
export const SECILI_BRANSLAR_VARSAYILAN = ['futbol', 'basketbol', 'voleybol', 'tenis', 'yuzme', 'jimnastik'];
export const SECILI_HIZMET_VARSAYILAN = ['cok-bransli'];

export const BEKLEME_LISTESI_BASLANGIC = 214;
