import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

const BRANSLAR = ['Basketbol', 'Yüzme', 'Voleybol', 'Jimnastik'];

const SLOTS: Record<string, { d1: string; d2: string; t: string; v: string }[]> = {
  Basketbol: [
    { d1: 'ÇAR', d2: '22', t: '17:00 – 18:00', v: 'Salon 1 · U11 grubuyla' },
    { d1: 'CUM', d2: '24', t: '16:30 – 17:30', v: 'Salon 2 · U11 grubuyla' },
    { d1: 'PZT', d2: '27', t: '17:00 – 18:00', v: 'Salon 1 · U11 grubuyla' },
  ],
  Yüzme: [
    { d1: 'SAL', d2: '21', t: '18:00 – 18:45', v: 'Havuz · başlangıç kulvarı' },
    { d1: 'PER', d2: '23', t: '18:00 – 18:45', v: 'Havuz · başlangıç kulvarı' },
    { d1: 'SAL', d2: '28', t: '18:00 – 18:45', v: 'Havuz · başlangıç kulvarı' },
  ],
  Voleybol: [
    { d1: 'ÇAR', d2: '22', t: '18:30 – 19:30', v: 'Salon 2 · minik grup' },
    { d1: 'CMT', d2: '25', t: '10:00 – 11:00', v: 'Salon 1 · minik grup' },
    { d1: 'ÇAR', d2: '29', t: '18:30 – 19:30', v: 'Salon 2 · minik grup' },
  ],
  Jimnastik: [
    { d1: 'PZT', d2: '27', t: '16:00 – 17:00', v: 'Stüdyo · temel seviye' },
    { d1: 'ÇAR', d2: '29', t: '16:00 – 17:00', v: 'Stüdyo · temel seviye' },
    { d1: 'CUM', d2: '31', t: '16:00 – 17:00', v: 'Stüdyo · temel seviye' },
  ],
};

export default function SporcuEkleScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [ad, setAd] = useState('');
  const [yil, setYil] = useState('');
  const [brans, setBrans] = useState<string | null>(null);
  const [slotIdx, setSlotIdx] = useState(0);
  const [gonderildi, setGonderildi] = useState(false);
  const [sending, setSending] = useState(false);

  const canSend = ad.trim().length > 1 && !!brans;
  const slot = brans ? SLOTS[brans][slotIdx] : null;

  async function onSend() {
    if (!canSend) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 400));
    setSending(false);
    setGonderildi(true);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Sporcu Ekle</Text>
            <Text style={styles.headerSub}>İlk ders deneme · ücretsiz</Text>
          </View>
        </View>

        {gonderildi ? (
          <View style={styles.doneWrap}>
            <View style={styles.doneCircle}>
              <Text style={styles.doneCheckmark}>✓</Text>
            </View>
            <Text style={styles.doneTitle}>Başvuru alındı</Text>
            <Text style={styles.doneSum}>{ad} · {brans} · {slot?.t}</Text>
            <View style={styles.timeline}>
              <TimelineRow label="Başvuru kulübe iletildi" note="şimdi" done />
              <TimelineRow label="Kulüp onayı · genellikle aynı gün" note="bekleniyor" done={false} />
              <TimelineRow label="Ders günü hatırlatma bildirimi" note="otomatik" done={false} />
            </View>
            <Pressable style={styles.okBtn} onPress={() => router.back()}>
              <Text style={styles.okBtnText}>Tamam</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>SPORCU BİLGİLERİ</Text>
            <TextInput
              style={styles.input}
              placeholder="Ad Soyad"
              placeholderTextColor={colors.textDim}
              value={ad}
              onChangeText={setAd}
            />
            <TextInput
              style={[styles.input, { marginTop: spacing.sm }]}
              placeholder="Doğum yılı · örn. 2015"
              placeholderTextColor={colors.textDim}
              value={yil}
              onChangeText={setYil}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>BRANŞ</Text>
            <View style={styles.bransGrid}>
              {BRANSLAR.map((b) => {
                const active = brans === b;
                return (
                  <Pressable
                    key={b}
                    style={[styles.bransChip, active && styles.bransChipActive]}
                    onPress={() => {
                      setBrans(b);
                      setSlotIdx(0);
                    }}
                  >
                    <Text style={[styles.bransChipText, active && styles.bransChipTextActive]}>{b}</Text>
                  </Pressable>
                );
              })}
            </View>

            {brans && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>DENEME DERSİ SEÇ · ÜCRETSİZ</Text>
                {SLOTS[brans].map((s, i) => {
                  const active = slotIdx === i;
                  return (
                    <Pressable key={i} style={[styles.slotRow, active && styles.slotRowActive]} onPress={() => setSlotIdx(i)}>
                      <View style={styles.slotDateBox}>
                        <Text style={styles.slotD1}>{s.d1}</Text>
                        <Text style={styles.slotD2}>{s.d2}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.slotTitle}>{s.t}</Text>
                        <Text style={styles.slotDetay}>{s.v}</Text>
                      </View>
                      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                        {active && <View style={styles.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
              </>
            )}

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Başvuru kulüp onayından geçer. Deneme dersi sonrası kayıt kararı tamamen size aittir.</Text>
            </View>

            <Pressable style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} disabled={!canSend || sending} onPress={onSend}>
              <Text style={[styles.sendBtnText, !canSend && styles.sendBtnTextDisabled]}>
                {sending ? 'Gönderiliyor…' : canSend ? 'Başvuruyu Gönder' : 'Ad ve branş seçin'}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function TimelineRow({ label, note, done }: { label: string; note: string; done: boolean }) {
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
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginBottom: spacing.xs },
  input: { height: 48, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  bransGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  bransChip: { width: '48%', height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  bransChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  bransChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  bransChipTextActive: { color: colors.accent },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border, padding: 12, marginBottom: spacing.xs },
  slotRowActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  slotDateBox: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  slotD1: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, color: colors.textMuted },
  slotD2: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  slotTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  slotDetay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.accent },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  infoBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent, lineHeight: 19 },
  sendBtn: { marginTop: spacing.lg, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.panel },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  sendBtnTextDisabled: { color: colors.textDim },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 56 },
  doneCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doneCheckmark: { fontSize: 40, color: colors.accent },
  doneTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.lg },
  doneSum: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.xs },
  timeline: { width: '100%', borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.xl, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDotPending: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  timelineLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  timelineNote: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textDim },
  okBtn: { width: '100%', marginTop: spacing.md, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  okBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  });
}
