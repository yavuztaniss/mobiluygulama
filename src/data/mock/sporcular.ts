import type { GelisimNotu, OdemeKaydi, Sporcu, SporcuDetay, YoklamaGunu } from '../types';

// Sporcu roster'ının kendisi Faz 1'de gerçek `sporcular` tablosuna taşındı
// (bkz. src/data/sporcularRepo.ts) — burada kalan sabit fixture'lar (yoklama
// takvimi, ödeme geçmişi, gelişim notları) her sporcu için ortak/paylaşımlı
// gösterim verisi, Faz 2/3'te gerçek tabloya taşınacak.

const CAL_DAYS: YoklamaGunu[] = [
  { gun: 1, durum: 'katildi' }, { gun: 2, durum: 'katildi' }, { gun: 3, durum: 'gelmedi' },
  { gun: 4, durum: 'katildi' }, { gun: 8, durum: 'katildi' }, { gun: 9, durum: 'katildi' },
  { gun: 10, durum: 'gelmedi' }, { gun: 11, durum: 'katildi' }, { gun: 15, durum: 'katildi' },
  { gun: 16, durum: 'katildi' }, { gun: 17, durum: 'katildi' }, { gun: 18, durum: 'planli' },
  { gun: 22, durum: 'planli' }, { gun: 23, durum: 'planli' },
];

const ODEME_GECMISI: OdemeKaydi[] = [
  { id: 'o1', baslik: 'Temmuz aidatı', tutar: '₺1.250', durum: 'gecikti', detay: "12 gün gecikti · Son ödeme 8 Temmuz'du" },
  { id: 'o2', baslik: 'Haziran aidatı', tutar: '₺1.250', durum: 'odendi', detay: '10 Haziran · Havale / EFT' },
  { id: 'o3', baslik: 'Mayıs aidatı', tutar: '₺1.250', durum: 'odendi', detay: '8 Mayıs · Kredi kartı •••• 4521' },
];

const GELISIM_NOTLARI: GelisimNotu[] = [
  { metin: 'Şut tekniğinde bu ay belirgin ilerleme var. Savunmada el pozisyonu üzerinde çalışmaya devam ediyoruz.', yazan: 'Emre Hoca', tarih: '19 Temmuz' },
  { metin: 'Kondisyon testinde grup ortalamasının üzerine çıktı; maç içi karar hızı gelişiyor.', yazan: 'Emre Hoca', tarih: '5 Temmuz' },
  { metin: 'Takım oyununa katkısı artıyor, pas seçimlerinde daha isabetli kararlar veriyor.', yazan: 'Emre Hoca', tarih: '21 Haziran' },
  { metin: 'Ribaunt zamanlamasında gelişme var; sıçrama antrenmanlarına devam edilmesi öneriliyor.', yazan: 'Emre Hoca', tarih: '7 Haziran' },
  { metin: 'Aylık değerlendirmede disiplinli çalışma ön plana çıktı, devamsızlık yok.', yazan: 'Mert Demir', tarih: '30 Mayıs' },
];

export function buildSporcuDetay(sporcu: Sporcu): SporcuDetay {
  return {
    ...sporcu,
    sube: 'Merkez Şube',
    yoklamaOrani: 86,
    aylikAidat: '₺1.250',
    kayitTarihi: "Eyl '24",
    calDays: CAL_DAYS,
    odemeGecmisi: sporcu.odemeDurumu === 'gecikmis' ? ODEME_GECMISI : ODEME_GECMISI.slice(1),
    gelisimNotlari: GELISIM_NOTLARI,
  };
}
