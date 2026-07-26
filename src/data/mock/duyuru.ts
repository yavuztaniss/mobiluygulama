import type { DuyuruTaslak } from '../types';

// DUYURU_HEDEFLERI Faz 4'te kalktı — hedef kitle artık gerçek `grup` tablosundan
// geliyor (bkz. yoneticiRepo.getDuyuruHedefleri).

export const DUYURU_TASLAK_VARSAYILAN: DuyuruTaslak = {
  baslik: 'Yaz Kampı Erken Kayıt İndirimi',
  mesaj: "Foça Yaz Kampı kayıtları açıldı! 1 Ağustos'a kadar %15 erken kayıt indirimi geçerli. Detaylar ve kayıt formu uygulamada.",
};
