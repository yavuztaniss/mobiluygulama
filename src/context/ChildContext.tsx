import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface ChildInfo {
  id: string;
  ad: string;
  init: string;
  brans: string;
  avBg: string;
  avFg: string;
}

// Faz 1 öncesi ChildId = 'ali' | 'zeynep' sabit union'ıydı; artık gerçek sporcu.id
// (uuid) taşıyor. Tip adı geriye dönük uyum için korunuyor — mock/veli.ts,
// veliRepo.ts, types-veli.ts hâlâ bunu import ediyor (kalan mock alanlar gerçek
// veriye taşınınca bu alias kaldırılabilir).
export type ChildId = string;

// Dekoratif avatar renkleri sabit bir paletten döngüsel atanıyor (temadan bağımsız,
// bkz. tema entegrasyonu sırasındaki "dekoratif renkler sabit kalır" kararı).
const AVATAR_PALETTE = [
  { avBg: '#1D3560', avFg: '#9FE8CE' },
  { avBg: '#241A3E', avFg: '#E2C8FF' },
  { avBg: '#12303F', avFg: '#7DD8F0' },
  { avBg: '#3A2412', avFg: '#FFD9A0' },
];

// devSignInAs('veli') ile gerçek Supabase oturumu olmadan test edilirken
// (bkz. AuthContext.tsx) gösterilecek sabit örnek veri.
const DEV_CHILDREN: ChildInfo[] = [
  { id: 'dev-ali', ad: 'Ali', init: 'AK', brans: 'Basketbol U12', avBg: '#1D3560', avFg: '#9FE8CE' },
  { id: 'dev-zeynep', ad: 'Zeynep', init: 'ZK', brans: 'Yüzme U10', avBg: '#241A3E', avFg: '#E2C8FF' },
];

function initialsOf(ad: string): string {
  return ad
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ChildContextValue {
  children: ChildInfo[];
  selectedChildId: string;
  selectedChild: ChildInfo | null;
  selectChild: (id: string) => void;
  loading: boolean;
}

const ChildContext = createContext<ChildContextValue | null>(null);

export function ChildProvider({ children: reactChildren }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (profile?.id?.startsWith('dev-')) {
        setChildren(DEV_CHILDREN);
        setSelectedChildId((prev) => (DEV_CHILDREN.some((c) => c.id === prev) ? prev : DEV_CHILDREN[0].id));
        return;
      }
      if (!session) {
        setChildren([]);
        return;
      }
      const { data, error } = await supabase
        .from('veli_sporcu')
        .select('sporcu:sporcular(id, ad, numara, grup:grup(ad), brans:brans(ad))')
        .eq('veli_id', session.user.id);
      if (error) throw error;
      const list: ChildInfo[] = (data ?? [])
        .map((row: any) => row.sporcu)
        .filter(Boolean)
        .map((s: any, i: number) => ({
          id: s.id,
          ad: s.ad,
          init: initialsOf(s.ad),
          brans: [s.brans?.ad, s.grup?.ad].filter(Boolean).join(' · ') || s.grup?.ad || '',
          ...AVATAR_PALETTE[i % AVATAR_PALETTE.length],
        }));
      setChildren(list);
      setSelectedChildId((prev) => (list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? '')));
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [session, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? null;

  return (
    <ChildContext.Provider value={{ children, selectedChildId, selectedChild, selectChild: setSelectedChildId, loading }}>
      {reactChildren}
    </ChildContext.Provider>
  );
}

export function useChild() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error('useChild, ChildProvider içinde kullanılmalı');
  return ctx;
}
