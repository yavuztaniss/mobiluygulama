// 'muhasebeci' 0015 migration'ıyla eklendi — yalnızca web yönetim panelini kullanır,
// mobil uygulamada arayüzü yoktur (bkz. app/index.tsx yönlendirmesi).
export type AppRole = 'yonetici' | 'veli' | 'antrenor' | 'muhasebeci';

export interface Profile {
  id: string;
  role: AppRole;
  ad: string;
  telefon: string | null;
  sube_id: string | null;
  avatar_url: string | null;
  created_at: string;
}
