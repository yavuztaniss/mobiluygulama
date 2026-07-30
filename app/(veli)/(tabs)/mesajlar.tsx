import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState, EmptyState } from '../../../src/components/StateViews';
import { Toast, useIslem, useToast } from '../../../src/components/Toast';
import { getKonusmalar, getRehber, sohbetBaslat } from '../../../src/data/mesajRepo';
import type { KonusmaSatir, RehberKisi } from '../../../src/data/types-mesaj';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

export default function MesajlarScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [konusmalar, setKonusmalar] = useState<KonusmaSatir[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { toastMessage, showToast } = useToast();
  const calistir = useIslem(showToast);

  const [rehberOpen, setRehberOpen] = useState(false);
  const [rehber, setRehber] = useState<RehberKisi[]>([]);
  const [rehberYukleniyor, setRehberYukleniyor] = useState(false);
  const [baslatiliyorId, setBaslatiliyorId] = useState<string | null>(null);

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

  async function openRehber() {
    setRehberOpen(true);
    setRehberYukleniyor(true);
    try {
      setRehber(await getRehber());
    } finally {
      setRehberYukleniyor(false);
    }
  }

  async function onSecKisi(kisi: RehberKisi) {
    setBaslatiliyorId(kisi.id);
    try {
      // Hata yutulduğunda rehber modalı sebepsiz açık kalıyor, kullanıcı
      // dokunmanın işe yaramadığını sanıp tekrar tekrar deniyordu.
      let konusmaId = '';
      const oldu = await calistir(
        async () => { konusmaId = await sohbetBaslat(kisi.id); },
        'Sohbet başlatılamadı. Bağlantınızı kontrol edin.'
      );
      if (!oldu) return;
      setRehberOpen(false);
      router.push(`/mesajlar/${konusmaId}`);
    } finally {
      setBaslatiliyorId(null);
    }
  }

  const filtered = konusmalar.filter((k) => k.ad.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')));

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Mesajlar</Text>
              <Text style={styles.subtitle}>Antrenör, kulüp ve servis tek yerde</Text>
            </View>
            <Pressable style={styles.newBtn} onPress={openRehber}>
              <Text style={{ fontSize: 18 }}>✎</Text>
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Text>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Sohbetlerde ara"
              placeholderTextColor={colors.textDim}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <View style={styles.pinnedCard}>
            <View style={styles.pinnedTop}>
              <View style={styles.pinnedIcon}>
                <Text>📣</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pinnedTitle}>U12 Basketbol · Veli Kanalı</Text>
                <Text style={styles.pinnedSub}>Yalnızca antrenör yazar · 24 veli</Text>
              </View>
              <Text style={styles.pinnedTime}>12:05</Text>
            </View>
            <Text style={styles.pinnedMsg}>Cuma antrenmanı 30 dk erken başlayacak, 16:30'da salonda olalım.</Text>
          </View>

          {loading && <LoadingState label="Yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && (
            <>
              <Text style={styles.sectionLabel}>SOHBETLER</Text>
              {filtered.map((k) => (
                <Pressable key={k.id} style={styles.convRow} onPress={() => router.push(`/mesajlar/${k.id}`)}>
                  <View style={[styles.convAvatar, { backgroundColor: k.avBg }]}>
                    <Text style={[styles.convAvatarText, { color: k.avFg }]}>{k.init}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.convTopRow}>
                      <Text style={styles.convName} numberOfLines={1}>{k.ad}</Text>
                      <Text style={styles.convTime}>{k.zaman}</Text>
                    </View>
                    <Text style={styles.convRole}>{k.role}</Text>
                    <View style={styles.convBottomRow}>
                      <Text style={styles.convLast} numberOfLines={1}>{k.son}</Text>
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
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <AppModal visible={rehberOpen} transparent animationType="slide" onRequestClose={() => setRehberOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRehberOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Yeni Sohbet</Text>
            <Text style={styles.sheetSub}>Kiminle sohbet başlatmak istersin?</Text>
            {rehberYukleniyor ? (
              <LoadingState label="Yükleniyor…" />
            ) : rehber.length === 0 ? (
              <EmptyState title="Zaten herkesle bir sohbetin var" />
            ) : (
              <ScrollView contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.md }}>
                {rehber.map((k) => (
                  <Pressable key={k.id} style={styles.rehberRow} onPress={() => onSecKisi(k)} disabled={!!baslatiliyorId}>
                    <View style={[styles.rehberAvatar, { backgroundColor: k.avBg }]}>
                      <Text style={[styles.rehberAvatarText, { color: k.avFg }]}>{k.init}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rehberAd} numberOfLines={1}>{k.ad}</Text>
                      <Text style={styles.rehberRol} numberOfLines={1}>{k.role}</Text>
                    </View>
                    {baslatiliyorId === k.id && <Text style={styles.rehberLoading}>Açılıyor…</Text>}
                  </Pressable>
                ))}
              </ScrollView>
            )}
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  newBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  pinnedCard: { borderRadius: 22, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 15 },
  pinnedTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pinnedIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pinnedTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  pinnedSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted },
  pinnedTime: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  pinnedMsg: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginTop: spacing.sm },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  convAvatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  convAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  convTime: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  convRole: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, marginTop: 1, color: colors.accent },
  convBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  convLast: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  unreadBadge: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.onAccent },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.md },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '75%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  rehberRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: spacing.xs },
  rehberAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rehberAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
  rehberAd: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  rehberRol: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, marginTop: 1, color: colors.accent },
  rehberLoading: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.accent },
  });
}
