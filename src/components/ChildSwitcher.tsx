import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CHILDREN, useChild, type ChildId } from '../context/ChildContext';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../theme';

export function ChildSwitcherPills({ onAddChild }: { onAddChild?: () => void }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const { selectedChildId, selectChild } = useChild();
  return (
    <View style={styles.pillRow}>
      {Object.values(CHILDREN).map((c) => {
        const active = c.id === selectedChildId;
        return (
          <Pressable key={c.id} style={[styles.pill, active && styles.pillActive]} onPress={() => selectChild(c.id)}>
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
        <Pressable style={styles.addPill} onPress={onAddChild}>
          <Text style={styles.addPillText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ChildSwitcherCompact() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { selectedChildId, selectChild } = useChild();
  return (
    <View style={styles.compactRow}>
      {Object.values(CHILDREN).map((c) => {
        const active = c.id === selectedChildId;
        return (
          <Pressable
            key={c.id}
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
  return `${selectedChild.ad} · ${selectedChild.brans}`;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    pillRow: { flexDirection: 'row', gap: spacing.sm },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingRight: 16, paddingLeft: 8,
      borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorder,
    },
    pillActive: { borderColor: colors.accentBorder },
    pillAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    pillAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
    pillName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.iconMuted },
    pillNameActive: { color: colors.white },
    pillBrans: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textFainter },
    addPill: {
      width: 48, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong,
      alignItems: 'center', justifyContent: 'center',
    },
    addPillText: { color: colors.textFaint, fontSize: 20 },
    compactRow: { flexDirection: 'row', gap: 6 },
    compactAvatar: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
    compactAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
  });
}
