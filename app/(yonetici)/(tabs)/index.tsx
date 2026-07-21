import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { LoadingState, ErrorState, EmptyState } from '../../../src/components/StateViews';
import { getOzet, getSubeler } from '../../../src/data/yoneticiRepo';
import type { Sube, YoneticiOzet } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function OzetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [subeId, setSubeId] = useState('merkez');
  const [ozet, setOzet] = useState<YoneticiOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subeOpen, setSubeOpen] = useState(false);

  const load = useCallback(async (targetSubeId: string, cachedSubeler: Sube[]) => {
    setLoading(true);
    setError(null);
    try {
      const [subeListesi, ozetData] = await Promise.all([
        cachedSubeler.length ? Promise.resolve(cachedSubeler) : getSubeler(),
        getOzet(targetSubeId),
      ]);
      setSubeler(subeListesi);
      setOzet(ozetData);
    } catch {
      setError('Özet verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(subeId, subeler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subeId]);

  const maxTutar = ozet ? Math.max(...ozet.tahsilatSonAltiAy.map((t) => t.tutar)) : 1;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.brandRow}>
                <View style={styles.dot} />
                <Text style={styles.brand}>KARŞIYAKA SPOR OKULU</Text>
              </View>
              <Pressable style={styles.subeBtn} onPress={() => setSubeOpen(true)}>
                <Text style={styles.subeText}>{ozet?.subeAd ?? '—'}</Text>
                <Text style={styles.chevron}>⌄</Text>
              </Pressable>
              <Text style={styles.dateText}>{ozet?.tarihEtiketi ?? ''}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Yönetici</Text>
              </View>
              <View style={styles.bellBtn}>
                <Text style={styles.bellIcon}>🔔</Text>
                {!!ozet?.bellCount && (
                  <View style={styles.bellDot}>
                    <Text style={styles.bellDotText}>{ozet.bellCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {loading && <LoadingState label="Özet yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={() => load(subeId, subeler)} />}

          {!loading && !error && ozet && (
            <>
              <View style={styles.kpiGrid}>
                <Card style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>AKTİF SPORCU</Text>
                  <Text style={styles.kpiValue}>{ozet.kpiSporcu}</Text>
                  <Text style={styles.kpiSubGreen}>{ozet.kpiSporcuArtis}</Text>
                </Card>
                <Card style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>BU AY TAHSİLAT</Text>
                  <Text style={styles.kpiValue}>{ozet.kpiTahsilat}</Text>
                  <Text style={styles.kpiSubMuted}>{ozet.kpiTahsilatHedef}</Text>
                </Card>
                <Card style={[styles.kpiCard, ozet.kpiGeciken > 0 && styles.kpiCardDanger]}>
                  <Text style={[styles.kpiLabel, ozet.kpiGeciken > 0 && styles.kpiLabelDanger]}>GECİKEN AİDAT</Text>
                  {ozet.kpiGeciken > 0 ? (
                    <>
                      <Text style={[styles.kpiValue, styles.kpiValueDanger]}>{ozet.kpiGeciken}</Text>
                      <Text style={styles.kpiSubDanger}>{ozet.kpiGecikenTutar}</Text>
                    </>
                  ) : (
                    <View style={styles.gecikenYokWrap}>
                      <Text style={styles.gecikenYokText}>Geciken ödeme yok 🎉</Text>
                    </View>
                  )}
                </Card>
                <Card style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>YOKLAMA ORANI</Text>
                  <Text style={styles.kpiValue}>%{ozet.yoklamaOrani}</Text>
                  <Text style={styles.kpiSubMuted}>Son 30 gün</Text>
                </Card>
              </View>

              <Card style={styles.chartCard}>
                <Text style={styles.kpiLabel}>TAHSİLAT · SON 6 AY</Text>
                {ozet.tahsilatSonAltiAy.length === 0 ? (
                  <EmptyState title="Henüz tahsilat verisi yok" />
                ) : (
                  <View style={styles.chartRow}>
                    {ozet.tahsilatSonAltiAy.map((point) => (
                      <View key={point.ay} style={styles.chartBarWrap}>
                        <View
                          style={[
                            styles.chartBar,
                            { height: Math.max(6, (point.tutar / maxTutar) * 88) },
                          ]}
                        />
                        <Text style={styles.chartLabel}>{point.ay}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <AppModal visible={subeOpen} transparent animationType="fade" onRequestClose={() => setSubeOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSubeOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>ŞUBE SEÇ</Text>
            {subeler.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.sheetRow, s.id === subeId && styles.sheetRowActive]}
                onPress={() => {
                  setSubeId(s.id);
                  setSubeOpen(false);
                }}
              >
                <View style={styles.sheetRowText}>
                  <Text style={styles.sheetRowTitle}>{s.ad}</Text>
                  <Text style={styles.sheetRowSubtitle}>{s.altBilgi}</Text>
                </View>
                {s.id === subeId && <Text style={styles.sheetCheck}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </AppModal>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { gap: 3, flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  subeBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  subeText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.white, letterSpacing: -0.4 },
  chevron: { color: colors.textMuted, fontSize: 16 },
  dateText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  roleBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.xs, color: colors.accent },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.navySurface,
    borderWidth: 1,
    borderColor: colors.navyBorderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: { fontSize: 18 },
  bellDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.navyBg,
    paddingHorizontal: 3,
  },
  bellDotText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accentOnDark },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpiCard: { width: '47.5%', gap: 6, minHeight: 96 },
  kpiCardDanger: { borderColor: colors.dangerBorder },
  kpiLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.3, color: colors.textFaint },
  kpiLabelDanger: { color: colors.dangerSoft },
  kpiValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.white, letterSpacing: -0.5 },
  kpiValueDanger: { color: colors.danger },
  kpiSubGreen: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.accent },
  kpiSubMuted: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textMuted },
  kpiSubDanger: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.dangerSoft },
  gecikenYokWrap: { paddingTop: spacing.xs },
  gecikenYokText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.accent },
  chartCard: { gap: spacing.md },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, paddingTop: spacing.sm },
  chartBarWrap: { alignItems: 'center', gap: 6, flex: 1 },
  chartBar: { width: 18, borderRadius: 6, backgroundColor: colors.accent },
  chartLabel: { fontFamily: fontFamily.manropeMedium, fontSize: 10, color: colors.textFaint },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', padding: spacing.lg, paddingTop: 120 },
  sheet: {
    backgroundColor: colors.navySurfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.navyBorderStrong,
    padding: spacing.sm,
    maxWidth: 280,
  },
  sheetTitle: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.textFaint,
    padding: spacing.sm,
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  sheetRowActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  sheetRowText: { flex: 1 },
  sheetRowTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.white },
  sheetRowSubtitle: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFainter },
  sheetCheck: { color: colors.accent, fontSize: 16 },
  });
}
