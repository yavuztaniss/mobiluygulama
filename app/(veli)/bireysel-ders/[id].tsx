import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import {
  formatTL,
  getBireyselAntrenor,
  getBireyselHafta,
  getBireyselPaket,
  rezervasyonOlustur,
} from '../../../src/data/bireyselRepo';
import type { BireyselAntrenor, BireyselGunSlotlari, BireyselOdemeTipi, BireyselPaketDurumu, BireyselSlot } from '../../../src/data/types-bireysel';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

const AY = 'Temmuz';

export default function BireyselDersDetay() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [antrenor, setAntrenor] = useState<BireyselAntrenor | null>(null);
  const [paket, setPaket] = useState<BireyselPaketDurumu | null>(null);
  const [hafta, setHafta] = useState<BireyselGunSlotlari[]>([]);
  const [gunIndex, setGunIndex] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [seciliSlot, setSeciliSlot] = useState<string | null>(null);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<BireyselOdemeTipi>('paket');
  const [onaylaniyor, setOnaylaniyor] = useState(false);
  const [onaySonuc, setOnaySonuc] = useState<{ odemeNotu: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [a, p, h] = await Promise.all([getBireyselAntrenor(id), getBireyselPaket(id), getBireyselHafta(id)]);
      setAntrenor(a);
      setPaket(p);
      setHafta(h);
      setOdemeTipi(p && p.kalan > 0 ? 'paket' : 'tek');
    } catch {
      setError('Antrenör bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const gun = hafta[gunIndex];

  function onSlotTap(slot: BireyselSlot) {
    if (slot.durum === 'musait') {
      setSeciliSlot(slot.saat);
      setPaySheetOpen(true);
      return;
    }
    if (slot.durum === 'grup') {
      showToast(`Bu saatte ${antrenor?.ad ?? 'antrenör'} grup antrenmanında`);
      return;
    }
    showToast('Bu slot dolu — başka saat seçin');
  }

  async function onOnayla() {
    if (!id || !seciliSlot) return;
    setOnaylaniyor(true);
    try {
      const sonuc = await rezervasyonOlustur(id, gunIndex, seciliSlot, odemeTipi);
      setPaySheetOpen(false);
      setOnaySonuc({ odemeNotu: sonuc.odemeNotu });
      if (sonuc.kalanPaket !== undefined && paket) setPaket({ ...paket, kalan: sonuc.kalanPaket });
      setHafta(await getBireyselHafta(id));
    } finally {
      setOnaylaniyor(false);
    }
  }

  function onOnayKapat() {
    setOnaySonuc(null);
    setSeciliSlot(null);
    setOdemeTipi(paket && paket.kalan > 0 ? 'paket' : 'tek');
  }

  const secimEtiketi = gun && seciliSlot ? `${gun.gunAdi} ${gun.gunNo} ${AY} · ${seciliSlot}` : '';
  const paketVar = !!paket && paket.kalan > 0;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle}>Antrenör Profili</Text>
            <Text style={styles.headerSub}>Bireysel ders rezervasyonu</Text>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && antrenor && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.profileCard}>
              <View style={styles.profileTop}>
                <View style={[styles.avatar, { backgroundColor: antrenor.avBg }]}>
                  <Text style={[styles.avatarText, { color: antrenor.avFg }]}>{antrenor.init}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.profileName}>{antrenor.ad}</Text>
                  <Text style={styles.profileMeta}>{antrenor.brans} · Karşıyaka Spor Okulu</Text>
                  <View style={styles.ratingRow}>
                    <Text style={styles.star}>★</Text>
                    <Text style={styles.puan}>{antrenor.puan}</Text>
                    <Text style={styles.dersSay}>· {antrenor.dersSayisi} ders · {antrenor.deneyim} yıl deneyim</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.bio}>{antrenor.bio}</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>TEK DERS</Text>
                  <Text style={styles.priceValue}>{formatTL(antrenor.tekFiyatN)}</Text>
                </View>
                <View style={styles.priceBoxAccent}>
                  <Text style={styles.priceLabelAccent}>{paketVar ? 'PAKETİNİZ' : '10\'LU PAKET'}</Text>
                  <Text style={styles.priceValueAccent}>{paketVar ? `${paket!.kalan}/${paket!.toplam} ders` : formatTL(antrenor.paketFiyatN)}</Text>
                </View>
              </View>
            </View>

            {!antrenor.musait && (
              <View style={styles.doluBanner}>
                <Text style={styles.doluBannerText}>Bu hafta müsait değil · {antrenor.ilkBosEtiket}</Text>
              </View>
            )}

            <View style={styles.slotHeader}>
              <Text style={styles.slotLabel}>SLOT SEÇİN · 60 DK</Text>
              {hafta.length === 7 && <Text style={styles.slotRange}>{hafta[0].gunNo}–{hafta[6].gunNo} {AY}</Text>}
            </View>

            <View style={styles.gunRow}>
              {hafta.map((g, i) => {
                const on = i === gunIndex;
                return (
                  <Pressable key={g.gunNo} style={[styles.gunChip, on && styles.gunChipActive]} onPress={() => { setGunIndex(i); setSeciliSlot(null); }}>
                    <Text style={[styles.gunAd, on && styles.gunAdActive]}>{g.gunAdi}</Text>
                    <Text style={[styles.gunNo, on && styles.gunNoActive]}>{g.gunNo}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.slotGrid}>
              {gun?.slotlar.map((s) => {
                const secili = seciliSlot === s.saat && s.durum === 'musait';
                return (
                  <Pressable
                    key={s.saat}
                    style={[
                      styles.slot,
                      s.durum === 'musait' && (secili ? styles.slotSeciliMusait : styles.slotMusait),
                      s.durum === 'grup' && styles.slotGrup,
                      s.durum === 'dolu' && styles.slotDolu,
                    ]}
                    onPress={() => onSlotTap(s)}
                  >
                    <Text
                      style={[
                        styles.slotSaat,
                        s.durum === 'musait' && (secili ? styles.slotSaatSeciliMusait : styles.slotSaatMusait),
                        s.durum === 'grup' && styles.slotSaatGrup,
                        s.durum === 'dolu' && styles.slotSaatDolu,
                      ]}
                    >
                      {s.saat}
                    </Text>
                    <Text
                      style={[
                        styles.slotSub,
                        s.durum === 'musait' && (secili ? styles.slotSubSeciliMusait : styles.slotSubMusait),
                        s.durum === 'grup' && styles.slotSubGrup,
                        s.durum === 'dolu' && styles.slotSubDolu,
                      ]}
                    >
                      {s.durum === 'musait' ? (secili ? 'SEÇİLDİ' : 'MÜSAİT') : s.durum === 'grup' ? 'GRUP ANTR.' : 'DOLU'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.accent }]} /><Text style={styles.legendText}>Müsait</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#3D4F6E' }]} /><Text style={styles.legendText}>Dolu</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2B4A8F' }]} /><Text style={styles.legendText}>Grup antrenmanı</Text></View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={paySheetOpen} transparent animationType="slide" onRequestClose={() => setPaySheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPaySheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Rezervasyonu Onayla</Text>
            <Text style={styles.sheetSub}>{antrenor?.ad} · {antrenor?.brans} · {secimEtiketi}</Text>

            <Pressable style={[styles.payOption, odemeTipi === 'tek' && styles.payOptionActive]} onPress={() => setOdemeTipi('tek')}>
              <View style={[styles.radio, odemeTipi === 'tek' && styles.radioActive]}>{odemeTipi === 'tek' && <View style={styles.radioDot} />}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.payOptionTitle}>Tek Ders</Text>
                <Text style={styles.payOptionSub}>Kayıtlı kart •••• 4521 ile ödenir</Text>
              </View>
              <Text style={styles.payOptionAmount}>{antrenor ? formatTL(antrenor.tekFiyatN) : ''}</Text>
            </Pressable>

            {paketVar && (
              <Pressable style={[styles.payOption, { marginTop: spacing.sm }, odemeTipi === 'paket' && styles.payOptionActive]} onPress={() => setOdemeTipi('paket')}>
                <View style={[styles.radio, odemeTipi === 'paket' && styles.radioActive]}>{odemeTipi === 'paket' && <View style={styles.radioDot} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.payOptionTitle}>Paketten Düş</Text>
                  <Text style={styles.payOptionSub}>10'lu paketiniz · kalan {paket!.kalan} ders</Text>
                </View>
                <View style={styles.payOptionBadge}>
                  <Text style={styles.payOptionBadgeText}>{paket!.kalan} → {paket!.kalan - 1}</Text>
                </View>
              </Pressable>
            )}

            <View style={styles.warnBox}>
              <Text style={styles.warnText}>24 saatten geç iptalde seans yanar</Text>
            </View>

            <Pressable style={styles.confirmBtn} onPress={onOnayla} disabled={onaylaniyor}>
              <Text style={styles.confirmBtnText}>
                {onaylaniyor
                  ? 'İşleniyor…'
                  : odemeTipi === 'tek'
                    ? `Onayla ve Öde · ${antrenor ? formatTL(antrenor.tekFiyatN) : ''}`
                    : 'Onayla · Paketten 1 Ders Düş'}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>

      {onaySonuc && (
        <View style={styles.onayOverlay}>
          <View style={styles.onayIconCircle}>
            <Text style={styles.onayIconCheck}>✓</Text>
          </View>
          <Text style={styles.onayTitle}>Ders rezerve edildi</Text>
          <Text style={styles.onaySub}>{antrenor?.ad} · {antrenor?.brans} · {secimEtiketi}{'\n'}{onaySonuc.odemeNotu}</Text>
          <View style={styles.onayInfoBox}>
            <Text style={styles.onayInfoText}>Takviminize eklendi · {antrenor?.ad}'ya bildirim gitti</Text>
          </View>
          <View style={[styles.onayInfoBox, styles.onayWarnBox]}>
            <Text style={styles.onayWarnText}>24 saatten geç iptalde seans yanar</Text>
          </View>
          <Pressable style={styles.onayKapatBtn} onPress={onOnayKapat}>
            <Text style={styles.onayKapatBtnText}>Tamam</Text>
          </Pressable>
        </View>
      )}

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
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  profileCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.navyBorderSoft, backgroundColor: colors.navySurfaceAlt, padding: spacing.xl },
  profileTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: 22 },
  profileName: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white },
  profileMeta: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  star: { color: colors.warning, fontSize: 12 },
  puan: { fontFamily: fontFamily.manropeExtra, fontSize: 11.5, color: colors.warningSoft },
  dersSay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFaint },
  bio: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, lineHeight: 19, marginTop: spacing.md },
  priceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  priceBox: { flex: 1, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.navyBorder, padding: 11 },
  priceLabel: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.8, color: colors.textFaint },
  priceValue: { fontFamily: fontFamily.archivoBold, fontSize: 15.5, color: colors.white, marginTop: 2 },
  priceBoxAccent: { flex: 1, borderRadius: 13, backgroundColor: 'rgba(46,230,168,0.07)', borderWidth: 1, borderColor: 'rgba(46,230,168,0.22)', padding: 11 },
  priceLabelAccent: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.8, color: colors.accent },
  priceValueAccent: { fontFamily: fontFamily.archivoBold, fontSize: 15.5, color: colors.accent, marginTop: 2 },
  doluBanner: { borderRadius: 14, backgroundColor: 'rgba(255,180,84,0.08)', borderWidth: 1, borderColor: 'rgba(255,180,84,0.22)', padding: 11 },
  doluBannerText: { textAlign: 'center', fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.warningSoft },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  slotLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint },
  slotRange: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textFaint },
  gunRow: { flexDirection: 'row', gap: 6 },
  gunChip: { flex: 1, borderRadius: 14, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  gunChipActive: { backgroundColor: 'rgba(46,230,168,0.10)', borderColor: 'rgba(46,230,168,0.55)' },
  gunAd: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.textFaint },
  gunAdActive: { color: colors.accent },
  gunNo: { fontFamily: fontFamily.archivoBold, fontSize: 15, color: colors.textMuted, marginTop: 2 },
  gunNoActive: { color: colors.white },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31.5%', borderRadius: 13, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5 },
  slotMusait: { backgroundColor: 'rgba(46,230,168,0.10)', borderColor: 'rgba(46,230,168,0.4)' },
  slotSeciliMusait: { backgroundColor: colors.accent, borderColor: colors.accent },
  slotGrup: { backgroundColor: 'rgba(43,74,143,0.35)', borderColor: 'rgba(90,140,230,0.4)' },
  slotDolu: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: colors.navyBorder },
  slotSaat: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base },
  slotSaatMusait: { color: colors.accent },
  slotSaatSeciliMusait: { color: colors.accentOnDark },
  slotSaatGrup: { color: colors.iconMuted },
  slotSaatDolu: { color: colors.textFaint },
  slotSub: { fontFamily: fontFamily.manropeExtra, fontSize: 9, marginTop: 2, letterSpacing: 0.4 },
  slotSubMusait: { color: 'rgba(46,230,168,0.75)' },
  slotSubSeciliMusait: { color: 'rgba(5,33,23,0.75)' },
  slotSubGrup: { color: colors.textFaint },
  slotSubDolu: { color: colors.textFaint },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 13, marginTop: spacing.xs, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textMuted },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white, marginTop: spacing.sm },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  payOption: { marginTop: spacing.md, borderRadius: 16, borderWidth: 1.5, borderColor: colors.navyBorderStrong, backgroundColor: 'rgba(255,255,255,0.03)', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  payOptionActive: { borderColor: 'rgba(46,230,168,0.55)', backgroundColor: 'rgba(46,230,168,0.06)' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  payOptionTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  payOptionSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  payOptionAmount: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.white },
  payOptionBadge: { backgroundColor: colors.accentTint, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  payOptionBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accent },
  warnBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: 'rgba(255,180,84,0.07)', borderWidth: 1, borderColor: 'rgba(255,180,84,0.2)', padding: 11 },
  warnText: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 11.5, color: colors.warningSoft },
  confirmBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  onayOverlay: { position: 'absolute', inset: 0, zIndex: 90, backgroundColor: 'rgba(4,10,20,0.92)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  onayIconCircle: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  onayIconCheck: { color: colors.accent, fontSize: 28 },
  onayTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white, marginTop: spacing.md },
  onaySub: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 19 },
  onayInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navySurfaceAlt, borderWidth: 1, borderColor: 'rgba(46,230,168,0.32)', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 15, marginTop: spacing.md },
  onayInfoText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent },
  onayWarnBox: { borderColor: 'rgba(255,180,84,0.32)', marginTop: spacing.xs },
  onayWarnText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.warningSoft },
  onayKapatBtn: { marginTop: spacing.xl, height: 48, paddingHorizontal: 26, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  onayKapatBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accentOnDark },
  });
}
