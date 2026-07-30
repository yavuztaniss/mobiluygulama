import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { Card } from '../../../src/components/Card';
import { useChildLabel } from '../../../src/components/ChildSwitcher';
import { EmptyState, LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useChild } from '../../../src/context/ChildContext';
import { getEtkinlikSonuclari, getEtkinlikler, setKatilimDurumu } from '../../../src/data/veliRepo';
import type { Etkinlik, EtkinlikSonuc } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

type Sekme = 'yaklasan' | 'sonuclar';

function sonucGorunum(colors: AppColors, sonuc: EtkinlikSonuc['sonuc']): { harf: string; bg: string; fg: string } {
  if (sonuc === 'galibiyet') return { harf: 'G', bg: colors.accentSoft, fg: colors.accent };
  if (sonuc === 'maglubiyet') return { harf: 'M', bg: colors.dangerSoft, fg: colors.danger };
  return { harf: 'B', bg: colors.warningSoft, fg: colors.warning };
}

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

  // Sahte "Yaz Kampı kayıt" akışı kaldırıldı — hiçbir yere yazmıyordu (fire-and-forget
  // toast). Gerçek kamp etkinlikleri `etkinlik` tablosuna tur='kamp' olarak eklendiğinde
  // yukarıdaki gerçek RSVP akışıyla listelenir.

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Etkinlikler</Text>
            <Text style={styles.headerSub}>{childLabel}</Text>
          </View>
        </View>

        <View style={styles.segmentRow}>
          <Pressable hitSlop={{ top: 8, bottom: 8 }} style={[styles.segmentItem, sekme === 'yaklasan' && styles.segmentItemActive]} onPress={() => setSekme('yaklasan')}>
            <Text style={[styles.segmentText, sekme === 'yaklasan' && styles.segmentTextActive]}>Yaklaşan</Text>
          </Pressable>
          <Pressable hitSlop={{ top: 8, bottom: 8 }} style={[styles.segmentItem, sekme === 'sonuclar' && styles.segmentItemActive]} onPress={() => setSekme('sonuclar')}>
            <Text style={[styles.segmentText, sekme === 'sonuclar' && styles.segmentTextActive]}>Sonuçlar</Text>
          </Pressable>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {sekme === 'yaklasan' ? (
              <>
                {etkinlikler.length === 0 && (
                  <EmptyState title="Yaklaşan etkinlik yok" subtitle="Kulüp yeni bir maç, turnuva veya kamp eklediğinde burada görünür." />
                )}
                {etkinlikler.map((mt) => (
                  <Card key={mt.id}>
                    <View style={styles.matchTop}>
                      <View style={styles.tagPill}>
                        <Text style={styles.tagPillText}>{mt.tag}</Text>
                      </View>
                    </View>
                    <Text style={styles.matchTitle} numberOfLines={1}>{mt.title}</Text>
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
              </>
            ) : (
              <>
                {sonuclar.map((rs) => {
                  const g = sonucGorunum(colors, rs.sonuc);
                  return (
                    <View key={rs.id} style={styles.resultRow}>
                      <View style={[styles.resultBadge, { backgroundColor: g.bg }]}>
                        <Text style={[styles.resultBadgeText, { color: g.fg }]}>{g.harf}</Text>
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
                  );
                })}
                <Text style={styles.footerNote}>Sezon fikstürünün tamamı kulüp panosunda</Text>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  segmentRow: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 5 },
  segmentItem: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  segmentTextActive: { color: colors.onAccent },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  matchTop: { flexDirection: 'row', justifyContent: 'flex-start' },
  tagPill: { backgroundColor: colors.accentSoft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  tagPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 1, color: colors.accent },
  matchTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: 9 },
  matchSub: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  matchVenue: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 6 },
  matchExtra: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  lcvRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' },
  lcvText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  lcvBtn: { height: 38, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  lcvBtnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  lcvBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  lcvBtnTextActive: { color: colors.accent },
  lcvBtnOut: { height: 38, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  lcvBtnOutActive: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  lcvBtnOutText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  lcvBtnOutTextActive: { color: colors.danger },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 15 },
  resultBadge: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  resultBadgeText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg },
  resultTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultScore: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  resultDate: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  resultOpp: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  resultNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.accent, marginTop: 3 },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.sm },
  });
}
