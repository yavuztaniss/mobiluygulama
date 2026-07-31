import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useChild } from '../../../src/context/ChildContext';
import { useKurum } from '../../../src/context/KurumContext';
import { useChildLabel } from '../../../src/components/ChildSwitcher';
import {
  formatTL,
  getBireyselAntrenor,
  getBireyselHafta,
  getBireyselPaket,
  rezervasyonOlustur,
} from '../../../src/data/bireyselRepo';
import type { BireyselAntrenor, BireyselGunSlotlari, BireyselOdemeTipi, BireyselPaketDurumu, BireyselSlot } from '../../../src/data/types-bireysel';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

export default function BireyselDersDetay() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId } = useChild();
  const { kulupAdi } = useKurum();
  const childLabel = useChildLabel();
  const [antrenor, setAntrenor] = useState<BireyselAntrenor | null>(null);
  const [paket, setPaket] = useState<BireyselPaketDurumu | null>(null);
  const [hafta, setHafta] = useState<BireyselGunSlotlari[]>([]);
  // 0041: VARSAYILAN GUN BUGUN. Eskiden sabit 1 (Sali) idi; hafta Pazartesi
  // basladigi icin ekran hafta ortasinda GECMIS bir gun secili aciliyordu ve
  // veli oradan rezervasyon denemesi yapiyordu. Pazar = 0 -> 6.
  const [gunIndex, setGunIndex] = useState(() => {
    const g = new Date().getDay();
    return g === 0 ? 6 : g - 1;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [seciliSlot, setSeciliSlot] = useState<string | null>(null);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<BireyselOdemeTipi>('paket');
  const [onaylaniyor, setOnaylaniyor] = useState(false);
  const [onaySonuc, setOnaySonuc] = useState<{ odemeNotu: string } | null>(null);

  const load = useCallback(async () => {
    if (!id || !selectedChildId) return;
    setLoading(true);
    setError(null);
    try {
      const [a, p, h] = await Promise.all([getBireyselAntrenor(id), getBireyselPaket(id, selectedChildId), getBireyselHafta(id)]);
      setAntrenor(a);
      setPaket(p);
      setHafta(h);
      setOdemeTipi(p && p.kalan > 0 ? 'paket' : 'tek');
    } catch {
      setError('Antrenör bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id, selectedChildId]);

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
    if (!id || !seciliSlot || !selectedChildId) return;
    setOnaylaniyor(true);
    try {
      const sonuc = await rezervasyonOlustur(id, selectedChildId, gunIndex, seciliSlot, odemeTipi);
      setPaySheetOpen(false);
      setOnaySonuc({ odemeNotu: sonuc.odemeNotu });
      if (sonuc.kalanPaket !== undefined && paket) setPaket({ ...paket, kalan: sonuc.kalanPaket });
      setHafta(await getBireyselHafta(id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Rezervasyon oluşturulamadı, tekrar dene.');
    } finally {
      setOnaylaniyor(false);
    }
  }

  function onOnayKapat() {
    setOnaySonuc(null);
    setSeciliSlot(null);
    setOdemeTipi(paket && paket.kalan > 0 ? 'paket' : 'tek');
  }

  const secimEtiketi = gun && seciliSlot ? `${gun.gunAdi} ${gun.gunNo} · ${seciliSlot}` : '';
  const paketVar = !!paket && paket.kalan > 0;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle}>Antrenör Profili</Text>
            <Text style={styles.headerSub}>Bireysel ders rezervasyonu · {childLabel}</Text>
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
                  <Text style={styles.profileName} numberOfLines={1}>{antrenor.ad}</Text>
                  <Text style={styles.profileMeta}>
                    {antrenor.brans} · {kulupAdi}
                  </Text>
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
              {hafta.length === 7 && <Text style={styles.slotRange}>{hafta[0].gunNo}–{hafta[6].gunNo}</Text>}
            </View>

            <View style={styles.gunRow}>
              {hafta.map((g, i) => {
                const on = i === gunIndex;
                return (
                  <Pressable
                    key={g.gunNo}
                    disabled={g.gecmis}
                    style={[styles.gunChip, on && styles.gunChipActive, g.gecmis && styles.gunChipGecmis]}
                    onPress={() => { setGunIndex(i); setSeciliSlot(null); }}
                  >
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
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.border }]} /><Text style={styles.legendText}>Dolu</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.info }]} /><Text style={styles.legendText}>Grup antrenmanı</Text></View>
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
                {/* Uygulama içi kart tahsilatı yok — ücret kulübe ödenir. */}
                <Text style={styles.payOptionSub}>Ödeme kulübe yapılır (resepsiyon / havale)</Text>
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

            {/* METİN GERÇEĞE ÇEKİLDİ (0040).
                Eskiden "24 saatten geç iptalde seans yanar" yazıyordu. Bu cümle
                velinin uygulamadan iptal EDEBİLDİĞİNİ varsayıyor — oysa uygulamada
                iptal düğmesi HİÇ YOK; hiçbir kod yolu durum='iptal' yazmıyor.
                Ekran, olmayan bir özelliğin kuralını anlatıyordu.
                Ayrıca 0040'tan sonra sunucu tarafındaki kural net: ders gününde
                ya da sonrasında yapılan bir iptal paket hakkını GERİ VERMEZ. */}
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>İptal için kulübünüzle iletişime geçin</Text>
            </View>

            <Pressable style={styles.confirmBtn} onPress={onOnayla} disabled={onaylaniyor}>
              <Text style={styles.confirmBtnText}>
                {onaylaniyor
                  ? 'İşleniyor…'
                  : odemeTipi === 'tek'
                    ? `Rezervasyonu Onayla · ${antrenor ? formatTL(antrenor.tekFiyatN) : ''} kulübe ödenir`
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
            {/* Push bildirimi yok — rezervasyon, antrenörün uygulamadaki takvim/onay listesine düşer. */}
            <Text style={styles.onayInfoText}>Rezervasyon {antrenor?.ad ?? 'antrenör'} onayına iletildi</Text>
          </View>
          <View style={[styles.onayInfoBox, styles.onayWarnBox]}>
            {/* Yukarıdaki kutuyla aynı gerekçe (0040): uygulamada iptal yolu yok. */}
            <Text style={styles.onayWarnText}>İptal için kulübünüzle iletişime geçin</Text>
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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  profileCard: { borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl },
  profileTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl },
  profileName: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright },
  profileMeta: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  star: { color: colors.warning, fontSize: 12 },
  puan: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.warning },
  dersSay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  bio: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, lineHeight: 19, marginTop: spacing.md },
  priceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  priceBox: { flex: 1, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, padding: 11 },
  priceLabel: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.8, color: colors.textDim },
  priceValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright, marginTop: 2 },
  priceBoxAccent: { flex: 1, borderRadius: 13, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 11 },
  priceLabelAccent: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, letterSpacing: 0.8, color: colors.accent },
  priceValueAccent: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.accent, marginTop: 2 },
  doluBanner: { borderRadius: 14, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning, padding: 11 },
  doluBannerText: { textAlign: 'center', fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.warning },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  slotLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  slotRange: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  gunRow: { flexDirection: 'row', gap: 6 },
  gunChip: { flex: 1, borderRadius: 14, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  // 0041: gecmis gunler secilemez — soluk gosteriliyor.
  gunChipGecmis: { opacity: 0.35 },
  gunChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  gunAd: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textDim },
  gunAdActive: { color: colors.accent },
  gunNo: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textMuted, marginTop: 2 },
  gunNoActive: { color: colors.textBright },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31.5%', borderRadius: 13, paddingVertical: 11, alignItems: 'center', borderWidth: 1.5 },
  slotMusait: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  slotSeciliMusait: { backgroundColor: colors.accent, borderColor: colors.accent },
  slotGrup: { backgroundColor: colors.infoSoft, borderColor: colors.info },
  slotDolu: { backgroundColor: colors.chip, borderColor: colors.border },
  slotSaat: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base },
  slotSaatMusait: { color: colors.accent },
  slotSaatSeciliMusait: { color: colors.onAccent },
  slotSaatGrup: { color: colors.textMuted },
  slotSaatDolu: { color: colors.textDim },
  slotSub: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, marginTop: 2, letterSpacing: 0.4 },
  slotSubMusait: { color: colors.accent },
  slotSubSeciliMusait: { color: colors.onAccent },
  slotSubGrup: { color: colors.textDim },
  slotSubDolu: { color: colors.textDim },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 13, marginTop: spacing.xs, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.sm },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  payOption: { marginTop: spacing.md, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.chip, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  payOptionActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  payOptionTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  payOptionSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  payOptionAmount: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  payOptionBadge: { backgroundColor: colors.accentSoft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  payOptionBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.accent },
  warnBox: { marginTop: spacing.md, borderRadius: 14, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning, padding: 11 },
  warnText: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.warning },
  confirmBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  onayOverlay: { position: 'absolute', inset: 0, zIndex: 90, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  onayIconCircle: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  onayIconCheck: { color: colors.accent, fontSize: 28 },
  onayTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: spacing.md },
  onaySub: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 19 },
  onayInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentBorder, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 15, marginTop: spacing.md },
  onayInfoText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.accent },
  onayWarnBox: { borderColor: colors.warning, marginTop: spacing.xs },
  onayWarnText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.warning },
  onayKapatBtn: { marginTop: spacing.xl, height: 48, paddingHorizontal: 26, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  onayKapatBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  });
}
