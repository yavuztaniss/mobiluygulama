import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import {
  getBranslar,
  getVeliBasvurulari,
  veliBasvuruOlustur,
  type BransSecenek,
  type VeliBasvuru,
} from '../../../src/data/basvurularRepo';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

// Başvuru artık GERÇEK: `basvuru` tablosuna DENEME kaydı ekleniyor (0018 politikası),
// Yönetici > Başvurular ekranı aynı satırı görüp onaylıyor/reddediyor. Eski sabit
// gün/saat (SLOT) seçimi kaldırıldı — veli, RLS gereği başka grupların antrenman
// planını göremez; tercih artık serbest metin olarak detay_notu'na yazılıyor.

const DURUM_ETIKET: Record<VeliBasvuru['durum'], string> = {
  bekliyor: 'BEKLİYOR',
  onaylandi: 'ONAYLANDI',
  reddedildi: 'REDDEDİLDİ',
};

export default function SporcuEkleScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { toastMessage, showToast } = useToast();

  const [branslar, setBranslar] = useState<BransSecenek[]>([]);
  const [basvurular, setBasvurular] = useState<VeliBasvuru[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ad, setAd] = useState('');
  const [yil, setYil] = useState('');
  const [bransId, setBransId] = useState<string | null>(null);
  const [tercih, setTercih] = useState('');
  const [gonderildi, setGonderildi] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, v] = await Promise.all([getBranslar(), getVeliBasvurulari()]);
      setBranslar(b);
      setBasvurular(v);
    } catch {
      setError('Bilgiler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canSend = ad.trim().length > 1 && !!bransId;
  const seciliBrans = branslar.find((b) => b.id === bransId);

  async function onSend() {
    if (!canSend || !bransId) return;
    const yilN = parseInt(yil.trim(), 10);
    setSending(true);
    try {
      await veliBasvuruOlustur({
        ad: ad.trim(),
        dogumYili: Number.isNaN(yilN) ? null : yilN,
        bransId,
        tercihNotu: tercih,
      });
      setGonderildi(true);
      // Alt listedeki "önceki başvurular" da tazelensin (başarı ekranından dönüşte görünür).
      getVeliBasvurulari().then(setBasvurular).catch(() => {});
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Başvuru gönderilemedi, tekrar deneyin.');
    } finally {
      setSending(false);
    }
  }

  function durumRozetStil(durum: VeliBasvuru['durum']) {
    if (durum === 'onaylandi') return { bg: colors.accentSoft, fg: colors.accent };
    if (durum === 'reddedildi') return { bg: colors.dangerSoft, fg: colors.danger };
    return { bg: colors.warningSoft, fg: colors.warning };
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Sporcu Ekle</Text>
            <Text style={styles.headerSub}>İlk ders deneme · ücretsiz</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (gonderildi ? (
          <View style={styles.doneWrap}>
            <View style={styles.doneCircle}>
              <Text style={styles.doneCheckmark}>✓</Text>
            </View>
            <Text style={styles.doneTitle}>Başvuru alındı</Text>
            <Text style={styles.doneSum}>{ad.trim()}{seciliBrans ? ` · ${seciliBrans.ad}` : ''}</Text>
            <View style={styles.timeline}>
              <TimelineRow label="Başvuru kulübe iletildi" note="şimdi" done />
              <TimelineRow label="Kulüp onayı · sonucu bu ekrandan takip edebilirsiniz" note="bekleniyor" done={false} />
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
              {branslar.map((b) => {
                const active = bransId === b.id;
                return (
                  <Pressable
                    key={b.id}
                    style={[styles.bransChip, active && styles.bransChipActive]}
                    onPress={() => setBransId(b.id)}
                  >
                    <Text style={[styles.bransChipText, active && styles.bransChipTextActive]}>{b.ad}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>TERCİH EDİLEN GÜN / SAAT (İSTEĞE BAĞLI)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="örn. hafta içi 17:00 sonrası, Cumartesi sabahı…"
              placeholderTextColor={colors.textDim}
              value={tercih}
              onChangeText={setTercih}
              multiline
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Başvuru kulüp onayından geçer; uygun grup ve deneme dersi saati kulüp tarafından sizinle iletişime geçilerek planlanır. Deneme dersi sonrası kayıt kararı tamamen size aittir.
              </Text>
            </View>

            <Pressable style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} disabled={!canSend || sending} onPress={onSend}>
              <Text style={[styles.sendBtnText, !canSend && styles.sendBtnTextDisabled]}>
                {sending ? 'Gönderiliyor…' : canSend ? 'Başvuruyu Gönder' : 'Ad ve branş seçin'}
              </Text>
            </Pressable>

            {basvurular.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>ÖNCEKİ BAŞVURULARIM</Text>
                {basvurular.map((b) => {
                  const rozet = durumRozetStil(b.durum);
                  return (
                    <View key={b.id} style={styles.basvuruRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.basvuruAd} numberOfLines={1}>{b.ad}</Text>
                        <Text style={styles.basvuruAlt}>{[b.altBilgi, b.when].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <View style={[styles.basvuruRozet, { backgroundColor: rozet.bg }]}>
                        <Text style={[styles.basvuruRozetText, { color: rozet.fg }]}>{DURUM_ETIKET[b.durum]}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        ))}
      </SafeAreaView>
      <Toast message={toastMessage} />
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
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginBottom: spacing.xs },
  input: { height: 48, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  inputMulti: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  bransGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  bransChip: { width: '48%', height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  bransChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  bransChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  bransChipTextActive: { color: colors.accent },
  infoBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent, lineHeight: 19 },
  sendBtn: { marginTop: spacing.lg, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.panel },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  sendBtnTextDisabled: { color: colors.textDim },
  basvuruRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 13, marginBottom: spacing.xs },
  basvuruAd: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  basvuruAlt: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  basvuruRozet: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  basvuruRozetText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 56 },
  doneCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  doneCheckmark: { fontSize: 40, color: colors.accent },
  doneTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.lg },
  doneSum: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted, marginTop: spacing.xs },
  timeline: { width: '100%', borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.xl, gap: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineDotPending: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  timelineLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  timelineNote: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  okBtn: { width: '100%', marginTop: spacing.md, height: 48, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  okBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  });
}
