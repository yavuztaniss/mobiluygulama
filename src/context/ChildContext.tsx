import { createContext, useContext, useState, type ReactNode } from 'react';

export type ChildId = 'ali' | 'zeynep';

export interface ChildInfo {
  id: ChildId;
  ad: string;
  init: string;
  brans: string;
  avBg: string;
  avFg: string;
}

export const CHILDREN: Record<ChildId, ChildInfo> = {
  ali: { id: 'ali', ad: 'Ali', init: 'AK', brans: 'Basketbol U12', avBg: '#1D3560', avFg: '#9FE8CE' },
  zeynep: { id: 'zeynep', ad: 'Zeynep', init: 'ZK', brans: 'Yüzme U10', avBg: '#241A3E', avFg: '#E2C8FF' },
};

interface ChildContextValue {
  selectedChildId: ChildId;
  selectedChild: ChildInfo;
  selectChild: (id: ChildId) => void;
}

const ChildContext = createContext<ChildContextValue | null>(null);

export function ChildProvider({ children }: { children: ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState<ChildId>('ali');

  return (
    <ChildContext.Provider
      value={{
        selectedChildId,
        selectedChild: CHILDREN[selectedChildId],
        selectChild: setSelectedChildId,
      }}
    >
      {children}
    </ChildContext.Provider>
  );
}

export function useChild() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error('useChild, ChildProvider içinde kullanılmalı');
  return ctx;
}
