import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

export function Button({ label, variant = 'primary', loading, disabled, ...props }: ButtonProps) {
  const colors = useColors();
  const styles = createStyles(colors);
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && (isPrimary ? styles.primaryPressed : styles.pressed),
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={isPrimary ? styles.primaryText : styles.secondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    base: {
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    primary: {
      backgroundColor: colors.accent,
    },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    disabled: {
      opacity: 0.5,
    },
    pressed: {
      opacity: 0.85,
    },
    primaryPressed: {
      backgroundColor: colors.accentPressed,
    },
    primaryText: {
      color: colors.onAccent,
      fontFamily: fontFamily.manropeExtra,
      fontSize: fontSize.md,
    },
    secondaryText: {
      color: colors.text,
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.md,
    },
  });
}
