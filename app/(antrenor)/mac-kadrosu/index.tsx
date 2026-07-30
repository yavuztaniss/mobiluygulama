import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { TextField } from '../../../src/components/TextField';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useIslem, useToast } from '../../../src/components/Toast';
import { getKadro, getKadroBaslik, getKadroYayinDurumu, kadroKilidiAc, kadroYayinla, lcvKatilanlariEkle, toggleKadroSecim } from '../../../src/data/antrenorRepo';
import { getSonucBekleyenMaclar, macSonucuKaydet, sonucTuret, type MacSonucSatiri, type MacSonucu } from '../../../src/data/etkinlikRepo';
import type { KadroSatiri } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing, tabularNums, avatarColorAt } from '../../../src/theme';

function getLcvMeta(colors: AppColors): Record<KadroSatiri['lcv'], { label: string; color: string }> {
  return {
    katiliyor: { label: 'Katılıyor', color: colors.accent },
    katilamiyor: { label: 'Katılamıyor', color: colors.danger },
    'yanit-yok': { label: 'Yanıt yok', color: colors.textDim },
  };
}

const SONUC_ETIKET: Record<MacSonucu, string> = {
  galibiyet: 'Galibiyet',
  beraberlik: 'Beraberlik',
  maglubiyet: 'Mağlubiyet',
};

function sadeceRakam(s: string): string {
  return s.replace(/[^\d]/g, '').slice(0, 3);
}

