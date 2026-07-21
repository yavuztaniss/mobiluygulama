export type AppRole = 'yonetici' | 'veli' | 'antrenor';

export interface Profile {
  id: string;
  role: AppRole;
  ad: string;
  telefon: string | null;
  sube_id: string | null;
  avatar_url: string | null;
  created_at: string;
}
