import { StyleSheet, Text, View } from 'react-native';
import { ScreenBackground } from './ScreenBackground';
import { Button } from './Button';
import { useAuth } from '../context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../theme';

export function PlaceholderHome({ title }: { title: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile, signOut } = useAuth();
  return (
    <ScreenBackground>
      <View style={styles.wrap}>
        <Text style={styles.eyebrow}>{title.toUpperCase()}</Text>
        <Text style={styles.title}>Merhaba {profile?.ad ?? ''}</Text>
        <Text style={styles.subtitle}>Bu modül henüz sıradaki fazda inşa edilecek.</Text>
        <View style={styles.spacer} />
        <Button label="Çıkış Yap" variant="secondary" onPress={signOut} />
      </View>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, padding: spacing.xxl, justifyContent: 'center' },
    eyebrow: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: '800',
      letterSpacing: 1.8,
      color: colors.accent,
      marginBottom: spacing.sm,
    },
    title: { fontFamily: fontFamily.archivoBold, fontSize: 28, color: colors.textBright },
    subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.xs },
    spacer: { height: spacing.xxl },
  });
}
