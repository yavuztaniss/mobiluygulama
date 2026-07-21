import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useToast } from '../../src/components/Toast';
import { getBasvurular, setBasvuruDurum } from '../../src/data/basvurularRepo';
import type { Basvuru } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

export default function BasvurularScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [basvurular, setBasvurular] = useState<Basvuru[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBasvurular(await getBasvurular());
    } catch {
      setError('Başvurular yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = basvurular.filter((b) => b.durum === 'bekliyor').length;

  async function onKarar(b: Basvuru, durum: 'onaylandi' | 'reddedildi') {
    await setBasvuruDurum(b.id, durum);
    setBasvurular(await getBasvurular());
    showToast(
      durum === 'onaylandi'
        ? `${b.ad.split(' ')[0]} onaylandı · ${b.veli.split(' ')[0]} Hanım/Bey bilgilendirildi`
        : 'Başvuru reddedildi · veliye iletildi'
    );
  }

  async function onGeriAl(b: Basvuru) {
    await setBasvuruDurum(b.id, 'bekliyor');
    setBasvurular(await getBasvurular());
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Başvurular</Text>
            <Text style={styles.headerSub}>
              {pendingCount > 0 ? `${pendingCount} bekleyen · bu hafta ${basvurular.length} başvuru` : `Tümü sonuçlandı · bu hafta ${basvurular.length} başvuru`}
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>

        {loading && <LoadingState label="Başvurular yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {basvurular.map((b) => {
              const decided = b.durum !== 'bekliyor';
              const approved = b.durum === 'onaylandi';
              return (
                <View
                  key={b.id}
                  style={[
                    styles.card,
                    { borderColor: decided ? 'rgba(255,255,255,0.05)' : 'rgba(255,180,84,0.28)' },
                  ]}
                >
                  <View style={styles.topRow}>
                    <View style={[styles.avatar, { backgroundColor: b.avBg }]}>
                      <Text style={[styles.avatarText, { color: b.avFg }]}>{b.init}</Text>
                    </View>
                    <View style={styles.mid}>
                      <Text style={styles.name}>{b.ad}</Text>
                      <Text style={styles.altText}>{b.altBilgi}</Text>
                    </View>
                    <View
                      style={[
                        styles.tag,
                        { backgroundColor: b.tag === 'DENEME' ? 'rgba(90,167,255,0.12)' : colors.accentTint },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: b.tag === 'DENEME' ? '#5AA7FF' : colors.accent }]}>{b.tag}</Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailText}>{b.detay}</Text>
                  </View>
                  <Text style={styles.whenText}>Veli: {b.veli} · {b.when}</Text>

                  {!decided && (
                    <View style={styles.actionRow}>
                      <Pressable style={styles.approveBtn} onPress={() => onKarar(b, 'onaylandi')}>
                        <Text style={styles.approveBtnText}>✓ Onayla</Text>
                      </Pressable>
                      <Pressable style={styles.rejectBtn} onPress={() => onKarar(b, 'reddedildi')}>
                        <Text style={styles.rejectBtnText}>✕ Reddet</Text>
                      </Pressable>
                    </View>
                  )}
                  {decided && (
                    <View style={[styles.decidedBox, approved ? styles.decidedBoxOk : styles.decidedBoxNo]}>
                      <Text style={[styles.decidedText, { color: approved ? colors.accent : colors.danger }]}>
                        {approved
                          ? 'Onaylandı · veliye bildirim gitti, grup listesine eklendi'
                          : 'Reddedildi · veliye kontenjan bilgisi iletildi'}
                      </Text>
                      <Pressable onPress={() => onGeriAl(b)}>
                        <Text style={styles.undoText}>Geri Al</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={styles.footerNote}>Onaylanan sporcu gruba ve veli uygulamasına otomatik eklenir</Text>
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
  pendingBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  pendingBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accentOnDark },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { borderRadius: radius.xxl, backgroundColor: colors.navySurface, borderWidth: 1, padding: 15 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base },
  mid: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.white },
  altText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  tag: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  tagText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11, padding: 11, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  detailText: { flex: 1, fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.iconMuted },
  whenText: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textFaint, marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  approveBtn: { flex: 1, height: 42, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accentOnDark },
  rejectBtn: { flex: 1, height: 42, borderRadius: 13, backgroundColor: colors.dangerBg, borderWidth: 1.5, borderColor: colors.dangerBorder, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.danger },
  decidedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 13, borderWidth: 1 },
  decidedBoxOk: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  decidedBoxNo: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  decidedText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm },
  undoText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textFaint, marginTop: spacing.xs },
  });
}
