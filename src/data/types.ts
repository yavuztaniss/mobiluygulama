export interface Sube {
  id: string;
  ad: string;
  altBilgi: string;
}

// Tüm alanlar gerçek tablolardan hesaplanır (bkz. yoneticiRepo.getOzet).
// bellCount kaldırıldı — yönetici bildirim merkezi yok, sahte rozet gösterilmiyor.
export interface YoneticiOzet {
  subeAd: string;
  tarihEtiketi: string;
  kpiSporcu: number;
  kpiSporcuArtis: string; // bu ay eklenen sporcu sayısı (sporcular.created_at)
  kpiTahsilat: string;
  kpiTahsilatAlt: string; // bu ayki ödeme işlem sayısı (eski sahte "Hedef" metni yerine)
  kpiGeciken: number;
  kpiGecikenTutar: string;
  yoklamaOrani: number;
  bugunAntrenman: number; // bugünkü antrenman sayısı (antrenman.tarih = bugün)
  tahsilatSonAltiAy: { ay: string; tutar: number }[];
}

export type OdemeDurumu = 'guncel' | 'gecikmis';

export interface Sporcu {
  id: string;
  init: string;
  ad: string;
  grup: string;
  brans: string;
  odemeDurumu: OdemeDurumu;
  veliAd: string;
  veliTelefon: string;
  veliYakinlik: string;
}

export interface YoklamaGunu {
  gun: number;
  durum: 'katildi' | 'gelmedi' | 'planli';
}

export interface OdemeKaydi {
  id: string;
  baslik: string;
  tutar: string;
  durum: 'gecikti' | 'odendi' | 'bekliyor';
  detay: string;
}

export interface GelisimNotu {
  metin: string;
  yazan: string;
  tarih: string;
}

export interface SporcuDetay extends Sporcu {
  sube: string;
  yoklamaOrani: number | null; // null: henüz yoklama kaydı yok (ekran '—' gösterir)
  aylikAidat: string; // aidat planı bağlanamadıysa '—'
  kayitTarihi: string;
  calDays: YoklamaGunu[];
  odemeGecmisi: OdemeKaydi[];
  gelisimNotlari: GelisimNotu[];
}

export interface AidatPlani {
  id: string;
  ad: string;
  alt: string;
  fiyat: string;
  beklenen: string;
}

export type OdemeYontemi = 'kart' | 'havale' | 'elden';

export interface TahsilatKaydi {
  id: string;
  ad: string;
  ne: string;
  sub: string;
  tutar: string;
  yontem: OdemeYontemi;
  grup: string;
}

export interface GelirGiderAy {
  ay: string;
  gelir: number;
  gider: number;
}

export interface GelirKategori {
  ad: string;
  tutar: string;
  pct: string;
  renkAnahtar: 'accent' | 'info' | 'warning' | 'purple';
}

export interface TakvimBlok {
  id: string;
  saat1: string;
  saat2: string;
  baslik: string;
  alt: string;
  tesis: string;
  live?: boolean;
  bireysel?: boolean;
  kaynak?: 'antrenman' | 'etkinlik';
  turEtiketi?: string;
}

export interface TakvimGun {
  tarih: string;
  gunAdi: string;
  gunNo: string;
  tesisler: string[];
  bloklar: TakvimBlok[];
}

export interface ServisDurak {
  id: string;
  ad: string;
  sub: string;
  saat: string;
  durum: 'gecti' | 'suan' | 'bekliyor';
}

export interface ServisSporcu {
  id: string;
  ad: string;
  init: string;
  durakAd: string;
  veliAd: string;
  veliTelefon: string;
}

export interface ServisRota {
  id: string;
  ad: string;
  sofor: string;
  /** servis_rota.sofor_telefon (0018) — boşsa ekranlar "Ara" butonunu göstermez. */
  soforTelefon: string | null;
  plaka: string;
  arac: string;
  alt: string;
  sporcuSayisi: number;
  yolda: boolean;
  durumTxt: string;
  konumSaat: string;
  konumHiz: string;
  duraklar: ServisDurak[];
  sporcular: ServisSporcu[];
}

// MagazaUrun/MagazaSiparis/SiparisDurum Faz 6'da src/data/types-magaza.ts'e taşındı
// (rol-bağımsız Urun/Siparis — hem Yönetici hem Veli aynı gerçek katalogu kullanıyor).

export type EtkinlikTuru = 'mac' | 'turnuva' | 'kamp';

export interface Etkinlik {
  id: string;
  tur: EtkinlikTuru;
  baslik: string;
  grup: string;
  tesis: string;
  tarih: string;
  saat: string;
  lcv: boolean;
  ucretli: boolean;
  tutar?: string;
}

export type BasvuruTag = 'DENEME' | 'KAYIT';
export type BasvuruDurum = 'bekliyor' | 'onaylandi' | 'reddedildi';

export interface Basvuru {
  id: string;
  init: string;
  ad: string;
  altBilgi: string;
  detay: string;
  veli: string;
  when: string;
  tag: BasvuruTag;
  avBg: string;
  avFg: string;
  durum: BasvuruDurum;
  grupId?: string | null;
}

export interface AntrenorKalem {
  n: string;
  v: string;
}

export interface AntrenorHakedis {
  id: string;
  init: string;
  ad: string;
  rol: string;
  ders: number;
  birim: string;
  grup: number;
  tutarN: number;
  avBg: string;
  avFg: string;
  kalemler: AntrenorKalem[];
  odendi: boolean;
}

export interface FinansOzet {
  subeAd: string; // gerçek sube.ad (başlık etiketi için)
  planlar: AidatPlani[];
  tahsilatlar: TahsilatKaydi[];
  islemSayisi: number;
  tahsilatToplam: string;
  ggAylar: GelirGiderAy[];
  kategoriler: GelirKategori[];
  kategoriToplam: string; // kategori kartındaki donut merkezi (aidat+mağaza+bireysel)
  toplamGelir: string;
  toplamGider: string;
  net: string;
}

export interface Brans {
  id: string;
  ad: string;
  ikon: string;
}

export interface HizmetTuruSecenegi {
  id: string;
  ad: string;
  aciklama: string;
  ikon: string;
}

export interface KurumBranslariDurumu {
  seciliBranslar: string[];
  seciliHizmetTurleri: string[];
}

// BagimsizAntrenorBasvurusu kaldırıldı — sahte bekleme listesi sayacı
// (beklemeSirasi=214) temizlendi, akış gerçek bir tabloya bağlanana dek
// "yakında" bilgilendirmesine dönüştürüldü (bkz. kurum-branslari.tsx).

export interface DuyuruHedefi {
  id: string;
  ad: string;
  veliSayisi: number;
}

export type DuyuruTuru = 'kamp' | 'servis' | 'basari' | 'genel';

// DuyuruTaslak kaldırıldı — duyuru formu artık boş açılıyor, örnek metinler placeholder.

export interface DuyuruGonderSonuc {
  veliSayisi: number;
  smsIle: boolean;
  /** Expo Push API'ye gerçekten iletilen cihaz sayısı — kayıtlı token yoksa 0. */
  pushCihaz: number;
}
