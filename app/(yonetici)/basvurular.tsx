import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { AppModal } from '../../src/components/AppModal';
import { Button } from '../../src/components/Button';
import { LoadingState, ErrorState } from '../../src/components/StateViews';
import { Toast, useIslem, useToast } from '../../src/components/Toast';
import { geriAlBasvuru, getBasvurular, onaylaBasvuru, reddetBasvuru } from '../../src/data/basvurularRepo';
import { getGruplar } from '../../src/data/etkinlikRepo';
import type { Basvuru } from '../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../src/theme';

export default function BasvurularScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [basvurular, setBasvurular] = useState<Basvuru[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();
  const calistir = useIslem(showToast);

  const [grupSheetFor, setGrupSheetFor] = useState<Basvuru | null>(null);
  const [gruplar, setGruplar] = useState<{ id: string; ad: string }[]>([]);
  const [seciliGrup, setSeciliGrup] = useState<string | null>(null);
  const [onaylaniyor, setOnaylaniyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBasvurular(await getBasvurular());
    } catch {
      setError('Başvurular yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = basvurular.filter((b) => b.durum === 'bekliyor').length;

  // Onay iki yazma birden yapıyor (sporcu satırı + veli_sporcu bağı). Hata
  // yutulduğunda ne kayıt oluşuyor ne de uyarı çıkıyordu; yönetici başvurunun
  // onaylandığını sanıp listede "bekliyor" görmeye devam ediyordu.
  // Dönüş değeri çağıranlara taşınıyor: grup sayfası ancak başarıda kapansın.
  async function onaylaVeYenile(b: Basvuru, grupId?: string): Promise<boolean> {
    const oldu = await calistir(() => onaylaBasvuru(b.id, grupId), 'Başvuru onaylanamadı. Tekrar deneyin.');
    if (!oldu) return false;
    setBasvurular(await getBasvurular());
    showToast(`${b.ad.split(' ')[0]} onaylandı · gerçek sporcu kaydı oluşturuldu`);
    return true;
  }

  async function onOnaylaTap(b: Basvuru) {
    if (!b.grupId) {
      setSeciliGrup(null);
      setGrupSheetFor(b);
      const g = await getGruplar();
      setGruplar(g);
      return;
    }
    await onaylaVeYenile(b);
  }

  async function onGrupSheetOnayla() {
    if (!grupSheetFor || !seciliGrup) {
      showToast('Grup seçimi gerekli');
      return;
    }
    setOnaylaniyor(true);
    try {
      // Sayfa yalnızca onay GERÇEKTEN geçtiyse kapanıyor; hata durumunda açık
      // kalıyor ki yönetici seçtiği grubu kaybetmeden tekrar deneyebilsin.
      const oldu = await onaylaVeYenile(grupSheetFor, seciliGrup);
      if (oldu) setGrupSheetFor(null);
    } finally {
      setOnaylaniyor(false);
    }
  }

  async function onReddet(b: Basvuru) {
    const oldu = await calistir(() => reddetBasvuru(b.id), 'Başvuru reddedilemedi. Tekrar deneyin.');
    if (!oldu) return;
    setBasvurular(await getBasvurular());
    showToast('Başvuru reddedildi · veliye iletildi');
  }

  async function onGeriAl(b: Basvuru) {
    const oldu = await calistir(() => geriAlBasvuru(b.id), 'Geri alınamadı. Tekrar deneyin.');
    if (oldu) setBasvurular(await getBasvurular());
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Başvurular</Text>
            <Text style={styles.headerSub}>
              {pendingCount > 0 ? `${pendingCount} bekleyen · bu hafta ${basvurular.length} başvuru` : `Tümü sonuçlandı · bu hafta ${basvurular.length} başvuru`}
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>

        {loading && <LoadingState label="Başvurular yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {basvurular.map((b) => {
              const decided = b.durum !== 'bekliyor';
              const approved = b.durum === 'onaylandi';
              return (
                <View
                  key={b.id}
                  style={[
                    styles.card,
                    { borderColor: decided ? colors.border : colors.warning },
                  ]}
                >
                  <View style={styles.topRow}>
                    <View style={[styles.avatar, { backgroundColor: b.avBg }]}>
                      <Text style={[styles.avatarText, { color: b.avFg }]}>{b.init}</Text>
                    </View>
                    <View style={styles.mid}>
                      <Text style={styles.name} numberOfLines={1}>{b.ad}</Text>
                      <Text style={styles.altText}>{b.altBilgi}</Text>
                    </View>
                    <View
                      style={[
                        styles.tag,
                        { backgroundColor: b.tag === 'DENEME' ? colors.infoSoft : colors.accentSoft },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: b.tag === 'DENEME' ? colors.info : colors.accent }]}>{b.tag}</Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailText}>{b.detay}</Text>
                  </View>
                  <Text style={styles.whenText}>Veli: {b.veli} · {b.when}</Text>

                  {!decided && (
                    <View style={styles.actionRow}>
                      <Pressable hitSlop={{ top: 6, bottom: 6 }} style={styles.approveBtn} onPress={() => onOnaylaTap(b)}>
                        <Text style={styles.approveBtnText}>✓ Onayla</Text>
                      </Pressable>
                      <Pressable hitSlop={{ top: 6, bottom: 6 }} style={styles.rejectBtn} onPress={() => onReddet(b)}>
                        <Text style={styles.rejectBtnText}>✕ Reddet</Text>
                      </Pressable>
                    </View>
                  )}
                  {decided && (
                    <View style={[styles.decidedBox, approved ? styles.decidedBoxOk : styles.decidedBoxNo]}>
                      <Text style={[styles.decidedText, { color: approved ? colors.accent : colors.danger }]}>
                        {approved
                          ? 'Onaylandı · gerçek sporcu kaydı oluşturuldu'
                          : 'Reddedildi · veliye kontenjan bilgisi iletildi'}
                      </Text>
                      <Pressable onPress={() => onGeriAl(b)}>
                        <Text style={styles.undoText}>Geri Al</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={styles.footerNote}>Onaylanan başvuru gerçek Sporcular listesine eklenir</Text>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={!!grupSheetFor} transparent animationType="slide" onRequestClose={() => setGrupSheetFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setGrupSheetFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Grup Seç</Text>
            <Text style={styles.sheetSub}>{grupSheetFor?.ad} için hangi gruba kaydedilecek?</Text>
            <ScrollView contentContainerStyle={{ gap: 7, paddingTop: spacing.sm }}>
              <View style={styles.pickRow}>
                {gruplar.map((g) => (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={g.id} style={[styles.pickChip, seciliGrup === g.id && styles.pickChipActive]} onPress={() => setSeciliGrup(g.id)}>
                    <Text style={[styles.pickChipText, seciliGrup === g.id && styles.pickChipTextActive]}>{g.ad}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ height: spacing.xs }} />
              <Button label="Onayla ve Kaydet" onPress={onGrupSheetOnayla} loading={onaylaniyor} />
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
  pendingBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  pendingBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xxl },
  card: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, padding: 15 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base },
  mid: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  altText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  tag: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  tagText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11, padding: 11, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border },
  detailText: { flex: 1, fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted },
  whenText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim, marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  approveBtn: { flex: 1, height: 42, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  rejectBtn: { flex: 1, height: 42, borderRadius: 13, backgroundColor: colors.dangerSoft, borderWidth: 1.5, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.danger },
  decidedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 13, borderWidth: 1 },
  decidedBoxOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  decidedBoxNo: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  decidedText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm },
  undoText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.xs },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '75%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pickChip: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  pickChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  pickChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  pickChipTextActive: { color: colors.accent },
  });
}
