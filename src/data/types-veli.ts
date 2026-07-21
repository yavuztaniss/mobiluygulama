import type { ChildId } from '../context/ChildContext';

export interface KulupDuyurusu {
  id: string;
  baslik: string;
  aciklama: string;
  zaman: string;
  tur: 'kamp' | 'servis' | 'basari';
}

export interface AnaSayfaOzet {
  bugunAntrenman: {
    var: boolean;
    branch: string;
    title: string;
    saat1: string;
    saat2: string;
    venue: string;
    coach: string;
    coachInit: string;
    coachRole: string;
    nextTraining?: string;
  };
  sonYoklama: { title: string; sub: string; pct: number; katildi: boolean };
  aidat: { durum: 'bekliyor' | 'gecikti' | 'odendi'; tutar: string; sonOdeme: string; taksit: string };
  duyurular: { id: string; baslik: string; aciklama: string; zaman: string; tur: 'kamp' | 'servis' | 'basari' }[];
}

export interface YoklamaGun {
  d: number;
  durum: 'katildi' | 'katilmadi' | 'planli' | 'bugun' | 'yok';
}

export interface GelisimBeceri {
  name: string;
  lvl: number;
}

export interface YoklamaGelisim {
  pct: number;
  attCount: number;
  missCount: number;
  planCount: number;
  trendText: string;
  calDays: YoklamaGun[];
  skills: GelisimBeceri[];
  noteText: string;
  noteDate: string;
  coach: string;
  coachInit: string;
}

export interface OdemeGecmisKalem {
  id: string;
  title: string;
  date: string;
  method: string;
  amount: string;
}

export interface OdemeOzet {
  durum: 'bekliyor' | 'gecikti' | 'odendi';
  tutar: string;
  kapsam: string;
  sonOdeme: string;
  taksit: string;
  odemeTarihi?: string;
  gecmis: OdemeGecmisKalem[];
}

export interface ServisTakip {
  hatAdi: string;
  plaka: string;
  soforAdi: string;
  soforInit: string;
  etaMin: number;
  etaClock: string;
  durum: string;
  suankiDurak: string;
  routePct: number;
  stopsLeft: number;
  bindiMesaji: string;
}

export interface MagazaUrunVeli {
  id: string;
  ad: string;
  aciklama: string;
  fiyat: string;
  fiyatN: number;
  kategori: string;
  badge?: string;
  jersey?: boolean;
}

export interface SepetKalem {
  urunId: string;
  ad: string;
  beden: string;
  fiyat: string;
  fiyatN: number;
  not: string;
}

export interface Konusma {
  id: string;
  init: string;
  ad: string;
  role: string;
  roleColor: string;
  avBg: string;
  avFg: string;
  son: string;
  zaman: string;
  unread: number;
}

export interface RehberKisi {
  id: string;
  ad: string;
  role: string;
  roleColor: string;
  init: string;
  avBg: string;
  avFg: string;
}

export interface ChatMesaj {
  who: 'c' | 'p';
  text: string;
  time: string;
}

export interface IznAntrenman {
  id: string;
  gun1: string;
  gun2: string;
  baslik: string;
  detay: string;
}

export interface Etkinlik {
  id: string;
  tag: string;
  title: string;
  sub: string;
  venue: string;
  extra: string;
  katilimDurumu: 'bekliyor' | 'katilir' | 'katilmaz';
}

export interface EtkinlikSonuc {
  id: string;
  r: string;
  rBg: string;
  rFg: string;
  score: string;
  opp: string;
  date: string;
  note: string;
}

export interface Bildirim {
  id: string;
  grup: 'bugun' | 'dun' | 'eski';
  baslik: string;
  aciklama: string;
  zaman: string;
  tur: 'yoklama' | 'odeme' | 'mesaj' | 'servis' | 'duyuru';
  okundu: boolean;
}

export interface VeliProfil {
  ad: string;
  telefon: string;
  eposta: string;
  cocuklar: { id: ChildId; ad: string; brans: string; belgeDurum: 'tam' | 'eksik' }[];
  belgeler: { id: string; ad: string; durum: string; aksiyonGerekli: boolean }[];
  odemeYontemi: string;
}
