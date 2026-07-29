import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, style, ...props }: TextFieldProps) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.xs,
    },
    label: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: colors.textDim,
      textTransform: 'uppercase',
    },
    input: {
      height: 52,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.md,
    },
    inputFocused: {
      borderColor: colors.focusRing,
      borderWidth: 2,
    },
    inputError: {
      borderColor: colors.danger,
    },
    errorText: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.sm,
      color: colors.danger,
    },
  });
}
