import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { AppModal } from '../../src/components/AppModal';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useToast } from '../../src/components/Toast';
import { getAntrenorSecenekleri, getHakedisler, odeHakedis, setDersUcreti, type AntrenorSecenegi } from '../../src/data/hakedisRepo';
import { getGruplar } from '../../src/data/etkinlikRepo';
import type { AntrenorHakedis } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../src/theme';

function fmt(n: number) {
  return '₺' + n.toLocaleString('tr-TR');
}

const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export default function AntrenorKadrosuScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [hakedisler, setHakedisler] = useState<AntrenorHakedis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acikId, setAcikId] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [ucretSheet, setUcretSheet] = useState(false);
  const [antrenorler, setAntrenorler] = useState<AntrenorSecenegi[]>([]);
  const [gruplar, setGruplar] = useState<{ id: string; ad: string }[]>([]);
  const [seciliAntrenor, setSeciliAntrenor] = useState<string | null>(null);
  const [seciliGrup, setSeciliGrup] = useState<string | null>(null);
  const [ucret, setUcret] = useState('');
  const [ucretKaydediliyor, setUcretKaydediliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHakedisler(await getHakedisler());
    } catch {
      setError('Hakediş verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openUcretSheet() {
    setSeciliAntrenor(null);
    setSeciliGrup(null);
    setUcret('');
    setUcretSheet(true);
    const [a, g] = await Promise.all([getAntrenorSecenekleri(), getGruplar()]);
    setAntrenorler(a);
    setGruplar(g);
  }

  async function onUcretKaydet() {
    if (!seciliAntrenor || !seciliGrup || !ucret) {
      showToast('Antrenör, grup ve ücret gerekli');
      return;
    }
    setUcretKaydediliyor(true);
    try {
      await setDersUcreti(seciliAntrenor, seciliGrup, parseInt(ucret, 10) || 0);
      setUcretSheet(false);
      await load();
      showToast('Ders ücreti kaydedildi');
    } finally {
      setUcretKaydediliyor(false);
    }
  }

  const toplam = hakedisler.reduce((a, h) => a + h.tutarN, 0);
  const odenenTutar = hakedisler.filter((h) => h.odendi).reduce((a, h) => a + h.tutarN, 0);
  const odenenN = hakedisler.filter((h) => h.odendi).length;
  const toplamDers = hakedisler.reduce((a, h) => a + h.ders, 0);
  const pct = toplam ? Math.round((odenenTutar / toplam) * 100) : 0;

  async function onOde(h: AntrenorHakedis) {
    await odeHakedis(h.id);
    setHakedisler(await getHakedisler());
    // Dürüst metin: dekont iletimi yok — yalnızca hakediş kaydı 'ödendi' işaretleniyor.
    showToast('Hakediş ödendi olarak işaretlendi');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Antrenör Kadrosu</Text>
            <Text style={styles.headerSub}>{AY_ADI[new Date().getMonth()]} hakedişleri · Merkez şube</Text>
          </View>
          <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.ucretBtn} onPress={openUcretSheet}>
            <Text style={styles.ucretBtnText}>Ders Ücreti Belirle</Text>
          </Pressable>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                {/* Ay adı sabit 'TEMMUZ' yerine içinde bulunulan aydan üretilir. */}
                <Text style={styles.summaryLabel}>{AY_ADI[new Date().getMonth()].toLocaleUpperCase('tr-TR')} HAKEDİŞ ÖZETİ</Text>
                <Text style={styles.summaryCount}>{odenenN}/{hakedisler.length} ödendi</Text>
              </View>
              <View style={styles.summaryAmountRow}>
                <Text style={styles.summaryAmount}>{fmt(toplam)}</Text>
                <Text style={styles.summaryAmountNote}>toplam · {toplamDers} ders</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressNote}>{fmt(odenenTutar)} ödendi · kalan {fmt(toplam - odenenTutar)}</Text>
            </View>

            <Text style={styles.kadroLabel}>KADRO · {hakedisler.length} ANTRENÖR</Text>

            {hakedisler.map((h) => {
              const acik = acikId === h.id;
              return (
                <View key={h.id} style={[styles.hkCard, acik && styles.hkCardOpen]}>
                  <Pressable style={styles.hkTop} onPress={() => setAcikId(acik ? null : h.id)}>
                    <View style={[styles.avatar, { backgroundColor: h.avBg }]}>
                      <Text style={[styles.avatarText, { color: h.avFg }]}>{h.init}</Text>
                    </View>
                    <View style={styles.mid}>
                      <Text style={styles.hkAd} numberOfLines={1}>{h.ad}</Text>
                      <Text style={styles.hkRol} numberOfLines={1}>{h.rol}</Text>
                    </View>
                    <View style={styles.hkAmountCol}>
                      <Text style={[styles.hkTutar, { color: h.odendi ? colors.textMuted : colors.textBright }]}>{fmt(h.tutarN)}</Text>
                      <Text style={[styles.hkStatus, { color: h.odendi ? colors.accent : colors.warning }]}>
                        {h.odendi ? 'ÖDENDİ' : 'BEKLEMEDE'}
                      </Text>
                    </View>
                    <Text style={[styles.chevron, acik && { transform: [{ rotate: '180deg' }] }]}>⌄</Text>
                  </Pressable>

                  {acik && (
                    <View style={styles.hkDetail}>
                      <View style={styles.statRow}>
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{h.ders}</Text>
                          <Text style={styles.statLabel}>DERS</Text>
                        </View>
                        <View style={styles.statBox}>
                          <Text style={styles.statValue}>{h.birim}</Text>
                          <Text style={styles.statLabel}>DERS ÜCRETİ</Text>
                        </View>
                        <View style={styles.statBox}>
                          <Text style={[styles.statValue, { color: colors.accent }]}>{h.grup}</Text>
                          <Text style={styles.statLabel}>GRUP</Text>
                        </View>
                      </View>
                      <View style={{ gap: 6, marginTop: 11 }}>
                        {h.kalemler.map((k, i) => (
                          <View key={i} style={styles.kalemRow}>
                            <View style={styles.kalemDot} />
                            <Text style={styles.kalemName} numberOfLines={1}>{k.n}</Text>
                            <Text style={styles.kalemValue}>{k.v}</Text>
                          </View>
                        ))}
                      </View>
                      {!h.odendi ? (
                        <Pressable style={styles.odeBtn} onPress={() => onOde(h)}>
                          <Text style={styles.odeBtnText}>Hakedişi Öde · {fmt(h.tutarN)}</Text>
                        </Pressable>
                      ) : (
                        <View style={styles.odendiBox}>
                          <Text style={styles.odendiText}>✓ Ödendi · dekont antrenöre iletildi</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={styles.footerNote}>Ders sayıları yoklama kayıtlarından otomatik hesaplanır</Text>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={ucretSheet} transparent animationType="slide" onRequestClose={() => setUcretSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setUcretSheet(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ders Ücreti Belirle</Text>
            <Text style={styles.sheetSub}>Antrenör × grup için aylık hakediş hesaplamasında kullanılacak ders ücreti</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>ANTRENÖR</Text>
              <View style={styles.pickRow}>
                {antrenorler.length === 0 && <Text style={styles.pickEmpty}>Henüz gerçek antrenör hesabı yok</Text>}
                {antrenorler.map((a) => (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={a.id} style={[styles.pickChip, seciliAntrenor === a.id && styles.pickChipActive]} onPress={() => setSeciliAntrenor(a.id)}>
                    <Text style={[styles.pickChipText, seciliAntrenor === a.id && styles.pickChipTextActive]}>{a.ad}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>GRUP</Text>
              <View style={styles.pickRow}>
                {gruplar.map((g) => (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={g.id} style={[styles.pickChip, seciliGrup === g.id && styles.pickChipActive]} onPress={() => setSeciliGrup(g.id)}>
                    <Text style={[styles.pickChipText, seciliGrup === g.id && styles.pickChipTextActive]}>{g.ad}</Text>
                  </Pressable>
                ))}
              </View>

              <TextField label="Ders Ücreti (₺)" value={ucret} onChangeText={setUcret} placeholder="400" keyboardType="numeric" />

              <View style={{ height: spacing.xs }} />
              <Button label="Kaydet" onPress={onUcretKaydet} loading={ucretKaydediliyor} />
            </ScrollView>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  ucretBtn: { height: 40, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ucretBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pickEmpty: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  pickChip: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  pickChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  pickChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  pickChipTextActive: { color: colors.accent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxl },
  summaryCard: { borderRadius: radius.xxl, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 16 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.accent },
  summaryCount: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  summaryAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: spacing.sm },
  summaryAmount: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, letterSpacing: -0.5 },
  summaryAmountNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: colors.border, marginTop: 11, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  progressNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 7 },
  kadroLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginTop: spacing.md },
  hkCard: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  hkCardOpen: { borderColor: colors.accentBorder },
  hkTop: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base },
  mid: { flex: 1, minWidth: 0 },
  hkAd: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  hkRol: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  hkAmountCol: { alignItems: 'flex-end' },
  hkTutar: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md },
  hkStatus: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, marginTop: 1 },
  chevron: { color: colors.textDim, fontSize: 15 },
  hkDetail: { paddingHorizontal: 15, paddingBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, padding: 9, alignItems: 'center' },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  statLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  kalemRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  kalemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  kalemName: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  kalemValue: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textBright },
  odeBtn: { marginTop: 13, height: 44, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  odeBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  odendiBox: { marginTop: 13, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  odendiText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.xs },
  });
}
