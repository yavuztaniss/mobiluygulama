// Roster (U12_SPORCULAR), bugünkü program (BUGUNKU_GRUPLAR), yoklama başlangıç durumu ve
// gelişim varsayılanları Faz 3'te; Maç Kadrosu (KADRO_VARSAYILAN) Faz 4'te gerçek tabloya
// taşındı (bkz. antrenorRepo.ts + supabase/migrations/0008_yoklama_gelisim.sql,
// 0009_duyuru_etkinlik.sql).
//
// Mock temizliğinde kaldırılanlar:
// - VELI_BILDIRIMLERI: sahte "İletildi/Görüldü/Ulaşılamadı" teslim listesiydi — gerçek push
//   altyapısı olmadığından yoklama-ozet ekranından bölümüyle birlikte silindi.
// - ANTRENOR_BILDIRIMLER: bildirimler artık gerçek olaylardan sentezleniyor (izinli yoklama
//   satırları + onay bekleyen bireysel rezervasyonlar, bkz. antrenorRepo.syncAntrenorBildirimleri).
// - ANTRENOR_PROFIL: profil artık profiles + sporcu_antrenor + bireysel_antrenor'dan okunuyor
//   (bkz. antrenorRepo.getAntrenorProfil).

// GELISIM_VARSAYILAN/GELISIM_BECERI_ADLARI Faz 3'te kalktı (gerçek gelisim_degerlendirme/
// beceri tabloları) — GELISIM_NOT_SABLONLARI hâlâ kullanılıyor (antrenörün not yazarken
// seçebileceği hazır cümle şablonları, veri değil sabit UI önerisi).
export const GELISIM_NOT_SABLONLARI = ['Belirgin ilerleme var', 'Disiplinli çalışıyor', 'Takım oyununa katkısı arttı'];

// ANTRENOR_KONUSMALAR Faz 5'te kalktı — bkz. mesajRepo.ts (gerçek `konusma`/`mesaj` tabloları).
