import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useChild } from '../context/ChildContext';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../theme';

// Kompakt avatar 36x36 çiziliyor — dokunma hedefi minimumu 44x44 olduğu için her yönde
// 4px hitSlop ile 44x44'e tamamlanıyor (görsel boyut değişmiyor).
const COMPACT_AVATAR_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;
// "+" butonu 48 genişlikte ama yüksekliği satıra göre esniyor; liste boşken 44'ün altına
// düşmemesi için hem minHeight hem hitSlop veriliyor.
const ICON_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export function ChildSwitcherPills({ onAddChild }: { onAddChild?: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const { children, selectedChildId, selectChild } = useChild();
  return (
    <View style={styles.pillRow}>
      {children.map((c) => {
        const active = c.id === selectedChildId;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => selectChild(c.id)}
          >
            <View style={[styles.pillAvatar, { backgroundColor: c.avBg }]}>
              <Text style={[styles.pillAvatarText, { color: c.avFg }]}>{c.init}</Text>
            </View>
            <View>
              <Text style={[styles.pillName, active && styles.pillNameActive]}>{c.ad}</Text>
              <Text style={styles.pillBrans}>{c.brans}</Text>
            </View>
          </Pressable>
        );
      })}
      {onAddChild && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sporcu ekle"
          hitSlop={ICON_HIT_SLOP}
          style={styles.addPill}
          onPress={onAddChild}
        >
          <Text style={styles.addPillText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ChildSwitcherCompact() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { children, selectedChildId, selectChild } = useChild();
  return (
    <View style={styles.compactRow}>
      {children.map((c) => {
        const active = c.id === selectedChildId;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={c.ad}
            hitSlop={COMPACT_AVATAR_HIT_SLOP}
            style={[styles.compactAvatar, { backgroundColor: c.avBg }, active && { borderColor: colors.accentBorder }]}
            onPress={() => selectChild(c.id)}
          >
            <Text style={[styles.compactAvatarText, { color: c.avFg }]}>{c.init}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function useChildLabel() {
  const { selectedChild } = useChild();
  if (!selectedChild) return '';
  return `${selectedChild.ad} · ${selectedChild.brans}`;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    pillRow: { flexDirection: 'row', gap: spacing.sm },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingRight: 16, paddingLeft: 8,
      borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border,
    },
    pillActive: { borderColor: colors.accentBorder },
    pillAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    pillAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
    pillName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, lineHeight: lineHeightFor(fontSize.md, 1.3), color: colors.textMuted },
    pillNameActive: { color: colors.textBright },
    pillBrans: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
    addPill: {
      width: 48, minHeight: 44, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    addPillText: { color: colors.textDim, fontSize: fontSize.xl },
    // gap 6 -> 8: kompakt avatarların 4px'lik hitSlop'ları komşusuyla çakışmasın diye
    // (36 + 4 + 4 = 44 dokunma hedefi, aradaki 8px boşluğu tam dolduruyor).
    compactRow: { flexDirection: 'row', gap: 8 },
    compactAvatar: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
    compactAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
  });
}
