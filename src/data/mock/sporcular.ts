import type { GelisimNotu, OdemeKaydi, Sporcu, SporcuDetay, YoklamaGunu } from '../types';

export const MOCK_SPORCULAR: Sporcu[] = [
  { id: 's1', init: 'MA', ad: 'Mert Aydın', grup: 'U14 Basketbol', brans: 'Basketbol', odemeDurumu: 'gecikmis', veliAd: 'Serkan Aydın', veliTelefon: '0532 417 88 21', veliYakinlik: 'Baba' },
  { id: 's2', init: 'AK', ad: 'Ali Kaya', grup: 'U12 Yüzme', brans: 'Yüzme', odemeDurumu: 'guncel', veliAd: 'Fatma Kaya', veliTelefon: '0533 221 44 09', veliYakinlik: 'Anne' },
  { id: 's3', init: 'ZK', ad: 'Zeynep Kaya', grup: 'U10 Jimnastik', brans: 'Jimnastik', odemeDurumu: 'guncel', veliAd: 'Fatma Kaya', veliTelefon: '0533 221 44 09', veliYakinlik: 'Anne' },
  { id: 's4', init: 'BT', ad: 'Berk Tan', grup: 'U14 Basketbol', brans: 'Basketbol', odemeDurumu: 'gecikmis', veliAd: 'Hakan Tan', veliTelefon: '0535 620 11 47', veliYakinlik: 'Baba' },
  { id: 's5', init: 'EY', ad: 'Ece Yıldız', grup: 'U12 Voleybol', brans: 'Voleybol', odemeDurumu: 'guncel', veliAd: 'Derya Yıldız', veliTelefon: '0536 802 93 15', veliYakinlik: 'Anne' },
  { id: 's6', init: 'CD', ad: 'Cem Demir', grup: 'U10 Yüzme', brans: 'Yüzme', odemeDurumu: 'guncel', veliAd: 'Onur Demir', veliTelefon: '0532 774 20 63', veliYakinlik: 'Baba' },
  { id: 's7', init: 'DA', ad: 'Defne Arslan', grup: 'U11 Basketbol', brans: 'Basketbol', odemeDurumu: 'gecikmis', veliAd: 'Seda Arslan', veliTelefon: '0538 411 96 27', veliYakinlik: 'Anne' },
  { id: 's8', init: 'KT', ad: 'Kerem Tunç', grup: 'U12 Yüzme', brans: 'Yüzme', odemeDurumu: 'guncel', veliAd: 'Murat Tunç', veliTelefon: '0533 908 55 12', veliYakinlik: 'Baba' },
];

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
