import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Button } from '../../../src/components/Button';
import { ChildSwitcherCompact, useChildLabel } from '../../../src/components/ChildSwitcher';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useChild } from '../../../src/context/ChildContext';
import { getOdemeOzet } from '../../../src/data/veliRepo';
import type { OdemeGecmisKalem, OdemeOzet } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function OdemelerScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { selectedChildId } = useChild();
  const childLabel = useChildLabel();
  const [ozet, setOzet] = useState<OdemeOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<OdemeGecmisKalem | null>(null);
  const { toastMessage, showToast } = useToast();

  const [indirilenler, setIndirilenler] = useState<Set<string>>(new Set());
  const [indiriliyorId, setIndiriliyorId] = useState<string | null>(null);

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

  async function onDekontIndir(id: string) {
    setIndiriliyorId(id);
    await new Promise((r) => setTimeout(r, 700));
    setIndirilenler((s) => new Set(s).add(id));
    setIndiriliyorId(null);
    showToast('Dekont indirildi · dekont.pdf');
  }

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
                  <Text style={styles.dueLabel}>TEMMUZ AİDATI</Text>
                  <View style={styles.duePill}>
                    <Text style={styles.duePillText}>{ozet.durum === 'gecikti' ? 'GECİKTİ' : 'BEKLİYOR'}</Text>
                  </View>
                </View>
                <Text style={styles.dueAmount}>{ozet.tutar}</Text>
                <Text style={styles.dueNote}>{ozet.kapsam} · Son ödeme: {ozet.sonOdeme}</Text>

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
                <Text style={styles.paidTitle}>Temmuz aidatı ödendi</Text>
                <Text style={styles.paidSub}>{ozet.tutar} · {ozet.odemeTarihi} · Kredi kartı •••• 4521</Text>
                <Text style={styles.paidNext}>Sıradaki aidat: 1 Ağustos'ta yansıyacak</Text>
              </View>
            )}

            <View style={styles.quickRow}>
              <Pressable style={styles.quickCard} onPress={() => showToast('Mesaj muhasebeye iletildi')}>
                <Text style={styles.quickTitle}>Muhasebeye Sor</Text>
                <Text style={styles.quickSub}>Ödeme hakkında mesaj gönder</Text>
              </Pressable>
              <Pressable style={styles.quickCard} onPress={() => showToast('Makbuzlar e-postana gönderildi')}>
                <Text style={styles.quickTitle}>Makbuzlar</Text>
                <Text style={styles.quickSub}>E-posta ile al</Text>
              </Pressable>
            </View>

            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Geçmiş Ödemeler</Text>
              <Text style={styles.historyNote}>Son {ozet.gecmis.length} ay</Text>
            </View>
            {ozet.gecmis.map((p) => (
              <Pressable key={p.id} style={styles.historyRow} onPress={() => setReceiptOpen(p)}>
                <View style={styles.historyIcon}>
                  <Text style={{ color: colors.accent }}>✓</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.historyTitle2}>{p.title}</Text>
                  <Text style={styles.historySub}>{p.date} · {p.method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyAmount}>{p.amount}</Text>
                  <Text style={styles.historyReceipt}>Makbuz ›</Text>
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
                    <Text style={styles.receiptTitle}>{receiptOpen.title}</Text>
                    <Text style={styles.receiptNo}>Makbuz No: MK-{receiptOpen.id.slice(-4).toUpperCase()}</Text>
                  </View>
                  <View style={styles.receiptOkBadge}>
                    <Text style={styles.receiptOkText}>ÖDENDİ</Text>
                  </View>
                </View>
                <View style={styles.receiptTable}>
                  <ReceiptRow label="Sporcu" value={childLabel.split(' · ')[0]} />
                  <ReceiptRow label="Tarih" value={receiptOpen.date + ' 2026 · 09:41'} />
                  <ReceiptRow label="Ödeme yöntemi" value={receiptOpen.method} />
                  <ReceiptRow label="Tutar (KDV dahil)" value={receiptOpen.amount} accent />
                  <ReceiptRow label="Düzenleyen" value="Karşıyaka Spor Kulübü İkt. İşl." last />
                </View>
                <View style={styles.receiptActions}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={indirilenler.has(receiptOpen.id) ? '✓ İndirildi' : indiriliyorId === receiptOpen.id ? 'İndiriliyor…' : 'Dekont İndir (PDF)'}
                      onPress={() => onDekontIndir(receiptOpen.id)}
                      loading={indiriliyorId === receiptOpen.id}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Muhasebeye Sor" variant="secondary" onPress={() => showToast('Mesaj muhasebeye iletildi')} />
                  </View>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
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
  dueLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  duePill: { backgroundColor: colors.warningSoft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  duePillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.warning },
  dueAmount: { fontFamily: fontFamily.archivoBold, fontSize: 44, color: colors.textBright, letterSpacing: -1.5, marginTop: 12 },
  dueNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  infoBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  infoBoxDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.accent, lineHeight: 19 },
  infoTextDanger: { color: colors.danger },
  paidCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surface, padding: spacing.xl, alignItems: 'center' },
  paidIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  paidTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.sm },
  paidSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  paidNext: { fontFamily: fontFamily.manropeSemi, fontSize: 11, color: colors.textDim, marginTop: spacing.sm },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickCard: { flex: 1, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 13 },
  quickTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  quickSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  historyTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  historyNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  historyTitle2: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  historySub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  historyAmount: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  historyReceipt: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accent, marginTop: 1 },
  receiptBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  receiptSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  receiptHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  receiptIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  receiptTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  receiptNo: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  receiptOkBadge: { backgroundColor: colors.accentSoft, paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  receiptOkText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent },
  receiptTable: { borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, marginTop: spacing.md },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  receiptRowLabel: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  receiptRowValue: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  receiptActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  });
}
