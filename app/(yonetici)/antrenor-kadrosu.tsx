import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useToast } from '../../src/components/Toast';
import { getHakedisler, odeHakedis } from '../../src/data/hakedisRepo';
import type { AntrenorHakedis } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

function fmt(n: number) {
  return '₺' + n.toLocaleString('tr-TR');
}

export default function AntrenorKadrosuScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [hakedisler, setHakedisler] = useState<AntrenorHakedis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acikId, setAcikId] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHakedisler(await getHakedisler());
    } catch {
      setError('Hakediş verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toplam = hakedisler.reduce((a, h) => a + h.tutarN, 0);
  const odenenTutar = hakedisler.filter((h) => h.odendi).reduce((a, h) => a + h.tutarN, 0);
  const odenenN = hakedisler.filter((h) => h.odendi).length;
  const toplamDers = hakedisler.reduce((a, h) => a + h.ders, 0);
  const pct = toplam ? Math.round((odenenTutar / toplam) * 100) : 0;

  async function onOde(h: AntrenorHakedis) {
    await odeHakedis(h.id);
    setHakedisler(await getHakedisler());
    showToast(h.ad + ' hakedişi ödendi · dekont iletildi');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Antrenör Kadrosu</Text>
            <Text style={styles.headerSub}>Temmuz hakedişleri · Merkez şube</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <Text style={styles.summaryLabel}>TEMMUZ HAKEDİŞ ÖZETİ</Text>
                <Text style={styles.summaryCount}>{odenenN}/{hakedisler.length} ödendi</Text>
              </View>
              <View style={styles.summaryAmountRow}>
                <Text style={styles.summaryAmount}>{fmt(toplam)}</Text>
                <Text style={styles.summaryAmountNote}>toplam · {toplamDers} ders</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressNote}>{fmt(odenenTutar)} ödendi · kalan {fmt(toplam - odenenTutar)}</Text>
            </View>

            <Text style={styles.kadroLabel}>KADRO · {hakedisler.length} ANTRENÖR</Text>

            {hakedisler.map((h) => {
              const acik = acikId === h.id;
              return (
                <View key={h.id} style={[styles.hkCard, acik && styles.hkCardOpen]}>
                  <Pressable style={styles.hkTop} onPress={() => setAcikId(acik ? null : h.id)}>
                    <View style={[styles.avatar, { backgroundColor: h.avBg }]}>
                      <Text style={[styles.avatarText, { color: h.avFg }]}>{h.init}</Text>
                    </View>
                    <View style={styles.mid}>
                      <Text style={styles.hkAd}>{h.ad}</Text>
                      <Text style={styles.hkRol}>{h.rol}</Text>
                    </View>
                    <View style={styles.hkAmountCol}>
                      <Text style={[styles.hkTutar, { color: h.odendi ? colors.textMuted : colors.white }]}>{fmt(h.tutarN)}</Text>
                      <Text style={[styles.hkStatus, { color: h.odendi ? colors.accent : colors.warning }]}>
                        {h.odendi ? 'ÖDENDİ' : 'BEKLEMEDE'}
                      </Text>
                    </View>
                    <Text style={[styles.chevron, acik && { transform: [{ rotate: '180deg' }] }]}>⌄</Text>
                  </Pressable>

                  {acik && (
                    <View style={styles.hkDetail}>
                      <View style={styles.statRow}>
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{h.ders}</Text>
                          <Text style={styles.statLabel}>DERS</Text>
                        </View>
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{h.birim}</Text>
                          <Text style={styles.statLabel}>DERS ÜCRETİ</Text>
                        </View>
                        <View style={styles.statBox}>
                          <Text style={[styles.statValue, { color: colors.accent }]}>{h.grup}</Text>
                          <Text style={styles.statLabel}>GRUP</Text>
                        </View>
                      </View>
                      <View style={{ gap: 6, marginTop: 11 }}>
                        {h.kalemler.map((k, i) => (
                          <View key={i} style={styles.kalemRow}>
                            <View style={styles.kalemDot} />
                            <Text style={styles.kalemName}>{k.n}</Text>
                            <Text style={styles.kalemValue}>{k.v}</Text>
                          </View>
                        ))}
                      </View>
                      {!h.odendi ? (
                        <Pressable style={styles.odeBtn} onPress={() => onOde(h)}>
                          <Text style={styles.odeBtnText}>Hakedişi Öde · {fmt(h.tutarN)}</Text>
                        </Pressable>
                      ) : (
                        <View style={styles.odendiBox}>
                          <Text style={styles.odendiText}>✓ Ödendi · dekont antrenöre iletildi</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={styles.footerNote}>Ders sayıları yoklama kayıtlarından otomatik hesaplanır</Text>
          </ScrollView>
        )}
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxl },
  summaryCard: { borderRadius: radius.xxl, backgroundColor: 'rgba(18,58,46,0.6)', borderWidth: 1, borderColor: 'rgba(46,230,168,0.25)', padding: 16 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.accent },
  summaryCount: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  summaryAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: spacing.sm },
  summaryAmount: { fontFamily: fontFamily.archivoBold, fontSize: 26, color: colors.white, letterSpacing: -0.5 },
  summaryAmountNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textFainter },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.10)', marginTop: 11, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  progressNote: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textMuted, marginTop: 7 },
  kadroLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginTop: spacing.md },
  hkCard: { borderRadius: radius.xxl, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, overflow: 'hidden' },
  hkCardOpen: { borderColor: colors.accentBorder },
  hkTop: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base },
  mid: { flex: 1, minWidth: 0 },
  hkAd: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.white },
  hkRol: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  hkAmountCol: { alignItems: 'flex-end' },
  hkTutar: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md },
  hkStatus: { fontFamily: fontFamily.manropeExtra, fontSize: 10, marginTop: 1 },
  chevron: { color: colors.textFaint, fontSize: 15 },
  hkDetail: { paddingHorizontal: 15, paddingBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.navyBorder },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 9, alignItems: 'center' },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.white },
  statLabel: { fontFamily: fontFamily.manropeBold, fontSize: 9, color: colors.textMuted, marginTop: 1 },
  kalemRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  kalemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  kalemName: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.iconMuted },
  kalemValue: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.white },
  odeBtn: { marginTop: 13, height: 44, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  odeBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accentOnDark },
  odendiBox: { marginTop: 13, height: 44, borderRadius: 14, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  odendiText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textFaint, marginTop: spacing.xs },
  });
}
