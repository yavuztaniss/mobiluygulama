import { StyleSheet, View, type ViewProps } from 'react-native';
import { useColors, type AppColors, radius, spacing } from '../theme';

export function Card({ style, ...props }: ViewProps) {
  const colors = useColors();
  const styles = createStyles(colors);
  return <View style={[styles.card, style]} {...props} />;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.xl,
      backgroundColor: colors.navySurface,
      borderWidth: 1,
      borderColor: colors.navyBorder,
      padding: spacing.lg,
    },
  });
}
