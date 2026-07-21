import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { addUrun, getSiparisler, getUrunler, setSiparisDurum, toggleUrunAktif } from '../../../src/data/magazaRepo';
import type { MagazaSiparis, MagazaUrun, SiparisDurum } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

type Segment = 'urun' | 'siparis';

const DURUM_LABEL: Record<SiparisDurum, string> = { hazirlaniyor: 'Hazırlanıyor', hazir: 'Hazır', teslim: 'Teslim Edildi' };
const DURUM_SIRA: SiparisDurum[] = ['hazirlaniyor', 'hazir', 'teslim'];

function getDurumColor(colors: AppColors): Record<SiparisDurum, string> {
  return { hazirlaniyor: colors.warning, hazir: colors.accent, teslim: colors.textFaint };
}

export default function MagazaScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const DURUM_COLOR = getDurumColor(colors);
  const [segment, setSegment] = useState<Segment>('urun');
  const [urunler, setUrunler] = useState<MagazaUrun[]>([]);
  const [siparisler, setSiparisler] = useState<MagazaSiparis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();
  const [durumSecId, setDurumSecId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [ad, setAd] = useState('');
  const [fiyat, setFiyat] = useState('');
  const [stok, setStok] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([getUrunler(), getSiparisler()]);
      setUrunler(u);
      setSiparisler(s);
    } catch {
      setError('Mağaza verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onToggle(id: string) {
    await toggleUrunAktif(id);
    setUrunler(await getUrunler());
  }

  async function onSubmitAdd() {
    if (!ad || !fiyat || !stok) {
      showToast('Tüm alanları doldur');
      return;
    }
    setSaving(true);
    try {
      await addUrun({ ad, fiyat: fiyat.startsWith('₺') ? fiyat : '₺' + fiyat, stok: parseInt(stok, 10) || 0 });
      setUrunler(await getUrunler());
      setAddOpen(false);
      setAd('');
      setFiyat('');
      setStok('');
      showToast('Ürün eklendi');
    } finally {
      setSaving(false);
    }
  }

  async function onPickDurum(id: string, durum: SiparisDurum) {
    await setSiparisDurum(id, durum);
    setSiparisler(await getSiparisler());
    setDurumSecId(null);
    if (durum === 'hazir') showToast('Veliye teslime hazır bildirimi gönderildi');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Mağaza Yönetimi</Text>
        </View>

        <View style={styles.segmentRow}>
          {(['urun', 'siparis'] as Segment[]).map((s) => (
            <Pressable key={s} style={[styles.segmentItem, segment === s && styles.segmentItemActive]} onPress={() => setSegment(s)}>
              <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>{s === 'urun' ? 'Ürünler' : 'Siparişler'}</Text>
            </Pressable>
          ))}
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {segment === 'urun' &&
              (urunler.length === 0 ? null : (
                <>
                  {urunler.map((u) => (
                    <Card key={u.id} style={[styles.urunRow, !u.aktif && styles.urunRowPasif]}>
                      <View style={styles.urunThumb} />
                      <View style={styles.mid}>
                        <Text style={styles.urunAd}>{u.ad}</Text>
                        <View style={styles.urunMetaRow}>
                          <Text style={styles.urunFiyat}>{u.fiyat}</Text>
                          <Text style={styles.dotSep}>·</Text>
                          <Text style={[styles.urunStok, u.stok === 0 && styles.urunStokBos]}>
                            {u.stok === 0 ? 'Stokta yok' : `${u.stok} adet`}
                          </Text>
                        </View>
                        <Text style={[styles.urunDurum, { color: u.aktif ? colors.accent : colors.textFaint }]}>
                          {u.aktif ? 'Yayında' : 'Pasif'}
                        </Text>
                      </View>
                      <Switch
                        value={u.aktif}
                        onValueChange={() => onToggle(u.id)}
                        trackColor={{ true: colors.accent, false: colors.navyBorderStrong }}
                        thumbColor="#FFFFFF"
                      />
                    </Card>
                  ))}
                </>
              ))}
            {segment === 'urun' && (
              <Pressable style={styles.dashedAdd} onPress={() => setAddOpen(true)}>
                <Text style={styles.dashedAddText}>+ Ürün Ekle</Text>
              </Pressable>
            )}

            {segment === 'siparis' && (
              <>
                {siparisler.map((s) => (
                  <Card key={s.id} style={{ gap: 0 }}>
                    <View style={styles.siparisTop}>
                      <View style={styles.siparisIcon}>
                        <Text style={styles.siparisIconText}>{s.id}</Text>
                      </View>
                      <View style={styles.mid}>
                        <Text style={styles.siparisUrun}>{s.urun}</Text>
                        <Text style={styles.siparisVeli}>{s.veli} · {s.sporcu}</Text>
                        <Text style={styles.siparisTarih}>{s.tarih}</Text>
                      </View>
                      <Text style={styles.siparisTutar}>{s.tutar}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.durumRow}>
                      <Text style={styles.durumLabel}>DURUM</Text>
                      <Pressable
                        style={[styles.durumPill, { backgroundColor: DURUM_COLOR[s.durum] + '22' }]}
                        onPress={() => setDurumSecId(durumSecId === s.id ? null : s.id)}
                      >
                        <View style={[styles.durumDot, { backgroundColor: DURUM_COLOR[s.durum] }]} />
                        <Text style={[styles.durumText, { color: DURUM_COLOR[s.durum] }]}>{DURUM_LABEL[s.durum]}</Text>
                        <Text style={[styles.durumChevron, { color: DURUM_COLOR[s.durum] }]}>⌄</Text>
                      </Pressable>
                    </View>
                    {durumSecId === s.id && (
                      <View style={styles.durumDropdown}>
                        {DURUM_SIRA.map((d) => (
                          <Pressable key={d} style={styles.durumOption} onPress={() => onPickDurum(s.id, d)}>
                            <View style={[styles.durumDot, { backgroundColor: DURUM_COLOR[d] }]} />
                            <Text style={styles.durumOptionText}>{DURUM_LABEL[d]}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </Card>
                ))}
                <Text style={styles.footerNote}>Teslime hazır siparişlerde veliye otomatik bildirim gider</Text>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.addBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.addSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.addTitle}>Ürün Ekle</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
              <TextField label="Ürün Adı" value={ad} onChangeText={setAd} placeholder="Örn. Kulüp Şapkası" />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TextField label="Fiyat" value={fiyat} onChangeText={setFiyat} placeholder="240" keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Stok" value={stok} onChangeText={setStok} placeholder="40" keyboardType="numeric" />
                </View>
              </View>
              <View style={{ height: spacing.xs }} />
              <Button label="Ürünü Kaydet" onPress={onSubmitAdd} loading={saving} />
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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  segmentRow: { flexDirection: 'row', marginHorizontal: spacing.lg, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, borderRadius: 16, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  segmentTextActive: { color: colors.accentOnDark },
  scroll: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  urunRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  urunRowPasif: { opacity: 0.6 },
  urunThumb: { width: 62, height: 62, borderRadius: 15, backgroundColor: colors.navyChip, borderWidth: 1, borderColor: colors.navyBorder },
  mid: { flex: 1, minWidth: 0 },
  urunAd: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.white },
  urunMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  urunFiyat: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.accent },
  dotSep: { color: colors.textFaint },
  urunStok: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  urunStokBos: { color: colors.dangerSoft },
  urunDurum: { fontFamily: fontFamily.manropeExtra, fontSize: 10, marginTop: 3 },
  dashedAdd: { borderRadius: radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  dashedAddText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textMuted },
  siparisTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  siparisIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  siparisIconText: { fontFamily: fontFamily.archivoBold, fontSize: 11, color: colors.iconMuted },
  siparisUrun: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.white },
  siparisVeli: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  siparisTarih: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textFaint, marginTop: 2 },
  siparisTutar: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.white },
  divider: { height: 1, backgroundColor: colors.navyBorder, marginVertical: 11 },
  durumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durumLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint },
  durumPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  durumDot: { width: 7, height: 7, borderRadius: 4 },
  durumText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm },
  durumChevron: { fontSize: 12 },
  durumDropdown: { marginTop: spacing.sm, backgroundColor: colors.navySurfaceAlt, borderWidth: 1, borderColor: colors.navyBorderStrong, borderRadius: 16, padding: 6, gap: 2 },
  durumOption: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 11 },
  durumOptionText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.iconMuted },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textFaint, paddingVertical: 4 },
  addBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  addSheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' },
  addTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white, marginTop: spacing.md, marginBottom: spacing.md },
  });
}
