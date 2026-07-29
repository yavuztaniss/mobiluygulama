import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { Card } from '../../../src/components/Card';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useChild } from '../../../src/context/ChildContext';
import { getServisTakip } from '../../../src/data/veliRepo';
import { getKonusmalar } from '../../../src/data/mesajRepo';
import type { ServisTakip } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing, avatarColorAt } from '../../../src/theme';

export default function ServisScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { selectedChildId } = useChild();
  const [takip, setTakip] = useState<ServisTakip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      setTakip(await getServisTakip(selectedChildId));
    } catch {
      setError('Servis bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onMesajSofor() {
    if (!takip) return;
    const konusmalar = await getKonusmalar();
    const konusma = konusmalar.find((k) => k.ad === takip.soforAdi);
    if (konusma) {
      router.push(`/mesajlar/${konusma.id}`);
    } else {
      showToast('Şoförle sohbet bulunamadı');
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Servis</Text>
          {!!takip && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              {/* Gerçek GPS/canlı konum yok — gösterilen, rotanın PLANI. */}
              <Text style={styles.liveBadgeText}>PLANLI</Text>
            </View>
          )}
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && !takip && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxText}>Bu sporcu için servis kaydı bulunmuyor.</Text>
          </View>
        )}

        {!loading && !error && takip && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.mapBox}>
              <View style={styles.busDot} />
              <Text style={styles.mapText}>rota planı · duraklar ve planlı saatler</Text>
              <View style={styles.hatBadge}>
                <Text style={styles.hatBadgeText}>{takip.hatAdi} · {takip.plaka}</Text>
              </View>
            </View>

            <Card>
              <View style={styles.etaRow}>
                <View>
                  <Text style={styles.etaLabel}>TAHMİNİ VARIŞ</Text>
                  <View style={styles.etaValueRow}>
                    <Text style={styles.etaValue}>{takip.etaMin}</Text>
                    <Text style={styles.etaUnit}>dk</Text>
                  </View>
                  <Text style={styles.etaNote}>Eve varış · yaklaşık {takip.etaClock}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.etaLabel}>DURUM</Text>
                  <Text style={styles.busStatus}>{takip.durum}</Text>
                  <Text style={styles.busStop}>{takip.suankiDurak}</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${takip.routePct}%` }]} />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabel}>Spor Okulu</Text>
                <Text style={styles.progressLabel}>{takip.stopsLeft} durak kaldı</Text>
                <Text style={styles.progressLabel}>Ev</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.soforRow}>
                <View style={styles.soforAvatar}>
                  <Text style={styles.soforAvatarText}>{takip.soforInit}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.soforName}>{takip.soforAdi}</Text>
                  <Text style={styles.soforSub}>Servis şoförü</Text>
                </View>
                <Pressable style={styles.iconBtn} onPress={onMesajSofor}>
                  <Text>💬</Text>
                </Pressable>
                {!!takip.soforTelefon && (
                  <Pressable
                    style={styles.callBtnMain}
                    onPress={() => Linking.openURL(`tel:${takip.soforTelefon!.replace(/\s/g, '')}`).catch(() => showToast('Arama başlatılamadı'))}
                  >
                    <Text style={styles.callBtnMainText}>Ara</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>✓ {takip.bindiMesaji}</Text>
              </View>
            </Card>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  liveBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent, letterSpacing: 0.5 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  emptyBox: { margin: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center' },
  emptyBoxText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center' },
  mapBox: { height: 160, borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative' },
  busDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent },
  mapText: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 1, color: colors.textMuted },
  hatBadge: { position: 'absolute', top: 10, left: 10, right: 10, backgroundColor: colors.scrim, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  hatBadgeText: { fontFamily: fontFamily.manropeBold, fontSize: 11, color: colors.textMuted },
  etaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  etaLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  etaValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 3 },
  etaValue: { fontFamily: fontFamily.archivoBold, fontSize: 34, color: colors.accent, letterSpacing: -1 },
  etaUnit: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textMuted },
  etaNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  busStatus: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright, marginTop: 6 },
  busStop: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textDim },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  soforRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  soforAvatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  soforAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  soforName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  soforSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  iconBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  callBtnMain: { height: 44, paddingHorizontal: 18, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  callBtnMainText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  confirmBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  confirmText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent },
  });
}
