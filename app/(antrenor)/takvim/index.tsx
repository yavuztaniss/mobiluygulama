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
  getBekleyenRezervasyon,
  getBireyselTakvimHaftasi,
  getIstisnalar,
  getMusaitlik,
  istisnaEkle,
  istisnaSil,
  musaitlikKaydet,
  rezervasyonYanitla,
  toggleMusaitlikGun,
} from '../../../src/data/bireyselRepo';
import type { AntrenorTakvimGun, BekleyenRezervasyon, MusaitlikGunu, MusaitlikIstisna } from '../../../src/data/types-bireysel';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

const AY = 'Temmuz';

export default function TakvimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile } = useAuth();
  const [hafta, setHafta] = useState<AntrenorTakvimGun[]>([]);
  const [bekleyen, setBekleyen] = useState<BekleyenRezervasyon | null>(null);
  const [gunIndex, setGunIndex] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yaniti, setYaniti] = useState<{ tip: 'onay' | 'red'; metin: string } | null>(null);
  const { toastMessage, showToast } = useToast();

  const [musaitOn, setMusaitOn] = useState(false);
  const [musaitlik, setMusaitlik] = useState<MusaitlikGunu[]>([]);
  const [istisnalar, setIstisnalar] = useState<MusaitlikIstisna[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, b] = await Promise.all([getBireyselTakvimHaftasi(), getBekleyenRezervasyon()]);
      setHafta(h);
      setBekleyen(b);
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
    setYaniti(null);
  }

  async function onYanitla(cevap: 'onayla' | 'reddet') {
    const { mesaj } = await rezervasyonYanitla(cevap);
    setYaniti({ tip: cevap === 'onayla' ? 'onay' : 'red', metin: mesaj });
    setBekleyen(null);
    setHafta(await getBireyselTakvimHaftasi());
    showToast(mesaj);
  }

  function onBlokTap(blok: AntrenorTakvimGun['bloklar'][number]) {
    if (blok.tur === 'bos') { showToast('Boş slot — veliler bu saati rezerve edebilir'); return; }
    if (blok.tur === 'kapali') { showToast('26 Temmuz istisna gün olarak kapatıldı'); return; }
    if (blok.tur === 'grup') { showToast('Grup antrenmanı detayı Bugün ekranında'); return; }
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
    await istisnaEkle('2 Ağustos Pazar · Tüm gün');
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
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
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
                  const dotColor = kapali ? colors.danger : doluluk >= 4 ? colors.accent : doluluk >= 2 ? 'rgba(46,230,168,0.45)' : 'rgba(255,255,255,0.15)';
                  return (
                    <Pressable key={g.gunNo} style={[styles.gunChip, on && styles.gunChipActive]} onPress={() => pickGun(i)}>
                      <Text style={[styles.gunAd, on && styles.gunAdActive]}>{g.gunAdi}</Text>
                      <Text style={[styles.gunNo, on && styles.gunNoActive]}>{g.gunNo}</Text>
                      <View style={[styles.gunDot, { backgroundColor: dotColor }]} />
                    </Pressable>
                  );
                })}
              </ScrollView>

              {bekleyen && gunIndex === 1 && (
                <View style={styles.rezvCard}>
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
                      <Text style={styles.rezvName}>{bekleyen.baslik}</Text>
                      <Text style={styles.rezvDetay}>{bekleyen.detay}</Text>
                    </View>
                  </View>
                  <View style={styles.rezvActions}>
                    <Pressable style={styles.onaylaBtn} onPress={() => onYanitla('onayla')}>
                      <Text style={styles.onaylaBtnText}>Onayla</Text>
                    </Pressable>
                    <Pressable style={styles.reddetBtn} onPress={() => onYanitla('reddet')}>
                      <Text style={styles.reddetBtnText}>Reddet</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {yaniti && gunIndex === 1 && (
                <View style={[styles.sonucBanner, { borderColor: yaniti.tip === 'onay' ? 'rgba(46,230,168,0.3)' : 'rgba(255,107,122,0.3)' }]}>
                  <Text style={[styles.sonucText, { color: yaniti.tip === 'onay' ? colors.accent : colors.danger }]}>{yaniti.metin}</Text>
                </View>
              )}

              <View style={styles.timelineHeader}>
                <Text style={styles.timelineLabel}>{gun?.gunAdi.toUpperCase()} {gun?.gunNo} {AY.toUpperCase()} · GÜN GÖRÜNÜMÜ</Text>
                <Text style={styles.timelineSummary}>{bireyselSayisi} bireysel · {grupSayisi} grup</Text>
              </View>

              <View style={{ gap: spacing.sm }}>
                {gun?.bloklar.map((b) => (
                  <View key={b.id} style={styles.timelineRow}>
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
                          b.tur === 'grup' && { backgroundColor: '#2B4A8F' },
                          (b.tur === 'bireysel' && !b.bekliyor) && { backgroundColor: colors.accent },
                          b.bekliyor && { backgroundColor: colors.accent },
                          b.tur === 'kapali' && { backgroundColor: colors.danger },
                          b.tur === 'bos' && { backgroundColor: 'rgba(255,255,255,0.14)' },
                        ]}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[
                            styles.timelineTitle,
                            b.tur === 'kapali' && { color: colors.danger },
                            b.tur === 'bos' && { color: colors.textFaint },
                          ]}
                        >
                          {b.tur === 'bos' ? 'Boş slot' : b.baslik}
                        </Text>
                        <Text
                          style={[
                            styles.timelineSub,
                            b.bekliyor && { color: colors.warning },
                            b.tur === 'kapali' && { color: colors.textFaint },
                            b.tur === 'bos' && { color: colors.textFaint },
                          ]}
                        >
                          {b.tur === 'bos' ? 'Bireysel derse açık' : b.sub}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.timelinePill,
                          b.tur === 'grup' && { backgroundColor: 'rgba(43,74,143,0.45)' },
                          (b.tur === 'bireysel' && !b.bekliyor) && { backgroundColor: 'rgba(46,230,168,0.12)' },
                          b.bekliyor && { backgroundColor: 'rgba(255,180,84,0.14)' },
                          b.tur === 'kapali' && { backgroundColor: 'rgba(255,107,122,0.14)' },
                          b.tur === 'bos' && { backgroundColor: 'rgba(255,255,255,0.05)' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.timelinePillText,
                            b.tur === 'grup' && { color: colors.iconMuted },
                            (b.tur === 'bireysel' && !b.bekliyor) && { color: colors.accent },
                            b.bekliyor && { color: colors.warning },
                            b.tur === 'kapali' && { color: colors.danger },
                            b.tur === 'bos' && { color: colors.textFaint },
                          ]}
                        >
                          {b.tur === 'grup' ? 'GRUP' : b.tur === 'kapali' ? 'İSTİSNA' : b.tur === 'bos' ? 'AÇIK' : b.bekliyor ? 'BEKLİYOR' : 'BİREYSEL'}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2B4A8F' }]} /><Text style={styles.legendText}>Grup</Text></View>
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
                  <Pressable style={[styles.toggleTrack, m.aktif && styles.toggleTrackOn]} onPress={() => onToggleGun(i)}>
                    <View style={[styles.toggleThumb, m.aktif && styles.toggleThumbOn]} />
                  </Pressable>
                  <Text style={[styles.musaitGun, m.aktif && styles.musaitGunOn]}>{m.gun}</Text>
                  <Text style={[styles.musaitSaat, m.aktif && styles.musaitSaatOn]}>{m.saatAraligi}</Text>
                </View>
              ))}
            </View>

            <View style={styles.istisnaHeader}>
              <Text style={styles.istisnaLabel}>İSTİSNA GÜNLER</Text>
              <Pressable style={styles.istisnaEkleBtn} onPress={onIstisnaEkle}>
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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.white, marginTop: 3 },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  musaitBtn: { height: 44, paddingHorizontal: 15, borderRadius: 15, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: 'rgba(46,230,168,0.3)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  musaitBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  gunRow: { gap: 6, paddingBottom: spacing.xs },
  gunChip: { width: 52, borderRadius: 14, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  gunChipActive: { backgroundColor: 'rgba(46,230,168,0.10)', borderColor: 'rgba(46,230,168,0.55)' },
  gunAd: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.textFaint },
  gunAdActive: { color: colors.accent },
  gunNo: { fontFamily: fontFamily.archivoBold, fontSize: 15, color: colors.textMuted, marginTop: 2 },
  gunNoActive: { color: colors.white },
  gunDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  rezvCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: 'rgba(46,230,168,0.35)', backgroundColor: colors.navySurfaceAlt, padding: spacing.lg },
  rezvTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDotWrap: { width: 8, height: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  rezvLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  rezvBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md },
  rezvAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  rezvAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: 13, color: '#9FE8CE' },
  rezvName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.white },
  rezvDetay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  rezvActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  onaylaBtn: { flex: 1, height: 44, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  onaylaBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 13, color: colors.accentOnDark },
  reddetBtn: { flex: 1, height: 44, borderRadius: 13, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder, alignItems: 'center', justifyContent: 'center' },
  reddetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 13, color: colors.danger },
  sonucBanner: { borderRadius: 18, borderWidth: 1, backgroundColor: colors.navySurface, paddingVertical: 13, paddingHorizontal: 15 },
  sonucText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  timelineLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint, flexShrink: 1 },
  timelineSummary: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textFaint },
  timelineRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  timelineSaat: { width: 42, textAlign: 'right', paddingTop: 11, fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textFaint },
  timelineCard: { flex: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: 'transparent' },
  timelineCardGrup: { backgroundColor: 'rgba(43,74,143,0.30)', borderColor: 'rgba(90,140,230,0.35)' },
  timelineCardBireysel: { backgroundColor: 'rgba(46,230,168,0.09)', borderColor: 'rgba(46,230,168,0.3)' },
  timelineCardBekliyor: { backgroundColor: 'rgba(46,230,168,0.09)', borderColor: 'rgba(255,180,84,0.45)' },
  timelineCardKapali: { backgroundColor: 'rgba(255,107,122,0.06)', borderColor: 'rgba(255,107,122,0.25)' },
  timelineCardBos: { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.14)', borderStyle: 'dashed' },
  timelineBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  timelineTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.white },
  timelineSub: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  timelinePill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill },
  timelinePillText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.5 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 13, marginTop: spacing.xs, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendDashed: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', borderStyle: 'dashed' },
  legendText: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textMuted },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white, marginTop: spacing.sm },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  musaitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 11 },
  musaitRowOn: { backgroundColor: 'rgba(46,230,168,0.05)', borderColor: 'rgba(46,230,168,0.2)' },
  musaitRowOff: { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' },
  toggleTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: colors.accent },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', marginLeft: 3 },
  toggleThumbOn: { marginLeft: 19 },
  musaitGun: { width: 34, fontFamily: fontFamily.manropeExtra, fontSize: 12.5, color: colors.textFaint },
  musaitGunOn: { color: colors.white },
  musaitSaat: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: 12.5, color: colors.textFaint },
  musaitSaatOn: { color: '#9FE8CE' },
  istisnaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xs },
  istisnaLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  istisnaEkleBtn: { backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentBorder, paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.pill },
  istisnaEkleBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 11.5, color: colors.accent },
  istisnaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder, padding: 11 },
  istisnaText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: 12.5, color: colors.danger },
  istisnaSil: { fontFamily: fontFamily.manropeExtra, fontSize: 11, color: colors.textFaint },
  musaitKaydetBtn: { marginTop: spacing.md, height: 50, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  musaitKaydetBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accentOnDark },
  });
}
