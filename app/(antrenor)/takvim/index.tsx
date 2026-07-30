import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import {
  getBekleyenRezervasyonlar,
  getBireyselTakvimHaftasi,
  getIstisnalar,
  getMusaitlik,
  istisnaEkle,
  istisnaSil,
  musaitlikKaydet,
  rezervasyonSonuclandir,
  rezervasyonYanitla,
  toggleMusaitlikGun,
} from '../../../src/data/bireyselRepo';
import type { AntrenorTakvimGun, BekleyenRezervasyon, MusaitlikGunu, MusaitlikIstisna } from '../../../src/data/types-bireysel';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing, avatarColorAt } from '../../../src/theme';

function bugunIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export default function TakvimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile } = useAuth();
  const [hafta, setHafta] = useState<AntrenorTakvimGun[]>([]);
  const [bekleyenler, setBekleyenler] = useState<BekleyenRezervasyon[]>([]);
  const [gunIndex, setGunIndex] = useState(bugunIndex());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [musaitOn, setMusaitOn] = useState(false);
  const [musaitlik, setMusaitlik] = useState<MusaitlikGunu[]>([]);
  const [istisnalar, setIstisnalar] = useState<MusaitlikIstisna[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, b] = await Promise.all([getBireyselTakvimHaftasi(), getBekleyenRezervasyonlar()]);
      setHafta(h);
      setBekleyenler(b);
    } catch {
      setError('Takvim yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const gun = hafta[gunIndex];

  function pickGun(i: number) {
    setGunIndex(i);
  }

  async function onYanitla(rezervasyonId: string, cevap: 'onayla' | 'reddet') {
    const { mesaj } = await rezervasyonYanitla(rezervasyonId, cevap);
    setBekleyenler((prev) => prev.filter((b) => b.id !== rezervasyonId));
    setHafta(await getBireyselTakvimHaftasi());
    showToast(mesaj);
  }

  async function onSonuclandir(rezervasyonId: string, sonuc: 'tamamlandi' | 'gelmedi') {
    await rezervasyonSonuclandir(rezervasyonId, sonuc);
    setHafta(await getBireyselTakvimHaftasi());
    showToast(sonuc === 'tamamlandi' ? 'Ders tamamlandı olarak işaretlendi' : 'Ders gelmedi olarak işaretlendi');
  }

  function onBlokTap(blok: AntrenorTakvimGun['bloklar'][number]) {
    if (blok.tur === 'bos') { showToast('Boş slot — veliler bu saati rezerve edebilir'); return; }
    if (blok.tur === 'kapali') { showToast('İstisna gün olarak kapatıldı'); return; }
    if (blok.tur === 'grup') { showToast('Grup antrenmanı detayı Bugün ekranında'); return; }
    if (blok.sonuclandirilabilir) return;
    showToast(blok.baslik.split(' · ')[0] + ' ders detayı sonraki turlarda');
  }

  async function openMusaitlik() {
    setMusaitOn(true);
    const [m, i] = await Promise.all([getMusaitlik(), getIstisnalar()]);
    setMusaitlik(m);
    setIstisnalar(i);
  }

  async function onToggleGun(index: number) {
    await toggleMusaitlikGun(index);
    setMusaitlik(await getMusaitlik());
  }

  async function onIstisnaEkle() {
    await istisnaEkle();
    setIstisnalar(await getIstisnalar());
  }

  async function onIstisnaSil(id: string) {
    await istisnaSil(id);
    setIstisnalar(await getIstisnalar());
  }

  async function onMusaitKaydet() {
    await musaitlikKaydet();
    setMusaitOn(false);
    showToast('Müsaitlik kaydedildi — takvim güncellendi');
  }

  const bireyselSayisi = gun?.bloklar.filter((b) => b.tur === 'bireysel').length ?? 0;
  const grupSayisi = gun?.bloklar.filter((b) => b.tur === 'grup').length ?? 0;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.brandRow}>
                <View style={styles.dot} />
                <Text style={styles.brand}>ANTRENÖR PANELİ</Text>
              </View>
              <Text style={styles.title}>Takvimim</Text>
              <Text style={styles.subtitle}>{profile?.ad || 'Antrenör'} · Bireysel ders programı</Text>
            </View>
            <Pressable style={styles.musaitBtn} onPress={openMusaitlik}>
              <Text style={styles.musaitBtnText}>Müsaitlik Düzenle</Text>
            </Pressable>
          </View>

          {loading && <LoadingState label="Yükleniyor…" />}
          {!loading && error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gunRow}>
                {hafta.map((g, i) => {
                  const on = i === gunIndex;
                  const kapali = g.bloklar.some((b) => b.tur === 'kapali');
                  const doluluk = g.bloklar.filter((b) => b.tur === 'grup' || b.tur === 'bireysel').length;
                  const dotColor = kapali ? colors.danger : doluluk >= 4 ? colors.accent : doluluk >= 2 ? colors.accentBorder : colors.border;
                  return (
                    <Pressable key={g.gunNo} style={[styles.gunChip, on && styles.gunChipActive]} onPress={() => pickGun(i)}>
                      <Text style={[styles.gunAd, on && styles.gunAdActive]}>{g.gunAdi}</Text>
                      <Text style={[styles.gunNo, on && styles.gunNoActive]}>{g.gunNo}</Text>
                      <View style={[styles.gunDot, { backgroundColor: dotColor }]} />
                    </Pressable>
                  );
                })}
              </ScrollView>

              {bekleyenler.map((bekleyen) => (
                <View key={bekleyen.id} style={styles.rezvCard}>
                  <View style={styles.rezvTop}>
                    <View style={styles.liveDotWrap}>
                      <View style={styles.liveDot} />
                    </View>
                    <Text style={styles.rezvLabel}>YENİ REZERVASYON</Text>
                  </View>
                  <View style={styles.rezvBody}>
                    <View style={styles.rezvAvatar}>
                      <Text style={styles.rezvAvatarText}>{bekleyen.sporcuInit}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rezvName} numberOfLines={1}>{bekleyen.baslik}</Text>
                      <Text style={styles.rezvDetay}>{bekleyen.detay}</Text>
                    </View>
                  </View>
                  <View style={styles.rezvActions}>
                    <Pressable style={styles.onaylaBtn} onPress={() => onYanitla(bekleyen.id, 'onayla')}>
                      <Text style={styles.onaylaBtnText}>Onayla</Text>
                    </Pressable>
                    <Pressable style={styles.reddetBtn} onPress={() => onYanitla(bekleyen.id, 'reddet')}>
                      <Text style={styles.reddetBtnText}>Reddet</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              <View style={styles.timelineHeader}>
                <Text style={styles.timelineLabel}>{gun?.gunAdi.toUpperCase()} {gun?.gunNo} · GÜN GÖRÜNÜMÜ</Text>
                <Text style={styles.timelineSummary}>{bireyselSayisi} bireysel · {grupSayisi} grup</Text>
              </View>

              <View style={{ gap: spacing.sm }}>
                {gun?.bloklar.map((b) => (
                  <View key={b.id} style={{ gap: 6 }}>
                  <View style={styles.timelineRow}>
                    <Text style={styles.timelineSaat}>{b.saat}</Text>
                    <Pressable
                      style={[
                        styles.timelineCard,
                        b.tur === 'grup' && styles.timelineCardGrup,
                        (b.tur === 'bireysel' && !b.bekliyor) && styles.timelineCardBireysel,
                        b.bekliyor && styles.timelineCardBekliyor,
                        b.tur === 'kapali' && styles.timelineCardKapali,
                        b.tur === 'bos' && styles.timelineCardBos,
                      ]}
                      onPress={() => onBlokTap(b)}
                    >
                      <View
                        style={[
                          styles.timelineBar,
                          b.tur === 'grup' && { backgroundColor: colors.info },
                          (b.tur === 'bireysel' && !b.bekliyor) && { backgroundColor: colors.accent },
                          b.bekliyor && { backgroundColor: colors.accent },
                          b.tur === 'kapali' && { backgroundColor: colors.danger },
                          b.tur === 'bos' && { backgroundColor: colors.border },
                        ]}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            styles.timelineTitle,
                            b.tur === 'kapali' && { color: colors.danger },
                            b.tur === 'bos' && { color: colors.textDim },
                          ]}
                        >
                          {b.tur === 'bos' ? 'Boş slot' : b.baslik}
                        </Text>
                        <Text
                          style={[
                            styles.timelineSub,
                            b.bekliyor && { color: colors.warning },
                            b.tur === 'kapali' && { color: colors.textDim },
                            b.tur === 'bos' && { color: colors.textDim },
                          ]}
                        >
                          {b.tur === 'bos' ? 'Bireysel derse açık' : b.sub}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.timelinePill,
                          b.tur === 'grup' && { backgroundColor: colors.infoSoft },
                          (b.tur === 'bireysel' && !b.bekliyor) && { backgroundColor: colors.accentSoft },
                          b.bekliyor && { backgroundColor: colors.warningSoft },
                          b.tur === 'kapali' && { backgroundColor: colors.dangerSoft },
                          b.tur === 'bos' && { backgroundColor: colors.chip },
                        ]}
                      >
                        <Text
                          style={[
                            styles.timelinePillText,
                            b.tur === 'grup' && { color: colors.textMuted },
                            (b.tur === 'bireysel' && !b.bekliyor) && { color: colors.accent },
                            b.bekliyor && { color: colors.warning },
                            b.tur === 'kapali' && { color: colors.danger },
                            b.tur === 'bos' && { color: colors.textDim },
                          ]}
                        >
                          {b.tur === 'grup' ? 'GRUP' : b.tur === 'kapali' ? 'İSTİSNA' : b.tur === 'bos' ? 'AÇIK' : b.bekliyor ? 'BEKLİYOR' : 'BİREYSEL'}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                  {b.sonuclandirilabilir && b.rezervasyonId && (
                    <View style={styles.sonuclandirRow}>
                      <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.tamamlandiBtn} onPress={() => onSonuclandir(b.rezervasyonId!, 'tamamlandi')}>
                        <Text style={styles.tamamlandiBtnText}>✓ Tamamlandı</Text>
                      </Pressable>
                      <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.gelmediBtn} onPress={() => onSonuclandir(b.rezervasyonId!, 'gelmedi')}>
                        <Text style={styles.gelmediBtnText}>✕ Gelmedi</Text>
                      </Pressable>
                    </View>
                  )}
                  </View>
                ))}
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.info }]} /><Text style={styles.legendText}>Grup</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.accent }]} /><Text style={styles.legendText}>Bireysel</Text></View>
                <View style={styles.legendItem}><View style={styles.legendDashed} /><Text style={styles.legendText}>Boş slot</Text></View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <AppModal visible={musaitOn} transparent animationType="slide" onRequestClose={() => setMusaitOn(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMusaitOn(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Haftalık Müsaitlik</Text>
            <Text style={styles.sheetSub}>Her hafta tekrarlar · bireysel derse açık saatleriniz</Text>

            <View style={{ gap: 7, marginTop: spacing.md }}>
              {musaitlik.map((m, i) => (
                <View key={m.gun} style={[styles.musaitRow, m.aktif ? styles.musaitRowOn : styles.musaitRowOff]}>
                  <Pressable hitSlop={12} style={[styles.toggleTrack, m.aktif && styles.toggleTrackOn]} onPress={() => onToggleGun(i)}>
                    <View style={[styles.toggleThumb, m.aktif && styles.toggleThumbOn]} />
                  </Pressable>
                  <Text style={[styles.musaitGun, m.aktif && styles.musaitGunOn]}>{m.gun}</Text>
                  <Text style={[styles.musaitSaat, m.aktif && styles.musaitSaatOn]}>{m.saatAraligi}</Text>
                </View>
              ))}
            </View>

            <View style={styles.istisnaHeader}>
              <Text style={styles.istisnaLabel}>İSTİSNA GÜNLER</Text>
              <Pressable hitSlop={{ top: 10, bottom: 10 }} style={styles.istisnaEkleBtn} onPress={onIstisnaEkle}>
                <Text style={styles.istisnaEkleBtnText}>+ Gün Ekle</Text>
              </Pressable>
            </View>
            <View style={{ gap: 7 }}>
              {istisnalar.map((i) => (
                <View key={i.id} style={styles.istisnaRow}>
                  <Text style={styles.istisnaText}>{i.etiket}</Text>
                  <Pressable onPress={() => onIstisnaSil(i.id)}>
                    <Text style={styles.istisnaSil}>Kaldır</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <Pressable style={styles.musaitKaydetBtn} onPress={onMusaitKaydet}>
              <Text style={styles.musaitKaydetBtnText}>Müsaitliği Kaydet</Text>
            </Pressable>
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, marginTop: 3 },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  musaitBtn: { height: 44, paddingHorizontal: 15, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  musaitBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  gunRow: { gap: 6, paddingBottom: spacing.xs },
  gunChip: { width: 52, borderRadius: 14, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  gunChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  gunAd: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textDim },
  gunAdActive: { color: colors.accent },
  gunNo: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textMuted, marginTop: 2 },
  gunNoActive: { color: colors.textBright },
  gunDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  rezvCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.surface, padding: spacing.lg },
  rezvTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDotWrap: { width: 8, height: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  rezvLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  rezvBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md },
  rezvAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  rezvAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: avatarColorAt(0).avFg },
  rezvName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  rezvDetay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  rezvActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  onaylaBtn: { flex: 1, height: 44, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  onaylaBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  reddetBtn: { flex: 1, height: 44, borderRadius: 13, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  reddetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.danger },
  sonucBanner: { borderRadius: 18, borderWidth: 1, backgroundColor: colors.panel, paddingVertical: 13, paddingHorizontal: 15 },
  sonucText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  timelineLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, flexShrink: 1 },
  timelineSummary: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  timelineRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  timelineSaat: { width: 42, textAlign: 'right', paddingTop: 11, fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textDim },
  timelineCard: { flex: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: 'transparent' },
  timelineCardGrup: { backgroundColor: colors.infoSoft, borderColor: colors.info },
  timelineCardBireysel: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  timelineCardBekliyor: { backgroundColor: colors.accentSoft, borderColor: colors.warning },
  timelineCardKapali: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  timelineCardBos: { backgroundColor: colors.chip, borderColor: colors.border, borderStyle: 'dashed' },
  timelineBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  timelineTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  timelineSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  timelinePill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill },
  timelinePillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.5 },
  sonuclandirRow: { flexDirection: 'row', gap: 7, marginLeft: 52 },
  tamamlandiBtn: { flex: 1, height: 36, borderRadius: 11, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  tamamlandiBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  gelmediBtn: { flex: 1, height: 36, borderRadius: 11, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  gelmediBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.danger },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 13, marginTop: spacing.xs, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendDashed: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  legendText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.sm },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  musaitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 11 },
  musaitRowOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  musaitRowOff: { backgroundColor: colors.chip, borderColor: colors.border },
  toggleTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: colors.border, justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: colors.accent },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', marginLeft: 3 },
  toggleThumbOn: { marginLeft: 19 },
  musaitGun: { width: 34, fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textDim },
  musaitGunOn: { color: colors.textBright },
  musaitSaat: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textDim },
  musaitSaatOn: { color: colors.accent },
  istisnaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xs },
  istisnaLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  istisnaEkleBtn: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.pill },
  istisnaEkleBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  istisnaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, padding: 11 },
  istisnaText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.danger },
  istisnaSil: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textDim },
  musaitKaydetBtn: { marginTop: spacing.md, height: 50, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  musaitKaydetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  });
}
