import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useIslem, useToast } from '../../src/components/Toast';
import { useKurum } from '../../src/context/KurumContext';
import { duyuruGonder, duyuruHedefSayisi, getDuyuruHedefleri } from '../../src/data/yoneticiRepo';
import type { DuyuruHedefi, DuyuruTuru } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../src/theme';

const TURLER: { value: DuyuruTuru; label: string }[] = [
  { value: 'genel', label: 'Genel' },
  { value: 'kamp', label: 'Kamp' },
  { value: 'servis', label: 'Servis' },
  { value: 'basari', label: 'Başarı' },
];

export default function DuyuruGonderScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { kulupAdi } = useKurum();
  const [hedefler, setHedefler] = useState<DuyuruHedefi[]>([]);
  const [seciliHedefler, setSeciliHedefler] = useState<string[]>(['tum']);
  const [tur, setTur] = useState<DuyuruTuru>('genel');
  const [baslik, setBaslik] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [smsIle, setSmsIle] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const { toastMessage, showToast } = useToast();
  const calistir = useIslem(showToast);

  // Form boş açılır — eski DUYURU_TASLAK_VARSAYILAN mock taslağı kaldırıldı,
  // örnek metinler yalnızca placeholder olarak duruyor.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHedefler(await getDuyuruHedefleri());
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

  const veliSayisi = duyuruHedefSayisi(hedefler, seciliHedefler);

  async function onGonder() {
    if (!baslik.trim() || !mesaj.trim()) {
      showToast('Başlık ve mesaj gerekli');
      return;
    }
    setGonderiliyor(true);
    try {
      // Duyuru tüm velilere gidiyor; sessizce başarısız olması "gönderdim
      // sanıyorum ama kimse görmedi" durumunu üretiyordu. Başlık ve mesaj
      // hatada state'te duruyor, yönetici tekrar deneyebiliyor.
      let sonuc: Awaited<ReturnType<typeof duyuruGonder>> | null = null;
      const oldu = await calistir(
        async () => { sonuc = await duyuruGonder({ hedefIds: seciliHedefler, baslik: baslik.trim(), mesaj: mesaj.trim(), tur, smsIle }); },
        'Duyuru gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.'
      );
      if (!oldu || !sonuc) return;
      // Push artık gerçek (0020) — kayıtlı cihaz varsa sayısı gösterilir; yoksa
      // yalnızca uygulama içi görünürlük bildirilir (SMS hâlâ yalnızca kayıt).
      const s: { pushCihaz: number; veliSayisi: number } = sonuc;
      showToast(
        s.pushCihaz > 0
          ? `Duyuru yayınlandı ✓ ${s.veliSayisi} veli · ${s.pushCihaz} cihaza push gönderildi`
          : `Duyuru yayınlandı ✓ ${s.veliSayisi} veli uygulamada görebilecek`
      );
    } finally {
      setGonderiliyor(false);
    }
  }

  const bugun = new Date();
  const onizlemeTarihi = `${bugun.toLocaleDateString('tr-TR', { weekday: 'long' })}, ${bugun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
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
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={h.id} style={[styles.chip, on && styles.chipActive]} onPress={() => onPickHedef(h.id)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{h.ad}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>TÜR</Text>
            <View style={styles.chipRow}>
              {TURLER.map((t) => {
                const on = t.value === tur;
                return (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={t.value} style={[styles.chip, on && styles.chipActive]} onPress={() => setTur(t.value)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>BAŞLIK</Text>
            <TextInput
              value={baslik}
              onChangeText={setBaslik}
              placeholder="ör. Yaz Kampı Erken Kayıt İndirimi"
              placeholderTextColor={colors.textDim}
              style={styles.titleInput}
            />

            <Text style={styles.fieldLabel}>MESAJ</Text>
            <TextInput
              value={mesaj}
              onChangeText={setMesaj}
              placeholder="ör. Yaz kampı kayıtları açıldı! Detaylar ve kayıt formu uygulamada."
              placeholderTextColor={colors.textDim}
              multiline
              style={styles.messageInput}
            />

            <Pressable style={styles.smsRow} onPress={() => setSmsIle((v) => !v)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.smsTitle}>SMS ile de gönder</Text>
                {/* Dürüst not: SMS gönderim altyapısı henüz yok — tercih kaydedilir. */}
                <Text style={styles.smsSub}>SMS altyapısı bağlandığında gönderilir</Text>
              </View>
              <Switch value={smsIle} onValueChange={setSmsIle} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#FFFFFF" />
            </Pressable>

            <Text style={styles.fieldLabel}>BİLDİRİM ÖNİZLEMESİ</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewClock}>09:41</Text>
              <Text style={styles.previewDate}>{onizlemeTarihi}</Text>
              <View style={styles.previewNotif}>
                <View style={styles.previewAvatar}>
                  <Text style={styles.previewAvatarText}>KS</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.previewNotifTop}>
                    <Text style={styles.previewSender}>{kulupAdi.toLocaleUpperCase('tr-TR')}</Text>
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
  backBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 130, gap: spacing.xs },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  hedefSayi: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.xs },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  chipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  chipTextActive: { color: colors.accent },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginTop: spacing.md },
  titleInput: { marginTop: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, color: colors.textBright, fontSize: fontSize.md, fontFamily: fontFamily.manropeBold },
  messageInput: { marginTop: 8, minHeight: 92, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, color: colors.textMuted, fontSize: fontSize.base, fontFamily: fontFamily.manropeMedium, lineHeight: 19, textAlignVertical: 'top' },
  smsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  smsTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  smsSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  previewCard: { marginTop: 9, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 18, paddingHorizontal: 14 },
  previewClock: { textAlign: 'center', fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxxl, color: colors.textBright, letterSpacing: -0.5 },
  previewDate: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  previewNotif: { marginTop: spacing.md, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  previewAvatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.onAccent },
  previewNotifTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  previewSender: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, letterSpacing: 0.5, color: colors.textMuted },
  previewNow: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  previewTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textBright, marginTop: 2 },
  previewBody: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1, lineHeight: 15 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl },
  sendBtn: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  });
}
