import type { AidatPlani, FinansOzet, GelirGiderAy, GelirKategori, TahsilatKaydi } from '../types';

export const MOCK_PLANLAR: AidatPlani[] = [
  { id: 'p1', ad: 'Basketbol Aylık', alt: 'U12-U14 · haftada 3 gün', fiyat: '₺1.250', beklenen: '₺43.750' },
  { id: 'p2', ad: 'Yüzme Aylık', alt: 'U10-U12 · haftada 2 gün', fiyat: '₺1.100', beklenen: '₺30.800' },
  { id: 'p3', ad: 'Jimnastik Aylık', alt: 'U8-U10 · haftada 3 gün', fiyat: '₺950', beklenen: '₺19.000' },
  { id: 'p4', ad: 'Voleybol Aylık', alt: 'U12 · haftada 2 gün', fiyat: '₺1.050', beklenen: '₺21.000' },
];

export const MOCK_TAHSILATLAR: TahsilatKaydi[] = [
  { id: 't1', ad: 'Ali Kaya', ne: 'Temmuz aidatı', sub: 'Bugün 09:14', tutar: '1.250', yontem: 'kart', grup: 'Bugün' },
  { id: 't2', ad: 'Ece Yıldız', ne: 'Temmuz aidatı', sub: 'Bugün 08:40', tutar: '1.050', yontem: 'havale', grup: 'Bugün' },
  { id: 't3', ad: 'Cem Demir', ne: 'Temmuz aidatı', sub: 'Dün 17:22', tutar: '1.100', yontem: 'elden', grup: 'Dün' },
  { id: 't4', ad: 'Kerem Tunç', ne: 'Temmuz aidatı', sub: 'Dün 11:05', tutar: '1.100', yontem: 'kart', grup: 'Dün' },
  { id: 't5', ad: 'Zeynep Kaya', ne: 'Temmuz aidatı', sub: '19 Temmuz', tutar: '950', yontem: 'kart', grup: '19 Temmuz' },
];

const GG_AYLAR: GelirGiderAy[] = [
  { ay: 'Nis', gelir: 191000, gider: 118000 },
  { ay: 'May', gelir: 202000, gider: 121000 },
  { ay: 'Haz', gelir: 196000, gider: 119500 },
  { ay: 'Tem', gelir: 214500, gider: 126300 },
];

const KATEGORILER: GelirKategori[] = [
  { ad: 'Aidatlar', tutar: '₺154.400', pct: '%72', renk: '#2EE6A8' },
  { ad: 'Bireysel Ders', tutar: '₺30.000', pct: '%14', renk: '#5AA7FF' },
  { ad: 'Mağaza', tutar: '₺19.300', pct: '%9', renk: '#FFB454' },
  { ad: 'Etkinlik/Kamp', tutar: '₺10.800', pct: '%5', renk: '#5D708C' },
];

export function buildFinansOzet(tahsilatlar: TahsilatKaydi[], planlar: AidatPlani[] = MOCK_PLANLAR): FinansOzet {
  const toplamSayi = tahsilatlar.reduce((a, t) => a + parseInt(t.tutar.replace(/\./g, ''), 10), 0);
  return {
    planlar,
    tahsilatlar,
    islemSayisi: 142,
    tahsilatToplam: '₺' + toplamSayi.toLocaleString('tr-TR'),
    ggAylar: GG_AYLAR,
    kategoriler: KATEGORILER,
    toplamGelir: '₺214.500',
    toplamGider: '−₺126.300',
    net: '₺88.200',
  };
}
