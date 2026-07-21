import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { TextField } from '../../src/components/TextField';
import { publishEtkinlik } from '../../src/data/etkinlikRepo';
import type { EtkinlikTuru } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

const TURLER: { value: EtkinlikTuru; label: string; baslikLabel: string; placeholder: string }[] = [
  { value: 'mac', label: 'Maç', baslikLabel: 'RAKİP', placeholder: 'Örn. Bornova U12' },
  { value: 'turnuva', label: 'Turnuva', baslikLabel: 'TURNUVA ADI', placeholder: 'Örn. Ege Kupası U12' },
  { value: 'kamp', label: 'Kamp', baslikLabel: 'KAMP ADI', placeholder: 'Örn. Foça Yaz Kampı' },
];
const GRUPLAR = ['U10', 'U12', 'U14'];
const TESISLER = ['Salon 1', 'Salon 2', 'Dış tesis'];

export default function EtkinlikOlusturScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [tur, setTur] = useState<EtkinlikTuru>('mac');
  const [baslik, setBaslik] = useState('');
  const [tarih, setTarih] = useState('');
  const [saat, setSaat] = useState('');
  const [grup, setGrup] = useState('U12');
  const [tesis, setTesis] = useState('Salon 1');
  const [lcv, setLcv] = useState(true);
  const [ucretli, setUcretli] = useState(false);
  const [tutar, setTutar] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [ozet, setOzet] = useState('');

  const turMeta = TURLER.find((t) => t.value === tur)!;
  const canPublish = baslik.trim().length > 0;

  async function onPublish() {
    if (!canPublish || publishing) return;
    setPublishing(true);
    try {
      await publishEtkinlik({ tur, baslik, grup, tesis, tarih: tarih || '—', saat: saat || '—', lcv, ucretli, tutar: ucretli ? tutar : undefined });
      setOzet(`${turMeta.label} · ${baslik} · ${grup} · ${tarih || '—'} ${saat}`.trim());
      setDone(true);
    } finally {
      setPublishing(false);
    }
  }

  function reset() {
    setTur('mac');
    setBaslik('');
    setTarih('');
    setSaat('');
    setGrup('U12');
    setTesis('Salon 1');
    setLcv(true);
    setUcretli(false);
    setTutar('');
    setDone(false);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Etkinlik Oluştur</Text>
            <Text style={styles.headerSub}>Yayınlanınca veli ve antrenörlere düşer</Text>
          </View>
        </View>

        {done ? (
          <View style={styles.doneWrap}>
            <View style={styles.doneCircle}>
              <Text style={styles.doneCheckmark}>✓</Text>
            </View>
            <Text style={styles.doneTitle}>Etkinlik yayınlandı</Text>
            <Text style={styles.doneOzet}>{ozet}</Text>
            <View style={styles.timeline}>
              <TimelineRow label="Veliler bildirim aldı" done />
              <TimelineRow label="Veli uygulamasında Etkinlikler'e düştü" done />
              <TimelineRow label="Antrenör kadro seçimi açıldı" done={false} note="LCV sonrası" />
            </View>
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnText}>Yeni Etkinlik Oluştur</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>TÜR</Text>
            <View style={styles.chipRow}>
              {TURLER.map((t) => {
                const active = t.value === tur;
                return (
                  <Pressable key={t.value} style={[styles.turChip, active && styles.turChipActive]} onPress={() => setTur(t.value)}>
                    <Text style={[styles.turChipText, active && styles.turChipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>{turMeta.baslikLabel}</Text>
            <TextField label="" value={baslik} onChangeText={setBaslik} placeholder={turMeta.placeholder} style={{ marginTop: 0 }} />

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <TextField label="TARİH" value={tarih} onChangeText={setTarih} placeholder="25 Temmuz" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="SAAT" value={saat} onChangeText={setSaat} placeholder="11:00" />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>GRUP</Text>
            <View style={styles.chipRow}>
              {GRUPLAR.map((g) => (
                <Pressable key={g} style={[styles.smallChip, grup === g && styles.smallChipActive]} onPress={() => setGrup(g)}>
                  <Text style={[styles.smallChipText, grup === g && styles.smallChipTextActive]}>{g}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>TESİS</Text>
            <View style={styles.chipRow}>
              {TESISLER.map((t) => (
                <Pressable key={t} style={[styles.smallChip, tesis === t && styles.smallChipActive]} onPress={() => setTesis(t)}>
                  <Text style={[styles.smallChipText, tesis === t && styles.smallChipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Velilerden LCV iste</Text>
                  <Text style={styles.toggleSub}>Katılır / katılmaz yanıtı toplanır</Text>
                </View>
                <Switch value={lcv} onValueChange={setLcv} trackColor={{ true: colors.accent, false: colors.navyBorderStrong }} thumbColor="#FFFFFF" />
              </View>
              <View style={[styles.toggleRow, { borderBottomWidth: ucretli ? 1 : 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Ücretli etkinlik</Text>
                  <Text style={styles.toggleSub}>Tutar veli uygulamasında ödemeye düşer</Text>
                </View>
                <Switch value={ucretli} onValueChange={setUcretli} trackColor={{ true: colors.accent, false: colors.navyBorderStrong }} thumbColor="#FFFFFF" />
              </View>
              {ucretli && (
                <View style={{ paddingBottom: spacing.md }}>
                  <TextField label="" value={tutar} onChangeText={setTutar} placeholder="Tutar · örn. ₺3.825" keyboardType="numeric" />
                </View>
              )}
            </View>

            <Pressable style={[styles.publishBtn, !canPublish && styles.publishBtnDisabled]} disabled={!canPublish || publishing} onPress={onPublish}>
              <Text style={[styles.publishBtnText, !canPublish && styles.publishBtnTextDisabled]}>
                {publishing ? 'Yayınlanıyor…' : 'Etkinliği Yayınla'}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function TimelineRow({ label, done, note }: { label: string; done: boolean; note?: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, done ? styles.timelineDotDone : styles.timelineDotPending]} />
      <Text style={[styles.timelineLabel, !done && { color: colors.textMuted }]}>{label}</Text>
      <Text style={styles.timelineNote}>{note ?? 'şimdi'}</Text>
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
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  turChip: { flex: 1, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  turChipActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  turChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  turChipTextActive: { color: colors.accent },
  smallChip: { flex: 1, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  smallChipActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  smallChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  smallChipTextActive: { color: colors.accent },
  rowGap: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  toggleCard: { marginTop: spacing.md, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, paddingHorizontal: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomColor: colors.navyBorder },
  toggleTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  toggleSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  publishBtn: { marginTop: spacing.lg, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  publishBtnDisabled: { backgroundColor: colors.navySurface },
  publishBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  publishBtnTextDisabled: { color: colors.textFaint },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 56 },
  doneCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentTint, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doneCheckmark: { fontSize: 40, color: colors.accent },
  doneTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white, marginTop: spacing.lg },
  doneOzet: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.iconMuted, marginTop: spacing.xs, textAlign: 'center' },
  timeline: { width: '100%', borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: spacing.md, marginTop: spacing.xl, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDotDone: { backgroundColor: colors.accent },
  timelineDotPending: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong },
  timelineLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.white },
  timelineNote: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textFaint },
  resetBtn: { width: '100%', marginTop: spacing.md, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  resetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accentOnDark },
  });
}
