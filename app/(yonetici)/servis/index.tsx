import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { addRota, getRotalar } from '../../../src/data/servisRepo';
import type { ServisRota } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function ServisListesiScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [rotalar, setRotalar] = useState<ServisRota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [ad, setAd] = useState('');
  const [sofor, setSofor] = useState('');
  const [plaka, setPlaka] = useState('');
  const [arac, setArac] = useState('');
  const [alt, setAlt] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRotalar(await getRotalar());
    } catch {
      setError('Rotalar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toplamSporcu = rotalar.reduce((a, r) => a + r.sporcuSayisi, 0);

  function openSheet() {
    setAd('');
    setSofor('');
    setPlaka('');
    setArac('');
    setAlt('');
    setSheetOpen(true);
  }

  async function onKaydet() {
    if (!ad.trim() || !sofor.trim() || !plaka.trim()) {
      showToast('Rota adı, şoför ve plaka gerekli.');
      return;
    }
    setKaydediliyor(true);
    try {
      await addRota({ ad: ad.trim(), sofor: sofor.trim(), plaka: plaka.trim(), arac: arac.trim() || 'Belirtilmedi', alt: alt.trim() || 'Sefer saati belirlenmedi' });
      await load();
      setSheetOpen(false);
      showToast('Yeni rota eklendi');
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Servis Yönetimi</Text>
            <Text style={styles.headerSub}>{rotalar.length} rota · {toplamSporcu} sporcu taşınıyor</Text>
          </View>
        </View>

        {loading && <LoadingState label="Rotalar yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {rotalar.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/servis/${r.id}`)}>
                <Card style={{ gap: 0 }}>
                  <View style={styles.rowTop}>
                    <View style={styles.icon}>
                      <Text>🚌</Text>
                    </View>
                    <View style={styles.mid}>
                      <Text style={styles.rotaAd}>{r.ad}</Text>
                      <Text style={styles.rotaSub}>{r.sofor} · {r.plaka}</Text>
                    </View>
                    <View style={[styles.durumBadge, r.yolda && styles.durumBadgeYolda]}>
                      {r.yolda && <View style={styles.liveDot} />}
                      <Text style={[styles.durumText, r.yolda && styles.durumTextYolda]}>{r.durumTxt}</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.rowBottom}>
                    <Text style={styles.altText}>{r.alt}</Text>
                    <View style={styles.sporcuBadge}>
                      <Text style={styles.sporcuBadgeText}>{r.sporcuSayisi} sporcu</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
            <Pressable style={styles.dashedAdd} onPress={openSheet}>
              <Text style={styles.dashedAddText}>+ Yeni Rota</Text>
            </Pressable>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Araç yoldayken veliler kendi uygulamasından canlı konum görür; durak yaklaşınca otomatik bildirim gider.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Yeni Rota</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }} keyboardShouldPersistTaps="handled">
              <FormField label="ROTA ADI" value={ad} onChangeText={setAd} placeholder="ör. Bornova – Merkez Hattı" />
              <FormField label="ŞOFÖR" value={sofor} onChangeText={setSofor} placeholder="Ad Soyad" />
              <FormField label="PLAKA" value={plaka} onChangeText={setPlaka} placeholder="35 KSO 000" autoCapitalize="characters" />
              <FormField label="ARAÇ" value={arac} onChangeText={setArac} placeholder="ör. Ford Transit" />
              <FormField label="SEFER BİLGİSİ" value={alt} onChangeText={setAlt} placeholder="ör. Sabah seferi · 07:30 kalkış" />
            </ScrollView>
            <Pressable style={styles.saveBtn} onPress={onKaydet} disabled={kaydediliyor}>
              <Text style={styles.saveBtnText}>{kaydediliyor ? 'Kaydediliyor…' : 'Rotayı Ekle'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function FormField(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; autoCapitalize?: 'none' | 'characters' }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize={props.autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxl },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0 },
  rotaAd: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.white },
  rotaSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  durumBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.navyChip },
  durumBadgeYolda: { backgroundColor: colors.accentTint },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  durumText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.textMuted },
  durumTextYolda: { color: colors.accent },
  divider: { height: 1, backgroundColor: colors.navyBorder, marginVertical: 11 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  altText: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  sporcuBadge: { backgroundColor: colors.navyChip, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  sporcuBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 11, color: colors.iconMuted },
  dashedAdd: { borderRadius: radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  dashedAddText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textMuted },
  infoBox: { borderRadius: radius.xl, backgroundColor: 'rgba(46,230,168,0.06)', borderWidth: 1, borderColor: 'rgba(46,230,168,0.2)', padding: spacing.md },
  infoText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.accent, lineHeight: 18 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white, marginTop: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint, marginBottom: 7 },
  input: { backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.white, fontSize: fontSize.base, fontFamily: fontFamily.manropeSemi },
  saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  });
}
