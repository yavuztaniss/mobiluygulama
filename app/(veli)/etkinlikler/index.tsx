import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { useChildLabel } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useChild } from '../../../src/context/ChildContext';
import { getEtkinlikSonuclari, getEtkinlikler, setKatilimDurumu } from '../../../src/data/veliRepo';
import type { Etkinlik, EtkinlikSonuc } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

type Sekme = 'yaklasan' | 'sonuclar';

export default function EtkinliklerScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const childLabel = useChildLabel();
  const { selectedChildId } = useChild();
  const [sekme, setSekme] = useState<Sekme>('yaklasan');
  const [etkinlikler, setEtkinlikler] = useState<Etkinlik[]>([]);
  const [sonuclar, setSonuclar] = useState<EtkinlikSonuc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kampSheet, setKampSheet] = useState(false);
  const [kampTaksit, setKampTaksit] = useState(false);
  const [kampKayitli, setKampKayitli] = useState(false);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, s] = await Promise.all([getEtkinlikler(selectedChildId), getEtkinlikSonuclari()]);
      setEtkinlikler(e);
      setSonuclar(s);
    } catch {
      setError('Etkinlikler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onKatilim(id: string, durum: 'katilir' | 'katilmaz') {
    await setKatilimDurumu(id, selectedChildId, durum);
    setEtkinlikler(await getEtkinlikler(selectedChildId));
  }

  function submitKamp() {
    setKampSheet(false);
    setKampKayitli(true);
    showToast('Yaz kampı kaydın alındı');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Etkinlikler</Text>
            <Text style={styles.headerSub}>{childLabel}</Text>
          </View>
        </View>

        <View style={styles.segmentRow}>
          <Pressable style={[styles.segmentItem, sekme === 'yaklasan' && styles.segmentItemActive]} onPress={() => setSekme('yaklasan')}>
            <Text style={[styles.segmentText, sekme === 'yaklasan' && styles.segmentTextActive]}>Yaklaşan</Text>
          </Pressable>
          <Pressable style={[styles.segmentItem, sekme === 'sonuclar' && styles.segmentItemActive]} onPress={() => setSekme('sonuclar')}>
            <Text style={[styles.segmentText, sekme === 'sonuclar' && styles.segmentTextActive]}>Sonuçlar</Text>
          </Pressable>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {sekme === 'yaklasan' ? (
              <>
                {etkinlikler.map((mt) => (
                  <Card key={mt.id}>
                    <View style={styles.matchTop}>
                      <View style={styles.tagPill}>
                        <Text style={styles.tagPillText}>{mt.tag}</Text>
                      </View>
                    </View>
                    <Text style={styles.matchTitle}>{mt.title}</Text>
                    <Text style={styles.matchSub}>{mt.sub}</Text>
                    <Text style={styles.matchVenue}>📍 {mt.venue}</Text>
                    <Text style={styles.matchExtra}>ℹ️ {mt.extra}</Text>
                    <View style={styles.divider} />
                    <View style={styles.lcvRow}>
                      <Text style={styles.lcvText}>
                        {mt.katilimDurumu === 'bekliyor' ? 'Katılım durumu bekleniyor' : mt.katilimDurumu === 'katilir' ? 'Katılıyor ✓' : 'Katılmıyor'}
                      </Text>
                      <Pressable
                        style={[styles.lcvBtn, mt.katilimDurumu === 'katilir' && styles.lcvBtnActive]}
                        onPress={() => onKatilim(mt.id, 'katilir')}
                      >
                        <Text style={[styles.lcvBtnText, mt.katilimDurumu === 'katilir' && styles.lcvBtnTextActive]}>✓ Katılır</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.lcvBtnOut, mt.katilimDurumu === 'katilmaz' && styles.lcvBtnOutActive]}
                        onPress={() => onKatilim(mt.id, 'katilmaz')}
                      >
                        <Text style={[styles.lcvBtnOutText, mt.katilimDurumu === 'katilmaz' && styles.lcvBtnOutTextActive]}>✕ Katılmaz</Text>
                      </Pressable>
                    </View>
                  </Card>
                ))}

                <View style={styles.kampCard}>
                  <View style={styles.kampTop}>
                    <Text style={styles.kampLabel}>YAZ KAMPI</Text>
                    {kampKayitli ? (
                      <View style={styles.kampBadgeOk}>
                        <Text style={styles.kampBadgeOkText}>✓ KAYITLI</Text>
                      </View>
                    ) : (
                      <View style={styles.kampBadgeWarn}>
                        <Text style={styles.kampBadgeWarnText}>Son 6 kontenjan</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.kampTitle}>Foça Yaz Kampı</Text>
                  <Text style={styles.kampSub}>10 – 17 Ağustos · 7 gece konaklama · günde 2 antrenman</Text>
                  {!kampKayitli ? (
                    <View style={styles.kampBottomRow}>
                      <View style={styles.kampPriceRow}>
                        <Text style={styles.kampPrice}>₺3.825</Text>
                        <Text style={styles.kampPriceOld}>₺4.500</Text>
                        <Text style={styles.kampPriceNote}>%15 erken kayıt</Text>
                      </View>
                      <Pressable style={styles.kampBtn} onPress={() => setKampSheet(true)}>
                        <Text style={styles.kampBtnText}>Kayıt Ol</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.kampOkBox}>
                      <Text style={styles.kampOkText}>Kayıt alındı · ödeme onaylandı, kulüp servisi dahil</Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                {sonuclar.map((rs) => (
                  <View key={rs.id} style={styles.resultRow}>
                    <View style={[styles.resultBadge, { backgroundColor: rs.rBg }]}>
                      <Text style={[styles.resultBadgeText, { color: rs.rFg }]}>{rs.r}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.resultTopRow}>
                        <Text style={styles.resultScore}>{rs.score}</Text>
                        <Text style={styles.resultDate}>{rs.date}</Text>
                      </View>
                      <Text style={styles.resultOpp}>{rs.opp}</Text>
                      <Text style={styles.resultNote}>{rs.note}</Text>
                    </View>
                  </View>
                ))}
                <Text style={styles.footerNote}>Sezon fikstürünün tamamı kulüp panosunda</Text>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={kampSheet} transparent animationType="slide" onRequestClose={() => setKampSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setKampSheet(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Foça Yaz Kampı Kaydı</Text>
            <Text style={styles.sheetSub}>{childLabel.split(' · ')[0]} için</Text>
            <View style={styles.kampTable}>
              <KampRow label="Tarih" value="10 – 17 Ağustos" />
              <KampRow label="Konaklama" value="4 kişilik oda · tam pansiyon" />
              <KampRow label="Ulaşım" value="Kulüp servisi dahil" last />
            </View>
            <View style={styles.sheetPriceRow}>
              <Text style={styles.sheetPrice}>₺3.825</Text>
              <Text style={styles.sheetPriceOld}>₺4.500</Text>
              <View style={styles.sheetPriceBadge}>
                <Text style={styles.sheetPriceBadgeText}>%15 ERKEN KAYIT</Text>
              </View>
            </View>
            <Pressable style={styles.taksitRow} onPress={() => setKampTaksit((v) => !v)}>
              <View style={[styles.radioOuter, kampTaksit && styles.radioOuterActive]}>
                {kampTaksit && <View style={styles.radioInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.taksitTitle}>3 taksit ile öde</Text>
                <Text style={styles.taksitSub}>3 × ₺1.275</Text>
              </View>
              <View style={styles.faizPill}>
                <Text style={styles.faizPillText}>%0 FAİZ</Text>
              </View>
            </Pressable>
            <Button label={kampTaksit ? 'İlk Taksidi Öde · ₺1.275' : 'Kaydı Onayla · ₺3.825'} onPress={submitKamp} />
            <Text style={styles.sheetNote}>🔒 İptal hakkı: kamptan 14 gün öncesine kadar ücretsiz</Text>
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function KampRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={[styles.kampTableRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.kampTableLabel}>{label}</Text>
      <Text style={styles.kampTableValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  segmentRow: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, borderRadius: 16, padding: 5 },
  segmentItem: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  segmentTextActive: { color: colors.accentOnDark },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  matchTop: { flexDirection: 'row', justifyContent: 'flex-start' },
  tagPill: { backgroundColor: colors.accentTint, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  tagPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 1, color: colors.accent },
  matchTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white, marginTop: 9 },
  matchSub: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.iconMuted, marginTop: 3 },
  matchVenue: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 6 },
  matchExtra: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.navyBorder, marginVertical: spacing.sm },
  lcvRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  lcvText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.iconMuted },
  lcvBtn: { height: 38, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  lcvBtnActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  lcvBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  lcvBtnTextActive: { color: colors.accent },
  lcvBtnOut: { height: 38, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  lcvBtnOutActive: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  lcvBtnOutText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  lcvBtnOutTextActive: { color: colors.danger },
  kampCard: { borderRadius: 22, backgroundColor: 'rgba(18,58,46,0.6)', borderWidth: 1, borderColor: 'rgba(46,230,168,0.25)', padding: 16 },
  kampTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kampLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: colors.accent },
  kampBadgeWarn: { backgroundColor: 'rgba(255,180,84,0.12)', paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  kampBadgeWarnText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.warning },
  kampBadgeOk: { backgroundColor: colors.accentTint, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  kampBadgeOkText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent },
  kampTitle: { fontFamily: fontFamily.archivoBold, fontSize: 19, color: colors.white, marginTop: 7 },
  kampSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFainter, marginTop: 3 },
  kampBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13, flexWrap: 'wrap', gap: spacing.xs },
  kampPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  kampPrice: { fontFamily: fontFamily.archivoBold, fontSize: 21, color: colors.accent },
  kampPriceOld: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textFaint, textDecorationLine: 'line-through' },
  kampPriceNote: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent },
  kampBtn: { height: 40, paddingHorizontal: 17, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  kampBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accentOnDark },
  kampOkBox: { marginTop: 12, borderRadius: 13, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, padding: 11 },
  kampOkText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: 15 },
  resultBadge: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  resultBadgeText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg },
  resultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultScore: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  resultDate: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textFaint },
  resultOpp: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  resultNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent, marginTop: 3 },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFaint, marginTop: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: spacing.md },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  kampTable: { borderRadius: 16, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, paddingHorizontal: 14, marginTop: spacing.md },
  kampTableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  kampTableLabel: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  kampTableValue: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.white },
  sheetPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: spacing.md },
  sheetPrice: { fontFamily: fontFamily.archivoBold, fontSize: 26, color: colors.accent },
  sheetPriceOld: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textFaint, textDecorationLine: 'line-through' },
  sheetPriceBadge: { backgroundColor: colors.accentTint, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
  sheetPriceBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accent },
  taksitRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: spacing.md, marginBottom: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.navyBorderStrong, backgroundColor: 'rgba(255,255,255,0.04)', padding: 13 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.navyBorderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  taksitTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  taksitSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  faizPill: { backgroundColor: colors.accentTint, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  faizPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accent },
  sheetNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textFaint, marginTop: spacing.sm },
  });
}
