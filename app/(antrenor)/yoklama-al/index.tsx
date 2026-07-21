import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import {
  getYoklamaKayitDurumu,
  getYoklamaSatirlari,
  setYoklamaDurum,
  tumunuKatildiYap,
  yoklamaKaydet,
  yoklamaKilidiAc,
} from '../../../src/data/antrenorRepo';
import type { YoklamaSatiri } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function YoklamaAlScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [satirlar, setSatirlar] = useState<YoklamaSatiri[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<{ inCount: number; outCount: number } | null>(null);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, durum] = await Promise.all([getYoklamaSatirlari(), getYoklamaKayitDurumu()]);
      setSatirlar(rows);
      setSaved(durum.kaydedildi);
      setSavedAt(durum.zaman);
    } catch {
      setError('Yoklama yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inCount = satirlar.filter((s) => s.durum === 'in').length;
  const outCount = satirlar.filter((s) => s.durum === 'out').length;
  const unmarked = satirlar.filter((s) => s.durum === null).length;
  const izinliSatir = satirlar.find((s) => s.izinli);

  async function onSetDurum(id: string, durum: 'in' | 'out') {
    if (saved) {
      showToast('Kayıt kilitli — "Düzenle"ye dokunun');
      return;
    }
    await setYoklamaDurum(id, durum);
    setSatirlar(await getYoklamaSatirlari());
  }

  async function onTumunuKatildi() {
    if (saved) return;
    await tumunuKatildiYap();
    setSatirlar(await getYoklamaSatirlari());
  }

  async function onSave() {
    setSaving(true);
    try {
      const result = await yoklamaKaydet();
      setOverlay(result);
    } finally {
      setSaving(false);
    }
  }

  async function closeOverlay() {
    const durum = await getYoklamaKayitDurumu();
    setSaved(durum.kaydedildi);
    setSavedAt(durum.zaman);
    setOverlay(null);
  }

  async function onUnlock() {
    await yoklamaKilidiAc();
    setSaved(false);
    setSavedAt(null);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Yoklama</Text>
            <Text style={styles.headerSub}>U12 Basketbol · 17:00 – 18:30 · Salon 2</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>CANLI</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={[styles.statBox, styles.statBoxGreen]}>
                  <Text style={[styles.statValue, { color: colors.accent }]}>{inCount}</Text>
                  <Text style={styles.statLabel}>KATILDI</Text>
                </View>
                <View style={[styles.statBox, styles.statBoxRed]}>
                  <Text style={[styles.statValue, { color: colors.danger }]}>{outCount}</Text>
                  <Text style={styles.statLabel}>KATILMADI</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{unmarked}</Text>
                  <Text style={styles.statLabel}>İŞARETSİZ</Text>
                </View>
              </View>
              <Text style={styles.hintText}>Satıra dokunup katıldı/katılmadı işaretleyin</Text>
            </View>

            {izinliSatir && (
              <View style={styles.izinBanner}>
                <View style={styles.izinIcon}>
                  <Text>📅</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.izinTitle}>Gelen izin · {izinliSatir.ad}</Text>
                  <Text style={styles.izinDetay}>{izinliSatir.izinDetay}</Text>
                </View>
                <View style={styles.izinPill}>
                  <Text style={styles.izinPillText}>İZİNLİ</Text>
                </View>
              </View>
            )}

            <View style={styles.listHeader}>
              <Text style={styles.listLabel}>SPORCU LİSTESİ</Text>
              <Pressable style={styles.allInBtn} onPress={onTumunuKatildi}>
                <Text style={styles.allInBtnText}>Tümünü katıldı yap</Text>
              </Pressable>
            </View>

            {satirlar.map((s) => (
              <View key={s.id} style={[styles.row, s.izinli && styles.rowIzinli]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{s.init}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{s.ad}</Text>
                  {s.izinli && <Text style={styles.izinliSub}>İzinli · devamsızlık sayılmaz</Text>}
                </View>
                <View style={styles.toggleGroup}>
                  <Pressable
                    style={[styles.toggleBtn, s.durum === 'in' && styles.toggleBtnInActive]}
                    onPress={() => onSetDurum(s.id, 'in')}
                  >
                    <Text style={[styles.toggleIcon, s.durum === 'in' && { color: colors.accent }]}>✓</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.toggleBtn, s.durum === 'out' && styles.toggleBtnOutActive]}
                    onPress={() => onSetDurum(s.id, 'out')}
                  >
                    <Text style={[styles.toggleIcon, s.durum === 'out' && { color: colors.danger }]}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {!loading && !error && (
          <View style={styles.bottomBar}>
            {!saved ? (
              <Pressable style={styles.saveBtn} onPress={onSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor…' : 'Yoklamayı Kaydet'}</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.savedBox}>
                  <Text style={styles.savedText}>✓ Kaydedildi · {savedAt} · Bildirim gitti</Text>
                </View>
                <Pressable onPress={onUnlock}>
                  <Text style={styles.unlockText}>Düzenle</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </SafeAreaView>

      {overlay && (
        <Pressable style={styles.overlay} onPress={closeOverlay}>
          <View style={styles.overlayCircle}>
            <Text style={styles.overlayCheck}>✓</Text>
          </View>
          <Text style={styles.overlayTitle}>Yoklama kaydedildi</Text>
          <Text style={styles.overlaySub}>Velilere bildirim gönderildi</Text>
          <View style={styles.overlayPills}>
            <View style={styles.overlayPillIn}>
              <Text style={styles.overlayPillInText}>{overlay.inCount} sporcu katıldı</Text>
            </View>
            {overlay.outCount > 0 && (
              <View style={styles.overlayPillOut}>
                <Text style={styles.overlayPillOutText}>{overlay.outCount} sporcu katılmadı</Text>
              </View>
            )}
          </View>
          <Text style={styles.overlayTap}>kapatmak için dokunun</Text>
        </Pressable>
      )}

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
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.accentTint },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  liveBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: 140 },
  statsCard: { borderRadius: radius.xxl, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statBox: { flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.navyBorder, padding: 9, alignItems: 'center' },
  statBoxGreen: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  statBoxRed: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  statLabel: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  hintText: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  izinBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: 'rgba(255,180,84,0.35)', padding: 12 },
  izinIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,180,84,0.14)', alignItems: 'center', justifyContent: 'center' },
  izinTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.warning },
  izinDetay: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  izinPill: { backgroundColor: 'rgba(255,180,84,0.12)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill },
  izinPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.warning },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  listLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  allInBtn: { backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill },
  allInBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 11.5, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: 10 },
  rowIzinli: { borderColor: 'rgba(255,180,84,0.35)' },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: 12.5, color: '#9FE8CE' },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  izinliSub: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.warning, marginTop: 1 },
  toggleGroup: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 13 },
  toggleBtn: { width: 34, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleBtnInActive: { backgroundColor: colors.accentTint },
  toggleBtnOutActive: { backgroundColor: colors.dangerBg },
  toggleIcon: { fontSize: 15, color: colors.textFaint },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl },
  saveBtn: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  savedBox: { height: 52, borderRadius: 16, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  unlockText: { textAlign: 'center', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(4,10,20,0.9)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  overlayCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.accentTint, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  overlayCheck: { fontSize: 44, color: colors.accent },
  overlayTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white, marginTop: spacing.lg },
  overlaySub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.xs },
  overlayPills: { gap: spacing.xs, marginTop: spacing.lg, alignItems: 'center' },
  overlayPillIn: { backgroundColor: '#152A4E', borderWidth: 1, borderColor: colors.accentBorder, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 15 },
  overlayPillInText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: '#BFEFD9' },
  overlayPillOut: { backgroundColor: '#152A4E', borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 15 },
  overlayPillOutText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: '#FFD3D8' },
  overlayTap: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textFaint, marginTop: spacing.xl },
  });
}
