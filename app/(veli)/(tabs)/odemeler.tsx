import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { ChildSwitcherCompact, useChildLabel } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { useChild } from '../../../src/context/ChildContext';
import { useKurum } from '../../../src/context/KurumContext';
import { getOdemeOzet } from '../../../src/data/veliRepo';
import type { OdemeGecmisKalem, OdemeOzet } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

export default function OdemelerScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { selectedChildId } = useChild();
  const { kulupAdi } = useKurum();
  const childLabel = useChildLabel();
  const [ozet, setOzet] = useState<OdemeOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<OdemeGecmisKalem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOzet(await getOdemeOzet(selectedChildId));
    } catch {
      setError('Ödeme bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ay/dönem etiketleri sabit metin değil — bugünden ve gerçek ödeme kaydından türetilir.
  const ayAdi = new Date().toLocaleDateString('tr-TR', { month: 'long' });
  const simdi = new Date();
  const sonrakiDonem = new Date(simdi.getFullYear(), simdi.getMonth() + 1, 1).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Ödemeler</Text>
            <Text style={styles.subtitle}>{childLabel}</Text>
          </View>
          <ChildSwitcherCompact />
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && ozet && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {ozet.durum !== 'odendi' ? (
              <View style={[styles.dueCard, ozet.durum === 'gecikti' && styles.dueCardGecikti]}>
                <View style={styles.dueTop}>
                  {/* Etiket, bekleyen/geciken odeme kaydının kendi dönemi — içinde bulunulan ay değil. */}
                  <Text style={styles.dueLabel}>{(ozet.kapsam || `${ayAdi} aidatı`).toLocaleUpperCase('tr-TR')}</Text>
                  <View style={styles.duePill}>
                    <Text style={styles.duePillText}>{ozet.durum === 'gecikti' ? 'GECİKTİ' : 'BEKLİYOR'}</Text>
                  </View>
                </View>
                <Text style={styles.dueAmount}>{ozet.tutar}</Text>
                <Text style={styles.dueNote}>{ozet.kapsam}{ozet.sonOdeme ? ` · Son ödeme: ${ozet.sonOdeme}` : ''}</Text>

                <View style={[styles.infoBox, ozet.durum === 'gecikti' && styles.infoBoxDanger]}>
                  <Text style={[styles.infoText, ozet.durum === 'gecikti' && styles.infoTextDanger]}>
                    {ozet.durum === 'gecikti'
                      ? 'Son ödeme tarihi geçti. En kısa sürede kulüple iletişime geç — ödeme kulüp tarafından işlenince durumun burada otomatik güncellenir.'
                      : 'Ödeme kulüp resepsiyonu, banka havalesi veya elden alınır. Kulüp kaydı işleyince durumun burada otomatik güncellenir.'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.paidCard}>
                <View style={styles.paidIcon}>
                  <Text style={{ color: colors.accent, fontSize: 22 }}>✓</Text>
                </View>
                <Text style={styles.paidTitle} numberOfLines={1}>{ozet.kapsam ? `${ozet.kapsam} ödendi` : 'Bekleyen aidat yok'}</Text>
                <Text style={styles.paidSub}>{[ozet.tutar, ozet.odemeTarihi].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.paidNext}>Sıradaki aidat ({sonrakiDonem}) kulüp kaydı açılınca burada görünür</Text>
              </View>
            )}

            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Geçmiş Ödemeler</Text>
              <Text style={styles.historyNote}>{ozet.gecmis.length} kayıt</Text>
            </View>
            {ozet.gecmis.map((p) => (
              <Pressable key={p.id} style={styles.historyRow} onPress={() => setReceiptOpen(p)}>
                <View style={styles.historyIcon}>
                  <Text style={{ color: colors.accent }}>✓</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.historyTitle2} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.historySub}>{p.date} · {p.method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyAmount}>{p.amount}</Text>
                  <Text style={styles.historyReceipt}>Detay ›</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={!!receiptOpen} transparent animationType="slide" onRequestClose={() => setReceiptOpen(null)}>
        <Pressable style={styles.receiptBackdrop} onPress={() => setReceiptOpen(null)}>
          <Pressable style={styles.receiptSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {receiptOpen && (
              <>
                <View style={styles.receiptHeaderRow}>
                  <View style={styles.receiptIcon}>
                    <Text>🧾</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.receiptTitle} numberOfLines={1}>{receiptOpen.title}</Text>
                    <Text style={styles.receiptNo}>Kayıt No: {receiptOpen.id.slice(-4).toUpperCase()}</Text>
                  </View>
                  <View style={styles.receiptOkBadge}>
                    <Text style={styles.receiptOkText}>ÖDENDİ</Text>
                  </View>
                </View>
                <View style={styles.receiptTable}>
                  <ReceiptRow label="Sporcu" value={childLabel.split(' · ')[0]} />
                  <ReceiptRow label="Tarih" value={receiptOpen.date} />
                  <ReceiptRow label="Ödeme yöntemi" value={receiptOpen.method} />
                  <ReceiptRow label="Tutar" value={receiptOpen.amount} accent />
                  <ReceiptRow label="Düzenleyen" value={kulupAdi} last />
                </View>
                <Text style={styles.receiptFootnote}>Resmî makbuz/dekont için kulüp muhasebesiyle iletişime geçebilirsiniz.</Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </AppModal>
    </ScreenBackground>
  );
}

function ReceiptRow({ label, value, accent, last }: { label: string; value: string; accent?: boolean; last?: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={[styles.receiptRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.receiptRowLabel}>{label}</Text>
      <Text style={[styles.receiptRowValue, accent && { color: colors.accent, fontFamily: fontFamily.archivoBold }]}>{value}</Text>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 3 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  dueCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.surface, padding: spacing.xl },
  dueCardGecikti: { borderColor: colors.danger },
  dueTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dueLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  duePill: { backgroundColor: colors.warningSoft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  duePillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.warning },
  dueAmount: { fontFamily: fontFamily.archivoBold, fontSize: 44, color: colors.textBright, letterSpacing: -1.5, marginTop: 12 },
  dueNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted, marginTop: 2 },
  infoBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  infoBoxDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent, lineHeight: 19 },
  infoTextDanger: { color: colors.danger },
  paidCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surface, padding: spacing.xl, alignItems: 'center' },
  paidIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  paidTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.sm, textAlign: 'center' },
  paidSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  paidNext: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.sm, textAlign: 'center' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  historyTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  historyNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  historyTitle2: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  historySub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  historyAmount: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  historyReceipt: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent, marginTop: 1 },
  receiptBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  receiptSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  receiptHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  receiptIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  receiptTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  receiptNo: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  receiptOkBadge: { backgroundColor: colors.accentSoft, paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  receiptOkText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  receiptTable: { borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, marginTop: spacing.md },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  receiptRowLabel: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  receiptRowValue: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  receiptFootnote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim, marginTop: spacing.md },
  });
}
