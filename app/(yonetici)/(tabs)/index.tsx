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
  // Şube id'leri artık gerçek `sube` tablosundan (uuid) — başlangıçta null,
  // repo null'da ilk şubeyi seçer. KPI'lar şube-bağımsız hesaplanır (bkz. yoneticiRepo.getOzet).
  const [subeId, setSubeId] = useState<string | null>(null);
  const [ozet, setOzet] = useState<YoneticiOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subeOpen, setSubeOpen] = useState(false);

  const load = useCallback(async (targetSubeId: string | null, cachedSubeler: Sube[]) => {
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

  // Sheet'teki seçili işareti — henüz seçim yapılmadıysa listedeki ilk şube aktiftir.
  const aktifSubeId = subeId ?? subeler[0]?.id ?? null;

  // Hiç tahsilat yoksa 0'a bölme/NaN yükseklik olmasın diye alt sınır 1.
  const maxTutar = ozet ? Math.max(1, ...ozet.tahsilatSonAltiAy.map((t) => t.tutar)) : 1;

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
              {/* Zil ikonu + bellCount rozeti kaldırıldı: yönetici için bir bildirim
                  merkezi yok — sahte sayaç göstermek yerine ikon tamamen kalktı. */}
            </View>
          </View>

          {loading && <LoadingState label="Özet yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={() => load(subeId, subeler)} />}

          {!loading && !error && ozet && (
            <>
              {/* Şube bazlı kırılım henüz yok — rakamlar seçili şubeye değil tüm kuruma ait,
                  bunu açıkça söylemek gerekiyor (şube seçici yalnızca başlık etiketi). */}
              <Text style={styles.kurumNotu}>Rakamlar tüm kurumu kapsar</Text>
              <View style={styles.kpiGrid}>
                <Card style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>AKTİF SPORCU</Text>
                  <Text style={styles.kpiValue}>{ozet.kpiSporcu}</Text>
                  <Text style={styles.kpiSubGreen}>{ozet.kpiSporcuArtis}</Text>
                </Card>
                <Card style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>BU AY TAHSİLAT</Text>
                  <Text style={styles.kpiValue}>{ozet.kpiTahsilat}</Text>
                  <Text style={styles.kpiSubMuted}>{ozet.kpiTahsilatAlt}</Text>
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
                  <Text style={styles.kpiSubMuted}>Bugün {ozet.bugunAntrenman} antrenman</Text>
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
                style={[styles.sheetRow, s.id === aktifSubeId && styles.sheetRowActive]}
                onPress={() => {
                  setSubeId(s.id);
                  setSubeOpen(false);
                }}
              >
                <View style={styles.sheetRowText}>
                  <Text style={styles.sheetRowTitle}>{s.ad}</Text>
                  {/* alt_bilgi seed'deki eski tanıtım metni ("184 sporcu · 6 branş" gibi) —
                      gerçek sayılarla eşleşmediği için gösterilmiyor. */}
                </View>
                {s.id === aktifSubeId && <Text style={styles.sheetCheck}>✓</Text>}
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
  subeText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, letterSpacing: -0.4 },
  chevron: { color: colors.textMuted, fontSize: 16 },
  dateText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  roleBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.xs, color: colors.accent },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kurumNotu: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textDim, marginBottom: spacing.xs },
  kpiCard: { width: '47.5%', gap: 6, minHeight: 96 },
  kpiCardDanger: { borderColor: colors.danger },
  kpiLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.3, color: colors.textDim },
  kpiLabelDanger: { color: colors.danger },
  kpiValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, letterSpacing: -0.5 },
  kpiValueDanger: { color: colors.danger },
  kpiSubGreen: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.accent },
  kpiSubMuted: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textMuted },
  kpiSubDanger: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.danger },
  gecikenYokWrap: { paddingTop: spacing.xs },
  gecikenYokText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.accent },
  chartCard: { gap: spacing.md },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, paddingTop: spacing.sm },
  chartBarWrap: { alignItems: 'center', gap: 6, flex: 1 },
  chartBar: { width: 18, borderRadius: 6, backgroundColor: colors.accent },
  chartLabel: { fontFamily: fontFamily.manropeMedium, fontSize: 10, color: colors.textDim },
  modalBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-start', padding: spacing.lg, paddingTop: 120 },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    maxWidth: 280,
  },
  sheetTitle: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.textDim,
    padding: spacing.sm,
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  sheetRowActive: { backgroundColor: colors.chip },
  sheetRowText: { flex: 1 },
  sheetRowTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  sheetRowSubtitle: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim },
  sheetCheck: { color: colors.accent, fontSize: 16 },
  });
}
