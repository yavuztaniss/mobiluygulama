import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { useChildLabel } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useChild } from '../../../src/context/ChildContext';
import { getIznAntrenmanlar, getIznSebepleri, izinGonder } from '../../../src/data/veliRepo';
import type { IznAntrenman } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

export default function IzinBildirScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const childLabel = useChildLabel();
  const { selectedChildId } = useChild();
  const [antrenmanlar, setAntrenmanlar] = useState<IznAntrenman[]>([]);
  const [sebepler, setSebepler] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seciliAntrenman, setSeciliAntrenman] = useState<string | null>(null);
  const [seciliSebep, setSeciliSebep] = useState<string | null>(null);
  const [not, setNot] = useState('');
  const [gonderildi, setGonderildi] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([getIznAntrenmanlar(selectedChildId), getIznSebepleri()]);
      setAntrenmanlar(a);
      setSebepler(s);
      setSeciliAntrenman(a[0]?.id ?? null);
    } catch {
      setError('Bilgiler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  const canSend = !!seciliAntrenman && !!seciliSebep;
  const secilenAntrenman = antrenmanlar.find((a) => a.id === seciliAntrenman);

  async function onSend() {
    if (!canSend || !seciliAntrenman || !seciliSebep) return;
    setSending(true);
    setSendError(null);
    try {
      await izinGonder(seciliAntrenman, selectedChildId, seciliSebep, not);
      setGonderildi(true);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'İzin gönderilemedi, tekrar dene.');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setGonderildi(false);
    setSeciliSebep(null);
    setNot('');
    setSendError(null);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
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
                        <Text style={styles.sessionTitle} numberOfLines={1}>{a.baslik}</Text>
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
                    <Pressable hitSlop={{ top: 8, bottom: 8 }} key={s} style={[styles.reasonChip, seciliSebep === s && styles.reasonChipActive]} onPress={() => setSeciliSebep(s)}>
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
                  placeholderTextColor={colors.textDim}
                  value={not}
                  onChangeText={setNot}
                />

                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    Antrenöre anında iletilir, yoklamada <Text style={{ fontFamily: fontFamily.manropeExtra }}>izinli</Text> olarak işlenir ve devamsızlık puanını etkilemez.
                  </Text>
                </View>

                {sendError && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>{sendError}</Text>
                  </View>
                )}

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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginBottom: spacing.xs },
  optionalNote: { color: colors.textDim, letterSpacing: 0.4 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border, padding: 12, marginBottom: spacing.xs },
  sessionRowActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  sessionDateBox: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  sessionDateD1: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  sessionDateD2: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  sessionTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  sessionDetay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.accent },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reasonChip: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 99, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  reasonChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  reasonChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  reasonChipTextActive: { color: colors.accent },
  noteInput: { height: 48, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  infoBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent, lineHeight: 19 },
  errorBox: { marginTop: spacing.sm, borderRadius: 14, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, padding: 12 },
  errorBoxText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.danger, lineHeight: 19 },
  sendBtn: { marginTop: spacing.lg, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.panel },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  sendBtnTextDisabled: { color: colors.textDim },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 56 },
  doneCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doneCheckmark: { fontSize: 40, color: colors.accent },
  doneTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.lg },
  doneSum: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted, marginTop: spacing.xs },
  doneCoachTo: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  timeline: { width: '100%', borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.xl, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDotPending: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  timelineLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  timelineNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  doneActions: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.md },
  undoBtn: { flex: 1, height: 48, borderRadius: 15, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  undoBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  okBtn: { flex: 1, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  okBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  });
}
