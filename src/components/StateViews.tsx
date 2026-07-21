import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../theme';

export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.mutedText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Bir şeyler ters gitti</Text>
      <Text style={styles.mutedText}>{message ?? 'Veriler yüklenemedi. Bağlantını kontrol et.'}</Text>
      {!!onRetry && (
        <View style={styles.retryWrap}>
          <Button label="Tekrar Dene" variant="secondary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.mutedText}>{subtitle}</Text>}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.xxl,
    },
    emptyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xxl,
    },
    emptyTitle: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.md,
      color: colors.white,
    },
    errorTitle: {
      fontFamily: fontFamily.archivoSemi,
      fontSize: fontSize.lg,
      color: colors.danger,
    },
    mutedText: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
      textAlign: 'center',
    },
    retryWrap: {
      marginTop: spacing.sm,
      minWidth: 160,
    },
  });
}
