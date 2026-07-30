import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { addAntrenman, getTakvim, TESIS_LISTESI } from '../../../src/data/takvimRepo';
import { getGruplar } from '../../../src/data/etkinlikRepo';
import type { TakvimBlok, TakvimGun } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

function bugunIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export default function TakvimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [gunler, setGunler] = useState<TakvimGun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(bugunIndex());
  const [selectedTesis, setSelectedTesis] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [gruplar, setGruplar] = useState<{ id: string; ad: string }[]>([]);
  const [grupId, setGrupId] = useState<string | null>(null);
  const [tesis, setTesis] = useState(TESIS_LISTESI[0]);
  const [saat1, setSaat1] = useState('16:00');
  const [saat2, setSaat2] = useState('17:30');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<TakvimBlok | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, t] = await Promise.all([getTakvim(), getGruplar()]);
      setGunler(g);
      setGruplar(t);
    } catch {
      setError('Takvim yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const gun = gunler[selectedDay];
  const bloklar = useMemo(() => {
    if (!gun) return [];
    return selectedTesis ? gun.bloklar.filter((b) => b.tesis === selectedTesis) : gun.bloklar;
  }, [gun, selectedTesis]);

  async function onKaydetAntrenman() {
    if (!grupId) {
      showToast('Grup seçimi gerekli');
      return;
    }
    setSaving(true);
    setConflict(null);
    try {
      const result = await addAntrenman({ gunIndex: selectedDay, grupId, tesis, saat1, saat2 });
      if (result.conflict) {
        setConflict(result.conflict);
        return;
      }
      await load();
      setAddOpen(false);
      setGrupId(null);
      showToast('Antrenman eklendi');
    } catch {
      showToast('Antrenman eklenemedi, tekrar dene');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Takvim</Text>
            <Text style={styles.subtitle}>{gunler[0]?.tarih ?? ''} – {gunler[6]?.tarih ?? ''}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.todayBtn} onPress={() => setSelectedDay(bugunIndex())}>
              <Text style={styles.todayBtnText}>Bugün</Text>
            </Pressable>
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                setConflict(null);
                setAddOpen(true);
              }}
            >
              <Text style={styles.addBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        {loading && <LoadingState label="Takvim yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStripScroll} contentContainerStyle={styles.dayStrip}>
              {gunler.map((g, i) => {
                const active = i === selectedDay;
                return (
                  <Pressable key={g.tarih} style={[styles.dayCell, active && styles.dayCellActive]} onPress={() => setSelectedDay(i)}>
                    <Text style={[styles.dayCellDow, active && styles.dayCellDowActive]}>{g.gunAdi}</Text>
                    <Text style={[styles.dayCellNum, active && styles.dayCellNumActive]}>{g.gunNo}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tesisScroll} contentContainerStyle={styles.tesisRow}>
              <Pressable hitSlop={{ top: 8, bottom: 8 }} style={[styles.tesisChip, !selectedTesis && styles.tesisChipActive]} onPress={() => setSelectedTesis(null)}>
                <Text style={[styles.tesisChipText, !selectedTesis && styles.tesisChipTextActive]}>Tüm Tesisler</Text>
              </Pressable>
              {TESIS_LISTESI.map((t) => (
                <Pressable hitSlop={{ top: 8, bottom: 8 }} key={t} style={[styles.tesisChip, selectedTesis === t && styles.tesisChipActive]} onPress={() => setSelectedTesis(t)}>
                  <Text style={[styles.tesisChipText, selectedTesis === t && styles.tesisChipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView contentContainerStyle={styles.scroll}>
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayHeaderLabel}>{gun?.tarih.toUpperCase()}</Text>
                <Text style={styles.dayHeaderCount}>{bloklar.length} antrenman</Text>
              </View>

              {bloklar.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyBoxIcon}>📅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emptyBoxTitle}>Planlı antrenman yok</Text>
                    <Text style={styles.emptyBoxSubtitle}>"+" ile yeni antrenman ekleyebilirsiniz</Text>
                  </View>
                </View>
              ) : (
                bloklar.map((b) => (
                  <View key={b.id} style={styles.blokRow}>
                    <View style={styles.blokTimeCol}>
                      <Text style={styles.blokTime1}>{b.saat1}</Text>
                      <Text style={styles.blokTime2}>{b.saat2}</Text>
                    </View>
                    <View style={[styles.blokCard, b.live && styles.blokCardLive]}>
                      <View style={styles.blokTitleRow}>
                        <Text style={styles.blokTitle} numberOfLines={1}>{b.baslik}</Text>
                        {b.live && (
                          <View style={styles.liveBadge}>
                            <Text style={styles.liveBadgeText}>● Şu an</Text>
                          </View>
                        )}
                        {b.bireysel && (
                          <View style={styles.bireyselBadge}>
                            <Text style={styles.bireyselBadgeText}>Bireysel</Text>
                          </View>
                        )}
                        {b.turEtiketi && (
                          <View style={styles.bireyselBadge}>
                            <Text style={styles.bireyselBadgeText}>{b.turEtiketi}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.blokAlt}>{b.alt} · {b.tesis}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      <AppModal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.addBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.addSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.addTitle}>Antrenman Ekle</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>GRUP</Text>
              <View style={styles.tesisPickRow}>
                {gruplar.map((g) => (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={g.id} style={[styles.tesisPickChip, grupId === g.id && styles.tesisPickChipActive]} onPress={() => setGrupId(g.id)}>
                    <Text style={[styles.tesisPickChipText, grupId === g.id && styles.tesisPickChipTextActive]}>{g.ad}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>TESİS</Text>
              <View style={styles.tesisPickRow}>
                {TESIS_LISTESI.map((t) => (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={t} style={[styles.tesisPickChip, tesis === t && styles.tesisPickChipActive]} onPress={() => setTesis(t)}>
                    <Text style={[styles.tesisPickChipText, tesis === t && styles.tesisPickChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.saatRow}>
                <View style={{ flex: 1 }}>
                  <TextField label="Başlangıç" value={saat1} onChangeText={setSaat1} placeholder="16:00" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Bitiş" value={saat2} onChangeText={setSaat2} placeholder="17:30" />
                </View>
              </View>

              {conflict && (
                <View style={styles.conflictBox}>
                  <Text style={styles.conflictText}>
                    {tesis} bu saatte dolu — <Text style={styles.conflictBold}>{conflict.saat1}–{conflict.saat2} {conflict.baslik}</Text> ile çakışıyor. Farklı tesis veya saat seçin.
                  </Text>
                </View>
              )}

              <View style={{ height: spacing.xs }} />
              <Button label="Antrenmanı Kaydet" onPress={onKaydetAntrenman} loading={saving} />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todayBtn: { paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  todayBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  addBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontFamily: fontFamily.archivoBold, fontSize: 18, color: colors.onAccent },
  dayStripScroll: { flexGrow: 0, marginTop: spacing.md },
  dayStrip: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg },
  dayCell: { width: 46, alignItems: 'center', gap: 3, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  dayCellActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayCellDow: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textDim },
  dayCellDowActive: { color: colors.onAccent },
  dayCellNum: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  dayCellNumActive: { color: colors.onAccent },
  tesisScroll: { flexGrow: 0, marginTop: spacing.sm },
  tesisRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: 2 },
  tesisChip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tesisChipActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  tesisChipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  tesisChipTextActive: { color: colors.accent },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  dayHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayHeaderLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  dayHeaderCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  emptyBox: {
    marginTop: spacing.sm, borderRadius: radius.xxl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
    backgroundColor: colors.surface, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  emptyBoxIcon: { fontSize: 22 },
  emptyBoxTitle: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.md, color: colors.textBright },
  emptyBoxSubtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  blokRow: { flexDirection: 'row', gap: spacing.sm },
  blokTimeCol: { width: 44, alignItems: 'flex-end', gap: 2, paddingTop: spacing.sm },
  blokTime1: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  blokTime2: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  blokCard: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 13 },
  blokCardLive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  blokTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  blokTitle: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  liveBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  liveBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.accent },
  bireyselBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  bireyselBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.accent },
  blokAlt: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
  addBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  addSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  addTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.md, marginBottom: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  tesisPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tesisPickChip: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  tesisPickChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  tesisPickChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  tesisPickChipTextActive: { color: colors.accent },
  saatRow: { flexDirection: 'row', gap: spacing.sm },
  conflictBox: { borderRadius: 14, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, padding: 13 },
  conflictText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.danger, lineHeight: 18 },
  conflictBold: { color: colors.textBright, fontFamily: fontFamily.manropeExtra },
  });
}
