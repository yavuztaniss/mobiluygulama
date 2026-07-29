import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from './ScreenBackground';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../theme';

export function TabPlaceholder({ title, note }: { title: string; note?: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.wrap} edges={['top']}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{note ?? 'Bu ekran sıradaki geliştirme turunda inşa edilecek.'}</Text>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, padding: spacing.lg, gap: spacing.xs },
    title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
    subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted },
  });
}
