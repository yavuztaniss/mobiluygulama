// Bu dosyadaki buildSporcuDetay fixture'ı (sabit CAL_DAYS/%86, ODEME_GECMISI,
// GELISIM_NOTLARI) kaldırıldı — sporcu detayı artık tamamen gerçek tablolardan
// besleniyor: odeme (ödeme geçmişi + aylık aidat planı), gelisim_degerlendirme
// (+profiles antrenör adı), yoklama/antrenman (takvim + oran), sporcular.created_at
// (kayıt tarihi) ve sube.ad. Bkz. src/data/sporcularRepo.ts:getSporcuDetay.
// Dosya açıklayıcı yorumla tutuluyor; yeni mock veri EKLEMEYİN.

export {};
