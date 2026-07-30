import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { EmptyState, LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useKurum } from '../../../src/context/KurumContext';
import { getTumDuyurular } from '../../../src/data/veliRepo';
import type { KulupDuyurusu } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../../src/theme';

const DUYURU_ICON: Record<KulupDuyurusu['tur'], string> = { kamp: '🏕️', servis: '🚌', basari: '🏆', genel: '📣' };

export default function TumDuyurularScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { kulupAdi } = useKurum();
  const [duyurular, setDuyurular] = useState<KulupDuyurusu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDuyurular(await getTumDuyurular());
    } catch {
      setError('Duyurular yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

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
            <Text style={styles.headerTitle}>Kulüp Duyuruları</Text>
            <Text style={styles.headerSub}>{kulupAdi}</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {duyurular.length === 0 ? (
              <EmptyState title="Henüz duyuru yok" />
            ) : (
              duyurular.map((d) => (
                <View key={d.id} style={styles.row}>
                  <View style={styles.icon}>
                    <Text>{DUYURU_ICON[d.tur]}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.baslik}>{d.baslik}</Text>
                    <Text style={styles.aciklama}>{d.aciklama}</Text>
                  </View>
                  <Text style={styles.zaman}>{d.zaman}</Text>
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
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  baslik: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  aciklama: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  zaman: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textDim },
  });
}
