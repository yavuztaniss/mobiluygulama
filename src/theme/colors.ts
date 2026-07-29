// Üretim kalitesinde renk sistemi — premium/güven veren/atletik/sakin/veri odaklı karakter.
// Mint (`accent`) yalnızca güçlü vurgu, CTA, ilerleme ve aktif durumlarda kullanılır; ekranın
// büyük bölümünü kaplamaz. Değerler ThemeContext üzerinden `useColors()` ile okunan aktif
// temaya (dark/light) göre değişir. Tüm hex değerleri kaynak-gerçek olarak sabitlenmiştir —
// buradaki dizin dışında hiçbir bileşende ham hex/rgba renk bulunmamalı.
export interface AppColors {
  // Accent (mint) — etkileşim durumlarıyla birlikte
  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSoft: string;
  accentBorder: string;
  onAccent: string;

  // Yüzey hiyerarşisi (5 katman: kabuk → sayfa → panel → yükseltilmiş yüzey → chip)
  bgDeep: string;
  bgMid: string;
  panel: string;
  surface: string;
  chip: string;

  // Metin
  textBright: string;
  text: string;
  textMuted: string;
  textDim: string;

  // Semantik durum renkleri
  danger: string;
  warning: string;
  info: string;
  purple: string;
  onDanger: string;
  onWarning: string;
  onInfo: string;
  onPurple: string;
  dangerSoft: string;
  warningSoft: string;
  infoSoft: string;
  purpleSoft: string;

  // Yapı
  border: string;
  divider: string;
  focusRing: string;

  // Zorunlu sette olmayan, yapısal olarak gerekli tek ek — modal/bottom-sheet arka perdesi.
  scrim: string;
}

export const darkColors: AppColors = {
  accent: '#36E6AF',
  accentHover: '#64F0C4',
  accentPressed: '#1BCB94',
  accentSoft: '#143E38',
  accentBorder: '#2D9B7A',
  onAccent: '#06221A',

  bgDeep: '#061923',
  bgMid: '#0A2530',
  panel: '#0F303D',
  surface: '#153C4A',
  chip: '#1B4A59',

  textBright: '#F2FBF8',
  text: '#C7DCD8',
  textMuted: '#B0CAC5',
  textDim: '#9BB8B3',

  danger: '#FF7482',
  warning: '#FFC266',
  info: '#63C5FF',
  purple: '#B9A0FF',

  onDanger: '#340A12',
  onWarning: '#302000',
  onInfo: '#062435',
  onPurple: '#1E1440',

  dangerSoft: '#3A1A22',
  warningSoft: '#3B2B10',
  infoSoft: '#143548',
  purpleSoft: '#2E234B',

  border: '#274B58',
  divider: '#1B3B47',
  focusRing: '#64F0C4',

  scrim: 'rgba(3,12,17,0.7)',
};

export const lightColors: AppColors = {
  accent: '#007A5A',
  accentHover: '#00684D',
  accentPressed: '#005B43',
  accentSoft: '#D9F4EA',
  accentBorder: '#8CD5BF',
  onAccent: '#FFFFFF',

  bgDeep: '#EDF5F5',
  bgMid: '#E2EEEE',
  panel: '#FFFFFF',
  surface: '#F7FBFA',
  chip: '#DCEBEB',

  textBright: '#08232B',
  text: '#1B3B42',
  textMuted: '#3F5F65',
  textDim: '#4D676C',

  danger: '#C53347',
  warning: '#8A5200',
  info: '#006FAE',
  purple: '#6746C4',

  onDanger: '#FFFFFF',
  onWarning: '#FFFFFF',
  onInfo: '#FFFFFF',
  onPurple: '#FFFFFF',

  dangerSoft: '#FBE8EB',
  warningSoft: '#FFF1D6',
  infoSoft: '#E5F2FB',
  purpleSoft: '#EFE9FB',

  border: '#C5DADA',
  divider: '#D8E6E5',
  focusRing: '#007A5A',

  scrim: 'rgba(8,35,43,0.4)',
};

export type ColorToken = keyof AppColors;
