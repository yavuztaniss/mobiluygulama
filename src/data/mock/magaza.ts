import type { MagazaSiparis, MagazaUrun } from '../types';

export const MOCK_URUNLER: MagazaUrun[] = [
  { id: 'u1', ad: 'Kulüp Forması', fiyat: '₺450', stok: 32, aktif: true },
  { id: 'u2', ad: 'Antrenman Eşofmanı', fiyat: '₺620', stok: 18, aktif: true },
  { id: 'u3', ad: 'Spor Çantası', fiyat: '₺380', stok: 12, aktif: true },
  { id: 'u4', ad: 'Kulüp Matarası', fiyat: '₺120', stok: 0, aktif: false },
];

export const MOCK_SIPARISLER: MagazaSiparis[] = [
  { id: 'S241', urun: 'Kulüp Forması · M', veli: 'Fatma Kaya', sporcu: 'Ali Kaya', tarih: '19 Temmuz', tutar: '₺450', durum: 'hazirlaniyor' },
  { id: 'S240', urun: 'Antrenman Eşofmanı · S', veli: 'Seda Arslan', sporcu: 'Defne Arslan', tarih: '18 Temmuz', tutar: '₺620', durum: 'hazir' },
  { id: 'S239', urun: 'Spor Çantası', veli: 'Murat Tunç', sporcu: 'Kerem Tunç', tarih: '17 Temmuz', tutar: '₺380', durum: 'teslim' },
];
