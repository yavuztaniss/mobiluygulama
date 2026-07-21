export interface Sporcu {
  id: string;
  ad: string;
  init: string;
  numara: number;
  pct: number;
  veliAd: string;
  veliTelefon: string;
}

export interface BugunkuGrup {
  id: string;
  ad: string;
  saat1: string;
  saat2: string;
  tesis: string;
  sporcuSayisi: number;
  durum: 'tamamlandi' | 'simdi' | 'sirada';
  yoklamaAlindi: boolean;
  katilanSayisi?: number;
  izinliAd?: string;
  izinliSebep?: string;
}

export type YoklamaDurum = 'in' | 'out' | null;

export interface YoklamaSatiri {
  id: string;
  ad: string;
  init: string;
  durum: YoklamaDurum;
  izinli: boolean;
  izinDetay?: string;
}

export interface VeliBildirimi {
  id: string;
  veliAd: string;
  sporcuAd: string;
  durum: 'iletildi' | 'gorundu' | 'ulasilamadi';
  zaman: string;
}

export interface GelisimBeceriSatiri {
  ad: string;
  seviye: number;
}

export interface GelisimKaydi {
  sporcuId: string;
  beceriler: GelisimBeceriSatiri[];
  not: string;
  gonderildi: boolean;
  tarih?: string;
}

export interface KadroSatiri {
  id: string;
  ad: string;
  numara: number;
  lcv: 'katiliyor' | 'katilamiyor' | 'yanit-yok';
  secili: boolean;
}

export interface AntrenorKonusma {
  id: string;
  init: string;
  ad: string;
  role: string;
  avBg: string;
  avFg: string;
  son: string;
  zaman: string;
  unread: number;
}

export interface AntrenorProfil {
  ad: string;
  rol: string;
  telefon: string;
  eposta: string;
  gruplar: { ad: string; sporcuSayisi: number }[];
}

export type AntrenorBildirimGrup = 'bugun' | 'dun' | 'eski';
export type AntrenorBildirimTuru = 'izin' | 'mesaj' | 'rezervasyon' | 'yoklama' | 'sistem';

export interface AntrenorBildirim {
  id: string;
  grup: AntrenorBildirimGrup;
  baslik: string;
  aciklama: string;
  zaman: string;
  tur: AntrenorBildirimTuru;
  okundu: boolean;
}
