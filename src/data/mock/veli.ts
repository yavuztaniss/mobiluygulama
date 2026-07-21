import type { ChildId } from '../../context/ChildContext';
import type {
  AnaSayfaOzet,
  Bildirim,
  Etkinlik,
  EtkinlikSonuc,
  IznAntrenman,
  Konusma,
  KulupDuyurusu,
  MagazaUrunVeli,
  OdemeOzet,
  RehberKisi,
  ServisTakip,
  VeliProfil,
  YoklamaGelisim,
} from '../types-veli';

export const ANA_SAYFA: Record<ChildId, AnaSayfaOzet> = {
  ali: {
    bugunAntrenman: {
      var: true,
      branch: 'Basketbol',
      title: 'U12 Antrenmanı',
      saat1: '17:00',
      saat2: '18:30',
      venue: 'Merkez Tesis · Salon 1',
      coach: 'Mert Demir',
      coachInit: 'MD',
      coachRole: 'Baş Antrenör',
    },
    sonYoklama: { title: 'Cumartesi antrenmanı', sub: 'U12 Basketbol · Salon 1', pct: 91, katildi: true },
    // Not: aidat durumu artık src/data/paymentLedger.ts'ten canlı okunuyor (bkz. veliRepo.getAnaSayfa),
    // buradaki değer sadece tip uyumu için tutuluyor.
    aidat: { durum: 'gecikti', tutar: '₺1.250', sonOdeme: '18 Temmuz', taksit: '₺417' },
    duyurular: [
      { id: 'd1', baslik: 'Yaz kampı kayıtları açıldı', aciklama: 'Foça Yaz Kampı · 10–17 Ağustos · Erken kayıtta %15 indirim', zaman: '2 sa', tur: 'kamp' },
      { id: 'd2', baslik: 'Cumartesi servis saatleri güncellendi', aciklama: "Mavişehir hattı kalkışı 08:30'a alındı", zaman: 'Dün', tur: 'servis' },
      { id: 'd3', baslik: 'U12 takımımız İzmir il şampiyonu!', aciklama: "Finalde 64–58'lik galibiyetle kupayı kaldırdık", zaman: '3 gün', tur: 'basari' },
    ],
  },
  zeynep: {
    bugunAntrenman: {
      var: false,
      branch: 'Yüzme',
      title: '',
      saat1: '',
      saat2: '',
      venue: '',
      coach: '',
      coachInit: '',
      coachRole: '',
      nextTraining: 'Çarşamba 18:00 · Havuz',
    },
    sonYoklama: { title: 'Salı antrenmanı', sub: 'U10 Yüzme · Havuz', pct: 88, katildi: true },
    aidat: { durum: 'odendi', tutar: '₺1.100', sonOdeme: '12 Temmuz', taksit: '₺367' },
    duyurular: [
      { id: 'd1', baslik: 'Yaz kampı kayıtları açıldı', aciklama: 'Foça Yaz Kampı · 10–17 Ağustos · Erken kayıtta %15 indirim', zaman: '2 sa', tur: 'kamp' },
      { id: 'd2', baslik: 'Cumartesi servis saatleri güncellendi', aciklama: "Mavişehir hattı kalkışı 08:30'a alındı", zaman: 'Dün', tur: 'servis' },
    ],
  },
};

