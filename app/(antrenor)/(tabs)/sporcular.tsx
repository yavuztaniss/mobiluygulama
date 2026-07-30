import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState, EmptyState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getSporcular } from '../../../src/data/antrenorRepo';
import type { Sporcu } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, spacing, avatarColorAt } from '../../../src/theme';

export default function AntrenorSporcularScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [sporcular, setSporcular] = useState<Sporcu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSporcular(await getSporcular());
    } catch {
      setError('Sporcular yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = sporcular.filter((s) => s.ad.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')));

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Sporcular</Text>
          {/* Sabit "U12 Basketbol" etiketi kaldırıldı — liste antrenörün TÜM bağlı sporcularını kapsıyor. */}
          <Text style={styles.subtitle}>{sporcular.length} sporcu</Text>
        </View>

        <View style={styles.searchBox}>
          <Text>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Sporcu ara..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {filtered.length === 0 ? (
              <EmptyState title="Sonuç bulunamadı" />
            ) : (
              filtered.map((s) => (
                <Pressable key={s.id} style={styles.row} onPress={() => router.push(`/gelisim?sporcuId=${s.id}`)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{s.init}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{s.ad}</Text>
                    <Text style={styles.sub}>#{s.numara} · Veli: {s.veliAd}</Text>
                  </View>
                  <View style={styles.pctBadge}>
                    <Text style={styles.pctText}>%{s.pct}</Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${s.veliTelefon.replace(/\s/g, '')}`).catch(() => showToast('Arama başlatılamadı'))}
                  >
                    <Text>📞</Text>
                  </Pressable>
                </Pressable>
              ))
            )}
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
  header: { padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 3 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 12 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  sub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  pctBadge: { backgroundColor: colors.accentSoft, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 99 },
  pctText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  callBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  });
}
