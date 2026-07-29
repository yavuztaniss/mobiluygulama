import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../theme';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(msg);
    timer.current = setTimeout(() => setMessage(null), 2400);
  }, []);

  return { toastMessage: message, showToast };
}

export function Toast({ message }: { message: string | null }) {
  const colors = useColors();
  const styles = createStyles(colors);
  if (!message) return null;
  return <Text style={styles.toast}>{message}</Text>;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    toast: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: 100,
      zIndex: 90,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: radius.lg,
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
      fontFamily: fontFamily.manropeBold,
      fontSize: fontSize.base,
      color: colors.textBright,
      textAlign: 'center',
      overflow: 'hidden',
    },
  });
}
