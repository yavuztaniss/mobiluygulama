import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { Card } from '../../../src/components/Card';
import { ChildSwitcherPills } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { useChild } from '../../../src/context/ChildContext';
import { useKurum } from '../../../src/context/KurumContext';
import { useOzellik } from '../../../src/context/OzellikContext';
import { getAnaSayfa, getBildirimler } from '../../../src/data/veliRepo';
import type { AnaSayfaOzet, Bildirim } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing, avatarColorAt } from '../../../src/theme';

const DUYURU_ICON: Record<string, string> = { kamp: '🏕️', servis: '🚌', basari: '🏆', genel: '📣' };

export default function VeliAnaSayfa() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile } = useAuth();
  const { selectedChildId } = useChild();
  const { kulupAdi } = useKurum();
  const { ozellikAcik } = useOzellik();
  const [ozet, setOzet] = useState<AnaSayfaOzet | null>(null);
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([getAnaSayfa(selectedChildId), getBildirimler()]);
      setOzet(a);
      setBildirimler(b);
    } catch {
      setError('Veriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      getBildirimler().then(setBildirimler).catch(() => {});
    }, [])
  );

  const unreadCount = bildirimler.filter((b) => !b.okundu).length;
  // Gerçek profil adı (ilk isim) — profil yüklenmemişse nötr 'Veli'.
  const veliAdi = profile?.ad?.trim() ? profile.ad.trim().split(' ')[0] : 'Veli';
  const bugunEtiketi = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const ayAdi = new Date().toLocaleDateString('tr-TR', { month: 'long' });

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View>
              <View style={styles.brandRow}>
                <View style={styles.dot} />
                <Text style={styles.brand}>{kulupAdi.toLocaleUpperCase('tr-TR')}</Text>
              </View>
              <Text style={styles.title}>Merhaba, {veliAdi}</Text>
              <Text style={styles.subtitle}>{bugunEtiketi}</Text>
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

          <View style={{ marginTop: spacing.md }}>
            <ChildSwitcherPills onAddChild={() => router.push('/sporcu-ekle')} />
          </View>

          {loading && <LoadingState label="Yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && ozet && (
            <>
              {ozet.bugunAntrenman.var ? (
                <Card style={styles.trainingCard}>
                  <View style={styles.trainingTop}>
                    <Text style={styles.trainingLabel}>BUGÜNKÜ ANTRENMAN</Text>
                    <View style={styles.branchPill}>
                      <Text style={styles.branchPillText}>{ozet.bugunAntrenman.branch}</Text>
                    </View>
                  </View>
                  <Text style={styles.trainingTitle}>{ozet.bugunAntrenman.title}</Text>
                  <View style={styles.trainingTimeRow}>
                    <Text style={styles.trainingTime1}>{ozet.bugunAntrenman.saat1}</Text>
                    <Text style={styles.trainingTime2}> – {ozet.bugunAntrenman.saat2}</Text>
                  </View>
                  <Text style={styles.trainingVenue}>📍 {ozet.bugunAntrenman.venue}</Text>
                  <View style={styles.divider} />
                  <View style={styles.coachRow}>
                    <View style={styles.coachAvatar}>
                      <Text style={styles.coachAvatarText}>{ozet.bugunAntrenman.coachInit}</Text>
                    </View>
                    <View style={styles.coachMid}>
                      <Text style={styles.coachName}>{ozet.bugunAntrenman.coach}</Text>
                      <Text style={styles.coachRole}>{ozet.bugunAntrenman.coachRole}</Text>
                    </View>
                    <Pressable style={styles.servisBtn} onPress={() => router.push('/(veli)/(tabs)/servis')}>
                      <Text style={styles.servisBtnText}>Servisi Takip Et</Text>
                    </Pressable>
                  </View>
                </Card>
              ) : (
                <View style={styles.emptyTraining}>
                  <Text style={styles.emptyTrainingIcon}>📅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emptyTrainingTitle}>Bugün antrenman yok</Text>
                    {!!ozet.bugunAntrenman.nextTraining && (
                      <Text style={styles.emptyTrainingSub}>Sıradaki: {ozet.bugunAntrenman.nextTraining}</Text>
                    )}
                  </View>
                </View>
              )}

              {!!ozet.sonYoklama.title && (
              <Pressable style={styles.attendanceRow} onPress={() => router.push('/yoklama')}>
                <View style={[styles.attendanceIcon, { backgroundColor: ozet.sonYoklama.katildi ? colors.accentSoft : colors.dangerSoft }]}>
                  <Text>{ozet.sonYoklama.katildi ? '✓' : '✕'}</Text>
                </View>
                <View style={styles.attendanceMid}>
                  <Text style={styles.attendanceLabel}>SON YOKLAMA</Text>
                  <Text style={styles.attendanceTitle}>{ozet.sonYoklama.title}</Text>
                  <Text style={styles.attendanceSub}>{ozet.sonYoklama.sub}</Text>
                </View>
                <View style={styles.attendancePct}>
                  <Text style={styles.attendancePctText}>%{ozet.sonYoklama.pct} katılım</Text>
                </View>
              </Pressable>
              )}

              {ozet.aidat.durum !== 'odendi' ? (
                <Pressable
                  style={[styles.aidatCard, ozet.aidat.durum === 'gecikti' && styles.aidatCardGecikti]}
                  onPress={() => router.push('/(veli)/(tabs)/odemeler')}
                >
                  <View style={styles.aidatTop}>
                    <View style={styles.aidatIcon}>
                      <Text style={styles.aidatIconText}>₺</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {/* Etiket, gösterilen odeme kaydının kendi dönemi (aciklama) — içinde bulunulan ay değil:
                          Ağustos'ta hâlâ ödenmemiş "Temmuz aidatı" kartı yanlış ay iddia etmesin. */}
                      <Text style={styles.aidatLabel}>{(ozet.aidat.kapsam || `${ayAdi} aidatı`).toLocaleUpperCase('tr-TR')}</Text>
                      <View style={styles.aidatAmountRow}>
                        <Text style={styles.aidatAmount}>{ozet.aidat.tutar}</Text>
                        <View style={styles.aidatPill}>
                          <Text style={styles.aidatPillText}>{ozet.aidat.durum === 'gecikti' ? 'GECİKTİ' : 'BEKLİYOR'}</Text>
                        </View>
                      </View>
                      <Text style={styles.aidatDate}>Son ödeme: {ozet.aidat.sonOdeme}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                  <Text style={[styles.aidatNote, ozet.aidat.durum === 'gecikti' && styles.aidatNoteDanger]}>
                    {ozet.aidat.durum === 'gecikti' ? 'Son ödeme tarihi geçti · kulüple iletişime geç' : 'Ödeme kulüp tarafından işlenir · detay için dokun'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable style={styles.aidatOkRow} onPress={() => router.push('/(veli)/(tabs)/odemeler')}>
                  <View style={styles.aidatOkIcon}>
                    <Text style={{ color: colors.accent }}>✓</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aidatOkTitle}>{ozet.aidat.kapsam || `${ayAdi} aidatı`} ödendi</Text>
                    <Text style={styles.aidatOkSub}>{ozet.aidat.tutar} · ödeme kulüp tarafından kaydedildi</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}

              {ozellikAcik('bireysel_ders') && (
                <Pressable style={styles.bireyselCard} onPress={() => router.push('/bireysel-ders')}>
                  <View style={styles.bireyselIcon}>
                    <Text style={{ fontSize: 18 }}>🧑‍🏫</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.bireyselTitleRow}>
                      <Text style={styles.bireyselTitle}>Bireysel Ders Al</Text>
                      <View style={styles.yeniPill}>
                        <Text style={styles.yeniPillText}>YENİ</Text>
                      </View>
                    </View>
                    <Text style={styles.bireyselSub}>Kulüp antrenörlerinden birebir ders rezerve et</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}

              <View style={styles.quickActionsRow}>
                <Pressable style={styles.quickActionBtn} onPress={() => router.push('/izin-bildir')}>
                  <Text style={styles.quickActionIcon}>📋</Text>
                  <Text style={styles.quickActionText}>İzin Bildir</Text>
                </Pressable>
                {ozellikAcik('etkinlikler') && (
                  <Pressable style={styles.quickActionBtn} onPress={() => router.push('/etkinlikler')}>
                    <Text style={styles.quickActionIcon}>🏆</Text>
                    <Text style={styles.quickActionText}>Etkinlikler</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.duyuruHeader}>
                <Text style={styles.duyuruTitle}>Kulüp Duyuruları</Text>
                <Pressable onPress={() => router.push('/duyurular')}>
                  <Text style={styles.duyuruAll}>Tümü</Text>
                </Pressable>
              </View>
              {ozet.duyurular.map((d) => (
                <View key={d.id} style={styles.duyuruRow}>
                  <View style={styles.duyuruIcon}>
                    <Text>{DUYURU_ICON[d.tur]}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.duyuruBaslik}>{d.baslik}</Text>
                    <Text style={styles.duyuruAciklama}>{d.aciklama}</Text>
                  </View>
                  <Text style={styles.duyuruZaman}>{d.zaman}</Text>
                </View>
              ))}
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, marginTop: 3 },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  bellBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 18 },
  bellDot: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgDeep, paddingHorizontal: 3 },
  bellDotText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.onAccent },
  trainingCard: { backgroundColor: colors.surface },
  trainingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trainingLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  branchPill: { backgroundColor: colors.accentSoft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  branchPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 11, color: colors.accent },
  trainingTitle: { fontFamily: fontFamily.archivoBold, fontSize: 22, color: colors.textBright, marginTop: 10 },
  trainingTimeRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  trainingTime1: { fontFamily: fontFamily.archivoBold, fontSize: 32, color: colors.textBright },
  trainingTime2: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.lg, color: colors.textMuted },
  trainingVenue: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  coachAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  coachAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  coachMid: { flex: 1, minWidth: 0 },
  coachName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  coachRole: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  servisBtn: { backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  servisBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  emptyTraining: { borderRadius: radius.xxl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyTrainingIcon: { fontSize: 22 },
  emptyTrainingTitle: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.md, color: colors.textBright },
  emptyTrainingSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  attendanceIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  attendanceMid: { flex: 1, minWidth: 0 },
  attendanceLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  attendanceTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright, marginTop: 2 },
  attendanceSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  attendancePct: { backgroundColor: colors.accentSoft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  attendancePctText: { fontFamily: fontFamily.manropeExtra, fontSize: 11, color: colors.accent },
  aidatCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.surface, padding: spacing.lg },
  aidatCardGecikti: { borderColor: colors.danger },
  aidatTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  aidatIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  aidatIconText: { fontFamily: fontFamily.archivoBold, fontSize: 19, color: colors.warning },
  aidatLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textMuted },
  aidatAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 },
  aidatAmount: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  aidatPill: { backgroundColor: colors.warningSoft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  aidatPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.warning },
  aidatDate: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  aidatNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  aidatNoteDanger: { color: colors.danger },
  aidatOkRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.md },
  aidatOkIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  aidatOkTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  aidatOkSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  chevron: { color: colors.textDim, fontSize: 16 },
  bireyselCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.md },
  bireyselIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  bireyselTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bireyselTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  yeniPill: { backgroundColor: colors.accent, paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.pill },
  yeniPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 9, letterSpacing: 0.5, color: colors.onAccent },
  bireyselSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  quickActionsRow: { flexDirection: 'row', gap: spacing.sm },
  quickActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  quickActionIcon: { fontSize: 16 },
  quickActionText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  duyuruHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  duyuruTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  duyuruAll: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accent },
  duyuruRow: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  duyuruIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  duyuruBaslik: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  duyuruAciklama: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  duyuruZaman: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textDim },
  });
}
