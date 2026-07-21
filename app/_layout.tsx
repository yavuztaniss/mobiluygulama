import { useEffect, useCallback } from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useArchivo, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import {
  useFonts as useManrope,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider, useThemeMode } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedStatusBar() {
  const mode = useThemeMode();
  return <StatusBar style={mode === 'light' ? 'dark' : 'light'} />;
}

export default function RootLayout() {
  const [archivoLoaded] = useArchivo({ Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold });
  const [manropeLoaded] = useManrope({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const fontsLoaded = archivoLoaded && manropeLoaded;

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    onLayout();
  }, [onLayout]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <Slot />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
