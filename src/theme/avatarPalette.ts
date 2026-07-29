export interface AvatarColor {
  avBg: string;
  avFg: string;
}

// Dekoratif kimlik rozetleri (baş harf daireleri) — opak bir daire olduğundan
// çevresindeki panel/yüzey rengiyle değil yalnızca kendi avBg/avFg çiftiyle
// kontrast kurması gerekiyor, bu yüzden açık ve koyu temada aynı palet
// kullanılıyor (Gmail/Slack'teki kullanıcı rozeti deseniyle aynı mantık).
// Index-tabanlı döngüsel atama — kullanıcı/veli isimlerine anlam yüklemiyor.
const AVATAR_PALETTE: AvatarColor[] = [
  { avBg: '#1D3560', avFg: '#9FE8CE' },
  { avBg: '#241A3E', avFg: '#E2C8FF' },
  { avBg: '#12303F', avFg: '#7DD8F0' },
  { avBg: '#3A2412', avFg: '#FFD9A0' },
];

export function avatarColorAt(index: number): AvatarColor {
  const len = AVATAR_PALETTE.length;
  return AVATAR_PALETTE[((index % len) + len) % len];
}
