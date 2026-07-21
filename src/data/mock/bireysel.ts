import type {
  AntrenorTakvimGun,
  BekleyenRezervasyon,
  BireyselAntrenor,
  BireyselGunSlotlari,
  BireyselPaketDurumu,
  BireyselSlotDurum,
  KazancAySecenegi,
  MusaitlikGunu,
  MusaitlikIstisna,
} from '../types-bireysel';

export const BIREYSEL_ANTRENORLER: BireyselAntrenor[] = [
  {
    id: 'emre', ad: 'Emre Hoca', init: 'EH', brans: 'Tenis', deneyim: 9, puan: '4,9', dersSayisi: 312, musait: true,
    tekFiyatN: 750, paketFiyatN: 6500, avBg: '#1D3560', avFg: '#9FE8CE',
    bio: 'Milli takım altyapısında 4 yıl görev aldı. Başlangıç ve orta seviye sporcularla birebir teknik gelişim, servis ve maç taktiği çalışır.',
  },
  {
    id: 'seda', ad: 'Seda Hoca', init: 'SH', brans: 'Yüzme', deneyim: 7, puan: '4,8', dersSayisi: 246, musait: true,
    tekFiyatN: 650, paketFiyatN: 5900, avBg: '#12303F', avFg: '#7DD8F0',
    bio: 'Serbest stil ve sırtüstü teknik düzeltmede uzmanlaşmış. Su korkusu olan başlangıç seviyesi sporcularla sabırlı bir çalışma yürütür.',
  },
  {
    id: 'mert', ad: 'Mert Demir', init: 'MD', brans: 'Basketbol', deneyim: 11, puan: '5,0', dersSayisi: 428, musait: false,
    ilkBosEtiket: 'İLK BOŞ: 27 TEM', tekFiyatN: 700, paketFiyatN: 6200, avBg: '#241A3E', avFg: '#E2C8FF',
    bio: 'Baş antrenör · şut mekaniği ve top sürme üzerine bireysel gelişim programları hazırlar. Genç yetenek taramalarında görev aldı.',
  },
  {
    id: 'aylin', ad: 'Aylin Hoca', init: 'AH', brans: 'Jimnastik', deneyim: 5, puan: '4,7', dersSayisi: 158, musait: true,
    tekFiyatN: 600, paketFiyatN: 5400, avBg: '#2A2138', avFg: '#FFD9A0',
    bio: 'Denge ve esneklik temelli başlangıç programlarıyla küçük yaş grubuna yönelik bireysel dersler verir.',
  },
];

export const BIREYSEL_FILTRELER = ['Tümü', 'Tenis', 'Basketbol', 'Yüzme', 'Jimnastik'];

export const BIREYSEL_PAKETLERIM: Record<string, BireyselPaketDurumu> = {
  emre: { kalan: 7, toplam: 10 },
};

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUN_NOLARI = ['20', '21', '22', '23', '24', '25', '26'];

type Ham = [string, BireyselSlotDurum];

const SLOT_TABLOSU: Record<string, Ham[][]> = {
  emre: [
    [['16:00', 'dolu'], ['17:00', 'grup'], ['18:00', 'grup'], ['19:00', 'dolu'], ['20:00', 'musait'], ['21:00', 'musait']],
    [['16:00', 'musait'], ['17:00', 'musait'], ['18:00', 'dolu'], ['19:00', 'grup'], ['20:00', 'musait'], ['21:00', 'dolu']],
    [['16:00', 'grup'], ['17:00', 'grup'], ['18:00', 'musait'], ['19:00', 'musait'], ['20:00', 'dolu'], ['21:00', 'musait']],
    [['16:00', 'dolu'], ['17:00', 'musait'], ['18:00', 'grup'], ['19:00', 'musait'], ['20:00', 'musait'], ['21:00', 'dolu']],
    [['16:00', 'musait'], ['17:00', 'dolu'], ['18:00', 'grup'], ['19:00', 'grup'], ['20:00', 'musait'], ['21:00', 'musait']],
    [['09:00', 'musait'], ['10:00', 'musait'], ['11:00', 'dolu'], ['12:00', 'musait'], ['13:00', 'grup'], ['14:00', 'musait']],
    [['09:00', 'dolu'], ['10:00', 'musait'], ['11:00', 'musait'], ['12:00', 'grup'], ['13:00', 'musait'], ['14:00', 'dolu']],
  ],
  seda: [
    [['08:00', 'musait'], ['09:00', 'grup'], ['17:00', 'dolu'], ['18:00', 'musait']],
    [['08:00', 'dolu'], ['09:00', 'musait'], ['17:00', 'musait'], ['18:00', 'grup']],
    [['08:00', 'musait'], ['09:00', 'dolu'], ['17:00', 'grup'], ['18:00', 'musait']],
    [['08:00', 'grup'], ['09:00', 'musait'], ['17:00', 'musait'], ['18:00', 'dolu']],
    [['08:00', 'musait'], ['09:00', 'musait'], ['17:00', 'dolu'], ['18:00', 'grup']],
    [['09:00', 'musait'], ['10:00', 'musait'], ['11:00', 'grup'], ['12:00', 'musait']],
    [['09:00', 'dolu'], ['10:00', 'grup'], ['11:00', 'musait'], ['12:00', 'musait']],
  ],
  mert: [
    [['16:00', 'grup'], ['17:00', 'grup'], ['19:00', 'dolu']],
    [['16:00', 'dolu'], ['17:00', 'dolu'], ['19:00', 'grup']],
    [['16:00', 'grup'], ['17:00', 'grup'], ['20:00', 'dolu']],
    [['16:00', 'dolu'], ['18:00', 'grup'], ['20:00', 'dolu']],
    [['16:00', 'dolu'], ['18:00', 'grup'], ['19:00', 'grup']],
    [['09:00', 'dolu'], ['11:00', 'grup'], ['13:00', 'grup']],
    [['09:00', 'dolu'], ['12:00', 'grup'], ['14:00', 'dolu']],
  ],
  aylin: [
    [['10:00', 'musait'], ['11:00', 'grup'], ['15:00', 'musait']],
    [['10:00', 'dolu'], ['11:00', 'musait'], ['15:00', 'grup']],
    [['10:00', 'musait'], ['11:00', 'musait'], ['15:00', 'dolu']],
    [['10:00', 'grup'], ['11:00', 'dolu'], ['15:00', 'musait']],
    [['10:00', 'musait'], ['11:00', 'grup'], ['15:00', 'musait']],
    [['09:00', 'musait'], ['10:00', 'musait'], ['11:00', 'dolu']],
    [['09:00', 'dolu'], ['10:00', 'grup'], ['11:00', 'musait']],
  ],
};

