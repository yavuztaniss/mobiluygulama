import type { AntrenorBildirim, AntrenorKonusma, AntrenorProfil, BugunkuGrup, GelisimKaydi, KadroSatiri, Sporcu, VeliBildirimi } from '../types-antrenor';

export const U12_SPORCULAR: Sporcu[] = [
  { id: 'ali', ad: 'Ali Kaya', init: 'AK', numara: 7, pct: 92, veliAd: 'Elif Kaya', veliTelefon: '0532 417 88 21' },
  { id: 'emir', ad: 'Emir Şahin', init: 'EŞ', numara: 4, pct: 96, veliAd: 'Burak Şahin', veliTelefon: '0533 221 44 09' },
  { id: 'kerem', ad: 'Kerem Yılmaz', init: 'KY', numara: 9, pct: 88, veliAd: 'Aslı Yılmaz', veliTelefon: '0535 620 11 47' },
  { id: 'deniz', ad: 'Deniz Aksoy', init: 'DA', numara: 11, pct: 90, veliAd: 'Merve Aksoy', veliTelefon: '0536 802 93 15' },
  { id: 'arda', ad: 'Arda Güneş', init: 'AG', numara: 12, pct: 84, veliAd: 'Hakan Güneş', veliTelefon: '0532 774 20 63' },
  { id: 'yusuf', ad: 'Yusuf Demirel', init: 'YD', numara: 8, pct: 100, veliAd: 'Nalan Demirel', veliTelefon: '0538 411 96 27' },
  { id: 'ege', ad: 'Ege Aydın', init: 'EA', numara: 23, pct: 76, veliAd: 'Serkan Aydın', veliTelefon: '0533 908 55 12' },
  { id: 'can', ad: 'Can Polat', init: 'CP', numara: 10, pct: 81, veliAd: 'Selin Polat', veliTelefon: '0532 111 22 33' },
  { id: 'baran', ad: 'Baran Koç', init: 'BK', numara: 6, pct: 94, veliAd: 'Emre Koç', veliTelefon: '0533 444 55 66' },
  { id: 'kaan', ad: 'Kaan Erdem', init: 'KE', numara: 15, pct: 89, veliAd: 'Derya Erdem', veliTelefon: '0535 777 88 99' },
  { id: 'toprak', ad: 'Toprak Sezer', init: 'TS', numara: 3, pct: 97, veliAd: 'Onur Sezer', veliTelefon: '0536 123 45 67' },
  { id: 'umut', ad: 'Umut Karaca', init: 'UK', numara: 14, pct: 85, veliAd: 'Gamze Karaca', veliTelefon: '0532 987 65 43' },
  { id: 'mert', ad: 'Mert Can Öz', init: 'MÖ', numara: 5, pct: 91, veliAd: 'Aylin Öz', veliTelefon: '0533 456 78 90' },
];

export const BUGUNKU_GRUPLAR: BugunkuGrup[] = [
  { id: 'u10', ad: 'U10 Basketbol', saat1: '15:30', saat2: '16:45', tesis: 'Salon 1', sporcuSayisi: 12, durum: 'tamamlandi', yoklamaAlindi: true, katilanSayisi: 11 },
  { id: 'u12', ad: 'U12 Basketbol', saat1: '17:00', saat2: '18:30', tesis: 'Mavişehir Spor Salonu · Salon 2', sporcuSayisi: 13, durum: 'simdi', yoklamaAlindi: false, izinliAd: 'Deniz Aksoy', izinliSebep: 'Hastalık' },
  { id: 'u14', ad: 'U14 Basketbol', saat1: '19:00', saat2: '20:30', tesis: 'Salon 2', sporcuSayisi: 15, durum: 'sirada', yoklamaAlindi: false },
];

export const VELI_BILDIRIMLERI: VeliBildirimi[] = [
  { id: 'v1', veliAd: 'Elif Kaya', sporcuAd: 'Ali Kaya', durum: 'gorundu', zaman: '17:32' },
  { id: 'v2', veliAd: 'Burak Şahin', sporcuAd: 'Emir Şahin', durum: 'gorundu', zaman: '17:31' },
  { id: 'v3', veliAd: 'Merve Aksoy', sporcuAd: 'Deniz Aksoy', durum: 'iletildi', zaman: '17:31' },
  { id: 'v4', veliAd: 'Serkan Aydın', sporcuAd: 'Ege Aydın', durum: 'ulasilamadi', zaman: '17:31' },
];

