// Mockup'lardan (Yonetici/Veli/Antrenor .dc.html) çıkarılan renk paleti.
// Anahtar adları tarihseldir ("navy*", "white") ama artık tema-bağımsız ROL isimleridir:
// navyBg = ekran arka planı, white = birincil metin, navySurface = kart yüzeyi, vb.
// Değerleri ThemeContext üzerinden `useColors()` ile okunan aktif temaya (dark/light) göre değişir.
export interface AppColors {
  navyBg: string;
  navyBgGradientTop: string;
  navySurface: string;
  navySurfaceAlt: string;
  navySheet: string;
  navyChip: string;
  navyBorder: string;
  navyBorderStrong: string;
  navyBorderSoft: string;
  lightBg: string;
  lightText: string;
  lightTextHover: string;
  lightTextMuted: string;
  lightTextFaint: string;
  lightBorder: string;
  lightSurface: string;
  accent: string;
  accentDark: string;
  accentOnDark: string;
  accentTint: string;
  accentBorder: string;
  white: string;
  textMuted: string;
  textFaint: string;
  textFainter: string;
  iconMuted: string;
  danger: string;
  dangerSoft: string;
  dangerBg: string;
  dangerBorder: string;
  warning: string;
  warningSoft: string;
  warningBg: string;
  warningBorder: string;
}

export const darkColors: AppColors = {
  // Koyu (dashboard/kart) yüzeyler — Yönetici/Veli/Antrenör ana ekranları
  navyBg: '#0A1628',
  navyBgGradientTop: '#13284C',
  navySurface: '#101F38',
  navySurfaceAlt: '#152B50',
  navySheet: '#0F1F3A',
  navyChip: '#16294A',
  navyBorder: 'rgba(255,255,255,0.06)',
  navyBorderStrong: 'rgba(255,255,255,0.12)',
  navyBorderSoft: 'rgba(255,255,255,0.07)',

  // Açık (dış sayfa / liste) yüzeyler — sadece mockup galeri çerçevesinde kullanılıyor
  lightBg: '#EBEAE5',
  lightText: '#13233F',
  lightTextHover: '#0A1628',
  lightTextMuted: '#6D6B64',
  lightTextFaint: '#8A887F',
  lightBorder: '#D9D7CF',
  lightSurface: 'rgba(255,255,255,0.92)',

  // Accent
  accent: '#2EE6A8',
  accentDark: '#0A8F63',
  accentOnDark: '#052117',
  accentTint: 'rgba(46,230,168,0.10)',
  accentBorder: 'rgba(46,230,168,0.45)',

  // Metin (koyu zemin üstünde)
  white: '#FFFFFF',
  textMuted: '#8FA0B8',
  textFaint: '#5D708C',
  textFainter: '#7E90AB',
  iconMuted: '#C7D3E6',

  // Durum
  danger: '#FF6B7A',
  dangerSoft: '#FF8A96',
  dangerBg: 'rgba(255,107,122,0.13)',
  dangerBorder: 'rgba(255,107,122,0.35)',
  warning: '#FFB454',
  warningSoft: '#FFD9A0',
  warningBg: 'rgba(255,180,84,0.14)',
  warningBorder: 'rgba(255,180,84,0.35)',
};

export const lightColors: AppColors = {
  navyBg: '#F2F1EC',
  navyBgGradientTop: '#FFFFFF',
  navySurface: '#FFFFFF',
  navySurfaceAlt: '#E9FAF3',
  navySheet: '#FFFFFF',
  navyChip: '#F1F3F2',
  navyBorder: 'rgba(15,23,42,0.08)',
  navyBorderStrong: 'rgba(15,23,42,0.18)',
  navyBorderSoft: 'rgba(15,23,42,0.10)',

  lightBg: '#EBEAE5',
  lightText: '#13233F',
  lightTextHover: '#0A1628',
  lightTextMuted: '#6D6B64',
  lightTextFaint: '#8A887F',
  lightBorder: '#D9D7CF',
  lightSurface: 'rgba(255,255,255,0.92)',

  accent: '#0E9F6E',
  accentDark: '#0A8F63',
  accentOnDark: '#FFFFFF',
  accentTint: 'rgba(14,159,110,0.10)',
  accentBorder: 'rgba(14,159,110,0.4)',

  white: '#101828',
  textMuted: '#5B6472',
  textFaint: '#8A94A6',
  textFainter: '#A7B0BE',
  iconMuted: '#475569',

  danger: '#E11D48',
  dangerSoft: '#BE123C',
  dangerBg: 'rgba(225,29,72,0.10)',
  dangerBorder: 'rgba(225,29,72,0.35)',
  warning: '#B45309',
  warningSoft: '#92400E',
  warningBg: 'rgba(217,119,6,0.12)',
  warningBorder: 'rgba(217,119,6,0.35)',
};

export type ColorToken = keyof AppColors;

/** @deprecated Statik değil — ekranlarda `useColors()` kullan. Sadece tema-dışı yerler için (ör. splash). */
export const colors = darkColors;
