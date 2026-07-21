import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type AppColors } from './colors';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: AppColors;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: 'dark', colors: darkColors });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<ThemeContextValue>(() => {
    const mode: ThemeMode = scheme === 'light' ? 'light' : 'dark';
    return { mode, colors: mode === 'light' ? lightColors : darkColors };
  }, [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeContext).mode;
}

export function useColors(): AppColors {
  return useContext(ThemeContext).colors;
}