export const GELISIM_VARSAYILAN: Record<string, { beceriler: number[]; not: string; gonderildi: boolean }> = {
  ali: { beceriler: [4, 4, 3, 5], not: '', gonderildi: false },
  deniz: { beceriler: [3, 3, 4, 3], not: '', gonderildi: false },
  emir: { beceriler: [4, 3, 3, 4], not: 'Emir hızlı hücumda çok gelişti, bireysel savunmada tempo kazanıyor.', gonderildi: true },
  kerem: { beceriler: [2, 3, 3, 4], not: '', gonderildi: false },
  yusuf: { beceriler: [4, 4, 4, 4], not: 'Yusuf bu ay tüm antrenmanlara katıldı; ribaunt zamanlaması belirgin iyileşti.', gonderildi: true },
};

export const GELISIM_BECERI_ADLARI = ['Şut Tekniği', 'Top Sürme', 'Kondisyon', 'Takım Oyunu'];
export const GELISIM_NOT_SABLONLARI = ['Belirgin ilerleme var', 'Disiplinli çalışıyor', 'Takım oyununa katkısı arttı'];

export const KADRO_VARSAYILAN: KadroSatiri[] = U12_SPORCULAR.map((s, i) => ({
  id: s.id,
  ad: s.ad,
  numara: s.numara,
  lcv: i % 3 === 0 ? 'katiliyor' : i % 3 === 1 ? 'yanit-yok' : 'katilamiyor',
  secili: false,
}));

export const ANTRENOR_KONUSMALAR: AntrenorKonusma[] = [
  { id: 'a1', init: 'EK', ad: 'Elif Kaya', role: 'Veli · Ali Kaya', avBg: '#1D3560', avFg: '#9FE8CE', son: 'Teşekkürler hocam, Cuma erken geliriz.', zaman: '14:32', unread: 0 },
  { id: 'a2', init: 'MA', ad: 'Merve Aksoy', role: 'Veli · Deniz Aksoy', avBg: '#241A3E', avFg: '#E2C8FF', son: 'Deniz bugün hastalığı nedeniyle katılamayacak.', zaman: '09:12', unread: 1 },
  { id: 'a3', init: 'SY', ad: 'Serdar Koç', role: 'Yönetim', avBg: '#12303F', avFg: '#7DD8F0', son: 'Cuma antrenman saati değişikliği onaylandı.', zaman: 'Dün', unread: 0 },
];

export const ANTRENOR_BILDIRIMLER: AntrenorBildirim[] = [
  { id: 'ab1', grup: 'bugun', baslik: 'Deniz Aksoy için izin bildirimi', aciklama: 'Merve Aksoy: "Ateşi var, evde dinlenecek" · U12 Basketbol', zaman: '09:12', tur: 'izin', okundu: false },
  { id: 'ab2', grup: 'bugun', baslik: 'Yeni bireysel ders rezervasyonu', aciklama: 'Ali Kaya · Salı 17:00–18:00 · onayını bekliyor', zaman: '10:40', tur: 'rezervasyon', okundu: false },
  { id: 'ab3', grup: 'bugun', baslik: 'Merve Aksoy yeni mesaj gönderdi', aciklama: 'Deniz bugün hastalığı nedeniyle katılamayacak.', zaman: '09:12', tur: 'mesaj', okundu: false },
  { id: 'ab4', grup: 'dun', baslik: 'Yoklama hatırlatması', aciklama: 'U14 Basketbol · 19:00 antrenmanı için yoklama henüz kaydedilmedi', zaman: 'Dün 20:15', tur: 'yoklama', okundu: true },
  { id: 'ab5', grup: 'dun', baslik: 'Serdar Koç yeni mesaj gönderdi', aciklama: 'Cuma antrenman saati değişikliği onaylandı.', zaman: 'Dün 14:02', tur: 'mesaj', okundu: true },
  { id: 'ab6', grup: 'eski', baslik: 'Kadro yayınlandı', aciklama: 'Bornova U12 maçı için kadronuz velilere iletildi', zaman: '18 Temmuz', tur: 'sistem', okundu: true },
  { id: 'ab7', grup: 'eski', baslik: 'Gelişim değerlendirmesi hatırlatması', aciklama: 'Bu ay için 3 sporcunun gelişim notu henüz gönderilmedi', zaman: '15 Temmuz', tur: 'sistem', okundu: true },
];

export const ANTRENOR_PROFIL: AntrenorProfil = {
  ad: 'Mert Demir',
  rol: 'Baş Antrenör · Basketbol',
  telefon: '0532 555 12 34',
  eposta: 'mert.demir@…',
  gruplar: [
    { ad: 'U10 Basketbol', sporcuSayisi: 12 },
    { ad: 'U12 Basketbol', sporcuSayisi: 13 },
    { ad: 'U14 Basketbol', sporcuSayisi: 15 },
  ],
};
