import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getVeliBildirimleri, getYoklamaSatirlari } from '../../../src/data/antrenorRepo';
import type { VeliBildirimi, YoklamaSatiri } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing, avatarColorAt } from '../../../src/theme';

function getDurumMeta(colors: AppColors): Record<VeliBildirimi['durum'], { label: string; color: string }> {
  return {
    iletildi: { label: 'İletildi', color: colors.textMuted },
    gorundu: { label: 'Görüldü', color: colors.accent },
    ulasilamadi: { label: 'Ulaşılamadı', color: colors.danger },
  };
}

export default function YoklamaOzetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const DURUM_META = getDurumMeta(colors);
  const [satirlar, setSatirlar] = useState<YoklamaSatiri[]>([]);
  const [bildirimler, setBildirimler] = useState<VeliBildirimi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servisOnaylandi, setServisOnaylandi] = useState<Record<string, boolean>>({});
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, b] = await Promise.all([getYoklamaSatirlari(), getVeliBildirimleri()]);
      setSatirlar(s);
      setBildirimler(b);
    } catch {
      setError('Özet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const katilanlar = satirlar.filter((s) => s.durum === 'in');
  const katilmayanlar = satirlar.filter((s) => s.durum === 'out');
  const pct = satirlar.length ? Math.round((katilanlar.length / satirlar.length) * 100) : 0;
  const size = 92;
  const r = 38;
  const circumference = 2 * Math.PI * r;

  function onServisOnay(id: string, ad: string) {
    setServisOnaylandi((prev) => ({ ...prev, [id]: true }));
    showToast(ad + " servise bindi — veliye bildirim gönderildi");
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Yoklama Özeti</Text>
            <Text style={styles.headerSub}>U12 Basketbol · Pazartesi, 20 Temmuz</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.heroCard}>
              <View style={{ width: size, height: size }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={8} fill="none" />
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={colors.accent}
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
                  />
                </Svg>
                <View style={styles.heroPctWrap} pointerEvents="none">
                  <Text style={styles.heroPct}>%{pct}</Text>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroLabel}>KATILIM ORANI</Text>
                <Text style={styles.heroSub}>{katilanlar.length}/{satirlar.length} sporcu katıldı</Text>
                {katilmayanlar.length > 0 && (
                  <Text style={styles.heroMiss}>✕ Katılmayan: {katilmayanlar.map((k) => k.ad.split(' ')[0]).join(', ')}</Text>
                )}
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>VELİ BİLDİRİMLERİ</Text>
              <Text style={styles.sectionCount}>{bildirimler.length} bildirim</Text>
            </View>
            {bildirimler.map((b) => {
              const meta = DURUM_META[b.durum];
              return (
                <View key={b.id} style={styles.notifRow}>
                  <View style={styles.notifIcon}>
                    <Text>🔔</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.notifVeli}>{b.veliAd}</Text>
                    <Text style={styles.notifSub}>{b.sporcuAd}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.notifStatus, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.notifTime}>{b.zaman}</Text>
                  </View>
                  {b.durum === 'ulasilamadi' && (
                    <Pressable style={styles.callBtn} onPress={() => Linking.openURL('tel:').catch(() => showToast('Arama başlatılamadı'))}>
                      <Text>📞</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <View style={styles.smsNote}>
              <Text style={styles.smsNoteText}>Ulaşmayan bildirimler 5 dakika sonra SMS ile yinelenir</Text>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>SERVİS TAKİBİ</Text>
              <Text style={styles.sectionCount}>{katilanlar.length} sporcu</Text>
            </View>
            {katilanlar.map((s) => (
              <View key={s.id} style={styles.servisRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{s.init}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{s.ad}</Text>
                  <Text style={styles.servisSub}>{servisOnaylandi[s.id] ? 'Servise bindi ✓' : 'Servis bekleniyor'}</Text>
                </View>
                {!servisOnaylandi[s.id] ? (
                  <Pressable style={styles.servisBtn} onPress={() => onServisOnay(s.id, s.ad)}>
                    <Text style={styles.servisBtnText}>Bindi</Text>
                  </Pressable>
                ) : (
                  <View style={styles.servisOkBadge}>
                    <Text style={styles.servisOkText}>✓</Text>
                  </View>
                )}
              </View>
            ))}
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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.sm },
  heroPctWrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  heroPct: { fontFamily: fontFamily.archivoBold, fontSize: 19, color: colors.textBright },
  heroLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  heroSub: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: 5 },
  heroMiss: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.danger, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  sectionCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 11 },
  notifIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  notifVeli: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  notifSub: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  notifStatus: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5 },
  notifTime: { fontFamily: fontFamily.manropeSemi, fontSize: 10, color: colors.textDim, marginTop: 2 },
  callBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  smsNote: { borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 11, marginTop: spacing.xs },
  smsNoteText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent },
  servisRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 11 },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: 12.5, color: avatarColorAt(0).avFg },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  servisSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  servisBtn: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12 },
  servisBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  servisOkBadge: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  servisOkText: { color: colors.accent, fontFamily: fontFamily.archivoBold },
  });
}
