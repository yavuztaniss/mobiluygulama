import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useChild } from '../../../src/context/ChildContext';
import { getUrunler, olusturSiparis } from '../../../src/data/magazaRepo';
import type { SepetKalemGirdi, Urun } from '../../../src/data/types-magaza';
import type { SepetKalem } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

const BEDENLER = ['XS', 'S', 'M', 'L', 'XL'];
const KATEGORILER = ['Tümü', 'Forma', 'Giyim', 'Aksesuar'];

export default function MagazaScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { selectedChildId } = useChild();
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seciliKat, setSeciliKat] = useState('Tümü');
  const { toastMessage, showToast } = useToast();

  const [urunSheet, setUrunSheet] = useState<Urun | null>(null);
  const [seciliBeden, setSeciliBeden] = useState<string | null>(null);
  const [sepet, setSepet] = useState<SepetKalem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [odemeYapiliyor, setOdemeYapiliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUrunler((await getUrunler()).filter((u) => u.aktif));
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

  function openUrun(u: Urun) {
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
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Pressable style={styles.cartBtn} onPress={() => router.push('/magaza-siparisler')}>
              <Text style={styles.cartIcon}>📦</Text>
            </Pressable>
            <Pressable style={styles.cartBtn} onPress={() => setCartOpen(true)}>
              <Text style={styles.cartIcon}>🛍</Text>
              {sepet.length > 0 && (
                <View style={styles.cartDot}>
                  <Text style={styles.cartDotText}>{sepet.length}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Sahte kampanya bandı ("baskı hediye · 31 Temmuz'a kadar") kaldırıldı —
                gerçek bir kampanya verisi yok; katalog gerçek `urun` tablosundan geliyor. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.katScroll} contentContainerStyle={styles.katRow}>
              {KATEGORILER.map((k) => (
                <Pressable hitSlop={{ top: 8, bottom: 8 }} key={k} style={[styles.katChip, seciliKat === k && styles.katChipActive]} onPress={() => setSeciliKat(k)}>
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
                    <Text style={styles.detailName} numberOfLines={1}>{urunSheet.ad}</Text>
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
                      <Text style={styles.cartItemName} numberOfLines={1}>{c.ad}</Text>
                      <Text style={styles.cartItemNote}>Beden: {c.beden} · {c.not}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={styles.cartItemPrice}>{c.fiyat}</Text>
                      <Pressable hitSlop={12} onPress={() => removeFromCart(i)}>
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
                  style={[styles.checkoutBtn, odemeYapiliyor && styles.checkoutBtnDisabled]}
                  disabled={odemeYapiliyor}
                  onPress={async () => {
                    if (!selectedChildId) {
                      showToast('Önce bir çocuk seçin');
                      return;
                    }
                    setOdemeYapiliyor(true);
                    try {
                      const kalemler: SepetKalemGirdi[] = sepet.map((c) => ({
                        urunId: c.urunId,
                        beden: c.beden,
                        adet: 1,
                        fiyatN: c.fiyatN,
                        not: c.not,
                      }));
                      await olusturSiparis(selectedChildId, kalemler);
                      setSepet([]);
                      setCartOpen(false);
                      showToast('Siparişin alındı · salonda teslim edilecek');
                    } catch {
                      showToast('Sipariş oluşturulamadı, tekrar dene');
                    } finally {
                      setOdemeYapiliyor(false);
                    }
                  }}
                >
                  <Text style={styles.checkoutBtnText}>{odemeYapiliyor ? 'Gönderiliyor…' : 'Ödemeye Geç'}</Text>
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
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  cartBtn: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cartIcon: { fontSize: 18 },
  cartDot: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgDeep, paddingHorizontal: 3 },
  cartDotText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.onAccent },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  bannerCard: { borderRadius: 22, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 16 },
  bannerLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.6, color: colors.accent },
  bannerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, marginTop: 4 },
  bannerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: 3 },
  katScroll: { flexGrow: 0 },
  katRow: { flexDirection: 'row', gap: spacing.xs },
  katChip: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  katChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  katChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  katChipTextActive: { color: colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  productCard: { width: '47%', borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  productThumb: { aspectRatio: 1, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  productBadge: { position: 'absolute', top: 9, left: 9, backgroundColor: colors.accent, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill },
  productBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.onAccent },
  productInfo: { padding: 12 },
  productName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright, minHeight: 32 },
  productBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
  productPrice: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.textBright },
  productAddBtn: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  productAddBtnText: { color: colors.accent, fontSize: 16, fontFamily: fontFamily.archivoBold },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  detailTop: { flexDirection: 'row', gap: 14 },
  detailThumb: { width: 92, height: 92, borderRadius: 18, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  detailName: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  detailDesc: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  detailPrice: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.accent, marginTop: 6 },
  bedenHeader: { marginTop: spacing.md },
  bedenLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
  bedenRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  bedenChip: { flex: 1, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  bedenChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  bedenChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  bedenChipTextActive: { color: colors.accent },
  jerseyNote: { marginTop: spacing.sm, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 11 },
  jerseyNoteText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.accent },
  addBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { backgroundColor: colors.panel },
  addBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  addBtnTextDisabled: { color: colors.textDim },
  cartTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginBottom: spacing.sm },
  emptyCartText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  cartThumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  cartItemName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  cartItemNote: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  cartItemPrice: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: colors.textBright },
  cartRemove: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.danger },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  cartTotalLabel: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  cartTotalValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright },
  checkoutBtn: { marginTop: spacing.sm, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  checkoutBtnDisabled: { opacity: 0.6 },
  checkoutBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  });
}
