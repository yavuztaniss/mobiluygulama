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
// kuralını karşılamak için 12.5/13.5'ten yükseltildi. xs/sm bilinçli olarak değişmedi:
// bunlar gövde metni değil, yalnızca mono kicker etiketleri/zaman damgaları gibi düşük
// öncelikli meta içerik için kullanılıyor (bkz. tema planı — hex/tema denetimi notları).
export const fontSize = {
  xs: 10.5,
  sm: 11,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 28,
} as const;

// Nabız/set/tekrar/kilo/süre/yüzde gibi sayısal ölçümlerde rakamların hizasının
// kaymaması için — ilgili Text stiline spread edilir: `style={[styles.x, tabularNums]}`.
export const tabularNums: { fontVariant: Array<'tabular-nums'> } = { fontVariant: ['tabular-nums'] };
