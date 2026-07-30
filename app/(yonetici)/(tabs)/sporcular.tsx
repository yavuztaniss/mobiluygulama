import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState, EmptyState } from '../../../src/components/StateViews';
import { TextField } from '../../../src/components/TextField';
import { Button } from '../../../src/components/Button';
import { addSporcu, getBranslar, getGruplar, getSporcular } from '../../../src/data/sporcularRepo';
import type { KatalogSecenegi, Sporcu } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

type OdemeFilter = 'tumu' | 'guncel' | 'gecikmis';
const ODEME_LABEL: Record<OdemeFilter, string> = { tumu: 'Ödeme: Tümü', guncel: 'Ödeme: Güncel', gecikmis: 'Ödeme: Gecikmiş' };
const ODEME_SIRA: OdemeFilter[] = ['tumu', 'guncel', 'gecikmis'];

export default function SporcularScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [sporcular, setSporcular] = useState<Sporcu[]>([]);
  // Grup/branş ekleme formunun GERÇEK katalogları — form artık serbest metin
  // değil, bu listelerden id seçtiriyor (yazım hatasında sessizce grupsuz
  // kaydolma sorunu buradan kapandı).
  const [grupKatalog, setGrupKatalog] = useState<KatalogSecenegi[]>([]);
  const [bransKatalog, setBransKatalog] = useState<KatalogSecenegi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [bransFilter, setBransFilter] = useState<string | null>(null);
  const [grupFilter, setGrupFilter] = useState<string | null>(null);
  const [odemeFilter, setOdemeFilter] = useState<OdemeFilter>('tumu');
  // 0024 yumuşak silme: pasife alınan sporcu listede varsayılan olarak GİZLİ.
  const [pasifleriGoster, setPasifleriGoster] = useState(false);
  const [bransSheetOpen, setBransSheetOpen] = useState(false);
  const [grupSheetOpen, setGrupSheetOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addAd, setAddAd] = useState('');
  const [addGrupId, setAddGrupId] = useState<string | null>(null);
  const [addBransId, setAddBransId] = useState<string | null>(null);
  const [addVeliAd, setAddVeliAd] = useState('');
  const [addVeliTel, setAddVeliTel] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [liste, gruplar, branslar] = await Promise.all([
        getSporcular({ pasifleriDahilEt: pasifleriGoster }),
        getGruplar(),
        getBranslar(),
      ]);
      setSporcular(liste);
      setGrupKatalog(gruplar);
      setBransKatalog(branslar);
    } catch {
      setError('Sporcular yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [pasifleriGoster]);

  useEffect(() => {
    load();
  }, [load]);

  // Branş/grup bağı olmayan eski kayıtlar boş etiket üretiyordu — filtre listesine
  // tıklanamaz boş satır olarak düşmesinler.
  const branslar = useMemo(
    () => Array.from(new Set(sporcular.map((s) => s.brans).filter(Boolean))).sort(),
    [sporcular]
  );
  const gruplar = useMemo(
    () => Array.from(new Set(sporcular.map((s) => s.grup).filter(Boolean))).sort(),
    [sporcular]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return sporcular.filter((s) => {
      if (bransFilter && s.brans !== bransFilter) return false;
      if (grupFilter && s.grup !== grupFilter) return false;
      if (odemeFilter === 'guncel' && s.odemeDurumu !== 'guncel') return false;
      if (odemeFilter === 'gecikmis' && s.odemeDurumu !== 'gecikmis') return false;
      if (!q) return true;
      return (
        s.ad.toLocaleLowerCase('tr-TR').includes(q) || s.veliAd.toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [sporcular, search, bransFilter, grupFilter, odemeFilter]);

  function cycleOdeme() {
    const idx = ODEME_SIRA.indexOf(odemeFilter);
    setOdemeFilter(ODEME_SIRA[(idx + 1) % ODEME_SIRA.length]);
  }

  async function onSubmitAdd() {
    setAddError(null);
    if (!addAd.trim() || !addVeliAd.trim() || !addVeliTel.trim()) {
      setAddError('Ad, veli adı ve veli telefonu zorunlu.');
      return;
    }
    // Grup/branş artık katalogdan seçiliyor: seçim yapılmadıysa kayıt
    // ENGELLENİR — eskiden yazım hatası sessizce grupsuz sporcu üretiyordu.
    if (!addGrupId || !addBransId) {
      setAddError('Grup ve branş seçimi zorunlu.');
      return;
    }
    setAddSaving(true);
    try {
      await addSporcu({
        ad: addAd.trim(),
        grupId: addGrupId,
        bransId: addBransId,
        veliAd: addVeliAd.trim(),
        veliTelefon: addVeliTel.trim(),
      });
      await load();
      setAddOpen(false);
      setAddAd('');
      setAddGrupId(null);
      setAddBransId(null);
      setAddVeliAd('');
      setAddVeliTel('');
    } catch {
      setAddError('Sporcu eklenemedi, tekrar dene.');
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Sporcular</Text>
            <Text style={styles.count}>
              {filtered.length} sporcu{pasifleriGoster ? ' · pasifler dahil' : ''}
            </Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>Yönetici</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Sporcu veya veli ara..."
            placeholderTextColor={colors.textDim}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
          <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.chip} onPress={() => setBransSheetOpen(true)}>
            <Text style={styles.chipText}>{bransFilter ?? 'Branş'} ⌄</Text>
          </Pressable>
          <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.chip} onPress={() => setGrupSheetOpen(true)}>
            <Text style={styles.chipText}>{grupFilter ?? 'Grup'} ⌄</Text>
          </Pressable>
          <Pressable
            style={[
              styles.chip,
              odemeFilter === 'gecikmis' && styles.chipDanger,
              odemeFilter === 'guncel' && styles.chipAccent,
            ]}
            onPress={cycleOdeme}
          >
            <Text
              style={[
                styles.chipText,
                odemeFilter === 'gecikmis' && styles.chipTextDanger,
                odemeFilter === 'guncel' && styles.chipTextAccent,
              ]}
            >
              {ODEME_LABEL[odemeFilter]} ⌄
            </Text>
          </Pressable>
          {/* Pasife alınan sporcu silinmiyor, yalnızca gizleniyor (0024). */}
          <Pressable
            style={[styles.chip, pasifleriGoster && styles.chipAccent]}
            onPress={() => setPasifleriGoster((v) => !v)}
          >
            <Text style={[styles.chipText, pasifleriGoster && styles.chipTextAccent]}>
              {pasifleriGoster ? '✓ Pasifler dahil' : 'Pasifleri göster'}
            </Text>
          </Pressable>
        </ScrollView>

        {loading && <LoadingState label="Sporcular yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.list}>
            {filtered.length === 0 ? (
              <EmptyState
                title="Sonuç bulunamadı"
                subtitle={
                  pasifleriGoster
                    ? 'Arama veya filtreleri değiştirmeyi dene.'
                    : 'Arama veya filtreleri değiştirmeyi dene. Pasife alınmış kayıtlar için "Pasifleri göster" filtresini aç.'
                }
              />
            ) : (
              filtered.map((s) => (
                <Pressable key={s.id} style={[styles.row, !s.aktif && styles.rowPasif]} onPress={() => router.push(`/sporcu/${s.id}`)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{s.init}</Text>
                  </View>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowName} numberOfLines={1}>{s.ad}</Text>
                    <Text style={styles.rowSub}>{s.grup || 'Grup atanmadı'}</Text>
                  </View>
                  {/* Pasif kayıtta ödeme durumu gösterilmiyor: sporcu kulüpten
                      ayrılmış, "Gecikmiş / Güncel" etiketi takip ediliyor izlenimi
                      verirdi (panelle aynı davranış). */}
                  {!s.aktif ? (
                    <View style={[styles.statusBadge, styles.statusPasif]}>
                      <Text style={[styles.statusText, styles.statusTextPasif]}>Pasif</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, s.odemeDurumu === 'gecikmis' ? styles.statusDanger : styles.statusOk]}>
                      <Text style={[styles.statusText, s.odemeDurumu === 'gecikmis' ? styles.statusTextDanger : styles.statusTextOk]}>
                        {s.odemeDurumu === 'gecikmis' ? 'Gecikmiş' : 'Güncel'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}

        <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
          <Text style={styles.fabIcon}>+</Text>
          <Text style={styles.fabText}>Yeni Sporcu</Text>
        </Pressable>
      </SafeAreaView>

      <FilterSheet visible={bransSheetOpen} title="BRANŞ SEÇ" options={branslar} selected={bransFilter} onSelect={setBransFilter} onClose={() => setBransSheetOpen(false)} />
      <FilterSheet visible={grupSheetOpen} title="GRUP SEÇ" options={gruplar} selected={grupFilter} onSelect={setGrupFilter} onClose={() => setGrupSheetOpen(false)} />

      <AppModal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.addBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.addSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addTitle}>Yeni Sporcu</Text>
            <ScrollView contentContainerStyle={styles.addForm} keyboardShouldPersistTaps="handled">
              <TextField label="Ad Soyad" value={addAd} onChangeText={setAddAd} placeholder="Sporcunun adı" />
              <SecimAlani
                label="Branş"
                secenekler={bransKatalog}
                seciliId={addBransId}
                onSelect={setAddBransId}
                bosMesaj="Kayıtlı branş yok — önce Kurum Branşları ekranından branş tanımlanmalı."
              />
              <SecimAlani
                label="Grup"
                secenekler={grupKatalog}
                seciliId={addGrupId}
                onSelect={setAddGrupId}
                bosMesaj="Kayıtlı aktif grup yok — önce panelden grup açılmalı."
              />
              <TextField label="Veli Adı" value={addVeliAd} onChangeText={setAddVeliAd} placeholder="Veli adı soyadı" />
              <TextField
                label="Veli Telefonu"
                value={addVeliTel}
                onChangeText={setAddVeliTel}
                placeholder="05XX XXX XX XX"
                keyboardType="phone-pad"
              />
              {!!addError && <Text style={styles.addError}>{addError}</Text>}
              <View style={styles.addActions}>
                <View style={styles.addActionBtn}>
                  <Button label="Vazgeç" variant="secondary" onPress={() => setAddOpen(false)} />
                </View>
                <View style={styles.addActionBtn}>
                  <Button label="Kaydet" onPress={onSubmitAdd} loading={addSaving} />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>
    </ScreenBackground>
  );
}

// Serbest metin yerine katalogdan seçim. Katalog boşsa neden boş olduğu ve nereden
// doldurulacağı açıkça yazılır — kullanıcı "yazarım nasılsa tutar" sanmasın.
function SecimAlani({
  label,
  secenekler,
  seciliId,
  onSelect,
  bosMesaj,
}: {
  label: string;
  secenekler: KatalogSecenegi[];
  seciliId: string | null;
  onSelect: (id: string) => void;
  bosMesaj: string;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.pickField}>
      <Text style={styles.pickLabel}>{label}</Text>
      {secenekler.length === 0 ? (
        <Text style={styles.pickEmpty}>{bosMesaj}</Text>
      ) : (
        <View style={styles.pickRow}>
          {secenekler.map((o) => {
            const secili = seciliId === o.id;
            return (
              <Pressable
                key={o.id}
                style={[styles.pickChip, secili && styles.pickChipActive]}
                onPress={() => onSelect(o.id)}
              >
                <Text style={[styles.pickChipText, secili && styles.pickChipTextActive]}>{o.ad}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function FilterSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable
            style={[styles.sheetRow, selected === null && styles.sheetRowActive]}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          >
            <Text style={styles.sheetRowTitle}>Tümü</Text>
            {selected === null && <Text style={styles.sheetCheck}>✓</Text>}
          </Pressable>
          {options.map((opt) => (
            <Pressable
              key={opt}
              style={[styles.sheetRow, selected === opt && styles.sheetRowActive]}
              onPress={() => {
                onSelect(opt);
                onClose();
              }}
            >
              <Text style={styles.sheetRowTitle} numberOfLines={1}>{opt}</Text>
              {selected === opt && <Text style={styles.sheetCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </AppModal>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.lg, paddingBottom: 0 },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  count: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 3 },
  roleBadge: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  roleBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.xs, color: colors.accent },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  chipRow: { marginTop: spacing.sm, flexGrow: 0 },
  chipRowContent: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipDanger: { borderColor: colors.danger },
  chipAccent: { borderColor: colors.accentBorder },
  chipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  chipTextDanger: { color: colors.danger },
  chipTextAccent: { color: colors.accent },
  list: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 120, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPasif: { opacity: 0.6 },
  avatar: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.textMuted },
  rowMid: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  rowSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  statusBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  statusOk: { backgroundColor: colors.accentSoft },
  statusDanger: { backgroundColor: colors.dangerSoft },
  statusPasif: { backgroundColor: colors.warningSoft },
  statusText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro },
  statusTextOk: { color: colors.accent },
  statusTextDanger: { color: colors.danger },
  statusTextPasif: { color: colors.warning },
  chevron: { color: colors.textDim, fontSize: 18 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.accent,
  },
  fabIcon: { fontFamily: fontFamily.archivoBold, fontSize: 16, color: colors.onAccent },
  fabText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  modalBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-start', padding: spacing.lg, paddingTop: 180 },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    maxWidth: 280,
  },
  sheetTitle: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, padding: spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.sm, borderRadius: radius.sm },
  sheetRowActive: { backgroundColor: colors.chip },
  sheetRowTitle: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  sheetCheck: { color: colors.accent, fontSize: 16 },
  addBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  addSheet: {
    backgroundColor: colors.bgDeep,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '85%',
    padding: spacing.lg,
  },
  addTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginBottom: spacing.md },
  addForm: { gap: spacing.md, paddingBottom: spacing.xl },
  addError: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.danger },
  addActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  addActionBtn: { flex: 1 },
  pickField: { gap: spacing.xs },
  pickLabel: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeightFor(fontSize.xs),
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.textDim,
    textTransform: 'uppercase',
  },
  pickEmpty: {
    fontFamily: fontFamily.manropeMedium,
    fontSize: fontSize.sm,
    lineHeight: lineHeightFor(fontSize.sm),
    color: colors.warning,
  },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pickChip: {
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pickChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  pickChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  pickChipTextActive: { color: colors.accent },
  });
}