export default function MacKadrosuScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const LCV_META = getLcvMeta(colors);
  const [kadro, setKadro] = useState<KadroSatiri[]>([]);
  const [baslik, setBaslik] = useState<{ rakip: string; tarihSaat: string } | null>(null);
  const [yayinlandi, setYayinlandi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();
  const calistir = useIslem(showToast);

  // Oynanmış ama sonucu girilmemiş maç — kadroyu zaten antrenör kurduğu için skoru da o
  // giriyor (yazma izni: 0025_mac_sonucu.sql). RLS yalnızca kendi grubunun maçlarını
  // döndürür; birden fazlaysa en yenisi gösterilir, kaydedilince sıradaki gelir.
  const [sonucMac, setSonucMac] = useState<MacSonucSatiri | null>(null);
  const [sonucFormAcik, setSonucFormAcik] = useState(false);
  const [skorBiz, setSkorBiz] = useState('');
  const [skorRakip, setSkorRakip] = useState('');
  const [sonucNotu, setSonucNotu] = useState('');
  const [sonucSaving, setSonucSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [k, y, b, bekleyen] = await Promise.all([
        getKadro(),
        getKadroYayinDurumu(),
        getKadroBaslik(),
        getSonucBekleyenMaclar(),
      ]);
      setKadro(k);
      setYayinlandi(y);
      setBaslik(b);
      setSonucMac(bekleyen[0] ?? null);
    } catch {
      setError('Kadro yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const secilenSayisi = kadro.filter((k) => k.secili).length;
  const katiliyorN = kadro.filter((k) => k.lcv === 'katiliyor').length;
  const katilamiyorN = kadro.filter((k) => k.lcv === 'katilamiyor').length;
  const yanitYokN = kadro.filter((k) => k.lcv === 'yanit-yok').length;

  async function onToggle(id: string) {
    if (yayinlandi) {
      showToast('Kadro kilitli — "Düzenle"ye dokunun');
      return;
    }
    const oldu = await calistir(() => toggleKadroSecim(id), 'Kadro değişikliği kaydedilemedi.');
    if (oldu) setKadro(await getKadro());
  }

  async function onLcvEkle() {
    if (yayinlandi) return;
    const oldu = await calistir(() => lcvKatilanlariEkle(), 'Katılanlar eklenemedi. Tekrar deneyin.');
    if (oldu) setKadro(await getKadro());
  }

  async function onYayinla() {
    setSaving(true);
    try {
      // Hata yutulduğunda kadro "yayınlandı" görünüp velilere hiç ulaşmıyordu.
      const oldu = await calistir(() => kadroYayinla(), 'Kadro yayınlanamadı. Tekrar deneyin.');
      if (oldu) {
        setYayinlandi(true);
        // "velilere bildirim gitti" iddiası kaldırıldı — push altyapısı yok; yayınlanan
        // kadro veli uygulamasında gerçek veriden görünür.
        showToast('Kadro yayınlandı');
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDuzenle() {
    const oldu = await calistir(() => kadroKilidiAc(), 'Kilit açılamadı. Tekrar deneyin.');
    if (oldu) setYayinlandi(false);
  }

  const biz = parseInt(skorBiz, 10);
  const rakip = parseInt(skorRakip, 10);
  const skorTam = Number.isFinite(biz) && Number.isFinite(rakip);
  const turetilenSonuc: MacSonucu | null = skorTam ? sonucTuret(biz, rakip) : null;

  function onSonucFormToggle() {
    setSonucFormAcik((acik) => {
      if (!acik) {
        setSkorBiz('');
        setSkorRakip('');
        setSonucNotu('');
      }
      return !acik;
    });
  }

  async function onSonucKaydet() {
    if (!sonucMac || !skorTam) {
      showToast('İki skor da girilmeli');
      return;
    }
    setSonucSaving(true);
    try {
      await macSonucuKaydet({ etkinlikId: sonucMac.id, skorBiz: biz, skorRakip: rakip, sonucNotu });
      setSonucFormAcik(false);
      // Sıradaki sonucu bekleyen maç varsa kart yerinde kalır, yoksa kaybolur.
      setSonucMac((await getSonucBekleyenMaclar())[0] ?? null);
      showToast('Maç sonucu kaydedildi · velilere görünür');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Sonuç kaydedilemedi');
    } finally {
      setSonucSaving(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Maç Kadrosu</Text>
            <Text style={styles.headerSub}>{baslik ? `${baslik.rakip} ile · ${baslik.tarihSaat}` : 'Yaklaşan maç yok'}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{secilenSayisi}/12</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {sonucMac && (
              <View style={styles.sonucCard}>
                <Pressable style={styles.sonucHead} onPress={onSonucFormToggle}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sonucLabel}>OYNANAN MAÇ · SONUÇ BEKLİYOR</Text>
                    <Text style={styles.sonucTitle} numberOfLines={1}>{sonucMac.rakip}</Text>
                    <Text style={styles.sonucSub} numberOfLines={1}>
                      {[sonucMac.tarih, sonucMac.saat, sonucMac.tesis].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.sonucBtn}>
                    <Text style={styles.sonucBtnText}>{sonucFormAcik ? 'Kapat' : 'Sonucu Gir'}</Text>
                  </View>
                </Pressable>

                {sonucFormAcik && (
                  <View style={styles.sonucForm}>
                    <View style={styles.skorRow}>
                      <View style={styles.skorBox}>
                        <Text style={styles.skorBoxLabel}>BİZ</Text>
                        <TextInput
                          style={[styles.skorInput, tabularNums]}
                          value={skorBiz}
                          onChangeText={(t) => setSkorBiz(sadeceRakam(t))}
                          placeholder="0"
                          placeholderTextColor={colors.textDim}
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                      </View>
                      <Text style={styles.skorAyrac}>–</Text>
                      <View style={styles.skorBox}>
                        <Text style={styles.skorBoxLabel} numberOfLines={1}>RAKİP</Text>
                        <TextInput
                          style={[styles.skorInput, tabularNums]}
                          value={skorRakip}
                          onChangeText={(t) => setSkorRakip(sadeceRakam(t))}
                          placeholder="0"
                          placeholderTextColor={colors.textDim}
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                      </View>
                    </View>

                    <View style={[styles.turetilenBox, turetilenSonuc ? sonucKutuStili(styles, turetilenSonuc) : null]}>
                      <Text style={[styles.turetilenText, turetilenSonuc ? { color: sonucRengi(colors, turetilenSonuc) } : null]}>
                        {turetilenSonuc ? `Sonuç: ${SONUC_ETIKET[turetilenSonuc]}` : 'Sonuç skordan otomatik belirlenir'}
                      </Text>
                    </View>

                    <View style={{ marginTop: spacing.md }}>
                      <TextField
                        label="MAÇ NOTU (İSTEĞE BAĞLI)"
                        value={sonucNotu}
                        onChangeText={setSonucNotu}
                        placeholder="Örn. Yarı final galibiyeti"
                        multiline
                        style={styles.notInput}
                      />
                    </View>

                    <Pressable
                      style={[styles.sonucKaydetBtn, (!skorTam || sonucSaving) && styles.sonucKaydetBtnDisabled]}
                      disabled={!skorTam || sonucSaving}
                      onPress={onSonucKaydet}
                    >
                      <Text style={[styles.sonucKaydetBtnText, (!skorTam || sonucSaving) && styles.sonucKaydetBtnTextDisabled]}>
                        {sonucSaving ? 'Kaydediliyor…' : 'Sonucu Kaydet'}
                      </Text>
                    </Pressable>
                    <Text style={styles.sonucFormNote}>Kaydedilen skor veli uygulamasındaki Maç Sonuçları listesine düşer.</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.lcvCard}>
              <Text style={styles.lcvLabel}>VELİ LCV YANITLARI</Text>
              <View style={styles.lcvRow}>
                <View style={[styles.lcvBox, styles.lcvBoxGreen]}>
                  <Text style={[styles.lcvValue, { color: colors.accent }]}>{katiliyorN}</Text>
                  <Text style={styles.lcvBoxLabel}>KATILIYOR</Text>
                </View>
                <View style={[styles.lcvBox, styles.lcvBoxRed]}>
                  <Text style={[styles.lcvValue, { color: colors.danger }]}>{katilamiyorN}</Text>
                  <Text style={styles.lcvBoxLabel}>KATILAMIYOR</Text>
                </View>
                <View style={styles.lcvBox}>
                  <Text style={styles.lcvValue}>{yanitYokN}</Text>
                  <Text style={styles.lcvBoxLabel}>YANIT YOK</Text>
                </View>
              </View>
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.listLabel}>OYUNCU SEÇ</Text>
              <Pressable hitSlop={{ top: 10, bottom: 10 }} style={styles.lcvEkleBtn} onPress={onLcvEkle}>
                <Text style={styles.lcvEkleBtnText}>LCV katılanları ekle</Text>
              </Pressable>
            </View>

            {kadro.map((k) => {
              const meta = LCV_META[k.lcv];
              return (
                <Pressable key={k.id} style={[styles.row, k.lcv === 'katilamiyor' && styles.rowFaded]} onPress={() => onToggle(k.id)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{k.ad.split(' ').map((p) => p[0]).join('').slice(0, 2)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{k.ad}</Text>
                    <Text style={styles.num}>#{k.numara}</Text>
                  </View>
                  <View style={styles.lcvPill}>
                    <Text style={[styles.lcvPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <View style={[styles.checkBox, k.secili && styles.checkBoxActive]}>
                    {k.secili && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!loading && !error && (
          <View style={styles.bottomBar}>
            {!yayinlandi ? (
              <Pressable style={styles.pubBtn} onPress={onYayinla} disabled={saving}>
                <Text style={styles.pubBtnText}>{saving ? 'Yayınlanıyor…' : `Kadroyu Yayınla · ${secilenSayisi}/12`}</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.savedBox}>
                  <Text style={styles.savedText}>✓ Kadro yayınlandı · veliler uygulamada görebilir</Text>
                </View>
                <Pressable onPress={onDuzenle}>
                  <Text style={styles.unlockText}>Düzenle</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function sonucRengi(colors: AppColors, sonuc: MacSonucu): string {
  if (sonuc === 'galibiyet') return colors.accent;
  if (sonuc === 'maglubiyet') return colors.danger;
  return colors.warning;
}

function sonucKutuStili(styles: ReturnType<typeof createStyles>, sonuc: MacSonucu) {
  if (sonuc === 'galibiyet') return styles.sonucOk;
  if (sonuc === 'maglubiyet') return styles.sonucNo;
  return styles.sonucEsit;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  countPill: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 14 },
  countPillText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.accent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: 140 },
  sonucCard: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.warning, padding: 15, marginBottom: spacing.xs },
  sonucHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  sonucLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.warning },
  sonucTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright, marginTop: 3 },
  sonucSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  sonucBtn: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill },
  sonucBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.warning },
  sonucForm: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  skorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skorBox: { flex: 1, borderRadius: radius.md, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, paddingTop: 8, paddingBottom: 4, alignItems: 'center' },
  skorBoxLabel: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.8, color: colors.textMuted },
  skorInput: { width: '100%', height: 48, textAlign: 'center', fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  skorAyrac: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textDim },
  turetilenBox: { marginTop: spacing.sm, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  turetilenText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  sonucOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  sonucNo: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  sonucEsit: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  notInput: { height: 76, paddingTop: 14, textAlignVertical: 'top' },
  sonucKaydetBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sonucKaydetBtnDisabled: { backgroundColor: colors.chip },
  sonucKaydetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  sonucKaydetBtnTextDisabled: { color: colors.textDim },
  sonucFormNote: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.sm, textAlign: 'center' },
  lcvCard: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  lcvLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  lcvRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  lcvBox: { flex: 1, borderRadius: 14, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, padding: 9, alignItems: 'center' },
  lcvBoxGreen: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  lcvBoxRed: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  lcvValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  lcvBoxLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  listLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  lcvEkleBtn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill },
  lcvEkleBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 10 },
  rowFaded: { opacity: 0.55 },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: avatarColorAt(0).avFg },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  num: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim, marginTop: 1 },
  lcvPill: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  lcvPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro },
  checkBox: { width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.onAccent, fontSize: 13, fontFamily: fontFamily.archivoBold },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl },
  pubBtn: { height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pubBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  savedBox: { height: 52, borderRadius: 16, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.accent },
  unlockText: { textAlign: 'center', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  });
}
