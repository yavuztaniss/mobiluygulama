import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors, useThemePreference, type AppColors, type ThemePreference, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../theme';

// Segment yüksekliği 9 + 15 + 9 = 33px; 44x44 dokunma hedefi için dikeyde 6px hitSlop
// ekleniyor. Yatayda 0: segmentler flex:1 ile zaten satırı dolduruyor, yanlara taşırmak
// komşu segmentin dokunma alanıyla çakışıp yanlış seçime yol açardı.
const CHIP_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 0 } as const;

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
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            hitSlop={CHIP_HIT_SLOP}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => setPreference(o.value)}
          >
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
    chipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted },
    chipTextActive: { fontFamily: fontFamily.manropeExtra, color: colors.onAccent },
  });
}
