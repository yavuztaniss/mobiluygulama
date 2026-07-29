import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getRotaDetay } from '../../../src/data/servisRepo';
import type { ServisRota } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

function getDurakRenk(colors: AppColors): Record<string, { dot: string; text: string; line: string }> {
  return {
    gecti: { dot: colors.accent, text: colors.accent, line: colors.accent },
    suan: { dot: colors.accent, text: colors.accent, line: colors.border },
    bekliyor: { dot: colors.chip, text: colors.textMuted, line: colors.border },
  };
}

export default function RotaDetayScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const DURAK_RENK = getDurakRenk(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rota, setRota] = useState<ServisRota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();
  const [sporcuListOpen, setSporcuListOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setRota(await getRotaDetay(id));
    } catch {
      setError('Rota bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{rota?.ad ?? 'Rota Detayı'}</Text>
            <Text style={styles.headerSub}>{rota?.alt ?? ''} · {rota?.sporcuSayisi ?? 0} sporcu</Text>
          </View>
          {!!rota?.yolda && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>Yolda</Text>
            </View>
          )}
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && rota && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.mapBox}>
              <View style={styles.liveDotBig} />
              <Text style={styles.mapText}>canlı harita önizleme · araç konumu</Text>
              <View style={styles.mapBadge}>
                <Text style={styles.mapBadgeText}>{rota.konumSaat} · {rota.konumHiz}</Text>
              </View>
            </View>

            <View style={styles.soforRow}>
              <View style={styles.soforAvatar}>
                <Text style={styles.soforAvatarText}>{rota.sofor.split(' ').map((p) => p[0]).join('').slice(0, 2)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.soforName}>{rota.sofor}</Text>
                <Text style={styles.soforSub}>Şoför · {rota.plaka} · {rota.arac}</Text>
              </View>
              <Pressable
                style={styles.callBtn}
                onPress={() => Linking.openURL('tel:').catch(() => showToast('Arama başlatılamadı'))}
              >
                <Text>📞</Text>
              </Pressable>
            </View>

            <Card>
              <Text style={styles.sectionLabel}>DURAKLAR</Text>
              {rota.duraklar.map((d, i) => {
                const renk = DURAK_RENK[d.durum];
                const isLast = i === rota.duraklar.length - 1;
                return (
                  <View key={d.id} style={styles.durakRow}>
                    <View style={styles.durakDotCol}>
                      <View style={[styles.durakDot, { backgroundColor: renk.dot }]} />
                      {!isLast && <View style={[styles.durakLine, { backgroundColor: renk.line }]} />}
                    </View>
                    <View style={styles.durakMid}>
                      <View style={styles.durakTopRow}>
                        <Text style={[styles.durakAd, { color: renk.text }]}>{d.ad}</Text>
                        <Text style={[styles.durakSaat, { color: renk.text }]}>{d.saat}</Text>
                      </View>
                      <View style={styles.durakSubRow}>
                        <Text style={styles.durakSub}>{d.sub}</Text>
                        {d.durum === 'gecti' && (
                          <View style={styles.durakTag}>
                            <Text style={styles.durakTagText}>Geçildi</Text>
                          </View>
                        )}
                        {d.durum === 'suan' && (
                          <View style={styles.durakTag}>
                            <Text style={styles.durakTagText}>Şu an</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>

            <Pressable style={styles.sporcuRow} onPress={() => setSporcuListOpen(true)}>
              <Text style={styles.sporcuRowTitle}>Kayıtlı sporcular</Text>
              <Text style={styles.sporcuRowSub}>{rota.sporcuSayisi} sporcu · {rota.duraklar.length} durakta biniş</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              style={styles.notifyBtn}
              onPress={() => showToast('Rota velilerine bildirim gönderildi')}
            >
              <Text style={styles.notifyBtnText}>Rota Velilerine Bildirim Gönder</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={sporcuListOpen} transparent animationType="slide" onRequestClose={() => setSporcuListOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSporcuListOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Kayıtlı Sporcular</Text>
            <Text style={styles.sheetSub}>{rota?.sporcuSayisi ?? 0} sporcu · {rota?.ad}</Text>
            <ScrollView contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.md }}>
              {rota?.duraklar.map((d) => {
                const grup = rota.sporcular.filter((s) => s.durakAd === d.ad);
                if (grup.length === 0) return null;
                return (
                  <View key={d.id} style={{ marginBottom: spacing.sm }}>
                    <Text style={styles.durakGroupLabel}>{d.ad.toUpperCase()} · {grup.length} SPORCU</Text>
                    {grup.map((s) => (
                      <View key={s.id} style={styles.sporcuListRow}>
                        <View style={styles.sporcuAvatar}>
                          <Text style={styles.sporcuAvatarText}>{s.init}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.sporcuListName}>{s.ad}</Text>
                          <Text style={styles.sporcuListVeli}>{s.veliAd} · {s.veliTelefon}</Text>
                        </View>
                        <Pressable
                          style={styles.callBtnSm}
                          onPress={() => Linking.openURL(`tel:${s.veliTelefon.replace(/\s/g, '')}`).catch(() => showToast('Arama başlatılamadı'))}
                        >
                          <Text>📞</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  liveBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  mapBox: { height: 150, borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative' },
  liveDotBig: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent },
  mapText: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 1, color: colors.textMuted },
  mapBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: colors.scrim, paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  mapBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, color: colors.textMuted },
  soforRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 13 },
  soforAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  soforAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.textMuted },
  soforName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  soforSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  callBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginBottom: spacing.sm },
  durakRow: { flexDirection: 'row', gap: 12 },
  durakDotCol: { width: 14, alignItems: 'center' },
  durakDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border },
  durakLine: { flex: 1, width: 2, minHeight: 34 },
  durakMid: { flex: 1, minWidth: 0, paddingBottom: 14 },
  durakTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  durakAd: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md },
  durakSaat: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm },
  durakSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  durakSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  durakTag: { backgroundColor: colors.accentSoft, paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.pill },
  durakTagText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, color: colors.accent },
  sporcuRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  sporcuRowTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  sporcuRowSub: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  chevron: { color: colors.textDim, fontSize: 16 },
  notifyBtn: { height: 48, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  notifyBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accent },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  durakGroupLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginBottom: 6, marginTop: spacing.xs },
  sporcuListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 10, marginTop: 6 },
  sporcuAvatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  sporcuAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: 12, color: colors.textMuted },
  sporcuListName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  sporcuListVeli: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  callBtnSm: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  });
}
