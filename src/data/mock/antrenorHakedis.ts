import type { AntrenorHakedis } from '../types';

export const MOCK_HAKEDIS: AntrenorHakedis[] = [
  {
    id: 'h1', init: 'MD', ad: 'Mert Demir', rol: 'Baş Antrenör · Basketbol', ders: 68, birim: '₺400', grup: 3, tutarN: 27200,
    avBg: '#1D3560', avFg: '#9FE8CE', odendi: false,
    kalemler: [{ n: 'U12 · 28 ders', v: '₺11.200' }, { n: 'U14 · 24 ders', v: '₺9.600' }, { n: 'Özel ders · 16 ders', v: '₺6.400' }],
  },
  {
    id: 'h2', init: 'SA', ad: 'Seda Aydın', rol: 'Antrenör · Yüzme', ders: 60, birim: '₺350', grup: 3, tutarN: 21000,
    avBg: '#241A3E', avFg: '#E2C8FF', odendi: false,
    kalemler: [{ n: 'U10 · 24 ders', v: '₺8.400' }, { n: 'U12 · 20 ders', v: '₺7.000' }, { n: 'Yetişkin · 16 ders', v: '₺5.600' }],
  },
  {
    id: 'h3', init: 'BK', ad: 'Burak Koç', rol: 'Antrenör · Voleybol', ders: 56, birim: '₺300', grup: 2, tutarN: 16800,
    avBg: '#12303F', avFg: '#7DD8F0', odendi: false,
    kalemler: [{ n: 'Minik · 32 ders', v: '₺9.600' }, { n: 'U13 · 24 ders', v: '₺7.200' }],
  },
  {
    id: 'h4', init: 'İT', ad: 'İrem Tan', rol: 'Antrenör · Jimnastik', ders: 44, birim: '₺207', grup: 2, tutarN: 9100,
    avBg: '#2A2138', avFg: '#FFD9A0', odendi: false,
    kalemler: [{ n: 'Temel · 28 ders', v: '₺5.800' }, { n: 'İleri · 16 ders', v: '₺3.300' }],
  },
];