export const YOKLAMA_GELISIM: Record<ChildId, YoklamaGelisim> = {
  ali: {
    pct: 91,
    attCount: 21,
    missCount: 2,
    planCount: 4,
    trendText: 'Son aya göre +6 puan',
    calDays: Array.from({ length: 28 }, (_, i) => {
      const d = i + 1;
      const durum = [3, 17].includes(d) ? 'katilmadi' : [21, 22, 24, 25].includes(d) ? 'planli' : d > 20 ? 'yok' : 'katildi';
      return { d, durum: durum as 'katildi' | 'katilmadi' | 'planli' | 'yok' };
    }),
    skills: [
      { name: 'Şut Tekniği', lvl: 4 },
      { name: 'Savunma', lvl: 3 },
      { name: 'Takım Oyunu', lvl: 5 },
      { name: 'Kondisyon', lvl: 4 },
    ],
    noteText: 'Şut tekniğinde bu ay belirgin ilerleme var. Savunmada el pozisyonu üzerinde çalışmaya devam ediyoruz.',
    noteDate: '19 Temmuz',
    coach: 'Mert Demir',
    coachInit: 'MD',
  },
  zeynep: {
    pct: 88,
    attCount: 19,
    missCount: 3,
    planCount: 3,
    trendText: 'Son aya göre +3 puan',
    calDays: Array.from({ length: 28 }, (_, i) => {
      const d = i + 1;
      const durum = [8, 15].includes(d) ? 'katilmadi' : [21, 23].includes(d) ? 'planli' : d > 20 ? 'yok' : 'katildi';
      return { d, durum: durum as 'katildi' | 'katilmadi' | 'planli' | 'yok' };
    }),
    skills: [
      { name: 'Serbest Stil', lvl: 4 },
      { name: 'Sırtüstü', lvl: 3 },
      { name: 'Nefes Kontrolü', lvl: 4 },
      { name: 'Dayanıklılık', lvl: 3 },
    ],
    noteText: 'Nefes ritminde güzel gelişim var. Dönüş tekniğine önümüzdeki ay ağırlık vereceğiz.',
    noteDate: '18 Temmuz',
    coach: 'Seda Aydın',
    coachInit: 'SA',
  },
};

export const ODEME_OZET: Record<ChildId, OdemeOzet> = {
  ali: {
    durum: 'gecikti',
    tutar: '₺1.250',
    kapsam: 'Temmuz aidatı · Basketbol U12',
    sonOdeme: '18 Temmuz',
    taksit: '₺417',
    gecmis: [
      { id: 'p1', title: 'Haziran aidatı', date: '10 Haziran', method: 'Kredi kartı •••• 4521', amount: '₺1.250' },
      { id: 'p2', title: 'Mayıs aidatı', date: '8 Mayıs', method: 'Kredi kartı •••• 4521', amount: '₺1.250' },
      { id: 'p3', title: 'Nisan aidatı', date: '9 Nisan', method: 'Havale / EFT', amount: '₺1.250' },
    ],
  },
  zeynep: {
    durum: 'odendi',
    tutar: '₺1.100',
    kapsam: 'Temmuz aidatı · Yüzme U10',
    sonOdeme: '12 Temmuz',
    taksit: '₺367',
    odemeTarihi: '12 Temmuz',
    gecmis: [
      { id: 'p1', title: 'Temmuz aidatı', date: '12 Temmuz', method: 'Kredi kartı •••• 4521', amount: '₺1.100' },
      { id: 'p2', title: 'Haziran aidatı', date: '9 Haziran', method: 'Kredi kartı •••• 4521', amount: '₺1.100' },
      { id: 'p3', title: 'Mayıs aidatı', date: '10 Mayıs', method: 'Kredi kartı •••• 4521', amount: '₺1.100' },
    ],
  },
};

export const SERVIS_TAKIP: ServisTakip = {
  hatAdi: 'Akşam Servisi · Hat 3',
  plaka: '34 KS 1907',
  soforAdi: 'Hasan Yıldız',
  soforInit: 'HY',
  etaMin: 14,
  etaClock: '18:05',
  durum: 'Yolda',
  suankiDurak: 'Bostanlı İskele',
  routePct: 62,
  stopsLeft: 2,
  bindiMesaji: "Ali 17:42'de servise bindi — Mert Hoca onayladı",
};

export const MAGAZA_KATEGORILER = ['Tümü', 'Forma', 'Giyim', 'Aksesuar'];

export const MAGAZA_URUNLER: MagazaUrunVeli[] = [
  { id: 'm1', ad: '2026 Sezon Forması', aciklama: 'İsim + numara baskısı hediye', fiyat: '₺450', fiyatN: 450, kategori: 'Forma', badge: 'YENİ', jersey: true },
  { id: 'm2', ad: 'Antrenman Eşofmanı', aciklama: 'Nefes alabilir kumaş', fiyat: '₺620', fiyatN: 620, kategori: 'Giyim' },
  { id: 'm3', ad: 'Kulüp Şapkası', aciklama: 'Ayarlanabilir kayış', fiyat: '₺240', fiyatN: 240, kategori: 'Aksesuar' },
  { id: 'm4', ad: 'Spor Çantası', aciklama: '40L · su geçirmez', fiyat: '₺380', fiyatN: 380, kategori: 'Aksesuar' },
  { id: 'm5', ad: 'Kulüp Tişörtü', aciklama: 'Pamuklu · unisex kesim', fiyat: '₺210', fiyatN: 210, kategori: 'Giyim' },
  { id: 'm6', ad: 'Kulüp Matarası', aciklama: '750ml · paslanmaz çelik', fiyat: '₺120', fiyatN: 120, kategori: 'Aksesuar' },
];