export function bireyselHaftaSlotlari(antrenorId: string): BireyselGunSlotlari[] {
  const tablo = SLOT_TABLOSU[antrenorId] ?? SLOT_TABLOSU.emre;
  return GUN_ADLARI.map((gunAdi, i) => ({
    gunAdi,
    gunNo: GUN_NOLARI[i],
    slotlar: tablo[i].map(([saat, durum]) => ({ saat, durum })),
  }));
}

// Antrenör tarafı — Mert Demir'in (Baş Antrenör · Basketbol) haftalık bireysel ders takvimi.
// Sporcu adları mevcut antrenör kadrosuyla (bkz. mock/antrenor.ts) aynı.
export const BIREYSEL_TESISLER = ['Salon 1', 'Salon 2', 'Dış Saha'];

export function bireyselTakvimHaftasi(): AntrenorTakvimGun[] {
  return [
    {
      gunAdi: 'Pzt', gunNo: '20', bloklar: [
        { id: 't20-1', saat: '15:30', tur: 'grup', baslik: 'U10 Basketbol Grubu', sub: 'Salon 1 · 12 sporcu' },
        { id: 't20-2', saat: '17:00', tur: 'grup', baslik: 'U12 Basketbol Grubu', sub: 'Salon 1 · 13 sporcu' },
        { id: 't20-3', saat: '18:30', tur: 'bos', baslik: '', sub: '' },
        { id: 't20-4', saat: '19:30', tur: 'bireysel', baslik: 'Deniz Aksoy · Bireysel', sub: 'Salon 2 · Tek ders' },
        { id: 't20-5', saat: '20:30', tur: 'bos', baslik: '', sub: '' },
      ],
    },
    {
      gunAdi: 'Sal', gunNo: '21', bloklar: [
        { id: 't21-1', saat: '16:00', tur: 'bireysel', baslik: 'Kaan Erdem · Bireysel', sub: 'Salon 2 · Paket 3/10' },
        { id: 't21-2', saat: '17:00', tur: 'bireysel', baslik: 'Ali Kaya · Bireysel', sub: 'Salon 2 · Onay bekliyor', bekliyor: true },
        { id: 't21-3', saat: '18:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't21-4', saat: '19:00', tur: 'grup', baslik: 'U14 Basketbol Grubu', sub: 'Salon 1 · 15 sporcu' },
        { id: 't21-5', saat: '20:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't21-6', saat: '21:00', tur: 'bireysel', baslik: 'Ege Aydın · Bireysel', sub: 'Dış Saha · Tek ders' },
      ],
    },
    {
      gunAdi: 'Çar', gunNo: '22', bloklar: [
        { id: 't22-1', saat: '16:00', tur: 'grup', baslik: 'U10 Basketbol Grubu', sub: 'Salon 1 · 12 sporcu' },
        { id: 't22-2', saat: '17:00', tur: 'grup', baslik: 'U12 Basketbol Grubu', sub: 'Salon 1 · 13 sporcu' },
        { id: 't22-3', saat: '18:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't22-4', saat: '19:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't22-5', saat: '20:00', tur: 'bireysel', baslik: 'Baran Koç · Bireysel', sub: 'Salon 2 · Paket 8/10' },
        { id: 't22-6', saat: '21:00', tur: 'bos', baslik: '', sub: '' },
      ],
    },
    {
      gunAdi: 'Per', gunNo: '23', bloklar: [
        { id: 't23-1', saat: '16:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't23-2', saat: '17:00', tur: 'bireysel', baslik: 'Toprak Sezer · Bireysel', sub: 'Salon 2 · Tek ders' },
        { id: 't23-3', saat: '18:00', tur: 'grup', baslik: 'U14 Basketbol Grubu', sub: 'Salon 1 · 15 sporcu' },
        { id: 't23-4', saat: '19:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't23-5', saat: '20:00', tur: 'bos', baslik: '', sub: '' },
      ],
    },
    {
      gunAdi: 'Cum', gunNo: '24', bloklar: [
        { id: 't24-1', saat: '16:00', tur: 'bireysel', baslik: 'Umut Karaca · Bireysel', sub: 'Salon 2 · Paket 5/10' },
        { id: 't24-2', saat: '17:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't24-3', saat: '18:00', tur: 'grup', baslik: 'U12 Basketbol Grubu', sub: 'Salon 1 · 13 sporcu' },
        { id: 't24-4', saat: '19:00', tur: 'grup', baslik: 'U14 Basketbol Grubu', sub: 'Salon 1 · 15 sporcu' },
        { id: 't24-5', saat: '20:00', tur: 'bos', baslik: '', sub: '' },
      ],
    },
    {
      gunAdi: 'Cmt', gunNo: '25', bloklar: [
        { id: 't25-1', saat: '09:00', tur: 'bireysel', baslik: 'Can Polat · Bireysel', sub: 'Dış Saha · Tek ders' },
        { id: 't25-2', saat: '10:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't25-3', saat: '11:00', tur: 'grup', baslik: 'Mini Basketbol Grubu', sub: 'Salon 1 · 6 sporcu' },
        { id: 't25-4', saat: '12:00', tur: 'bos', baslik: '', sub: '' },
        { id: 't25-5', saat: '13:00', tur: 'grup', baslik: 'Yetişkin Grup', sub: 'Salon 2 · 5 sporcu' },
        { id: 't25-6', saat: '14:00', tur: 'bireysel', baslik: 'Arda Güneş · Bireysel', sub: 'Dış Saha · Paket 2/10' },
      ],
    },
    {
      gunAdi: 'Paz', gunNo: '26', bloklar: [
        { id: 't26-1', saat: '09:00', tur: 'kapali', baslik: 'KAPALI · İstisna gün', sub: 'Tüm gün müsait değil' },
      ],
    },
  ];
}

export const BEKLEYEN_REZERVASYON: BekleyenRezervasyon = {
  id: 't21-2', gunNo: '21', saat: '17:00',
  sporcuAd: 'Ali Kaya', sporcuInit: 'AK',
  baslik: 'Ali Kaya · Bireysel Basketbol',
  detay: 'Salı 21 Temmuz · 17:00–18:00 · Salon 2 · Paketten (6/10)',
};

export const MUSAITLIK_VARSAYILAN: MusaitlikGunu[] = [
  { gun: 'Sal', saatAraligi: '16:00 – 20:00', aktif: true },
  { gun: 'Çar', saatAraligi: '18:00 – 21:00', aktif: true },
  { gun: 'Cum', saatAraligi: '16:00 – 17:00', aktif: true },
  { gun: 'Cmt', saatAraligi: '09:00 – 15:00', aktif: true },
  { gun: 'Paz', saatAraligi: 'Kapalı', aktif: false },
];

export const ISTISNA_VARSAYILAN: MusaitlikIstisna[] = [{ id: 'i1', etiket: '26 Temmuz Pazar · Tüm gün' }];

export const KAZANC_AYLAR: KazancAySecenegi[] = [
  { id: 'haz', ad: 'Haziran' },
  { id: 'tem', ad: 'Temmuz' },
];

export const KAZANC_HAM: Record<string, {
  ad: string; ad2: string; ders: number; ogrenci: number; brut: number;
  tamam: number; iptal: number; noshow: number; trend: string;
  haftalar: [string, number][]; aktifHafta: number; odeme: string; not: string;
}> = {
  tem: {
    ad: 'TEMMUZ', ad2: 'Temmuz', ders: 34, ogrenci: 11, brut: 24600,
    tamam: 34, iptal: 4, noshow: 2, trend: '+%18 · Hazirana göre',
    haftalar: [['1–5', 3600], ['6–12', 4480], ['13–19', 5240], ['20–26', 4160], ['27–31', 2200]],
    aktifHafta: 3, odeme: "Hakediş her ayın 5'inde IBAN'ınıza aktarılır",
    not: 'No-show seanslarda ders ücreti tahsil edilir — hakedişinize dahildir',
  },
  haz: {
    ad: 'HAZİRAN', ad2: 'Haziran', ders: 28, ogrenci: 9, brut: 20400,
    tamam: 28, iptal: 5, noshow: 1, trend: '+%9 · Mayısa göre',
    haftalar: [['1–7', 3400], ['8–14', 3120], ['15–21', 4000], ['22–28', 4320], ['29–30', 1480]],
    aktifHafta: -1, odeme: "Hakediş 5 Temmuz'da ödendi · Ziraat •••• 8412",
    not: 'Haziran hakedişi ödendi — dekont Mesajlar bölümünde',
  },
};
