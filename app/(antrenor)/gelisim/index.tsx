import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import {
  GELISIM_TEMPLATES,
  gelisimGonder,
  gelisimKilidiAc,
  getGelisimKaydi,
  getSporcular,
  setGelisimNot,
  setGelisimSeviye,
} from '../../../src/data/antrenorRepo';
import type { GelisimKaydi, Sporcu } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function GelisimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const params = useLocalSearchParams<{ sporcuId?: string }>();
  const [sporcular, setSporcular] = useState<Sporcu[]>([]);
  const [seciliId, setSeciliId] = useState<string>(params.sporcuId || 'ali');
  const [kayit, setKayit] = useState<GelisimKaydi | null>(null);
  const [not, setNot] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();

  const loadSporcular = useCallback(async () => {
    try {
      setSporcular(await getSporcular());
    } catch {
      setError('Sporcular yüklenemedi.');
    }
  }, []);

  const loadKayit = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const k = await getGelisimKaydi(id);
      setKayit(k);
      setNot(k.not);
    } catch {
      setError('Gelişim kaydı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSporcular();
  }, [loadSporcular]);

  useEffect(() => {
    loadKayit(seciliId);
  }, [seciliId, loadKayit]);

  const seciliSporcu = sporcular.find((s) => s.id === seciliId);

  async function onSeviyeSec(beceriIndex: number, seviye: number) {
    if (kayit?.gonderildi) {
      showToast('Kayıt kilitli — "Düzenle"ye dokunun');
      return;
    }
    await setGelisimSeviye(seciliId, beceriIndex, seviye);
    setKayit(await getGelisimKaydi(seciliId));
  }

  async function onNotChange(text: string) {
    setNot(text);
    await setGelisimNot(seciliId, text);
  }

  function ekleTemplate(t: string) {
    const yeni = not ? not + ' ' + t + '.' : t + '.';
    setNot(yeni);
    setGelisimNot(seciliId, yeni);
  }

  async function onGonder() {
    setSaving(true);
    try {
      await gelisimGonder(seciliId);
      setKayit(await getGelisimKaydi(seciliId));
      showToast('Gelişim değerlendirmesi veliye iletildi');
    } finally {
      setSaving(false);
    }
  }

  async function onDuzenle() {
    await gelisimKilidiAc(seciliId);
    setKayit(await getGelisimKaydi(seciliId));
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Gelişim Değerlendirme</Text>
            <Text style={styles.headerSub}>U12 Basketbol · Temmuz dönemi</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sporcuScroll} contentContainerStyle={styles.sporcuRow}>
          {sporcular.map((s) => {
            const active = s.id === seciliId;
            return (
              <Pressable key={s.id} style={[styles.sporcuChip, active && styles.sporcuChipActive]} onPress={() => setSeciliId(s.id)}>
                <View style={[styles.sporcuAvatar, active && styles.sporcuAvatarActive]}>
                  <Text style={[styles.sporcuAvatarText, active && styles.sporcuAvatarTextActive]}>{s.init}</Text>
                </View>
                <Text style={[styles.sporcuName, active && styles.sporcuNameActive]}>{s.ad.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => loadKayit(seciliId)} />}

        {!loading && !error && kayit && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>BECERİLER · {seciliSporcu?.ad.split(' ')[0]}</Text>
            <View style={styles.skillCard}>
              {kayit.beceriler.map((b, bi) => (
                <View key={b.ad} style={[styles.skillRow, bi === kayit.beceriler.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.skillName}>{b.ad}</Text>
                    <Text style={styles.skillLvl}>{LEVELS[b.seviye - 1]}</Text>
                  </View>
                  <View style={styles.segRow}>
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <Pressable key={lvl} onPress={() => onSeviyeSec(bi, lvl)}>
                        <View style={[styles.segBar, { backgroundColor: lvl <= b.seviye ? colors.accent : colors.navyBorder }]} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>VELİYE NOT</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Bu ayki gelişimi 2-3 cümleyle özetleyin…"
              placeholderTextColor={colors.textFaint}
              value={not}
              onChangeText={onNotChange}
              editable={!kayit.gonderildi}
              multiline
            />
            {!kayit.gonderildi && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tplScroll} contentContainerStyle={styles.tplRow}>
                {GELISIM_TEMPLATES.map((t) => (
                  <Pressable key={t} style={styles.tplChip} onPress={() => ekleTemplate(t)}>
                    <Text style={styles.tplChipText}>+ {t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {!kayit.gonderildi ? (
              <Pressable style={[styles.sendBtn, !not.trim() && styles.sendBtnDisabled]} disabled={!not.trim() || saving} onPress={onGonder}>
                <Text style={[styles.sendBtnText, !not.trim() && styles.sendBtnTextDisabled]}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet ve Veliye Gönder'}
                </Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.sentBox}>
                  <Text style={styles.sentBoxText}>✓ Kaydedildi · Veliye iletildi</Text>
                </View>
                <Pressable onPress={onDuzenle}>
                  <Text style={styles.duzenleLink}>Düzenle</Text>
                </Pressable>

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>VELİ UYGULAMASINDA GÖRÜNÜMÜ</Text>
                <View style={styles.previewCard}>
                  <Text style={styles.previewLabel}>ANTRENÖR NOTU</Text>
                  <Text style={styles.previewNote}>{kayit.not}</Text>
                  <View style={styles.previewFooter}>
                    <View style={styles.previewAvatar}>
                      <Text style={styles.previewAvatarText}>MD</Text>
                    </View>
                    <View>
                      <Text style={styles.previewCoach}>Mert Demir</Text>
                      <Text style={styles.previewDate}>{kayit.tarih}</Text>
                    </View>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

const LEVELS = ['Başlangıç', 'Gelişiyor', 'Orta', 'İyi', 'Çok iyi'];

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  sporcuScroll: { flexGrow: 0, marginTop: spacing.xs },
  sporcuRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg },
  sporcuChip: { alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorder, minWidth: 74 },
  sporcuChipActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  sporcuAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#1B2E4F', alignItems: 'center', justifyContent: 'center' },
  sporcuAvatarActive: { backgroundColor: colors.accent },
  sporcuAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.textMuted },
  sporcuAvatarTextActive: { color: colors.accentOnDark },
  sporcuName: { fontFamily: fontFamily.manropeExtra, fontSize: 11, color: colors.textMuted },
  sporcuNameActive: { color: colors.white },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginBottom: spacing.xs },
  skillCard: { borderRadius: radius.xxl, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, paddingHorizontal: spacing.md },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  skillName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  skillLvl: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  segRow: { flexDirection: 'row', gap: 4 },
  segBar: { width: 22, height: 10, borderRadius: 5 },
  noteInput: { minHeight: 92, borderRadius: 16, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, padding: spacing.md, color: colors.white, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, textAlignVertical: 'top' },
  tplScroll: { flexGrow: 0, marginTop: spacing.xs },
  tplRow: { flexDirection: 'row', gap: spacing.xs },
  tplChip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 99, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: 'rgba(46,230,168,0.28)' },
  tplChipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: '#9FE8CE' },
  sendBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.navySurface },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  sendBtnTextDisabled: { color: colors.textFaint },
  sentBox: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  sentBoxText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  duzenleLink: { textAlign: 'center', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  previewCard: { borderRadius: radius.xxl, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.md },
  previewLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.accent },
  previewNote: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.iconMuted, marginTop: spacing.sm, lineHeight: 20 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.navyBorder },
  previewAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: 11, color: '#9FE8CE' },
  previewCoach: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.white },
  previewDate: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textFaint },
  });
}
