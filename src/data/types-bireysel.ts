export interface BireyselAntrenor {
  id: string;
  ad: string;
  init: string;
  brans: string;
  deneyim: number;
  puan: string;
  dersSayisi: number;
  musait: boolean;
  ilkBosEtiket?: string;
  tekFiyatN: number;
  paketFiyatN: number;
  bio: string;
  avBg: string;
  avFg: string;
}

export type BireyselSlotDurum = 'musait' | 'dolu' | 'grup';

export interface BireyselSlot {
  saat: string;
  durum: BireyselSlotDurum;
}

export interface BireyselGunSlotlari {
  gunAdi: string;
  gunNo: string;
  slotlar: BireyselSlot[];
  // 0041: hafta Pazartesi–Pazar döndüğü için haftanın GEÇMİŞ günleri de listede.
  // Geçmişe rezervasyon veritabanı düzeyinde reddediliyor (veli INSERT
  // politikası `tarih >= current_date`); ekran da o günleri seçtirmemeli, yoksa
  // kullanıcı slot seçip "rezervasyon oluşturulamadı" duvarına çarpıyor.
  gecmis: boolean;
}

export interface BireyselPaketDurumu {
  kalan: number;
  toplam: number;
}

export type BireyselOdemeTipi = 'tek' | 'paket';

export interface BireyselRezervasyonSonuc {
  odemeNotu: string;
  kalanPaket?: number;
}

// Antrenör tarafı — bireysel ders takvimi
export type TakvimBlokTuru = 'grup' | 'bireysel' | 'bos' | 'kapali';

export interface AntrenorTakvimBlok {
  id: string;
  saat: string;
  tur: TakvimBlokTuru;
  baslik: string;
  sub: string;
  bekliyor?: boolean;
  rezervasyonId?: string;
  sonuclandirilabilir?: boolean;
}

export interface AntrenorTakvimGun {
  gunAdi: string;
  gunNo: string;
  bloklar: AntrenorTakvimBlok[];
}

export interface BekleyenRezervasyon {
  id: string;
  gunNo: string;
  saat: string;
  sporcuAd: string;
  sporcuInit: string;
  baslik: string;
  detay: string;
}

export interface MusaitlikGunu {
  gun: string;
  saatAraligi: string;
  aktif: boolean;
}

export interface MusaitlikIstisna {
  id: string;
  etiket: string;
}

export interface KazancAySecenegi {
  id: string;
  ad: string;
}

export interface KazancHaftaBar {
  ad: string;
  val: string;
  pct: number;
  aktif: boolean;
}

export interface KazancOzet {
  ayAd: string;
  ayAd2: string;
  net: string;
  brut: string;
  kulupPay: string;
  odemeNotu: string;
  trend: string;
  dersAdet: number;
  saat: number;
  ogrenci: number;
  ortalamaDersUcret: string;
  toplamSeans: number;
  tamamlanan: number;
  tamamlananPct: number;
  iptal: number;
  iptalPct: number;
  noshow: number;
  noshowPct: number;
  haftalar: KazancHaftaBar[];
  altNot: string;
}