export const KONUSMALAR: Konusma[] = [
  { id: 'k1', init: 'MD', ad: 'Mert Demir', role: 'Baş Antrenör', roleColor: '#2EE6A8', avBg: '#1D3560', avFg: '#9FE8CE', son: 'Rica ederim, iyi akşamlar dilerim.', zaman: '14:32', unread: 0 },
  { id: 'k2', init: 'KY', ad: 'Kulüp Yönetimi', role: 'Kulüp', roleColor: '#5AA7FF', avBg: '#12303F', avFg: '#7DD8F0', son: 'Temmuz aidatınız için teşekkürler.', zaman: 'Dün', unread: 1 },
  { id: 'k3', init: 'HY', ad: 'Hasan Yıldız', role: 'Servis Şoförü', roleColor: '#FFB454', avBg: '#241A3E', avFg: '#FFD9A0', son: 'Bugün servis 5 dk gecikmeli olacak.', zaman: 'Dün', unread: 0 },
];

export const TUM_DUYURULAR: KulupDuyurusu[] = [
  { id: 'd1', baslik: 'Yaz kampı kayıtları açıldı', aciklama: 'Foça Yaz Kampı · 10–17 Ağustos · Erken kayıtta %15 indirim', zaman: '2 sa', tur: 'kamp' },
  { id: 'd2', baslik: 'Cumartesi servis saatleri güncellendi', aciklama: "Mavişehir hattı kalkışı 08:30'a alındı", zaman: 'Dün', tur: 'servis' },
  { id: 'd3', baslik: 'U12 takımımız İzmir il şampiyonu!', aciklama: "Finalde 64–58'lik galibiyetle kupayı kaldırdık", zaman: '3 gün', tur: 'basari' },
  { id: 'd4', baslik: 'Bireysel ders modülü yayında', aciklama: 'Kulüp antrenörlerinden birebir ders artık uygulama üzerinden rezerve edilebiliyor', zaman: '4 gün', tur: 'kamp' },
  { id: 'd5', baslik: 'Yeni servis hattı: Bostanlı', aciklama: 'Bostanlı İskele durağı Mavişehir hattına eklendi', zaman: '5 gün', tur: 'servis' },
  { id: 'd6', baslik: 'Ağustos ayı antrenman takvimi yayınlandı', aciklama: 'Bayram tatili nedeniyle 30 Ağustos–2 Eylül arası antrenman yok', zaman: '1 hafta', tur: 'kamp' },
  { id: 'd7', baslik: 'U14 takımımız bölge yarı finalinde', aciklama: '2 Ağustos Cumartesi · Bornova Spor Salonu · 11:00', zaman: '1 hafta', tur: 'basari' },
];

export const REHBER: RehberKisi[] = [
  { id: 'r1', ad: 'Emre Hoca', role: 'Tenis Antrenörü', roleColor: '#2EE6A8', init: 'EH', avBg: '#1D3560', avFg: '#9FE8CE' },
  { id: 'r2', ad: 'Seda Hoca', role: 'Yüzme Antrenörü', roleColor: '#2EE6A8', init: 'SH', avBg: '#12303F', avFg: '#7DD8F0' },
  { id: 'r3', ad: 'Aylin Hoca', role: 'Jimnastik Antrenörü', roleColor: '#2EE6A8', init: 'AH', avBg: '#2A2138', avFg: '#FFD9A0' },
  { id: 'r4', ad: 'Muhasebe', role: 'Kulüp', roleColor: '#5AA7FF', init: 'MH', avBg: '#12303F', avFg: '#7DD8F0' },
];

