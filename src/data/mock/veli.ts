import type { ChildId } from '../../context/ChildContext';
import type { AnaSayfaOzet, Bildirim, VeliProfil } from '../types-veli';

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

// SERVIS_TAKIP Faz 6'da kalktı — bkz. veliRepo.getServisTakip (gerçek `servis_rota`/
// `servis_durak`/`servis_sporcu` tabloları). MAGAZA_KATEGORILER/MAGAZA_URUNLER Faz 6'da
// kalktı — bkz. magazaRepo.ts (gerçek `urun` tablosu, Yönetici ile aynı katalog).

// KONUSMALAR/REHBER Faz 5'te kalktı — bkz. mesajRepo.ts (gerçek `konusma`/`mesaj`
// tabloları, gerçek `sporcu_antrenor`⋈`veli_sporcu` ilişkisinden türetilen rehber).
// TUM_DUYURULAR Faz 4'te kalktı — bkz. veliRepo.getTumDuyurular (gerçek `duyuru` tablosu).

// IZIN_ANTRENMANLAR Faz 6'da kalktı — bkz. veliRepo.getIznAntrenmanlar (gerçek `antrenman`
// tablosu). IZIN_SEBEPLERI hâlâ geçerli bir statik seçenek listesi (gerçek bir tablo gerektirmiyor).
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
