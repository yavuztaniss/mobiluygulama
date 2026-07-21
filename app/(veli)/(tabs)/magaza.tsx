import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getMagazaKategoriler, getMagazaUrunler } from '../../../src/data/veliRepo';
import type { MagazaUrunVeli, SepetKalem } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

const BEDENLER = ['XS', 'S', 'M', 'L', 'XL'];

export default function MagazaScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const [kategoriler, setKategoriler] = useState<string[]>([]);
  const [urunler, setUrunler] = useState<MagazaUrunVeli[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seciliKat, setSeciliKat] = useState('Tümü');
  const { toastMessage, showToast } = useToast();

  const [urunSheet, setUrunSheet] = useState<MagazaUrunVeli | null>(null);
  const [seciliBeden, setSeciliBeden] = useState<string | null>(null);
  const [sepet, setSepet] = useState<SepetKalem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [k, u] = await Promise.all([getMagazaKategoriler(), getMagazaUrunler()]);
      setKategoriler(k);
      setUrunler(u);
    } catch {
      setError('Mağaza yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (seciliKat === 'Tümü' ? urunler : urunler.filter((u) => u.kategori === seciliKat)),
    [urunler, seciliKat]
  );

  function openUrun(u: MagazaUrunVeli) {
    setUrunSheet(u);
    setSeciliBeden(null);
  }

  function addToCart() {
    if (!urunSheet || !seciliBeden) return;
    setSepet((prev) => [
      ...prev,
      {
        urunId: urunSheet.id,
        ad: urunSheet.ad,
        beden: seciliBeden,
        fiyat: urunSheet.fiyat,
        fiyatN: urunSheet.fiyatN,
        not: urunSheet.jersey ? '"ELİF K · —" baskısı hediye' : 'Standart paket',
      },
    ]);
    setUrunSheet(null);
    showToast(urunSheet.ad + ' sepete eklendi');
  }

  function removeFromCart(index: number) {
    setSepet((prev) => prev.filter((_, i) => i !== index));
  }

  const cartTotal = sepet.reduce((a, c) => a + c.fiyatN, 0);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Kulüp Mağazası</Text>
            <Text style={styles.subtitle}>Resmi ürünler · kulübe destek olur</Text>
          </View>
          <Pressable style={styles.cartBtn} onPress={() => setCartOpen(true)}>
            <Text style={styles.cartIcon}>🛍</Text>
            {sepet.length > 0 && (
              <View style={styles.cartDot}>
                <Text style={styles.cartDotText}>{sepet.length}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.bannerCard}>
              <Text style={styles.bannerLabel}>YENİ SEZON</Text>
              <Text style={styles.bannerTitle}>2026 forması çıktı</Text>
              <Text style={styles.bannerSub}>Sporcu adı + numara baskısı hediye · 31 Temmuz'a kadar</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.katScroll} contentContainerStyle={styles.katRow}>
              {kategoriler.map((k) => (
                <Pressable key={k} style={[styles.katChip, seciliKat === k && styles.katChipActive]} onPress={() => setSeciliKat(k)}>
                  <Text style={[styles.katChipText, seciliKat === k && styles.katChipTextActive]}>{k}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.grid}>
              {filtered.map((u) => (
                <Pressable key={u.id} style={styles.productCard} onPress={() => openUrun(u)}>
                  <View style={styles.productThumb}>
                    {!!u.badge && (
                      <View style={styles.productBadge}>
                        <Text style={styles.productBadgeText}>{u.badge}</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 32 }}>{u.kategori === 'Forma' ? '👕' : u.kategori === 'Giyim' ? '🧥' : '🎒'}</Text>
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{u.ad}</Text>
                    <View style={styles.productBottomRow}>
                      <Text style={styles.productPrice}>{u.fiyat}</Text>
                      <View style={styles.productAddBtn}>
                        <Text style={styles.productAddBtnText}>+</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={!!urunSheet} transparent animationType="slide" onRequestClose={() => setUrunSheet(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setUrunSheet(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {urunSheet && (
              <>
                <View style={styles.detailTop}>
                  <View style={styles.detailThumb}>
                    <Text style={{ fontSize: 40 }}>{urunSheet.kategori === 'Forma' ? '👕' : urunSheet.kategori === 'Giyim' ? '🧥' : '🎒'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.detailName}>{urunSheet.ad}</Text>
                    <Text style={styles.detailDesc}>{urunSheet.aciklama}</Text>
                    <Text style={styles.detailPrice}>{urunSheet.fiyat}</Text>
                  </View>
                </View>
                <View style={styles.bedenHeader}>
                  <Text style={styles.bedenLabel}>BEDEN</Text>
                </View>
                <View style={styles.bedenRow}>
                  {BEDENLER.map((b) => (
                    <Pressable key={b} style={[styles.bedenChip, seciliBeden === b && styles.bedenChipActive]} onPress={() => setSeciliBeden(b)}>
                      <Text style={[styles.bedenChipText, seciliBeden === b && styles.bedenChipTextActive]}>{b}</Text>
                    </Pressable>
                  ))}
                </View>
                {urunSheet.jersey && (
                  <View style={styles.jerseyNote}>
                    <Text style={styles.jerseyNoteText}>"ELİF K · —" baskısı hediye olarak eklenecek</Text>
                  </View>
                )}
                <Pressable
                  style={[styles.addBtn, !seciliBeden && styles.addBtnDisabled]}
                  disabled={!seciliBeden}
                  onPress={addToCart}
                >
                  <Text style={[styles.addBtnText, !seciliBeden && styles.addBtnTextDisabled]}>
                    {seciliBeden ? 'Sepete Ekle' : 'Önce beden seçin'}
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </AppModal>

      <AppModal visible={cartOpen} transparent animationType="slide" onRequestClose={() => setCartOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCartOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.cartTitle}>Sepet</Text>
            {sepet.length === 0 ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <Text style={styles.emptyCartText}>Sepetin boş</Text>
              </View>
            ) : (
              <>
                {sepet.map((c, i) => (
                  <View key={i} style={styles.cartRow}>
                    <View style={styles.cartThumb}>
                      <Text style={{ fontSize: 22 }}>🛍</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cartItemName}>{c.ad}</Text>
                      <Text style={styles.cartItemNote}>Beden: {c.beden} · {c.not}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={styles.cartItemPrice}>{c.fiyat}</Text>
                      <Pressable onPress={() => removeFromCart(i)}>
                        <Text style={styles.cartRemove}>Kaldır</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <View style={styles.cartTotalRow}>
                  <Text style={styles.cartTotalLabel}>Ara toplam · kargo salonda teslim ücretsiz</Text>
                  <Text style={styles.cartTotalValue}>₺{cartTotal.toLocaleString('tr-TR')}</Text>
                </View>
                <Pressable
                  style={styles.checkoutBtn}
                  onPress={() => {
                    setSepet([]);
                    setCartOpen(false);
                    showToast('Siparişin alındı · salonda teslim edilecek');
                  }}
                >
                  <Text style={styles.checkoutBtnText}>Ödemeye Geç</Text>
                </Pressable>
              </>
            )}
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
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  cartBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  cartIcon: { fontSize: 18 },
  cartDot: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.navyBg, paddingHorizontal: 3 },
  cartDotText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.accentOnDark },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  bannerCard: { borderRadius: 22, backgroundColor: 'rgba(18,58,46,0.6)', borderWidth: 1, borderColor: 'rgba(46,230,168,0.25)', padding: 16 },
  bannerLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: colors.accent },
  bannerTitle: { fontFamily: fontFamily.archivoBold, fontSize: 19, color: colors.white, marginTop: 4 },
  bannerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textFainter, marginTop: 3 },
  katScroll: { flexGrow: 0 },
  katRow: { flexDirection: 'row', gap: spacing.xs },
  katChip: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  katChipActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  katChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  katChipTextActive: { color: colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  productCard: { width: '47%', borderRadius: 20, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, overflow: 'hidden' },
  productThumb: { aspectRatio: 1, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  productBadge: { position: 'absolute', top: 9, left: 9, backgroundColor: colors.accent, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill },
  productBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 9, color: colors.accentOnDark },
  productInfo: { padding: 12 },
  productName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.white, minHeight: 32 },
  productBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
  productPrice: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.white },
  productAddBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  productAddBtnText: { color: colors.accent, fontSize: 16, fontFamily: fontFamily.archivoBold },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: spacing.md },
  detailTop: { flexDirection: 'row', gap: 14 },
  detailThumb: { width: 92, height: 92, borderRadius: 18, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  detailName: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white },
  detailDesc: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  detailPrice: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.accent, marginTop: 6 },
  bedenHeader: { marginTop: spacing.md },
  bedenLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
  bedenRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  bedenChip: { flex: 1, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft },
  bedenChipActive: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  bedenChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  bedenChipTextActive: { color: colors.accent },
  jerseyNote: { marginTop: spacing.sm, borderRadius: 14, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: 'rgba(46,230,168,0.18)', padding: 11 },
  jerseyNoteText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent },
  addBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { backgroundColor: colors.navySurface },
  addBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  addBtnTextDisabled: { color: colors.textFaint },
  cartTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white, marginBottom: spacing.sm },
  emptyCartText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  cartThumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  cartItemName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  cartItemNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  cartItemPrice: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.white },
  cartRemove: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.danger },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  cartTotalLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  cartTotalValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.white },
  checkoutBtn: { marginTop: spacing.sm, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  checkoutBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  });
}
