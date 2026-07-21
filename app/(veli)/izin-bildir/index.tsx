import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { useChildLabel } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { getIznAntrenmanlar, getIznSebepleri } from '../../../src/data/veliRepo';
import type { IznAntrenman } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function IzinBildirScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const childLabel = useChildLabel();
  const [antrenmanlar, setAntrenmanlar] = useState<IznAntrenman[]>([]);
  const [sebepler, setSebepler] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seciliAntrenman, setSeciliAntrenman] = useState<string | null>(null);
  const [seciliSebep, setSeciliSebep] = useState<string | null>(null);
  const [not, setNot] = useState('');
  const [gonderildi, setGonderildi] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([getIznAntrenmanlar(), getIznSebepleri()]);
      setAntrenmanlar(a);
      setSebepler(s);
      setSeciliAntrenman(a[0]?.id ?? null);
    } catch {
      setError('Bilgiler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canSend = !!seciliAntrenman && !!seciliSebep;
  const secilenAntrenman = antrenmanlar.find((a) => a.id === seciliAntrenman);

  async function onSend() {
    if (!canSend) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 400));
    setSending(false);
    setGonderildi(true);
  }

  function reset() {
    setGonderildi(false);
    setSeciliSebep(null);
    setNot('');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>İzin Bildir</Text>
            <Text style={styles.headerSub}>{childLabel}</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <>
            {gonderildi ? (
              <View style={styles.doneWrap}>
                <View style={styles.doneCircle}>
                  <Text style={styles.doneCheckmark}>✓</Text>
                </View>
                <Text style={styles.doneTitle}>İzin iletildi</Text>
                <Text style={styles.doneSum}>{secilenAntrenman?.baslik} · {seciliSebep}</Text>
                <Text style={styles.doneCoachTo}>Antrenöre gönderildi</Text>
                <View style={styles.timeline}>
                  <TimelineRow label="Antrenöre bildirildi" done note="şimdi" />
                  <TimelineRow label="Yoklamada izinli işlenecek" done={false} note="antrenman günü" />
                </View>
                <View style={styles.doneActions}>
                  <Pressable style={styles.undoBtn} onPress={reset}>
                    <Text style={styles.undoBtnText}>Geri Al</Text>
                  </Pressable>
                  <Pressable style={styles.okBtn} onPress={() => router.back()}>
                    <Text style={styles.okBtnText}>Tamam</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.fieldLabel}>ANTRENMAN SEÇ</Text>
                {antrenmanlar.map((a) => {
                  const active = seciliAntrenman === a.id;
                  return (
                    <Pressable key={a.id} style={[styles.sessionRow, active && styles.sessionRowActive]} onPress={() => setSeciliAntrenman(a.id)}>
                      <View style={styles.sessionDateBox}>
                        <Text style={styles.sessionDateD1}>{a.gun1}</Text>
                        <Text style={styles.sessionDateD2}>{a.gun2}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.sessionTitle}>{a.baslik}</Text>
                        <Text style={styles.sessionDetay}>{a.detay}</Text>
                      </View>
                      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                        {active && <View style={styles.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>SEBEP</Text>
                <View style={styles.chipWrap}>
                  {sebepler.map((s) => (
                    <Pressable key={s} style={[styles.reasonChip, seciliSebep === s && styles.reasonChipActive]} onPress={() => setSeciliSebep(s)}>
                      <Text style={[styles.reasonChipText, seciliSebep === s && styles.reasonChipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
                  ANTRENÖRE NOT <Text style={styles.optionalNote}>· isteğe bağlı</Text>
                </Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Örn. ateşi var, evde dinlenecek"
                  placeholderTextColor={colors.textFaint}
                  value={not}
                  onChangeText={setNot}
                />

                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    Antrenöre anında iletilir, yoklamada <Text style={{ fontFamily: fontFamily.manropeExtra }}>izinli</Text> olarak işlenir ve devamsızlık puanını etkilemez.
                  </Text>
                </View>

                <Pressable style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} disabled={!canSend || sending} onPress={onSend}>
                  <Text style={[styles.sendBtnText, !canSend && styles.sendBtnTextDisabled]}>
                    {sending ? 'Gönderiliyor…' : 'İzni Gönder'}
                  </Text>
                </Pressable>
              </ScrollView>
            )}
          </>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function TimelineRow({ label, done, note }: { label: string; done: boolean; note: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, done ? { backgroundColor: colors.accent } : styles.timelineDotPending]} />
      <Text style={[styles.timelineLabel, !done && { color: colors.textMuted }]}>{label}</Text>
      <Text style={styles.timelineNote}>{note}</Text>
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
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginBottom: spacing.xs },
  optionalNote: { color: colors.textFaint, letterSpacing: 0.4 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft, padding: 12, marginBottom: spacing.xs },
  sessionRowActive: { borderColor: colors.accentBorder, backgroundColor: 'rgba(46,230,168,0.06)' },
  sessionDateBox: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  sessionDateD1: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, color: colors.textMuted },
  sessionDateD2: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.white },
  sessionTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  sessionDetay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.navyBorderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.accent },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reasonChip: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 99, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  reasonChipActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  reasonChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  reasonChipTextActive: { color: colors.accent },
  noteInput: { height: 48, borderRadius: 16, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, paddingHorizontal: 15, color: colors.white, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  infoBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: 'rgba(46,230,168,0.16)', padding: 12 },
  infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent, lineHeight: 19 },
  sendBtn: { marginTop: spacing.lg, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.navySurface },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  sendBtnTextDisabled: { color: colors.textFaint },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 56 },
  doneCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentTint, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doneCheckmark: { fontSize: 40, color: colors.accent },
  doneTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white, marginTop: spacing.lg },
  doneSum: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.iconMuted, marginTop: spacing.xs },
  doneCoachTo: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  timeline: { width: '100%', borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: spacing.md, marginTop: spacing.xl, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDotPending: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong },
  timelineLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.white },
  timelineNote: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textFaint },
  doneActions: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.md },
  undoBtn: { flex: 1, height: 48, borderRadius: 15, borderWidth: 1, borderColor: colors.navyBorderStrong, alignItems: 'center', justifyContent: 'center' },
  undoBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.iconMuted },
  okBtn: { flex: 1, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  okBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accentOnDark },
  });
}
