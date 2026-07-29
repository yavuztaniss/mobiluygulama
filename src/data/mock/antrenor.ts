import type { AntrenorBildirim, AntrenorProfil, VeliBildirimi } from '../types-antrenor';

// Roster (U12_SPORCULAR), bugünkü program (BUGUNKU_GRUPLAR), yoklama başlangıç durumu ve
// gelişim varsayılanları Faz 3'te; Maç Kadrosu (KADRO_VARSAYILAN) Faz 4'te gerçek tabloya
// taşındı (bkz. antrenorRepo.ts + supabase/migrations/0008_yoklama_gelisim.sql,
// 0009_duyuru_etkinlik.sql).

export const VELI_BILDIRIMLERI: VeliBildirimi[] = [
  { id: 'v1', veliAd: 'Elif Kaya', sporcuAd: 'Ali Kaya', durum: 'gorundu', zaman: '17:32' },
  { id: 'v2', veliAd: 'Burak Şahin', sporcuAd: 'Emir Şahin', durum: 'gorundu', zaman: '17:31' },
  { id: 'v3', veliAd: 'Merve Aksoy', sporcuAd: 'Deniz Aksoy', durum: 'iletildi', zaman: '17:31' },
  { id: 'v4', veliAd: 'Serkan Aydın', sporcuAd: 'Ege Aydın', durum: 'ulasilamadi', zaman: '17:31' },
];

// GELISIM_VARSAYILAN/GELISIM_BECERI_ADLARI Faz 3'te kalktı (gerçek gelisim_degerlendirme/
// beceri tabloları) — GELISIM_NOT_SABLONLARI hâlâ kullanılıyor (antrenörün not yazarken
// seçebileceği hazır cümle şablonları, veri değil sabit UI önerisi).
export const GELISIM_NOT_SABLONLARI = ['Belirgin ilerleme var', 'Disiplinli çalışıyor', 'Takım oyununa katkısı arttı'];

// ANTRENOR_KONUSMALAR Faz 5'te kalktı — bkz. mesajRepo.ts (gerçek `konusma`/`mesaj` tabloları).

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
