export interface KonusmaSatir {
  id: string;
  ad: string;
  init: string;
  role: string;
  avBg: string;
  avFg: string;
  son: string;
  zaman: string;
  unread: number;
}

export interface Mesaj {
  id: string;
  benim: boolean;
  text: string;
  time: string;
}

export interface RehberKisi {
  id: string;
  ad: string;
  role: string;
  init: string;
  avBg: string;
  avFg: string;
}