export const IZIN_ANTRENMANLAR: IznAntrenman[] = [
  { id: 'a1', gun1: 'ÇAR', gun2: '22', baslik: 'U12 Basketbol Antrenmanı', detay: '17:00 · Salon 1' },
  { id: 'a2', gun1: 'CUM', gun2: '24', baslik: 'U12 Basketbol Antrenmanı', detay: '17:00 · Salon 1' },
  { id: 'a3', gun1: 'PZT', gun2: '27', baslik: 'U12 Basketbol Antrenmanı', detay: '17:00 · Salon 1' },
];

export const IZIN_SEBEPLERI = ['Hastalık', 'Aile etkinliği', 'Okul/Sınav', 'Tatil', 'Diğer'];

export const ETKINLIKLER: Etkinlik[] = [
  { id: 'e1', tag: 'MAÇ', title: 'Bornova U12', sub: 'Salı, 25 Temmuz · 11:00', venue: 'Merkez Tesis · Salon 1', extra: 'Deplasman değil · ev sahibi', katilimDurumu: 'bekliyor' },
  { id: 'e2', tag: 'TURNUVA', title: 'Ege Kupası U12', sub: 'Cumartesi, 2 Ağustos · 09:00', venue: 'Bornova Spor Salonu', extra: 'Tüm gün · öğle yemeği dahil', katilimDurumu: 'katilir' },
];

export const ETKINLIK_SONUCLARI: EtkinlikSonuc[] = [
  { id: 's1', r: 'G', rBg: 'rgba(46,230,168,0.14)', rFg: '#2EE6A8', score: '64 – 58', opp: 'Bornova SK', date: '14 Temmuz', note: 'İl şampiyonu olduk 🏆' },
  { id: 's2', r: 'G', rBg: 'rgba(46,230,168,0.14)', rFg: '#2EE6A8', score: '52 – 41', opp: 'Karşıyaka Yıldız', date: '7 Temmuz', note: 'Yarı final galibiyeti' },
  { id: 's3', r: 'M', rBg: 'rgba(255,107,122,0.14)', rFg: '#FF6B7A', score: '38 – 45', opp: 'Alsancak Gençlik', date: '28 Haziran', note: 'Grup maçı' },
];

export const BILDIRIMLER: Bildirim[] = [
  { id: 'n1', grup: 'bugun', baslik: 'Yoklama alındı', aciklama: 'Ali bugünkü antrenmana katıldı', zaman: '2 sa', tur: 'yoklama', okundu: false },
  { id: 'n2', grup: 'bugun', baslik: 'Yeni mesaj', aciklama: 'Mert Demir bir mesaj gönderdi', zaman: '3 sa', tur: 'mesaj', okundu: false },
  { id: 'n3', grup: 'dun', baslik: 'Aidat hatırlatması', aciklama: 'Temmuz aidatının son ödeme tarihi yaklaşıyor', zaman: 'Dün', tur: 'odeme', okundu: true },
  { id: 'n4', grup: 'dun', baslik: 'Servis güncellemesi', aciklama: "Mavişehir hattı kalkışı 08:30'a alındı", zaman: 'Dün', tur: 'servis', okundu: true },
  { id: 'n5', grup: 'eski', baslik: 'Yeni duyuru', aciklama: 'Yaz kampı kayıtları açıldı', zaman: '3 gün', tur: 'duyuru', okundu: true },
];

export const VELI_PROFIL: VeliProfil = {
  ad: 'Elif Kaya',
  telefon: '0532 ••• 41 07',
  eposta: 'elif.kaya@…',
  cocuklar: [
    { id: 'ali', ad: 'Ali Kaya', brans: 'Basketbol U12 · 2014 · Forma #7', belgeDurum: 'tam' },
    { id: 'zeynep', ad: 'Zeynep Kaya', brans: 'Yüzme U10 · 2016', belgeDurum: 'eksik' },
  ],
  belgeler: [
    { id: 'b1', ad: 'Sağlık Raporu · Ali', durum: 'Geçerli · 12 Mart 2027', aksiyonGerekli: false },
    { id: 'b2', ad: 'Sağlık Raporu · Zeynep', durum: 'Süresi doldu', aksiyonGerekli: true },
    { id: 'b3', ad: 'Veli İzin Formu · Ali', durum: 'Geçerli', aksiyonGerekli: false },
    { id: 'b4', ad: 'Fotoğraf İzni', durum: 'Onaylandı', aksiyonGerekli: false },
  ],
  odemeYontemi: 'Kredi kartı •••• 4521',
};
