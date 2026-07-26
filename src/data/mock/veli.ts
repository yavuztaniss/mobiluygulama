import type { ChildId } from '../../context/ChildContext';
import type {
  AnaSayfaOzet,
  Bildirim,
  IznAntrenman,
  Konusma,
  MagazaUrunVeli,
  RehberKisi,
  ServisTakip,
  VeliProfil,
} from '../types-veli';

// supabase/migrations/0004_kurum_ve_sporcular.sql'de Ali/Zeynep Kaya (Küme A)
// için sabitlenmiş gerçek uuid'ler — Faz 1'de ChildContext artık bunları
// döndürdüğü için bu mock dosyalardaki anahtarlar da bunlarla eşleşmeli
// (Faz 2/3'te bu dosyaların tamamı gerçek tabloya taşınınca kalkacak).
export const ALI_SPORCU_ID = '50000000-0000-0000-0000-000000000001';
export const ZEYNEP_SPORCU_ID = '50000016-0000-0000-0000-000000000001';

export const ANA_SAYFA: Record<ChildId, AnaSayfaOzet> = {
  [ALI_SPORCU_ID]: {
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
    // Not: aidat durumu artık `odeme` tablosundan canlı okunuyor (bkz. veliRepo.getAnaSayfa),
    // buradaki değer sadece tip uyumu için tutuluyor.
    aidat: { durum: 'gecikti', tutar: '₺1.250', sonOdeme: '18 Temmuz', taksit: '₺417' },
    // Not: duyurular artık `duyuru` tablosundan canlı okunuyor (bkz. veliRepo.getAnaSayfa),
    // buradaki boş dizi sadece tip uyumu için tutuluyor.
    duyurular: [],
  },
  [ZEYNEP_SPORCU_ID]: {
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
    duyurular: [],
  },
};

// Not: yoklama/gelişim (skills/calDays/pct) artık `yoklama`/`gelisim_degerlendirme` tablolarından
// canlı okunuyor (bkz. veliRepo.getYoklamaGelisim) — burada ayrı bir mock kopya tutulmuyor.

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

// TUM_DUYURULAR Faz 4'te kalktı — bkz. veliRepo.getTumDuyurular (gerçek `duyuru` tablosu).

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

// ETKINLIKLER/ETKINLIK_SONUCLARI Faz 4'te kalktı — bkz. veliRepo.getEtkinlikler/
// getEtkinlikSonuclari (gerçek `etkinlik`/`etkinlik_katilim` tabloları).

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
    { id: ALI_SPORCU_ID, ad: 'Ali Kaya', brans: 'Basketbol U12 · 2014 · Forma #7', belgeDurum: 'tam' },
    { id: ZEYNEP_SPORCU_ID, ad: 'Zeynep Kaya', brans: 'Yüzme U10 · 2016', belgeDurum: 'eksik' },
  ],
  belgeler: [
    { id: 'b1', ad: 'Sağlık Raporu · Ali', durum: 'Geçerli · 12 Mart 2027', aksiyonGerekli: false },
    { id: 'b2', ad: 'Sağlık Raporu · Zeynep', durum: 'Süresi doldu', aksiyonGerekli: true },
    { id: 'b3', ad: 'Veli İzin Formu · Ali', durum: 'Geçerli', aksiyonGerekli: false },
    { id: 'b4', ad: 'Fotoğraf İzni', durum: 'Onaylandı', aksiyonGerekli: false },
  ],
  odemeYontemi: 'Kredi kartı •••• 4521',
};
