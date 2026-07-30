import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { Card } from '../../../src/components/Card';
import { ChildSwitcherCompact, useChildLabel } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useChild } from '../../../src/context/ChildContext';
import { getYoklamaGelisim } from '../../../src/data/veliRepo';
import type { YoklamaGelisim } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing, avatarColorAt } from '../../../src/theme';

function getGunRenk(colors: AppColors): Record<string, { bg: string; c: string; bd?: string }> {
  return {
    katildi: { bg: colors.accentSoft, c: colors.accent },
    katilmadi: { bg: colors.dangerSoft, c: colors.danger },
    planli: { bg: 'transparent', c: colors.accent, bd: colors.accentBorder },
    yok: { bg: 'transparent', c: colors.textDim },
  };
}

export default function YoklamaGelisimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const GUN_RENK = getGunRenk(colors);
  const { selectedChildId } = useChild();
  const childLabel = useChildLabel();
  const [data, setData] = useState<YoklamaGelisim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getYoklamaGelisim(selectedChildId));
    } catch {
      setError('Bilgiler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  const size = 92;
  const r = 38;
  const circumference = 2 * Math.PI * r;

  // Başlıklar sabit 'Temmuz 2026' değil — bugünden türetilir (gün verisi zaten gerçek).
  const ayYil = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const ayAdi = new Date().toLocaleDateString('tr-TR', { month: 'long' });

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle}>Yoklama &amp; Gelişim</Text>
            <Text style={styles.headerSub}>{childLabel}</Text>
          </View>
          <ChildSwitcherCompact />
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && data && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.heroCard}>
              <View style={{ width: size, height: size }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={8} fill="none" />
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={colors.accent}
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(data.pct / 100) * circumference} ${circumference}`}
                  />
                </Svg>
                <View style={styles.heroPctWrap} pointerEvents="none">
                  <Text style={styles.heroPct}>%{data.pct}</Text>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroLabel}>{ayAdi.toLocaleUpperCase('tr-TR')} KATILIMI</Text>
                <Text style={styles.heroSub}>{data.attCount} / {data.attCount + data.missCount} antrenman</Text>
                <Text style={styles.heroTrend}>{data.trendText}</Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={[styles.statBox, styles.statBoxGreen]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{data.attCount}</Text>
                <Text style={styles.statLabel}>KATILDI</Text>
              </View>
              <View style={[styles.statBox, styles.statBoxRed]}>
                <Text style={[styles.statValue, { color: colors.danger }]}>{data.missCount}</Text>
                <Text style={styles.statLabel}>KAÇIRDI</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{data.planCount}</Text>
                <Text style={styles.statLabel}>PLANLI</Text>
              </View>
            </View>

            <Card>
              <Text style={styles.calTitle}>{ayYil}</Text>
              <View style={styles.calGrid}>
                {data.calDays.map((d) => (
                  <View
                    key={d.d}
                    style={[
                      styles.calCell,
                      { backgroundColor: GUN_RENK[d.durum].bg },
                      GUN_RENK[d.durum].bd ? { borderWidth: 1.5, borderColor: GUN_RENK[d.durum].bd, borderStyle: 'dashed' } : null,
                    ]}
                  >
                    <Text style={[styles.calCellText, { color: GUN_RENK[d.durum].c }]}>{d.d}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.legendRow}>
                <LegendDot color={colors.accent} label="Katıldı" />
                <LegendDot color={colors.danger} label="Katılmadı" />
                <LegendDot color={colors.accent} label="Planlı" outline />
                <LegendDot color={colors.textDim} label="Bugün" outline />
              </View>
            </Card>

            <Card>
              <Text style={styles.calTitle}>Gelişim Karnesi</Text>
              {data.skills.map((s) => (
                <View key={s.name} style={styles.skillRow}>
                  <Text style={styles.skillName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.skillLvl}>{s.lvl}/5</Text>
                  <View style={styles.skillSegs}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <View key={i} style={[styles.skillSeg, { backgroundColor: i <= s.lvl ? colors.accent : colors.border }]} />
                    ))}
                  </View>
                </View>
              ))}
            </Card>

            <Card>
              <Text style={styles.calTitle}>ANTRENÖR NOTU</Text>
              <Text style={styles.noteText}>{data.noteText}</Text>
              <View style={styles.noteFooter}>
                <View style={styles.noteAvatar}>
                  <Text style={styles.noteAvatarText}>{data.coachInit}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.noteCoach}>{data.coach}</Text>
                  <Text style={styles.noteDate}>{data.noteDate}</Text>
                </View>
              </View>
            </Card>
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function LegendDot({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, outline ? { borderWidth: 1.5, borderColor: color } : { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  heroPctWrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  heroPct: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright },
  heroLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  heroSub: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, lineHeight: lineHeightFor(fontSize.xl), color: colors.textBright, marginTop: 5 },
  heroTrend: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: { flex: 1, borderRadius: 14, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, padding: 9, alignItems: 'center' },
  statBoxGreen: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  statBoxRed: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  statLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  calTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.textBright },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  calCell: { width: '12.5%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calCellText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.sm },
  skillName: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  skillLvl: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  skillSegs: { flexDirection: 'row', gap: 4 },
  skillSeg: { width: 16, height: 6, borderRadius: 3 },
  noteText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, lineHeight: 21, marginTop: spacing.sm },
  noteFooter: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: spacing.md },
  noteAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  noteAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  noteCoach: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  noteDate: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim },
  });
}
