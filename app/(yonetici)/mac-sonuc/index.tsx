import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { TextField } from '../../../src/components/TextField';
import { EmptyState, ErrorState, LoadingState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import {
  getSonucBekleyenMaclar,
  getSonuclananMaclar,
  macSonucuKaydet,
  sonucTuret,
  type MacSonucSatiri,
  type MacSonucu,
} from '../../../src/data/etkinlikRepo';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing, tabularNums } from '../../../src/theme';

const SONUC_ETIKET: Record<MacSonucu, string> = {
  galibiyet: 'Galibiyet',
  beraberlik: 'Beraberlik',
  maglubiyet: 'Mağlubiyet',
};

function sadeceRakam(s: string): string {
  return s.replace(/[^\d]/g, '').slice(0, 3);
}

export default function MacSonucScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { toastMessage, showToast } = useToast();

  const [bekleyen, setBekleyen] = useState<MacSonucSatiri[]>([]);
  const [girilen, setGirilen] = useState<MacSonucSatiri[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aynı anda tek maçın formu açık — açılan maçın id'si ve form alanları.
  const [acikId, setAcikId] = useState<string | null>(null);
  const [skorBiz, setSkorBiz] = useState('');
  const [skorRakip, setSkorRakip] = useState('');
  const [not, setNot] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, g] = await Promise.all([getSonucBekleyenMaclar(), getSonuclananMaclar()]);
      setBekleyen(b);
      setGirilen(g);
    } catch {
      setError('Maçlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function formAc(mac: MacSonucSatiri) {
    if (acikId === mac.id) {
      setAcikId(null);
      return;
    }
    setAcikId(mac.id);
    // Sonucu girilmiş maç düzeltilirken alanlar mevcut değerlerle açılır.
    setSkorBiz(mac.skorBiz != null ? String(mac.skorBiz) : '');
    setSkorRakip(mac.skorRakip != null ? String(mac.skorRakip) : '');
    setNot(mac.sonucNotu);
  }

  const biz = parseInt(skorBiz, 10);
  const rakip = parseInt(skorRakip, 10);
  const skorTam = Number.isFinite(biz) && Number.isFinite(rakip);
  const turetilen: MacSonucu | null = skorTam ? sonucTuret(biz, rakip) : null;

  async function onKaydet(mac: MacSonucSatiri) {
    if (!skorTam) {
      showToast('İki skor da girilmeli');
      return;
    }
    setSaving(true);
    try {
      await macSonucuKaydet({ etkinlikId: mac.id, skorBiz: biz, skorRakip: rakip, sonucNotu: not });
      setAcikId(null);
      await load();
      showToast(`${mac.rakip} · ${biz}–${rakip} kaydedildi`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Sonuç kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  function renderForm(mac: MacSonucSatiri) {
    return (
      <View style={styles.form}>
        <Text style={styles.fieldLabel}>SKOR</Text>
        <View style={styles.skorRow}>
          <View style={styles.skorBox}>
            <Text style={styles.skorBoxLabel}>BİZ</Text>
            <TextInput
              style={[styles.skorInput, tabularNums]}
              value={skorBiz}
              onChangeText={(t) => setSkorBiz(sadeceRakam(t))}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <Text style={styles.skorAyrac}>–</Text>
          <View style={styles.skorBox}>
            <Text style={styles.skorBoxLabel} numberOfLines={1}>RAKİP</Text>
            <TextInput
              style={[styles.skorInput, tabularNums]}
              value={skorRakip}
              onChangeText={(t) => setSkorRakip(sadeceRakam(t))}
              placeholder="0"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
        </View>

        <View style={[styles.turetilenBox, turetilen ? sonucKutuStili(styles, turetilen) : null]}>
          <Text style={[styles.turetilenText, turetilen ? { color: sonucRengi(colors, turetilen) } : null]}>
            {turetilen ? `Sonuç: ${SONUC_ETIKET[turetilen]}` : 'Sonuç skordan otomatik belirlenir'}
          </Text>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <TextField
            label="MAÇ NOTU (İSTEĞE BAĞLI)"
            value={not}
            onChangeText={setNot}
            placeholder="Örn. Yarı final galibiyeti"
            multiline
            style={styles.notInput}
          />
        </View>

        <Pressable
          style={[styles.saveBtn, (!skorTam || saving) && styles.saveBtnDisabled]}
          disabled={!skorTam || saving}
          onPress={() => onKaydet(mac)}
        >
          <Text style={[styles.saveBtnText, (!skorTam || saving) && styles.saveBtnTextDisabled]}>
            {saving ? 'Kaydediliyor…' : 'Sonucu Kaydet'}
          </Text>
        </Pressable>
        <Text style={styles.formNote}>Kaydedilen sonuç veli uygulamasındaki Maç Sonuçları listesine düşer.</Text>
      </View>
    );
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Maç Sonuçları</Text>
            <Text style={styles.headerSub}>
              {bekleyen.length > 0 ? `${bekleyen.length} maçın sonucu bekleniyor` : 'Tüm maçların sonucu girildi'}
            </Text>
          </View>
          {bekleyen.length > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{bekleyen.length}</Text>
            </View>
          )}
        </View>

        {loading && <LoadingState label="Maçlar yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>SONUÇ BEKLEYEN MAÇLAR</Text>
              {bekleyen.length === 0 ? (
                <EmptyState
                  title="Sonuç bekleyen maç yok"
                  subtitle="Oynanmış her maçın skoru girilmiş durumda."
                />
              ) : (
                bekleyen.map((m) => {
                  const acik = acikId === m.id;
                  return (
                    <View key={m.id} style={[styles.card, acik && styles.cardActive]}>
                      <Pressable style={styles.cardHead} onPress={() => formAc(m)}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.cardTitle} numberOfLines={1}>{m.rakip}</Text>
                          <Text style={styles.cardSub} numberOfLines={1}>
                            {[m.tarih, m.saat, m.grup].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <View style={styles.girBtn}>
                          <Text style={styles.girBtnText}>{acik ? 'Kapat' : 'Sonucu Gir'}</Text>
                        </View>
                      </Pressable>
                      {acik && renderForm(m)}
                    </View>
                  );
                })
              )}

              {girilen.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>SON GİRİLEN SONUÇLAR</Text>
                  {girilen.map((m) => {
                    const acik = acikId === m.id;
                    const sonuc = m.sonuc;
                    return (
                      <View key={m.id} style={[styles.card, acik && styles.cardActive]}>
                        <Pressable style={styles.cardHead} onPress={() => formAc(m)}>
                          <View style={[styles.skorPill, sonuc ? sonucKutuStili(styles, sonuc) : null]}>
                            <Text style={[styles.skorPillText, sonuc ? { color: sonucRengi(colors, sonuc) } : null, tabularNums]}>
                              {m.skorBiz ?? 0}–{m.skorRakip ?? 0}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{m.rakip}</Text>
                            <Text style={styles.cardSub} numberOfLines={1}>
                              {[m.tarih, sonuc ? SONUC_ETIKET[sonuc] : null].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Text style={styles.duzeltText}>{acik ? 'Kapat' : 'Düzelt'}</Text>
                        </Pressable>
                        {acik && renderForm(m)}
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function sonucRengi(colors: AppColors, sonuc: MacSonucu): string {
  if (sonuc === 'galibiyet') return colors.accent;
  if (sonuc === 'maglubiyet') return colors.danger;
  return colors.warning;
}

function sonucKutuStili(styles: ReturnType<typeof createStyles>, sonuc: MacSonucu) {
  if (sonuc === 'galibiyet') return styles.sonucOk;
  if (sonuc === 'maglubiyet') return styles.sonucNo;
  return styles.sonucEsit;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
    headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
    headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
    pendingBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    pendingBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onWarning },
    scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxl },
    sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.4, color: colors.textDim },
    card: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 15 },
    cardActive: { borderColor: colors.accentBorder },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    cardTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
    cardSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
    girBtn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill },
    girBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
    duzeltText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
    skorPill: { minWidth: 62, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    skorPillText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
    sonucOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
    sonucNo: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    sonucEsit: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
    form: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
    fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.4, color: colors.textDim, marginBottom: spacing.xs },
    skorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    skorBox: { flex: 1, borderRadius: radius.md, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, paddingTop: 8, paddingBottom: 4, alignItems: 'center' },
    skorBoxLabel: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.8, color: colors.textMuted },
    skorInput: { width: '100%', height: 48, textAlign: 'center', fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
    skorAyrac: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textDim },
    turetilenBox: { marginTop: spacing.sm, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    turetilenText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
    notInput: { height: 76, paddingTop: 14, textAlignVertical: 'top' },
    saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    saveBtnDisabled: { backgroundColor: colors.chip },
    saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
    saveBtnTextDisabled: { color: colors.textDim },
    formNote: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.sm, textAlign: 'center' },
  });
}
