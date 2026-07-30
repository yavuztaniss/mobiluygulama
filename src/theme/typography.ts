// Mockup'ta başlık/rakamlar Archivo, gövde metni Manrope kullanıyor — font altyapısı korunuyor
// (Inter'e geçilmedi, proje zaten Archivo+Manrope kullanıyor). Archivo yalnızca 600-800
// ağırlıklarında, Manrope 400-800 arasında yüklü; hiçbir yerde 300/Light ağırlık yok.
export const fontFamily = {
  archivoBold: 'Archivo_800ExtraBold',
  archivoSemi: 'Archivo_700Bold',
  archivoMedium: 'Archivo_600SemiBold',
  manropeRegular: 'Manrope_400Regular',
  manropeMedium: 'Manrope_500Medium',
  manropeSemi: 'Manrope_600SemiBold',
  manropeBold: 'Manrope_700Bold',
  manropeExtra: 'Manrope_800ExtraBold',
  mono: 'ui-monospace',
} as const;

// base/md gövde metni tokenları — "mobilde en az 14px, ana açıklamalarda tercihen 16px"
// kuralını karşılamak için 12.5/13.5'ten yükseltildi.
//
// Erişilebilirlik alt sınırı (iOS HIG / Android Material): gövde metni 11pt'nin altına
// inmez. Rozet/pill/sayaç gibi ikincil, tek kelimelik etiketlerde 10pt kabul edilebilir —
// bunun için `micro` var. 10'un altı (9, 9.5 gibi) kırmızı çizgidir, ölçekte karşılığı
// bilinçli olarak yoktur.
//
// Ölçek tam sayılara sabitlendi: RN kesirli fontSize'ı (10.5, 11.5, 12.5) iOS ve Android'de
// farklı yuvarladığı için aynı ekran iki platformda farklı satır yüksekliği veriyordu.
//
// xs ve sm sayısal olarak aynı (11) ama semantik olarak ayrı: xs mono + uppercase +
// letterSpacing ile kullanılan kicker/rozet rungu (optik olarak daha küçük okunur),
// sm ise Manrope ile yazılan ikincil gövde metni. Ayrımı korumak ileride sm'i 12'ye
// çıkarmayı tek noktadan mümkün kılıyor.
export const fontSize = {
  micro: 10,
  xs: 11,
  sm: 11,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 28,
  xxxl: 32,
} as const;

// Gövde metinlerinde satır yüksekliği — Türkçe'de kelimeler uzun ("değerlendirme",
// "bilgilendirme") ve sarma sık oluyor; lineHeight verilmezse satırlar sıkışık görünür,
// Archivo'nun uzun descender'ları da alt satıra değiyor. Gövde için ~1.4, başlıklar için
// ~1.2 katsayısı kullanılıyor.
export const lineHeightFor = (size: number, ratio = 1.4) => Math.round(size * ratio);

// Nabız/set/tekrar/kilo/süre/yüzde gibi sayısal ölçümlerde rakamların hizasının
// kaymaması için — ilgili Text stiline spread edilir: `style={[styles.x, tabularNums]}`.
export const tabularNums: { fontVariant: Array<'tabular-nums'> } = { fontVariant: ['tabular-nums'] };
