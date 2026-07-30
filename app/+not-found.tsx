import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/components/Button';
import { ScreenBackground } from '../src/components/ScreenBackground';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, spacing } from '../src/theme';

// ===========================================================================
// EŞLEŞMEYEN ROTA — expo-router'ın "+not-found" dosya kuralı
// ===========================================================================
// Bu dosya YOKKEN expo-router kendi yedek ekranını gösteriyordu: siyah zemin
// üzerinde İngilizce "Unmatched Route / Page could not be found." Bozuk bir
// derin bağlantı (eski davet linki, kopyalanırken kırpılmış URL, kaldırılmış
// bir ekranın adresi) kullanıcıyı doğrudan oraya düşürüyordu — uygulamadan
// çıkmış gibi görünen, çıkışı olmayan bir ekran.
//
// Dosya adı bir kural: app/+not-found.tsx hiçbir rotayla eşleşmeyen TÜM
// yolları karşılar ve varsayılan sistem ekranının yerini alır. Ekran bilinçli
// olarak MARKASIZ: çok kiracılı kurulumda burada kulüp adı gösterilemez, çünkü
// kullanıcının hangi kulübe ait olduğu (hatta oturumu olup olmadığı) bu noktada
// bilinmiyor olabilir.
// ===========================================================================
export default function NotFoundScreen() {
  const colors = useColors();
  const styles = createStyles(colors);

  return (
    <ScreenBackground>
      <View style={styles.wrap}>
        <Text style={styles.kod}>404</Text>
        <Text style={styles.title}>Sayfa bulunamadı</Text>
        <Text style={styles.text}>
          Açmaya çalıştığınız bağlantı geçersiz ya da bu ekran artık yok. Bağlantı size gönderildiyse eksik
          kopyalanmış olabilir; gönderen kişiden yeniden istemeyi deneyin.
        </Text>
        {/* Hedef '/(auth)/login' değil kök rota: app/index.tsx oturum durumunu
            çözer — oturum yoksa girişe, varsa kullanıcının rolüne ait ana ekrana
            götürür. Böylece giriş yapmış bir kullanıcı giriş ekranına atılmaz. */}
        <Button label="Girişe Dön" onPress={() => router.replace('/')} />
      </View>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
    kod: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xl,
      fontWeight: '800',
      letterSpacing: 2,
      color: colors.textDim,
      textAlign: 'center',
    },
    title: {
      fontFamily: fontFamily.archivoBold,
      fontSize: fontSize.xl,
      color: colors.textBright,
      textAlign: 'center',
    },
    text: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      lineHeight: lineHeightFor(fontSize.base),
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
  });
}
