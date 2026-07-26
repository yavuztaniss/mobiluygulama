import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getKadro, getKadroBaslik, getKadroYayinDurumu, kadroKilidiAc, kadroYayinla, lcvKatilanlariEkle, toggleKadroSecim } from '../../../src/data/antrenorRepo';
import type { KadroSatiri } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

function getLcvMeta(colors: AppColors): Record<KadroSatiri['lcv'], { label: string; color: string }> {
  return {
    katiliyor: { label: 'Katılıyor', color: colors.accent },
    katilamiyor: { label: 'Katılamıyor', color: colors.danger },
    'yanit-yok': { label: 'Yanıt yok', color: colors.textFaint },
  };
}

export default function MacKadrosuScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const LCV_META = getLcvMeta(colors);
  const [kadro, setKadro] = useState<KadroSatiri[]>([]);
  const [baslik, setBaslik] = useState<{ rakip: string; tarihSaat: string } | null>(null);
  const [yayinlandi, setYayinlandi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [k, y, b] = await Promise.all([getKadro(), getKadroYayinDurumu(), getKadroBaslik()]);
      setKadro(k);
      setYayinlandi(y);
      setBaslik(b);
    } catch {
      setError('Kadro yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const secilenSayisi = kadro.filter((k) => k.secili).length;
  const katiliyorN = kadro.filter((k) => k.lcv === 'katiliyor').length;
  const katilamiyorN = kadro.filter((k) => k.lcv === 'katilamiyor').length;
  const yanitYokN = kadro.filter((k) => k.lcv === 'yanit-yok').length;

  async function onToggle(id: string) {
    if (yayinlandi) {
      showToast('Kadro kilitli — "Düzenle"ye dokunun');
      return;
    }
    await toggleKadroSecim(id);
    setKadro(await getKadro());
  }

  async function onLcvEkle() {
    if (yayinlandi) return;
    await lcvKatilanlariEkle();
    setKadro(await getKadro());
  }

  async function onYayinla() {
    setSaving(true);
    try {
      await kadroYayinla();
      setYayinlandi(true);
      showToast('Kadro yayınlandı · velilere bildirim gitti');
    } finally {
      setSaving(false);
    }
  }

  async function onDuzenle() {
    await kadroKilidiAc();
    setYayinlandi(false);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Maç Kadrosu</Text>
            <Text style={styles.headerSub}>{baslik ? `${baslik.rakip} ile · ${baslik.tarihSaat}` : 'Yaklaşan maç yok'}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{secilenSayisi}/12</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.lcvCard}>
              <Text style={styles.lcvLabel}>VELİ LCV YANITLARI</Text>
              <View style={styles.lcvRow}>
                <View style={[styles.lcvBox, styles.lcvBoxGreen]}>
                  <Text style={[styles.lcvValue, { color: colors.accent }]}>{katiliyorN}</Text>
                  <Text style={styles.lcvBoxLabel}>KATILIYOR</Text>
                </View>
                <View style={[styles.lcvBox, styles.lcvBoxRed]}>
                  <Text style={[styles.lcvValue, { color: colors.danger }]}>{katilamiyorN}</Text>
                  <Text style={styles.lcvBoxLabel}>KATILAMIYOR</Text>
                </View>
                <View style={styles.lcvBox}>
                  <Text style={styles.lcvValue}>{yanitYokN}</Text>
                  <Text style={styles.lcvBoxLabel}>YANIT YOK</Text>
                </View>
              </View>
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.listLabel}>OYUNCU SEÇ</Text>
              <Pressable style={styles.lcvEkleBtn} onPress={onLcvEkle}>
                <Text style={styles.lcvEkleBtnText}>LCV katılanları ekle</Text>
              </Pressable>
            </View>

            {kadro.map((k) => {
              const meta = LCV_META[k.lcv];
              return (
                <Pressable key={k.id} style={[styles.row, k.lcv === 'katilamiyor' && styles.rowFaded]} onPress={() => onToggle(k.id)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{k.ad.split(' ').map((p) => p[0]).join('').slice(0, 2)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name}>{k.ad}</Text>
                    <Text style={styles.num}>#{k.numara}</Text>
                  </View>
                  <View style={styles.lcvPill}>
                    <Text style={[styles.lcvPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={[styles.checkBox, k.secili && styles.checkBoxActive]}>
                    {k.secili && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!loading && !error && (
          <View style={styles.bottomBar}>
            {!yayinlandi ? (
              <Pressable style={styles.pubBtn} onPress={onYayinla} disabled={saving}>
                <Text style={styles.pubBtnText}>{saving ? 'Yayınlanıyor…' : `Kadroyu Yayınla · ${secilenSayisi}/12`}</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.savedBox}>
                  <Text style={styles.savedText}>✓ Kadro yayınlandı · velilere bildirim gitti</Text>
                </View>
                <Pressable onPress={onDuzenle}>
                  <Text style={styles.unlockText}>Düzenle</Text>
                </Pressable>
              </>
            )}
          </View>
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
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  countPill: { backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 14 },
  countPillText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.accent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: 140 },
  lcvCard: { borderRadius: radius.xxl, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: spacing.md },
  lcvLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  lcvRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  lcvBox: { flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.navyBorder, padding: 9, alignItems: 'center' },
  lcvBoxGreen: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  lcvBoxRed: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  lcvValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  lcvBoxLabel: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  listLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  lcvEkleBtn: { backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill },
  lcvEkleBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 11.5, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: 10 },
  rowFaded: { opacity: 0.55 },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: 12.5, color: '#9FE8CE' },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  num: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textFaint, marginTop: 1 },
  lcvPill: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  lcvPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10 },
  checkBox: { width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: colors.navyBorderStrong, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.accentOnDark, fontSize: 13, fontFamily: fontFamily.archivoBold },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl },
  pubBtn: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pubBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  savedBox: { height: 52, borderRadius: 16, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  unlockText: { textAlign: 'center', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  });
}
