import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { addAidatPlani, getFinansOzet, recordPayment, updateAidatPlani } from '../../../src/data/finansRepo';
import { getSporcular } from '../../../src/data/sporcularRepo';
import type { AidatPlani, FinansOzet, OdemeYontemi, Sporcu } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

type Segment = 'aidat' | 'tahsilat' | 'gg';

const YONTEM_LABEL: Record<OdemeYontemi, string> = { kart: 'Kart', havale: 'Havale', elden: 'Elden' };
const YONTEM_ICON: Record<OdemeYontemi, string> = { kart: '💳', havale: '🔁', elden: '💵' };

export default function FinansScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [ozet, setOzet] = useState<FinansOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>('aidat');
  const { toastMessage, showToast } = useToast();

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [sporcular, setSporcular] = useState<Sporcu[]>([]);
  const [seciliSporcu, setSeciliSporcu] = useState<Sporcu | null>(null);
  const [sporcuSecOpen, setSporcuSecOpen] = useState(false);
  const [tutar, setTutar] = useState('1.250');
  const [yontem, setYontem] = useState<OdemeYontemi>('kart');
  const [saving, setSaving] = useState(false);

  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AidatPlani | null>(null);
  const [planAd, setPlanAd] = useState('');
  const [planAlt, setPlanAlt] = useState('');
  const [planFiyat, setPlanFiyat] = useState('');
  const [planKaydediliyor, setPlanKaydediliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, s] = await Promise.all([getFinansOzet(), getSporcular()]);
      setOzet(f);
      setSporcular(s);
      if (!seciliSporcu && s.length) setSeciliSporcu(s[0]);
    } catch {
      setError('Finans verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tahsilatGruplar = useMemo(() => {
    if (!ozet) return [];
    const seen = new Set<string>();
    const gruplar: { grup: string; kayitlar: typeof ozet.tahsilatlar }[] = [];
    for (const t of ozet.tahsilatlar) {
      if (!seen.has(t.grup)) {
        seen.add(t.grup);
        gruplar.push({ grup: t.grup, kayitlar: [] });
      }
      gruplar.find((g) => g.grup === t.grup)!.kayitlar.push(t);
    }
    return gruplar;
  }, [ozet]);

  async function onKaydetPay() {
    if (!seciliSporcu) return;
    setSaving(true);
    try {
      // Açıklama içinde bulunulan aydan üretilir (eski sabit 'Temmuz aidatı' yerine).
      const ayAdi = new Date().toLocaleDateString('tr-TR', { month: 'long' });
      await recordPayment({ sporcuId: seciliSporcu.id, aciklama: `${ayAdi} aidatı`, tutar, yontem });
      await load();
      setPaySheetOpen(false);
      showToast('Ödeme kaydedildi');
    } catch {
      showToast('Ödeme kaydedilemedi, tekrar dene');
    } finally {
      setSaving(false);
    }
  }

  function openPlanDuzenle(p: AidatPlani) {
    setEditingPlan(p);
    setPlanAd(p.ad);
    setPlanAlt(p.alt);
    setPlanFiyat(p.fiyat.replace('₺', ''));
    setPlanSheetOpen(true);
  }

  function openPlanYeni() {
    setEditingPlan(null);
    setPlanAd('');
    setPlanAlt('');
    setPlanFiyat('');
    setPlanSheetOpen(true);
  }

  async function onKaydetPlan() {
    if (!planAd.trim() || !planFiyat.trim()) {
      showToast('Plan adı ve fiyat gerekli.');
      return;
    }
    const fiyatEtiketi = planFiyat.trim().startsWith('₺') ? planFiyat.trim() : `₺${planFiyat.trim()}`;
    setPlanKaydediliyor(true);
    try {
      if (editingPlan) {
        await updateAidatPlani(editingPlan.id, { ad: planAd.trim(), alt: planAlt.trim(), fiyat: fiyatEtiketi, beklenen: editingPlan.beklenen });
        showToast('Aidat planı güncellendi');
      } else {
        await addAidatPlani({ ad: planAd.trim(), alt: planAlt.trim(), fiyat: fiyatEtiketi, beklenen: fiyatEtiketi });
        showToast('Yeni aidat planı eklendi');
      }
      await load();
      setPlanSheetOpen(false);
    } finally {
      setPlanKaydediliyor(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Finans</Text>
            {/* Toplamlar/grafikler tarih filtresiz (tüm kayıtlar) — başlık belirli bir ay
                iddia etmesin diye 'Genel Özet' (eski sabit 'Merkez Şube · Temmuz 2026' yerine). */}
            <Text style={styles.subtitle}>{ozet ? `${ozet.subeAd} · Genel Özet` : ''}</Text>
          </View>
          <Pressable hitSlop={{ top: 6, bottom: 6 }} style={styles.payBtn} onPress={() => setPaySheetOpen(true)}>
            <Text style={styles.payBtnIcon}>+</Text>
            <Text style={styles.payBtnText}>Ödeme Kaydet</Text>
          </Pressable>
        </View>

        <View style={styles.segmentRow}>
          {(['aidat', 'tahsilat', 'gg'] as Segment[]).map((s) => (
            <Pressable hitSlop={{ top: 8, bottom: 8 }} key={s} style={[styles.segmentItem, segment === s && styles.segmentItemActive]} onPress={() => setSegment(s)}>
              <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>
                {s === 'aidat' ? 'Aidatlar' : s === 'tahsilat' ? 'Tahsilatlar' : 'Gelir-Gider'}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && <LoadingState label="Finans yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && ozet && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {segment === 'aidat' && (
              <View style={{ gap: spacing.sm }}>
                {ozet.planlar.map((p) => (
                  <Pressable key={p.id} onPress={() => openPlanDuzenle(p)}>
                    <Card>
                      <View style={styles.planRow}>
                        <View style={styles.planMid}>
                          <Text style={styles.planAd} numberOfLines={1}>{p.ad}</Text>
                          <Text style={styles.planAlt}>{p.alt}</Text>
                        </View>
                        <Text style={styles.planFiyat}>{p.fiyat}</Text>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                      <View style={styles.divider} />
                      <View style={styles.planFooter}>
                        <Text style={styles.planFooterLabel}>Aylık beklenen tahsilat</Text>
                        <Text style={styles.planFooterValue}>{p.beklenen}</Text>
                      </View>
                    </Card>
                  </Pressable>
                ))}
                <Pressable style={styles.dashedAdd} onPress={openPlanYeni}>
                  <Text style={styles.dashedAddText}>+ Yeni Aidat Planı</Text>
                </Pressable>
              </View>
            )}

            {segment === 'tahsilat' && (
              <Card>
                {tahsilatGruplar.map((g) => (
                  <View key={g.grup}>
                    <Text style={styles.tahsilatGrupLabel}>{g.grup}</Text>
                    {g.kayitlar.map((t) => (
                      <View key={t.id} style={styles.tahsilatRow}>
                        <View style={styles.tahsilatIcon}>
                          <Text>{YONTEM_ICON[t.yontem]}</Text>
                        </View>
                        <View style={styles.planMid}>
                          <Text style={styles.tahsilatAd} numberOfLines={1}>{t.ad} · {t.ne}</Text>
                          <Text style={styles.tahsilatSub}>{t.sub}</Text>
                        </View>
                        <Text style={styles.tahsilatTutar}>+₺{t.tutar}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                <View style={styles.tahsilatFooter}>
                  {/* Liste tüm ödenmiş kayıtları içerir — 'Bu ay' iddiası yerine gerçek kapsam. */}
                  <Text style={styles.tahsilatFooterLabel}>{ozet.islemSayisi} işlem</Text>
                  <Text style={styles.tahsilatFooterValue}>Toplam: {ozet.tahsilatToplam}</Text>
                </View>
              </Card>
            )}

            {segment === 'gg' && (
              <View style={{ gap: spacing.md }}>
                <Card>
                  <View style={styles.ggHeader}>
                    <Text style={styles.sectionLabel}>GELİR vs GİDER · SON 4 AY</Text>
                    <View style={styles.legendRow}>
                      <LegendDot color={colors.accent} label="Gelir" />
                      <LegendDot color={colors.danger} label="Gider" />
                    </View>
                  </View>
                  <View style={styles.ggBarRow}>
                    {ozet.ggAylar.map((m) => {
                      // Hiç kayıt yoksa 0'a bölme/NaN yükseklik olmasın diye alt sınır 1.
                      const maxV = Math.max(1, ...ozet.ggAylar.map((x) => Math.max(x.gelir, x.gider)));
                      return (
                        <View key={m.ay} style={styles.ggBarCol}>
                          <View style={styles.ggBarPair}>
                            <View style={[styles.ggBar, { height: (m.gelir / maxV) * 84, backgroundColor: colors.accent }]} />
                            <View style={[styles.ggBar, { height: (m.gider / maxV) * 84, backgroundColor: colors.danger }]} />
                          </View>
                          <Text style={styles.ggBarLabel}>{m.ay}</Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>

                <Card>
                  <Text style={styles.sectionLabel}>GELİR KATEGORİLERİ</Text>
                  {ozet.kategoriler.length === 0 ? (
                    <Text style={styles.kategoriBos}>Henüz gelir kaydı yok</Text>
                  ) : (
                    <View style={styles.donutRow}>
                      <DonutChart kategoriler={ozet.kategoriler} toplam={ozet.kategoriToplam} />
                      <View style={styles.kategoriList}>
                        {ozet.kategoriler.map((k) => (
                          <View key={k.ad} style={styles.kategoriRow}>
                            <View style={[styles.kategoriDot, { backgroundColor: colors[k.renkAnahtar] }]} />
                            <Text style={styles.kategoriAd} numberOfLines={1}>{k.ad}</Text>
                            <Text style={styles.kategoriTutar}>{k.tutar}</Text>
                            <Text style={styles.kategoriPct}>{k.pct}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </Card>

                <Card>
                  <View style={styles.ggSummaryRow}>
                    <Text style={styles.ggSummaryLabel}>Toplam Gelir</Text>
                    <Text style={[styles.ggSummaryValue, { color: colors.accent }]}>{ozet.toplamGelir}</Text>
                  </View>
                  <View style={styles.ggSummaryRow}>
                    <Text style={styles.ggSummaryLabel}>Toplam Gider <Text style={styles.ggSummaryNote}>· tüm gider kayıtları</Text></Text>
                    <Text style={[styles.ggSummaryValue, { color: colors.danger }]}>{ozet.toplamGider}</Text>
                  </View>
                  <View style={[styles.ggSummaryRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.ggSummaryLabelBold}>Net</Text>
                    <Text style={[styles.ggSummaryValueBold, { color: colors.accent }]}>{ozet.net}</Text>
                  </View>
                </Card>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={paySheetOpen} transparent animationType="slide" onRequestClose={() => setPaySheetOpen(false)}>
        <Pressable style={styles.payBackdrop} onPress={() => setPaySheetOpen(false)}>
          <Pressable style={styles.paySheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.paySheetTitle}>Ödeme Kaydet</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.xs }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>SPORCU</Text>
              <Pressable style={styles.sporcuPick} onPress={() => setSporcuSecOpen(true)}>
                <View style={styles.sporcuPickAvatar}>
                  <Text style={styles.sporcuPickAvatarText}>{seciliSporcu?.init ?? '—'}</Text>
                </View>
                <View style={styles.planMid}>
                  <Text style={styles.sporcuPickName} numberOfLines={1}>{seciliSporcu?.ad ?? 'Sporcu seç'}</Text>
                  <Text style={styles.sporcuPickSub}>{seciliSporcu?.grup ?? ''}</Text>
                </View>
                <Text style={styles.changeLink}>Değiştir</Text>
              </Pressable>

              <View style={{ height: spacing.sm }} />
              <TextField label="Tutar" value={tutar} onChangeText={setTutar} keyboardType="numeric" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>YÖNTEM</Text>
              <View style={styles.yontemRow}>
                {(['kart', 'havale', 'elden'] as OdemeYontemi[]).map((y) => (
                  <Pressable
                    key={y}
                    style={[styles.yontemChip, yontem === y && styles.yontemChipActive]}
                    onPress={() => setYontem(y)}
                  >
                    <Text style={[styles.yontemChipText, yontem === y && styles.yontemChipTextActive]}>
                      {YONTEM_LABEL[y]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ height: spacing.md }} />
              <Button label="Ödemeyi Kaydet" onPress={onKaydetPay} loading={saving} />
              {/* Dürüst metin: bildirim/makbuz altyapısı yok — kayıt yalnızca tahsilat listesine işlenir. */}
              <Text style={styles.paySheetNote}>Kayıt, tahsilat listesine anında işlenir</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>

      <AppModal visible={sporcuSecOpen} transparent animationType="fade" onRequestClose={() => setSporcuSecOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSporcuSecOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>SPORCU SEÇ</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {sporcular.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSeciliSporcu(s);
                    setSporcuSecOpen(false);
                  }}
                >
                  <Text style={styles.sheetRowTitle} numberOfLines={1}>{s.ad}</Text>
                  <Text style={styles.sheetRowSubtitle}>{s.grup}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </AppModal>

      <AppModal visible={planSheetOpen} transparent animationType="slide" onRequestClose={() => setPlanSheetOpen(false)}>
        <Pressable style={styles.payBackdrop} onPress={() => setPlanSheetOpen(false)}>
          <Pressable style={styles.paySheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.paySheetTitle}>{editingPlan ? 'Aidat Planını Düzenle' : 'Yeni Aidat Planı'}</Text>
            <View style={{ gap: spacing.sm }}>
              <TextField label="Plan Adı" value={planAd} onChangeText={setPlanAd} placeholder="ör. Basketbol Aylık" />
              <TextField label="Açıklama" value={planAlt} onChangeText={setPlanAlt} placeholder="ör. U12-U14 · haftada 3 gün" />
              <TextField label="Aylık Fiyat" value={planFiyat} onChangeText={setPlanFiyat} keyboardType="numeric" placeholder="1.250" />
            </View>
            <View style={{ height: spacing.md }} />
            <Button label={editingPlan ? 'Kaydet' : 'Planı Ekle'} onPress={onKaydetPlan} loading={planKaydediliyor} />
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function DonutChart({ kategoriler, toplam }: { kategoriler: { pct: string; renkAnahtar: 'accent' | 'info' | 'warning' | 'purple' }[]; toplam: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const size = 108;
  const r = 40;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={14} fill="none" />
        {kategoriler.map((k, i) => {
          const frac = parseInt(k.pct.replace('%', ''), 10) / 100;
          const dash = frac * circumference;
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors[k.renkAnahtar]}
              strokeWidth={14}
              fill="none"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={styles.donutValue}>{toplam}</Text>
        <Text style={styles.donutLabel}>GELİR</Text>
      </View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 3 },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.accent },
  payBtnIcon: { fontFamily: fontFamily.archivoBold, fontSize: 14, color: colors.onAccent },
  payBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  segmentRow: { flexDirection: 'row', margin: spacing.lg, marginBottom: 0, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  segmentTextActive: { color: colors.onAccent },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planMid: { flex: 1, minWidth: 0 },
  planAd: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.textBright },
  planAlt: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  planFiyat: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  chevron: { color: colors.textDim, fontSize: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  planFooterLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  planFooterValue: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  dashedAdd: {
    borderRadius: radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
    padding: spacing.lg, alignItems: 'center', justifyContent: 'center',
  },
  dashedAddText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textMuted },
  tahsilatGrupLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, paddingTop: spacing.sm },
  tahsilatRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  tahsilatIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  tahsilatAd: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  tahsilatSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  tahsilatTutar: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.accent },
  tahsilatFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  tahsilatFooterLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  tahsilatFooterValue: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  ggHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legendRow: { flexDirection: 'row', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  ggBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingHorizontal: spacing.xs },
  ggBarCol: { alignItems: 'center', gap: 6 },
  ggBarPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 84 },
  ggBar: { width: 14, borderRadius: 6 },
  ggBarLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: spacing.md },
  donutCenter: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  donutValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  donutLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.8, color: colors.textDim },
  kategoriList: { flex: 1, gap: 9 },
  kategoriBos: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim, marginTop: spacing.sm },
  kategoriRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kategoriDot: { width: 8, height: 8, borderRadius: 4 },
  kategoriAd: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  kategoriTutar: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  kategoriPct: { width: 34, textAlign: 'right', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textBright },
  ggSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  ggSummaryLabel: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted },
  ggSummaryNote: { fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  ggSummaryValue: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.md },
  ggSummaryLabelBold: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  ggSummaryValueBold: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg },
  payBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  paySheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '88%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  paySheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.md, marginBottom: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginBottom: spacing.xs },
  sporcuPick: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12 },
  sporcuPickAvatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  sporcuPickAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.danger },
  sporcuPickName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  sporcuPickSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted },
  changeLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  yontemRow: { flexDirection: 'row', gap: spacing.xs },
  yontemChip: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  yontemChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  yontemChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  yontemChipTextActive: { color: colors.accent },
  paySheetNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-start', padding: spacing.lg, paddingTop: 180 },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, maxWidth: 300 },
  sheetTitle: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, padding: spacing.sm },
  sheetRow: { padding: spacing.sm, borderRadius: radius.sm },
  sheetRowTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  sheetRowSubtitle: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  });
}
