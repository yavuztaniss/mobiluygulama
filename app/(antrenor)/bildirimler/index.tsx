import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { EmptyState, LoadingState, ErrorState } from '../../../src/components/StateViews';
import { getAntrenorBildirimler, markAntrenorBildirimOkundu, markAntrenorTumuOkundu } from '../../../src/data/antrenorRepo';
import type { AntrenorBildirim } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

// Bildirimler gerçek olaylardan sentezlenir (bkz. antrenorRepo.syncAntrenorBildirimleri) ve
// şimdilik yalnızca 'izin' + 'rezervasyon' türleri üretilir — hiç dolmayacak 'Mesaj'/'Yoklama'
// filtreleri mock temizliğinde kaldırıldı (tür listesi genişlerse buraya eklenir).
const FILTRELER = [
  { id: 'tumu', ad: 'Tümü' },
  { id: 'izin', ad: 'İzin' },
  { id: 'rezervasyon', ad: 'Bireysel Ders' },
];

const TUR_ICON: Record<AntrenorBildirim['tur'], string> = { izin: '📅', mesaj: '💬', rezervasyon: '🧑‍🏫', yoklama: '✓', sistem: '📣' };
const GRUP_LABEL: Record<AntrenorBildirim['grup'], string> = { bugun: 'BUGÜN', dun: 'DÜN', eski: 'DAHA ÖNCE' };

export default function AntrenorBildirimlerScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [bildirimler, setBildirimler] = useState<AntrenorBildirim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtre, setFiltre] = useState('tumu');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBildirimler(await getAntrenorBildirimler());
    } catch {
      setError('Bildirimler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (filtre === 'tumu' ? bildirimler : bildirimler.filter((b) => b.tur === filtre)),
    [bildirimler, filtre]
  );

  const gruplar: AntrenorBildirim['grup'][] = ['bugun', 'dun', 'eski'];
  const unreadCount = bildirimler.filter((b) => !b.okundu).length;

  async function onTap(b: AntrenorBildirim) {
    if (!b.okundu) {
      await markAntrenorBildirimOkundu(b.id);
      setBildirimler(await getAntrenorBildirimler());
    }
  }

  async function onReadAll() {
    await markAntrenorTumuOkundu();
    setBildirimler(await getAntrenorBildirimler());
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Bildirimler</Text>
            <Text style={styles.headerSub}>{unreadCount > 0 ? `${unreadCount} okunmamış` : 'Hepsi okundu'}</Text>
          </View>
          <Pressable onPress={onReadAll}>
            <Text style={styles.readAllLink}>Tümünü okundu say</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {FILTRELER.map((f) => (
            <Pressable key={f.id} style={[styles.filterChip, filtre === f.id && styles.filterChipActive]} onPress={() => setFiltre(f.id)}>
              <Text style={[styles.filterChipText, filtre === f.id && styles.filterChipTextActive]}>{f.ad}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {filtered.length === 0 ? (
              <EmptyState title="Bu kategoride bildirim yok" />
            ) : (
              gruplar.map((g) => {
                const items = filtered.filter((b) => b.grup === g);
                if (items.length === 0) return null;
                return (
                  <View key={g}>
                    <Text style={styles.groupLabel}>{GRUP_LABEL[g]}</Text>
                    {items.map((n) => (
                      <Pressable key={n.id} style={[styles.notifRow, !n.okundu && styles.notifRowUnread]} onPress={() => onTap(n)}>
                        <View style={styles.notifIcon}>
                          <Text>{TUR_ICON[n.tur]}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.notifTopRow}>
                            <Text style={styles.notifTitle}>{n.baslik}</Text>
                            <Text style={styles.notifTime}>{n.zaman}</Text>
                          </View>
                          <Text style={styles.notifDesc}>{n.aciklama}</Text>
                        </View>
                        {!n.okundu && <View style={styles.unreadDot} />}
                      </Pressable>
                    ))}
                  </View>
                );
              })
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
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  readAllLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  filterScroll: { flexGrow: 0, marginTop: spacing.xs },
  filterRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg },
  filterChip: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  filterChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  filterChipTextActive: { color: colors.accent },
  scroll: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xxl },
  groupLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginTop: spacing.sm, marginBottom: spacing.xs },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 13, marginBottom: spacing.xs },
  notifRowUnread: { borderColor: colors.accentBorder },
  notifIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  notifTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  notifTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  notifTime: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textDim },
  notifDesc: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 5 },
  });
}
