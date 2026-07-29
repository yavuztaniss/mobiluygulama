import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors, useThemePreference, type AppColors, type ThemePreference, fontFamily, fontSize, radius, spacing } from '../theme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
];

export function ThemePreferencePicker() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { preference, setPreference } = useThemePreference();
  return (
    <View style={styles.track}>
      {OPTIONS.map((o) => {
        const active = o.value === preference;
        return (
          <Pressable key={o.value} style={[styles.chip, active && styles.chipActive]} onPress={() => setPreference(o.value)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    track: { flexDirection: 'row', gap: 4, backgroundColor: colors.chip, borderRadius: radius.md, padding: 4 },
    chip: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
    chipActive: { backgroundColor: colors.accent },
    chipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
    chipTextActive: { fontFamily: fontFamily.manropeExtra, color: colors.onAccent },
  });
}
