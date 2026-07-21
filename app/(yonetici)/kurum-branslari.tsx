import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { AppModal } from '../../src/components/AppModal';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useToast } from '../../src/components/Toast';
import {
  bagimsizAntrenoreKatil,
  getBranslar,
  getHizmetTurleri,
  getKurumBranslariDurumu,
  kurumBranslariKaydet,
  toggleBrans,
  toggleHizmetTuru,
} from '../../src/data/kurumRepo';
import type { Brans, HizmetTuruSecenegi } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

const TERIMLER = [
  { rol: 'Hesap sahipleri', eski: 'Veli / Sporcu', yeniFitness: 'Üye' },
  { rol: 'Ders verenler', eski: 'Antrenör', yeniFitness: 'Eğitmen' },
];

export default function KurumBranslariScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [branslar, setBranslar] = useState<Brans[]>([]);
  const [hizmetTurleri, setHizmetTurleri] = useState<HizmetTuruSecenegi[]>([]);
  const [seciliBranslar, setSeciliBranslar] = useState<string[]>([]);
  const [seciliHizmet, setSeciliHizmet] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const { toastMessage, showToast } = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [wlAd, setWlAd] = useState('');
  const [wlTelefon, setWlTelefon] = useState('');
  const [wlSira, setWlSira] = useState<number | null>(null);
  const [wlGonderiliyor, setWlGonderiliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, h, d] = await Promise.all([getBranslar(), getHizmetTurleri(), getKurumBranslariDurumu()]);
      setBranslar(b);
      setHizmetTurleri(h);
      setSeciliBranslar(d.seciliBranslar);
      setSeciliHizmet(d.seciliHizmetTurleri);
    } catch {
      setError('Branşlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onToggleBrans(id: string) {
    setSeciliBranslar((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    await toggleBrans(id);
  }

  async function onToggleHizmet(id: string) {
    setSeciliHizmet((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    await toggleHizmetTuru(id);
  }

  async function onKaydet() {
    if (seciliBranslar.length === 0) {
      showToast('En az bir branş seçin');
      return;
    }
    setKaydediliyor(true);
    try {
      await kurumBranslariKaydet();
      showToast('Kurum branşları kaydedildi');
    } finally {
      setKaydediliyor(false);
    }
  }

  function openSheet() {
    setSheetOpen(true);
    setWlSira(null);
  }

  const digits = wlTelefon.replace(/\D/g, '');
  const canJoin = wlAd.trim().length >= 3 && digits.length >= 10;

  async function onJoin() {
    if (!canJoin) {
      showToast('Ad soyad ve geçerli bir telefon girin');
      return;
    }
    setWlGonderiliyor(true);
    try {
      const { sira } = await bagimsizAntrenoreKatil({ ad: wlAd.trim(), telefon: wlTelefon.trim() });
      setWlSira(sira);
    } finally {
      setWlGonderiliyor(false);
    }
  }

  function closeSheet() {
    setSheetOpen(false);
    setWlAd('');
    setWlTelefon('');
    setWlSira(null);
  }

  const fitnessSecili = seciliHizmet.includes('fitness');

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle}>Kurum Branşları</Text>
            <Text style={styles.headerSub}>Karşıyaka Spor Okulu için geçerli olanların tümünü seçin</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>BRANŞLAR</Text>
              <Text style={styles.sectionCount}>{seciliBranslar.length} seçili</Text>
            </View>
            <View style={styles.bransGrid}>
              {branslar.map((b) => {
                const secili = seciliBranslar.includes(b.id);
                return (
                  <Pressable key={b.id} style={[styles.bransCard, secili && styles.bransCardActive]} onPress={() => onToggleBrans(b.id)}>
                    <View style={[styles.bransIconBox, secili && styles.bransIconBoxActive]}>
                      <Text style={{ fontSize: 20 }}>{b.ikon}</Text>
                    </View>
                    <Text style={[styles.bransAd, secili && styles.bransAdActive]}>{b.ad}</Text>
                    <View style={[styles.checkBox, secili && styles.checkBoxActive]}>
                      {secili && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>HİZMET TÜRÜ</Text>
            <View style={{ gap: spacing.sm }}>
              {hizmetTurleri.map((h) => {
                const secili = seciliHizmet.includes(h.id);
                return (
                  <Pressable key={h.id} style={[styles.wideCard, secili && styles.wideCardActive]} onPress={() => onToggleHizmet(h.id)}>
                    <View style={[styles.bransIconBox, secili && styles.bransIconBoxActive]}>
                      <Text style={{ fontSize: 20 }}>{h.ikon}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.bransAd, secili && styles.bransAdActive]}>{h.ad}</Text>
                      <Text style={styles.wideDesc}>{h.aciklama}</Text>
                    </View>
                    <View style={[styles.checkBox, secili && styles.checkBoxActive]}>
                      {secili && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.termsCard}>
              <View style={styles.termsHeader}>
                <Text style={styles.termsHeaderIcon}>☰</Text>
                <Text style={styles.termsHeaderLabel}>UYGULAMA TERİMLERİ</Text>
              </View>
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {TERIMLER.map((t) => (
                  <View key={t.rol} style={styles.termRow}>
                    <Text style={styles.termRol}>{t.rol}</Text>
                    {fitnessSecili && <Text style={styles.termEski}>{t.eski}</Text>}
                    {fitnessSecili && <Text style={styles.termArrow}>→</Text>}
                    <View style={[styles.termPill, fitnessSecili && styles.termPillActive]}>
                      <Text style={[styles.termPillText, fitnessSecili && styles.termPillTextActive]}>
                        {fitnessSecili ? t.yeniFitness : t.eski}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.termsCaption}>
                {fitnessSecili
                  ? '"Fitness / Spor Salonu" seçildi — uygulama üyelik diliyle çalışır'
                  : 'Terimler branş seçiminize göre otomatik uyarlanır'}
              </Text>
            </View>

            <Pressable style={styles.ptCard} onPress={openSheet}>
              <View style={styles.ptIcon}>
                <Text style={{ fontSize: 18 }}>🎯</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ptTitle}>Bağımsız Antrenör / PT</Text>
                <Text style={styles.ptDesc}>Kulüpten bağımsız mı çalışıyorsunuz? Sıraya girin</Text>
              </View>
              <View style={styles.soonPill}>
                <Text style={styles.soonPillText}>YAKINDA</Text>
              </View>
            </Pressable>
          </ScrollView>
        )}

        {!loading && !error && (
          <View style={styles.bottomBar}>
            <Pressable
              style={[styles.saveBtn, seciliBranslar.length === 0 && styles.saveBtnDisabled]}
              onPress={onKaydet}
              disabled={kaydediliyor}
            >
              <Text style={[styles.saveBtnText, seciliBranslar.length === 0 && styles.saveBtnTextDisabled]}>
                {kaydediliyor
                  ? 'Kaydediliyor…'
                  : seciliBranslar.length === 0
                    ? 'En az 1 branş seçin'
                    : `Kaydet — ${seciliBranslar.length} branş`}
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <AppModal visible={sheetOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Bağımsız Antrenör / PT</Text>
              <View style={styles.soonPill}>
                <Text style={styles.soonPillText}>YAKINDA</Text>
              </View>
            </View>
            <Text style={styles.sheetDesc}>Bireysel çalışan antrenörler için ayrı bir sürüm hazırlıyoruz. Hazır olduğunda ilk size haber verelim.</Text>

            {wlSira === null ? (
              <>
                <Text style={styles.fieldLabel}>AD SOYAD</Text>
                <TextInput
                  value={wlAd}
                  onChangeText={setWlAd}
                  placeholder="Adınız Soyadınız"
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                />
                <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>TELEFON</Text>
                <TextInput
                  value={wlTelefon}
                  onChangeText={setWlTelefon}
                  placeholder="05xx xxx xx xx"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <Pressable style={[styles.joinBtn, !canJoin && styles.joinBtnDisabled]} onPress={onJoin} disabled={wlGonderiliyor}>
                  <Text style={[styles.joinBtnText, !canJoin && styles.joinBtnTextDisabled]}>
                    {wlGonderiliyor ? 'Gönderiliyor…' : 'Sıraya Gir'}
                  </Text>
                </Pressable>
                <Text style={styles.sheetFooterNote}>Bekleme listesinde 214 antrenör var</Text>
              </>
            ) : (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Text style={{ color: colors.accent, fontSize: 26 }}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Sıradasınız!</Text>
                <Text style={styles.successSub}>Lansmandan önce {wlTelefon} numarasına{'\n'}SMS ile haber vereceğiz</Text>
                <View style={styles.successPill}>
                  <Text style={styles.successPillText}>Sıra numaranız: #{wlSira}</Text>
                </View>
              </View>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white },
  headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140, gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  sectionCount: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  bransGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bransCard: { width: '47%', borderRadius: 20, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft, padding: 14, position: 'relative' },
  bransCardActive: { backgroundColor: 'rgba(46,230,168,0.08)', borderColor: 'rgba(46,230,168,0.55)' },
  bransIconBox: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  bransIconBoxActive: { backgroundColor: 'rgba(46,230,168,0.13)' },
  bransAd: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.iconMuted, marginTop: 10 },
  bransAdActive: { color: colors.white },
  checkBox: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.navyBorderStrong, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.accentOnDark, fontSize: 12, fontFamily: fontFamily.archivoBold },
  wideCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft, padding: 13 },
  wideCardActive: { backgroundColor: 'rgba(46,230,168,0.08)', borderColor: 'rgba(46,230,168,0.55)' },
  wideDesc: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  termsCard: { marginTop: spacing.xs, borderRadius: 20, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: spacing.md },
  termsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  termsHeaderIcon: { color: colors.accent, fontSize: 13 },
  termsHeaderLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termRol: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  termEski: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFaint, textDecorationLine: 'line-through' },
  termArrow: { color: colors.accent, fontSize: 12 },
  termPill: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.navyBorderStrong },
  termPillActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  termPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.iconMuted },
  termPillTextActive: { color: colors.accent },
  termsCaption: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 17 },
  ptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong, backgroundColor: colors.navySurfaceAlt, padding: 13 },
  ptIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,180,84,0.12)', alignItems: 'center', justifyContent: 'center' },
  ptTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  ptDesc: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  soonPill: { backgroundColor: 'rgba(255,180,84,0.14)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  soonPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, letterSpacing: 0.4, color: colors.warning },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: 'rgba(8,17,33,0.9)' },
  saveBtn: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  saveBtnTextDisabled: { color: colors.textFaint },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  sheetTitle: { flex: 1, fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  sheetDesc: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint, marginTop: spacing.md },
  input: { width: '100%', marginTop: 7, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, color: colors.white, fontSize: fontSize.md, fontFamily: fontFamily.manropeSemi },
  joinBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  joinBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  joinBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  joinBtnTextDisabled: { color: colors.textFaint },
  sheetFooterNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFaint, marginTop: spacing.sm },
  successWrap: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs },
  successIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white, marginTop: spacing.md },
  successSub: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: 5, lineHeight: 19 },
  successPill: { backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, marginTop: spacing.md },
  successPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  });
}
