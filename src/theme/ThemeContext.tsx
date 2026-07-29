import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type AppColors } from './colors';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeMode;

const STORAGE_KEY = 'theme-preference';

interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  colors: AppColors;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  preference: 'system',
  setPreference: () => {},
  colors: darkColors,
  ready: false,
});

// İlk açılışta sistem temasını takip eder. Kullanıcı elle 'light'/'dark' seçerse bu tercih
// AsyncStorage'da kalıcı saklanır ve OS değişikliğini görmezden gelir; 'system' seçiliyken
// OS teması değişirse anında takip eder. Bu proje zaten Supabase auth için AsyncStorage
// kullanıyor (bkz. src/lib/supabase.ts) — aynı bağımlılık, yeni paket eklenmiyor.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') setPreferenceState(stored);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  }

  const value = useMemo<ThemeContextValue>(() => {
    const mode: ThemeMode = preference === 'system' ? (scheme === 'light' ? 'light' : 'dark') : preference;
    return { mode, preference, setPreference, colors: mode === 'light' ? lightColors : darkColors, ready };
  }, [preference, scheme, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeContext).mode;
}

export function useColors(): AppColors {
  return useContext(ThemeContext).colors;
}

export function useThemePreference(): { preference: ThemePreference; setPreference: (pref: ThemePreference) => void } {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, setPreference };
}

// Kayıtlı tercih AsyncStorage'dan okunana kadar `false` — kök layout bunu font yükleme
// sinyaliyle birleştirip splash ekranını tutarak tema-flaşını önlüyor (bkz. app/_layout.tsx).
export function useThemeReady(): boolean {
  return useContext(ThemeContext).ready;
}
