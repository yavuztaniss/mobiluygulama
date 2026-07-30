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

/**
 * Bir antrenmanın kimlik/başlık bilgisi. Yoklama Özeti ekranı hangi grubun
 * özetini gösterdiğini başlıkta yazabilsin diye var — `getBugunkuGruplar`
 * yalnızca BUGÜNÜ döndürdüğünden, route param'la gelen id bugüne ait değilse
 * başlık bununla çözülür.
 */
export interface AntrenmanBaslik {
  id: string;
  ad: string;
  saat1: string;
  saat2: string;
  tesis: string;
  /** 'YYYY-MM-DD' */
  tarih: string;
}

export type YoklamaDurum = 'in' | 'out' | null;

export interface YoklamaSatiri {
  id: string;
  ad: string;
  init: string;
  durum: YoklamaDurum;
  izinli: boolean;
  izinDetay?: string;
  /** Yoklama Özeti'ndeki "Ara" butonu için (sporcular.veli_telefon) — yoklama-al kullanmaz. */
  veliTelefon?: string;
}

// VeliBildirimi kaldırıldı — sahte "İletildi/Görüldü/Ulaşılamadı" teslim-durumu listesiydi;
// gerçek bir push/teslim altyapısı olmadığından yoklama-ozet ekranından tamamen çıkarıldı.

export interface GelisimBeceriSatiri {
  ad: string;
  seviye: number;
  beceriId: string;
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

// AntrenorKonusma Faz 5'te src/data/types-mesaj.ts'e taşındı (rol-bağımsız KonusmaSatir).

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
