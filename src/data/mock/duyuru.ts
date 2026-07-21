import type { DuyuruHedefi, DuyuruTaslak } from '../types';

export const DUYURU_HEDEFLERI: DuyuruHedefi[] = [
  { id: 'tum', ad: 'Tüm Veliler', veliSayisi: 184 },
  { id: 'u12', ad: 'U12 Basketbol', veliSayisi: 28 },
  { id: 'u14', ad: 'U14 Basketbol', veliSayisi: 32 },
  { id: 'u16', ad: 'U16 Basketbol', veliSayisi: 24 },
  { id: 'yuzme', ad: 'Yüzme U8-U10', veliSayisi: 38 },
  { id: 'vole', ad: 'Voleybol U14', veliSayisi: 24 },
];

export const DUYURU_TASLAK_VARSAYILAN: DuyuruTaslak = {
  baslik: 'Yaz Kampı Erken Kayıt İndirimi',
  mesaj: "Foça Yaz Kampı kayıtları açıldı! 1 Ağustos'a kadar %15 erken kayıt indirimi geçerli. Detaylar ve kayıt formu uygulamada.",
};
