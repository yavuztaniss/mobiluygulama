// ANA_SAYFA mock'u 2026-07-29 mock temizliğinde kalktı — bkz. veliRepo.getAnaSayfa
// (gerçek `antrenman`/`yoklama`/`sporcu_antrenor`/`odeme`/`duyuru` tabloları).
// ALI_SPORCU_ID/ZEYNEP_SPORCU_ID sabitleri de yalnızca ANA_SAYFA anahtarı olarak
// kullanıldığından onlarla birlikte silindi (gerçek id'ler ChildContext'ten geliyor).

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

// BILDIRIMLER mock'u 2026-07-29 mock temizliğinde kalktı — bildirimler artık yalnızca
// gerçek verilerden sentezleniyor (bkz. veliRepo.syncOdemeGecikmeBildirimleri /
// syncDuyuruBildirimleri; kalıcı bildirim tablosu ileriki iş).

// VELI_PROFIL mock'u 2026-07-29 mock temizliğinde kalktı — bkz. veliRepo.getVeliProfil
// (gerçek `profiles` + `veli_sporcu`⋈`sporcular`; "belgeler"/"kayıtlı kart" bölümlerinin
// gerçek karşılığı olmadığından tamamen kaldırıldı).
