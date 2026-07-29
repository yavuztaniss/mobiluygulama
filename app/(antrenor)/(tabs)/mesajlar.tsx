import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { getKonusmalar } from '../../../src/data/mesajRepo';
import type { KonusmaSatir } from '../../../src/data/types-mesaj';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function AntrenorMesajlarScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [konusmalar, setKonusmalar] = useState<KonusmaSatir[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKonusmalar(await getKonusmalar());
    } catch {
      setError('Mesajlar yüklenemedi.');
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
          <Text style={styles.title}>Mesajlar</Text>
          <Text style={styles.subtitle}>Veliler ve kulüp yönetimi</Text>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {konusmalar.map((k) => (
              <Pressable key={k.id} style={styles.row} onPress={() => router.push(`/mesajlar/${k.id}`)}>
                <View style={[styles.avatar, { backgroundColor: k.avBg }]}>
                  <Text style={[styles.avatarText, { color: k.avFg }]}>{k.init}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.topRow}>
                    <Text style={styles.name}>{k.ad}</Text>
                    <Text style={styles.time}>{k.zaman}</Text>
                  </View>
                  <Text style={styles.role}>{k.role}</Text>
                  <View style={styles.bottomRow}>
                    <Text style={styles.last} numberOfLines={1}>{k.son}</Text>
                    {k.unread > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{k.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
            <Text style={styles.footerNote}>🔒 Numaralar paylaşılmaz · iletişim uygulama içinde kalır</Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 3 },
  scroll: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  time: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textDim },
  role: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  last: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  unreadBadge: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.onAccent },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textDim, marginTop: spacing.md },
  });
}
