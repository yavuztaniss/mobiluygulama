import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useAuth } from '../../../src/context/AuthContext';
import { getKazancAylar, getKazancOzet } from '../../../src/data/bireyselRepo';
import type { KazancAySecenegi, KazancOzet } from '../../../src/data/types-bireysel';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function KazancScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile } = useAuth();
  const [aylar, setAylar] = useState<KazancAySecenegi[]>([]);
  const [ay, setAy] = useState<string | null>(null);
  const [ozet, setOzet] = useState<KazancOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ayId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const a = await getKazancAylar();
      setAylar(a);
      const secilecekAy = ayId ?? a[a.length - 1]?.id ?? null;
      if (secilecekAy) {
        setAy(secilecekAy);
        setOzet(await getKazancOzet(secilecekAy));
      }
    } catch {
      setError('Kazanç bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.brandRow}>
                <View style={styles.dot} />
                <Text style={styles.brand}>ANTRENÖR PANELİ</Text>
              </View>
              <Text style={styles.title}>Kazanç Özeti</Text>
              <Text style={styles.subtitle}>{profile?.ad || 'Antrenör'} · Bireysel dersler</Text>
            </View>
            <View style={styles.ayRow}>
              {aylar.map((a) => {
                const on = a.id === ay;
                return (
                  <Pressable key={a.id} style={[styles.ayChip, on && styles.ayChipActive]} onPress={() => load(a.id)}>
                    <Text style={[styles.ayChipText, on && styles.ayChipTextActive]}>{a.ad}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {loading && <LoadingState label="Yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={() => load(ay)} />}

          {!loading && !error && ozet && (
            <>
              <View style={styles.netCard}>
                <View style={styles.netTop}>
                  <Text style={styles.netLabel}>NET HAKEDİŞ · {ozet.ayAd}</Text>
                  <View style={styles.trendPill}>
                    <Text style={styles.trendText}>{ozet.trend}</Text>
                  </View>
                </View>
                <Text style={styles.netAmount}>{ozet.net}</Text>
                <Text style={styles.netNote}>{ozet.odemeNotu}</Text>
                <View style={styles.divider} />
                <View style={styles.netRow}>
                  <Text style={styles.netRowLabel}>Brüt ciro · {ozet.dersAdet} ders</Text>
                  <Text style={styles.netRowValue}>{ozet.brut}</Text>
                </View>
                <View style={styles.netRow}>
                  <Text style={styles.netRowLabel}>Kulüp payı · %20</Text>
                  <Text style={[styles.netRowValue, { color: colors.danger }]}>−{ozet.kulupPay}</Text>
                </View>
              </View>

              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.accent }]}>{ozet.dersAdet}</Text>
                  <Text style={styles.statLabel}>BİREYSEL DERS</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{ozet.saat}</Text>
                  <Text style={styles.statLabel}>SAAT</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{ozet.ogrenci}</Text>
                  <Text style={styles.statLabel}>SPORCU</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.warning }]}>{ozet.ortalamaDersUcret}</Text>
                  <Text style={styles.statLabel}>ORT. / DERS</Text>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Seans Dağılımı</Text>
                  <Text style={styles.cardHeaderSub}>{ozet.toplamSeans} planlanan seans</Text>
                </View>
                <View style={styles.distBar}>
                  <View style={[styles.distSeg, { width: `${ozet.tamamlananPct}%`, backgroundColor: colors.accent }]} />
                  <View style={[styles.distSeg, { width: `${ozet.iptalPct}%`, backgroundColor: colors.warning }]} />
                  <View style={[styles.distSeg, { width: `${ozet.noshowPct}%`, backgroundColor: colors.danger }]} />
                </View>
                <View style={{ gap: 9, marginTop: spacing.md }}>
                  <DistRow renk={colors.accent} etiket="Tamamlanan" sayi={ozet.tamamlanan} pct={ozet.tamamlananPct} />
                  <DistRow renk={colors.warning} etiket="İptal · süresinde" sayi={ozet.iptal} pct={ozet.iptalPct} />
                  <DistRow renk={colors.danger} etiket="No-show · seans yandı" sayi={ozet.noshow} pct={ozet.noshowPct} />
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Haftalık Kazanç</Text>
                  <Text style={styles.cardHeaderSub}>net · {ozet.ayAd2}</Text>
                </View>
                <View style={styles.barChart}>
                  {ozet.haftalar.map((h) => (
                    <View key={h.ad} style={styles.barCol}>
                      <Text style={[styles.barVal, { color: h.aktif ? colors.accent : colors.textMuted }]}>{h.val}</Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            { height: `${h.pct}%`, backgroundColor: h.aktif ? colors.accent : colors.accentSoft, borderColor: h.aktif ? colors.accent : colors.accentBorder },
                          ]}
                        />
                      </View>
                      <Text style={styles.barAd}>{h.ad}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.altNotBox}>
                <Text style={styles.altNotText}>{ozet.altNot}</Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function DistRow({ renk, etiket, sayi, pct }: { renk: string; etiket: string; sayi: number; pct: number }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.distRow}>
      <View style={[styles.distDot, { backgroundColor: renk }]} />
      <Text style={styles.distEtiket}>{etiket}</Text>
      <Text style={styles.distSayi}>{sayi}</Text>
      <Text style={styles.distPct}>%{pct}</Text>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, marginTop: 3 },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  ayRow: { flexDirection: 'row', gap: 6 },
  ayChip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  ayChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  ayChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textMuted },
  ayChipTextActive: { color: colors.accent },
  netCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl, marginTop: spacing.xs },
  netTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  trendPill: { backgroundColor: colors.accentSoft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  trendText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accent },
  netAmount: { fontFamily: fontFamily.archivoBold, fontSize: 44, color: colors.textBright, letterSpacing: -1.5, marginTop: 10 },
  netNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  netRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  netRowLabel: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted },
  netRowValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright },
  statLabel: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.5, color: colors.textDim, marginTop: 2, textAlign: 'center' },
  card: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, letterSpacing: -0.2 },
  cardHeaderSub: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  distBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: spacing.md, gap: 2 },
  distSeg: { height: '100%' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  distDot: { width: 9, height: 9, borderRadius: 5 },
  distEtiket: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted },
  distSayi: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  distPct: { width: 38, textAlign: 'right', fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' },
  barVal: { fontFamily: fontFamily.manropeExtra, fontSize: 10 },
  barTrack: { width: '100%', maxWidth: 44, height: 70, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderWidth: 1 },
  barAd: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textDim },
  altNotBox: { borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  altNotText: { fontFamily: fontFamily.manropeSemi, fontSize: 11.5, color: colors.accent, lineHeight: 16, textAlign: 'center' },
  });
}
