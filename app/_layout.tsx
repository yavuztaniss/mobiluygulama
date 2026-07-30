import { useEffect } from 'react';
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
import { HataEkrani } from '../src/components/HataEkrani';
import { SurumKapisi } from '../src/components/SurumKapisi';
import { AuthProvider } from '../src/context/AuthContext';
import { KurumProvider } from '../src/context/KurumContext';
import { OzellikProvider } from '../src/context/OzellikContext';
import { ThemeProvider, useThemeMode, useThemeReady } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// expo-router SÖZLEŞMESİ: bir route dosyası `ErrorBoundary` adında bir bileşen
// dışa aktarırsa, o route ağacındaki render hataları o bileşenle karşılanır.
// Kök layout'tan aktarıldığı için uygulamanın TAMAMI kapsanıyor.
// Bu satır olmadan tek bir render hatası üretim derlemesinde beyaz ekrana
// düşürüyor ve kullanıcının uygulamayı kapatmaktan başka çıkışı kalmıyordu.
export { HataEkrani as ErrorBoundary };

function ThemedStatusBar() {
  const mode = useThemeMode();
  return <StatusBar style={mode === 'light' ? 'dark' : 'light'} />;
}

// Splash ekranı hem fontlar YÜKLENENE hem de kayıtlı tema tercihi AsyncStorage'dan
// OKUNANA kadar açık kalır — tema flaşını (yanlış modun bir an görünüp değişmesini) önler.
function AppGate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const themeReady = useThemeReady();
  const ready = fontsLoaded && themeReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    // SurumKapisi EN DIŞTA — oturum sağlayıcılarının bile üstünde.
    // Zorunlu güncelleme kontrolü oturumdan bağımsız olmalı: oturumu bozulmuş
    // ya da hiç açılmamış bir kullanıcı da kapıyı görebilmeli. İçeride olsaydı
    // kapı yalnızca giriş yapmış kullanıcılara çıkardı.
    // Kontrol yapılamadığında hiçbir şey engellenmez (fail-open).
    <SurumKapisi>
      <AuthProvider>
        <KurumProvider>
          <OzellikProvider>
            <ThemedStatusBar />
            <Slot />
          </OzellikProvider>
        </KurumProvider>
      </AuthProvider>
    </SurumKapisi>
  );
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

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppGate fontsLoaded={fontsLoaded} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
