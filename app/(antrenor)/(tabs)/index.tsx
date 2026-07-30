import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { useOzellik } from '../../../src/context/OzellikContext';
import { getAntrenorBildirimler, getBugunkuGruplar } from '../../../src/data/antrenorRepo';
import type { AntrenorBildirim, BugunkuGrup } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

function bugunEtiketi(): string {
  const d = new Date();
  return `${d.toLocaleDateString('tr-TR', { weekday: 'long' })}, ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`;
}

export default function AntrenorBugun() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile } = useAuth();
  const { ozellikAcik } = useOzellik();
  const [gruplar, setGruplar] = useState<BugunkuGrup[]>([]);
  const [bildirimler, setBildirimler] = useState<AntrenorBildirim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, b] = await Promise.all([getBugunkuGruplar(), getAntrenorBildirimler()]);
      setGruplar(g);
      setBildirimler(b);
    } catch {
      setError('Program yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      getAntrenorBildirimler().then(setBildirimler).catch(() => {});
    }, [])
  );

  const toplamSporcu = gruplar.reduce((a, g) => a + g.sporcuSayisi, 0);
  const simdikiGrup = gruplar.find((g) => g.durum === 'simdi');
  const digerGruplar = gruplar.filter((g) => g.durum !== 'simdi');
  const unreadCount = bildirimler.filter((b) => !b.okundu).length;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.brandRow}>
                <View style={styles.dot} />
                <Text style={styles.brand}>ANTRENÖR PANELİ</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>Merhaba, {profile?.ad || 'Antrenör'}</Text>
              <Text style={styles.subtitle}>{bugunEtiketi()} · {gruplar.length} grup</Text>
            </View>
            <Pressable style={styles.bellBtn} onPress={() => router.push('/bildirimler')}>
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.bellDot}>
                  <Text style={styles.bellDotText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {loading && <LoadingState label="Yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && (
            <>
              <View style={styles.programHeader}>
                <Text style={styles.programLabel}>BUGÜNKÜ PROGRAM</Text>
                <Text style={styles.programCount}>{toplamSporcu} sporcu</Text>
              </View>

              {gruplar
                .filter((g) => g.durum === 'tamamlandi')
                .map((g) => (
                  <Pressable
                    key={g.id}
                    style={styles.doneRow}
                    // Hedef antrenman id'si taşınır — aynı gün birden fazla grup varsa
                    // özet ekranı tıklanan grubu göstersin (kendi tahminini değil).
                    onPress={() => router.push({ pathname: '/yoklama-ozet', params: { antrenmanId: g.id } })}
                  >
                    <View style={styles.doneIcon}>
                      <Text style={{ color: colors.accent }}>✓</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.doneTitle} numberOfLines={1}>{g.ad}</Text>
                      <Text style={styles.doneSub}>{g.saat1} – {g.saat2} · {g.tesis} · Yoklama alındı</Text>
                    </View>
                    <View style={styles.doneBadgeCol}>
                      <View style={styles.donePill}>
                        <Text style={styles.donePillText}>{g.katilanSayisi}/{g.sporcuSayisi} katıldı</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}

              {simdikiGrup && (
                <View style={styles.nowCard}>
                  <View style={styles.nowTop}>
                    <View style={styles.nowBadgeRow}>
                      <View style={styles.liveDot} />
                      <Text style={styles.nowLabel}>ŞİMDİ</Text>
                    </View>
                    {/* Sabit "Teknik Antrenman" rozeti kaldırıldı — antrenman türü DB'de tutulmuyor. */}
                  </View>
                  <Text style={styles.nowTitle} numberOfLines={1}>{simdikiGrup.ad}</Text>
                  <View style={styles.nowTimeRow}>
                    <Text style={styles.nowTime1}>{simdikiGrup.saat1}</Text>
                    <Text style={styles.nowTime2}> – {simdikiGrup.saat2}</Text>
                  </View>
                  <Text style={styles.nowVenue}>📍 {simdikiGrup.tesis}</Text>
                  <View style={styles.divider} />
                  <View style={styles.nowBottomRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.nowSporcuCount}>{simdikiGrup.sporcuSayisi} sporcu</Text>
                      {simdikiGrup.izinliAd && (
                        <Text style={styles.nowIzinNote}>{simdikiGrup.izinliAd} izinli · {simdikiGrup.izinliSebep}</Text>
                      )}
                    </View>
                    <Pressable style={styles.yoklamaBtn} onPress={() => router.push('/yoklama-al')}>
                      <Text style={styles.yoklamaBtnText}>Yoklama Al</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {digerGruplar
                .filter((g) => g.durum === 'sirada')
                .map((g) => (
                  <Pressable key={g.id} style={styles.upcomingRow} onPress={() => showToast(g.ad + ' henüz sırada')}>
                    <View style={styles.upcomingIcon}>
                      <Text>⏱</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.upcomingTitle} numberOfLines={1}>{g.ad}</Text>
                      <Text style={styles.upcomingSub}>{g.saat1} – {g.saat2} · {g.tesis} · {g.sporcuSayisi} sporcu</Text>
                    </View>
                    <View style={styles.upcomingPill}>
                      <Text style={styles.upcomingPillText}>Sırada</Text>
                    </View>
                  </Pressable>
                ))}

              <Text style={styles.footerNote}>Yoklama, antrenman saatinde otomatik açılır</Text>

              <View style={styles.quickActionsRow}>
                <Pressable style={styles.quickActionBtn} onPress={() => router.push('/gelisim')}>
                  <Text style={styles.quickActionIcon}>📊</Text>
                  <Text style={styles.quickActionText}>Gelişim Değerlendirme</Text>
                </Pressable>
                <Pressable style={styles.quickActionBtn} onPress={() => router.push('/mac-kadrosu')}>
                  <Text style={styles.quickActionIcon}>🏀</Text>
                  <Text style={styles.quickActionText}>Maç Kadrosu</Text>
                </Pressable>
              </View>

              {/* Takvim + kazanç bireysel ders akışının parçaları — ikisi de aynı bayrağa bağlı. */}
              {ozellikAcik('bireysel_ders') && (
                <>
                  <Pressable style={styles.bireyselCard} onPress={() => router.push('/takvim')}>
                    <View style={styles.bireyselIcon}>
                      <Text style={{ fontSize: 18 }}>🧑‍🏫</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.bireyselTitleRow}>
                        <Text style={styles.bireyselTitle}>Bireysel Ders Takvimi</Text>
                        <View style={styles.yeniPill}>
                          <Text style={styles.yeniPillText}>YENİ</Text>
                        </View>
                      </View>
                      <Text style={styles.bireyselSub}>Rezervasyonları onayla, müsaitliğini düzenle</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                  <View style={styles.quickActionsRow}>
                    <Pressable style={styles.quickActionBtn} onPress={() => router.push('/kazanc')}>
                      <Text style={styles.quickActionIcon}>💰</Text>
                      <Text style={styles.quickActionText}>Kazanç Özeti</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, marginTop: 3 },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  bellBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 18 },
  bellDot: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgDeep, paddingHorizontal: 3 },
  bellDotText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.onAccent },
  programHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  programLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  programCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.md },
  doneIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  doneSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  doneBadgeCol: { alignItems: 'flex-end' },
  donePill: { backgroundColor: colors.accentSoft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  donePillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  nowCard: { borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  nowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nowBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  nowLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  nowTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: 10 },
  nowTimeRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  nowTime1: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxxl, color: colors.textBright },
  nowTime2: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.lg, color: colors.textMuted },
  nowVenue: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  nowBottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nowSporcuCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  nowIzinNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.warning, marginTop: 1 },
  yoklamaBtn: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  yoklamaBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  upcomingIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  upcomingTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  upcomingSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  upcomingPill: { backgroundColor: colors.chip, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  upcomingPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.xs },
  quickActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  quickActionIcon: { fontSize: 16 },
  quickActionText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center' },
  bireyselCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.md, marginTop: spacing.sm },
  bireyselIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  bireyselTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bireyselTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  yeniPill: { backgroundColor: colors.accent, paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.pill },
  yeniPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.5, color: colors.onAccent },
  bireyselSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  chevron: { color: colors.textDim, fontSize: 16 },
  });
}
