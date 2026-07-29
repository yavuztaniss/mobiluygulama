import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getAktifAntrenman, getBugunkuGruplar, getYoklamaSatirlari } from '../../../src/data/antrenorRepo';
import type { YoklamaSatiri } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing, avatarColorAt } from '../../../src/theme';

function bugunEtiketi(): string {
  const d = new Date();
  return `${d.toLocaleDateString('tr-TR', { weekday: 'long' })}, ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`;
}

export default function YoklamaOzetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  // Bugün ekranından tıklanan grubun antrenman id'si — varsa tahmin yerine o kullanılır.
  const { antrenmanId: paramAntrenmanId } = useLocalSearchParams<{ antrenmanId?: string }>();
  const [satirlar, setSatirlar] = useState<YoklamaSatiri[]>([]);
  const [baslik, setBaslik] = useState(bugunEtiketi());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servisOnaylandi, setServisOnaylandi] = useState<Record<string, boolean>>({});
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Hedef antrenman: (1) route param'la gelen id (Bugün ekranında tıklanan grup),
      // (2) devam eden (aktif) antrenman, (3) bugünün antrenmanı (kaydedilmiş öncelikli).
      let hedefId: string | undefined;
      let sub: string | null = null;
      const gruplar = await getBugunkuGruplar();
      if (paramAntrenmanId) {
        const g = gruplar.find((x) => x.id === paramAntrenmanId);
        hedefId = paramAntrenmanId;
        if (g) sub = `${g.ad} · ${g.saat1} – ${g.saat2}`;
      }
      if (!hedefId) {
        const aktif = await getAktifAntrenman();
        if (aktif) {
          hedefId = aktif.id;
          sub = `${aktif.ad} · ${aktif.saat1} – ${aktif.saat2}`;
        } else {
          const g = gruplar.find((x) => x.yoklamaAlindi) ?? gruplar[0];
          if (g) {
            hedefId = g.id;
            sub = `${g.ad} · ${g.saat1} – ${g.saat2}`;
          }
        }
      }
      setBaslik(sub ?? bugunEtiketi());
      setSatirlar(await getYoklamaSatirlari(hedefId));
    } catch {
      setError('Özet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [paramAntrenmanId]);

  useEffect(() => {
    load();
  }, [load]);

  const katilanlar = satirlar.filter((s) => s.durum === 'in');
  const katilmayanlar = satirlar.filter((s) => s.durum === 'out');
  const pct = satirlar.length ? Math.round((katilanlar.length / satirlar.length) * 100) : 0;
  const size = 92;
  const r = 38;
  const circumference = 2 * Math.PI * r;

  function veliyiAra(telefon: string) {
    Linking.openURL(`tel:${telefon}`).catch(() => showToast('Arama başlatılamadı'));
  }

  // Salt YEREL işaretleme — veliye herhangi bir bildirim GİTMEZ (push altyapısı yok);
  // işaret yalnızca bu ekran açıkken bellekte tutulur.
  function onServisOnay(id: string) {
    setServisOnaylandi((prev) => ({ ...prev, [id]: true }));
    showToast('İşaretlendi');
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
            <Text style={styles.headerSub}>{baslik}</Text>
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

            {/* Sahte "Veli bildirimleri" (İletildi/Görüldü/Ulaşılamadı) ve "SMS ile yinelenir"
                bölümleri kaldırıldı — gerçek push/SMS altyapısı yok. Yerine katılmayan
                sporcuların velilerini gerçek telefon numarasından arama listesi kondu. */}
            {katilmayanlar.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>KATILMAYANLAR</Text>
                  <Text style={styles.sectionCount}>{katilmayanlar.length} sporcu</Text>
                </View>
                {katilmayanlar.map((s) => (
                  <View key={s.id} style={styles.servisRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{s.init}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name}>{s.ad}</Text>
                      <Text style={styles.servisSub}>{s.veliTelefon ? `Veli: ${s.veliTelefon}` : 'Veli telefonu kayıtlı değil'}</Text>
                    </View>
                    {!!s.veliTelefon && (
                      <Pressable style={styles.callBtn} onPress={() => veliyiAra(s.veliTelefon!)}>
                        <Text>📞</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}

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
                  <Text style={styles.servisSub}>{servisOnaylandi[s.id] ? 'Servise bindi olarak işaretlendi ✓' : 'Henüz işaretlenmedi'}</Text>
                </View>
                {!servisOnaylandi[s.id] ? (
                  <Pressable style={styles.servisBtn} onPress={() => onServisOnay(s.id)}>
                    <Text style={styles.servisBtnText}>Bindi</Text>
                  </Pressable>
                ) : (
                  <View style={styles.servisOkBadge}>
                    <Text style={styles.servisOkText}>✓</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.servisNote}>Servis işaretleri yalnızca bu cihazda tutulur, veliye bildirim gitmez</Text>
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
  callBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  servisRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 11 },
  servisNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textDim, marginTop: spacing.xs },
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
