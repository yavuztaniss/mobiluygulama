// Faz 6'da Yönetici (eski MagazaUrun/MagazaSiparis, types.ts) ve Veli (eski MagazaUrunVeli,
// types-veli.ts) tarafındaki iki ayrı katalog/sipariş şekli tek gerçek kaynağa (magazaRepo.ts)
// taşınırken birleşti — her iki ekran de artık aynı tipleri kullanıyor.

export interface Urun {
  id: string;
  ad: string;
  aciklama: string;
  kategori: string;
  fiyat: string;
  fiyatN: number;
  stok: number;
  aktif: boolean;
  badge?: string;
  jersey?: boolean;
}

export type SiparisDurum = 'hazirlaniyor' | 'hazir' | 'teslim';

export interface Siparis {
  id: string;
  urun: string;
  veli: string;
  sporcu: string;
  tarih: string;
  tutar: string;
  durum: SiparisDurum;
}

export interface SepetKalemGirdi {
  urunId: string;
  beden: string | null;
  adet: number;
  fiyatN: number;
  not: string;
}
