import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { TextField } from '../../src/components/TextField';
import { Toast, useIslem, useToast } from '../../src/components/Toast';
import { getGruplar, publishEtkinlik } from '../../src/data/etkinlikRepo';
import type { EtkinlikTuru } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../src/theme';

const TURLER: { value: EtkinlikTuru; label: string; baslikLabel: string; placeholder: string }[] = [
  { value: 'mac', label: 'Maç', baslikLabel: 'RAKİP', placeholder: 'Örn. Bornova U12' },
  { value: 'turnuva', label: 'Turnuva', baslikLabel: 'TURNUVA ADI', placeholder: 'Örn. Ege Kupası U12' },
  { value: 'kamp', label: 'Kamp', baslikLabel: 'KAMP ADI', placeholder: 'Örn. Foça Yaz Kampı' },
];
const TESISLER = ['Salon 1', 'Salon 2', 'Dış tesis'];
const TARIH_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default function EtkinlikOlusturScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { toastMessage, showToast } = useToast();
  const calistir = useIslem(showToast);
  const [gruplar, setGruplar] = useState<{ id: string; ad: string }[]>([]);
  const [tur, setTur] = useState<EtkinlikTuru>('mac');
  const [baslik, setBaslik] = useState('');
  const [tarih, setTarih] = useState('');
  const [saat, setSaat] = useState('');
  const [grupId, setGrupId] = useState<string | null>(null);
  const [tesis, setTesis] = useState('Salon 1');
  const [lcv, setLcv] = useState(true);
  const [ucretli, setUcretli] = useState(false);
  const [tutar, setTutar] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [ozet, setOzet] = useState('');

  const loadGruplar = useCallback(async () => {
    try {
      setGruplar(await getGruplar());
    } catch {
      showToast('Gruplar yüklenemedi');
    }
  }, [showToast]);

  useEffect(() => {
    loadGruplar();
  }, [loadGruplar]);

  const turMeta = TURLER.find((t) => t.value === tur)!;
  const canPublish = baslik.trim().length > 0;
  const grupAdi = grupId ? gruplar.find((g) => g.id === grupId)?.ad ?? 'Grup' : 'Tüm Gruplar';

  async function onPublish() {
    if (!canPublish || publishing) return;
    if (!TARIH_REGEX.test(tarih)) {
      showToast('Tarih YYYY-AA-GG formatında olmalı (örn. 2026-07-25)');
      return;
    }
    setPublishing(true);
    try {
      // Hata yutulduğunda "yayınlandı" ekranı açılıyor ama etkinlik hiç
      // oluşmuyordu. Başarı ekranı artık yalnızca gerçekten yazıldıysa geliyor;
      // hatada form dolu kalıyor ve tekrar denenebiliyor.
      const oldu = await calistir(
        () => publishEtkinlik({ tur, baslik, grupId, tesis, tarih, saat: saat || '—', lcv, ucretli, tutar: ucretli ? tutar : undefined }),
        'Etkinlik yayınlanamadı. Bağlantınızı kontrol edip tekrar deneyin.'
      );
      if (!oldu) return;
      setOzet(`${turMeta.label} · ${baslik} · ${grupAdi} · ${tarih} ${saat}`.trim());
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
    setGrupId(null);
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
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Etkinlik Oluştur</Text>
            <Text style={styles.headerSub}>Yayınlanınca veli ve antrenörlere düşer</Text>
          </View>
          {/* Oynanan maçın skorunu girme ekranı — etkinliğin diğer ucu, aynı yerden erişiliyor. */}
          <Pressable style={styles.sonucLink} onPress={() => router.push('/mac-sonuc')}>
            <Text style={styles.sonucLinkText}>Maç Sonucu</Text>
          </Pressable>
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
                  <Pressable hitSlop={{ top: 6, bottom: 6 }} key={t.value} style={[styles.turChip, active && styles.turChipActive]} onPress={() => setTur(t.value)}>
                    <Text style={[styles.turChipText, active && styles.turChipTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>{turMeta.baslikLabel}</Text>
            <TextField label="" value={baslik} onChangeText={setBaslik} placeholder={turMeta.placeholder} style={{ marginTop: 0 }} />

            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <TextField label="TARİH" value={tarih} onChangeText={setTarih} placeholder="2026-07-25" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="SAAT" value={saat} onChangeText={setSaat} placeholder="11:00" />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>GRUP</Text>
            <View style={styles.chipRow}>
              <Pressable hitSlop={{ top: 8, bottom: 8 }} style={[styles.smallChip, grupId === null && styles.smallChipActive]} onPress={() => setGrupId(null)}>
                <Text style={[styles.smallChipText, grupId === null && styles.smallChipTextActive]}>Tüm Gruplar</Text>
              </Pressable>
            </View>
            <View style={[styles.chipRow, { flexWrap: 'wrap', marginTop: spacing.xs }]}>
              {gruplar.map((g) => (
                <Pressable hitSlop={{ top: 8, bottom: 8 }} key={g.id} style={[styles.smallChip, { flex: 0 }, grupId === g.id && styles.smallChipActive]} onPress={() => setGrupId(g.id)}>
                  <Text style={[styles.smallChipText, grupId === g.id && styles.smallChipTextActive]}>{g.ad}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>TESİS</Text>
            <View style={styles.chipRow}>
              {TESISLER.map((t) => (
                <Pressable hitSlop={{ top: 8, bottom: 8 }} key={t} style={[styles.smallChip, tesis === t && styles.smallChipActive]} onPress={() => setTesis(t)}>
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
                <Switch value={lcv} onValueChange={setLcv} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#FFFFFF" />
              </View>
              <View style={[styles.toggleRow, { borderBottomWidth: ucretli ? 1 : 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Ücretli etkinlik</Text>
                  <Text style={styles.toggleSub}>Tutar veli uygulamasında ödemeye düşer</Text>
                </View>
                <Switch value={ucretli} onValueChange={setUcretli} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#FFFFFF" />
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
      <Toast message={toastMessage} />
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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  sonucLink: { backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill },
  sonucLinkText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  turChip: { flex: 1, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  turChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  turChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  turChipTextActive: { color: colors.accent },
  smallChip: { flex: 1, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  smallChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  smallChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  smallChipTextActive: { color: colors.accent },
  rowGap: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  toggleCard: { marginTop: spacing.md, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomColor: colors.border },
  toggleTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  toggleSub: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  publishBtn: { marginTop: spacing.lg, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  publishBtnDisabled: { backgroundColor: colors.panel },
  publishBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  publishBtnTextDisabled: { color: colors.textDim },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 56 },
  doneCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doneCheckmark: { fontSize: 40, color: colors.accent },
  doneTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.lg },
  doneOzet: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  timeline: { width: '100%', borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.xl, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDotDone: { backgroundColor: colors.accent },
  timelineDotPending: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  timelineLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  timelineNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  resetBtn: { width: '100%', marginTop: spacing.md, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  resetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  });
}
