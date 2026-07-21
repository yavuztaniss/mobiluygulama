import type { TakvimBlok, TakvimGun } from '../types';

export const TESISLER = ['Salon 1', 'Salon 2', 'Yüzme Havuzu', 'Dış Saha'];

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUN_NOLARI = ['20', '21', '22', '23', '24', '25', '26'];

function blok(id: string, saat1: string, saat2: string, baslik: string, alt: string, tesis: string, extra?: Partial<TakvimBlok>): TakvimBlok {
  return { id, saat1, saat2, baslik, alt, tesis, ...extra };
}

export const MOCK_TAKVIM: TakvimGun[] = [
  { tarih: '20 Temmuz', gunAdi: GUN_ADLARI[0], gunNo: GUN_NOLARI[0], tesisler: TESISLER, bloklar: [
    blok('b1', '09:00', '10:30', 'U10 Yüzme', 'Başlangıç grubu', 'Yüzme Havuzu'),
    blok('b2', '16:00', '17:30', 'U12 Basketbol', 'Teknik antrenman', 'Salon 1'),
  ]},
  { tarih: '21 Temmuz', gunAdi: GUN_ADLARI[1], gunNo: GUN_NOLARI[1], tesisler: TESISLER, bloklar: [
    blok('b3', '09:00', '10:15', 'U14 Basketbol', 'Kondisyon', 'Salon 1'),
    blok('b4', '16:00', '17:30', 'U12 Basketbol', 'Maça hazırlık', 'Salon 1', { live: true }),
    blok('b5', '17:00', '17:45', 'Mert Aydın · Bireysel', 'Şut çalışması', 'Salon 2', { bireysel: true }),
  ]},
  { tarih: '22 Temmuz', gunAdi: GUN_ADLARI[2], gunNo: GUN_NOLARI[2], tesisler: TESISLER, bloklar: [
    blok('b6', '10:00', '11:15', 'U10 Jimnastik', 'Denge çalışması', 'Salon 2'),
  ]},
  { tarih: '23 Temmuz', gunAdi: GUN_ADLARI[3], gunNo: GUN_NOLARI[3], tesisler: TESISLER, bloklar: [
    blok('b7', '16:00', '17:30', 'U12 Voleybol', 'Servis çalışması', 'Dış Saha'),
    blok('b8', '18:00', '19:15', 'U14 Basketbol', 'Taktik çalışma', 'Salon 1'),
  ]},
  { tarih: '24 Temmuz', gunAdi: GUN_ADLARI[4], gunNo: GUN_NOLARI[4], tesisler: TESISLER, bloklar: [] },
  { tarih: '25 Temmuz', gunAdi: GUN_ADLARI[5], gunNo: GUN_NOLARI[5], tesisler: TESISLER, bloklar: [
    blok('b9', '11:00', '12:30', 'U12 Basketbol', 'Maç · Bornova U12', 'Salon 1'),
  ]},
  { tarih: '26 Temmuz', gunAdi: GUN_ADLARI[6], gunNo: GUN_NOLARI[6], tesisler: TESISLER, bloklar: [] },
];
