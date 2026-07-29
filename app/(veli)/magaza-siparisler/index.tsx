import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { EmptyState, LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useChild } from '../../../src/context/ChildContext';
import { getSiparislerim } from '../../../src/data/magazaRepo';
import type { Siparis, SiparisDurum } from '../../../src/data/types-magaza';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

const DURUM_LABEL: Record<SiparisDurum, string> = { hazirlaniyor: 'Hazırlanıyor', hazir: 'Hazır', teslim: 'Teslim Edildi' };

function getDurumColor(colors: AppColors): Record<SiparisDurum, string> {
  return { hazirlaniyor: colors.warning, hazir: colors.accent, teslim: colors.textDim };
}

export default function SiparislerimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const DURUM_COLOR = getDurumColor(colors);
  const { selectedChildId } = useChild();
  const [siparisler, setSiparisler] = useState<Siparis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      setSiparisler(await getSiparislerim(selectedChildId));
    } catch {
      setError('Siparişler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

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
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Siparişlerim</Text>
            <Text style={styles.headerSub}>Kulüp Mağazası</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {siparisler.length === 0 ? (
              <EmptyState title="Henüz sipariş yok" />
            ) : (
              siparisler.map((s) => (
                <View key={s.id} style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.urun}>{s.urun}</Text>
                    <Text style={styles.tarih}>{s.tarih}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.tutar}>{s.tutar}</Text>
                    <View style={[styles.durumPill, { backgroundColor: DURUM_COLOR[s.durum] + '22' }]}>
                      <Text style={[styles.durumText, { color: DURUM_COLOR[s.durum] }]}>{DURUM_LABEL[s.durum]}</Text>
                    </View>
                  </View>
                </View>
              ))
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
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', borderRadius: radius.xl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  urun: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  tarih: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textDim, marginTop: 3 },
  tutar: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.textBright },
  durumPill: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  durumText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5 },
  });
}
