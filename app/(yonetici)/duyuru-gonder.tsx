import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useToast } from '../../src/components/Toast';
import { duyuruGonder, duyuruHedefSayisi, getDuyuruHedefleri, getDuyuruTaslak } from '../../src/data/yoneticiRepo';
import type { DuyuruHedefi } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

export default function DuyuruGonderScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [hedefler, setHedefler] = useState<DuyuruHedefi[]>([]);
  const [seciliHedefler, setSeciliHedefler] = useState<string[]>(['tum']);
  const [baslik, setBaslik] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [smsIle, setSmsIle] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, t] = await Promise.all([getDuyuruHedefleri(), getDuyuruTaslak()]);
      setHedefler(h);
      setBaslik(t.baslik);
      setMesaj(t.mesaj);
    } catch {
      setError('Duyuru formu yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onPickHedef(id: string) {
    setSeciliHedefler((s) => {
      if (id === 'tum') return ['tum'];
      const next = s.filter((x) => x !== 'tum');
      return next.includes(id) ? (next.length > 1 ? next.filter((x) => x !== id) : ['tum']) : [...next, id];
    });
  }

  const veliSayisi = duyuruHedefSayisi(seciliHedefler);

  async function onGonder() {
    if (!baslik.trim() || !mesaj.trim()) {
      showToast('Başlık ve mesaj gerekli');
      return;
    }
    setGonderiliyor(true);
    try {
      const sonuc = await duyuruGonder({ hedefIds: seciliHedefler, baslik: baslik.trim(), mesaj: mesaj.trim(), smsIle });
      showToast(`Duyuru ${sonuc.veliSayisi} veliye gönderildi ✓ ${sonuc.smsIle ? '(bildirim + SMS)' : '(bildirim)'}`);
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Duyuru Gönder</Text>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>HEDEF KİTLE</Text>
              <Text style={styles.hedefSayi}>≈ {veliSayisi} veli</Text>
            </View>
            <View style={styles.chipRow}>
              {hedefler.map((h) => {
                const on = seciliHedefler.includes(h.id);
                return (
                  <Pressable key={h.id} style={[styles.chip, on && styles.chipActive]} onPress={() => onPickHedef(h.id)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{h.ad}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>BAŞLIK</Text>
            <TextInput
              value={baslik}
              onChangeText={setBaslik}
              placeholder="Duyuru başlığı"
              placeholderTextColor={colors.textFaint}
              style={styles.titleInput}
            />

            <Text style={styles.fieldLabel}>MESAJ</Text>
            <TextInput
              value={mesaj}
              onChangeText={setMesaj}
              placeholder="Duyuru mesajı"
              placeholderTextColor={colors.textFaint}
              multiline
              style={styles.messageInput}
            />

            <Pressable style={styles.smsRow} onPress={() => setSmsIle((v) => !v)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.smsTitle}>Bildirim + SMS olarak gönder</Text>
                {smsIle && <Text style={styles.smsSub}>Uygulaması olmayan velilere de SMS gider</Text>}
              </View>
              <Switch value={smsIle} onValueChange={setSmsIle} trackColor={{ true: colors.accent, false: colors.navyBorderStrong }} thumbColor="#FFFFFF" />
            </Pressable>

            <Text style={styles.fieldLabel}>VELİNİN KİLİT EKRANINDA</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewClock}>09:41</Text>
              <Text style={styles.previewDate}>Çarşamba, 22 Temmuz</Text>
              <View style={styles.previewNotif}>
                <View style={styles.previewAvatar}>
                  <Text style={styles.previewAvatarText}>KS</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.previewNotifTop}>
                    <Text style={styles.previewSender}>KARŞIYAKA SPOR OKULU</Text>
                    <Text style={styles.previewNow}>şimdi</Text>
                  </View>
                  <Text style={styles.previewTitle} numberOfLines={1}>{baslik || 'Başlık'}</Text>
                  <Text style={styles.previewBody} numberOfLines={2}>{mesaj || 'Mesaj'}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {!loading && !error && (
          <View style={styles.bottomBar}>
            <Pressable style={styles.sendBtn} onPress={onGonder} disabled={gonderiliyor}>
              <Text style={styles.sendBtnText}>{gonderiliyor ? 'Gönderiliyor…' : `${veliSayisi} Veliye Gönder`}</Text>
            </Pressable>
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
  backBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 130, gap: spacing.xs },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  hedefSayi: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.xs },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  chipActive: { backgroundColor: 'rgba(46,230,168,0.10)', borderColor: 'rgba(46,230,168,0.55)' },
  chipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.iconMuted },
  chipTextActive: { color: colors.accent },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint, marginTop: spacing.md },
  titleInput: { marginTop: 8, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, color: colors.white, fontSize: fontSize.md, fontFamily: fontFamily.manropeBold },
  messageInput: { marginTop: 8, minHeight: 92, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, color: colors.iconMuted, fontSize: fontSize.base, fontFamily: fontFamily.manropeMedium, lineHeight: 19, textAlignVertical: 'top' },
  smsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, borderRadius: 16, padding: 14 },
  smsTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  smsSub: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  previewCard: { marginTop: 9, borderRadius: 24, backgroundColor: colors.navySheet, borderWidth: 1, borderColor: colors.navyBorderSoft, paddingVertical: 18, paddingHorizontal: 14 },
  previewClock: { textAlign: 'center', fontFamily: fontFamily.archivoBold, fontSize: 34, color: colors.white, letterSpacing: -0.5 },
  previewDate: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  previewNotif: { marginTop: spacing.md, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  previewAvatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: 11, color: colors.accentOnDark },
  previewNotifTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  previewSender: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.5, color: colors.iconMuted },
  previewNow: { fontFamily: fontFamily.manropeSemi, fontSize: 9.5, color: colors.textMuted },
  previewTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.white, marginTop: 2 },
  previewBody: { fontFamily: fontFamily.manropeMedium, fontSize: 11.5, color: colors.iconMuted, marginTop: 1, lineHeight: 15 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl },
  sendBtn: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  });
}
