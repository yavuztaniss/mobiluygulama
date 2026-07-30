import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useKurum } from '../../../src/context/KurumContext';
import { formatTL, getBireyselAntrenorler, getBireyselFiltreler, paketAvantajYuzdesi } from '../../../src/data/bireyselRepo';
import type { BireyselAntrenor } from '../../../src/data/types-bireysel';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

export default function BireyselDersListesi() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { kulupAdi } = useKurum();
  const [antrenorler, setAntrenorler] = useState<BireyselAntrenor[]>([]);
  const [filtreler, setFiltreler] = useState<string[]>([]);
  const [filtre, setFiltre] = useState('Tümü');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, f] = await Promise.all([getBireyselAntrenorler(), getBireyselFiltreler()]);
      setAntrenorler(a);
      setFiltreler(f);
    } catch {
      setError('Antrenörler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const liste = antrenorler.filter((a) => filtre === 'Tümü' || a.brans === filtre);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.brandRow}>
              <View style={styles.dot} />
              <Text style={styles.brand}>{kulupAdi.toLocaleUpperCase('tr-TR')}</Text>
            </View>
            <Text style={styles.title}>Bireysel Ders</Text>
            <Text style={styles.subtitle}>Kulüp antrenörlerinden birebir ders alın</Text>
          </View>
          <Pressable
            style={styles.infoBtn}
            onPress={() => showToast('Bireysel ders: kulüp antrenöründen birebir seans — ödeme kulüp üzerinden')}
          >
            <Text style={styles.infoIcon}>ⓘ</Text>
          </Pressable>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtreRow}>
              {filtreler.map((f) => {
                const active = f === filtre;
                return (
                  <Pressable key={f} style={[styles.filtreChip, active && styles.filtreChipActive]} onPress={() => setFiltre(f)}>
                    <Text style={[styles.filtreText, active && styles.filtreTextActive]}>{f}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.promoBanner}>
              <Text style={styles.promoIcon}>★</Text>
              <Text style={styles.promoText}>
                10'lu paketlerde tek ders fiyatına göre <Text style={{ fontFamily: fontFamily.manropeExtra }}>%13'e varan</Text> avantaj
              </Text>
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.listLabel}>ANTRENÖRLER</Text>
              <Text style={styles.listCount}>{liste.length} antrenör</Text>
            </View>

            {liste.map((a) => (
              <Pressable key={a.id} style={styles.card} onPress={() => router.push(`/bireysel-ders/${a.id}`)}>
                <View style={styles.cardTop}>
                  <View style={styles.avatarWrap}>
                    <View style={[styles.avatar, { backgroundColor: a.avBg }]}>
                      <Text style={[styles.avatarText, { color: a.avFg }]}>{a.init}</Text>
                    </View>
                    {a.musait && <View style={styles.musaitDot} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{a.ad}</Text>
                      {a.musait ? (
                        <View style={styles.musaitPill}>
                          <Text style={styles.musaitPillText}>BU HAFTA MÜSAİT</Text>
                        </View>
                      ) : (
                        <View style={styles.doluPill}>
                          <Text style={styles.doluPillText}>{a.ilkBosEtiket}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.meta}>{a.brans} · {a.deneyim} yıl deneyim</Text>
                    <View style={styles.ratingRow}>
                      <Text style={styles.star}>★</Text>
                      <Text style={styles.puan}>{a.puan}</Text>
                      <Text style={styles.dersSay}>· {a.dersSayisi} ders verdi</Text>
                    </View>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
                <View style={styles.priceRow}>
                  <View style={styles.priceBox}>
                    <Text style={styles.priceLabel}>TEK DERS</Text>
                    <Text style={styles.priceValue}>{formatTL(a.tekFiyatN)}</Text>
                  </View>
                  <View style={styles.priceBoxAccent}>
                    <Text style={styles.priceLabelAccent}>10'LU PAKET</Text>
                    <Text style={styles.priceValueAccent}>{formatTL(a.paketFiyatN)}</Text>
                    <Text style={styles.priceNote}>%{paketAvantajYuzdesi(a)} avantaj</Text>
                  </View>
                </View>
              </Pressable>
            ))}

            <Text style={styles.footerNote}>Ödemeler kulüp üzerinden güvenle alınır ·{'\n'}24 saatten geç iptalde seans yanar</Text>
          </ScrollView>
        )}
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  brand: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright, marginTop: 3 },
  subtitle: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  infoBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  infoIcon: { color: colors.textMuted, fontSize: 16 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  filtreRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  filtreChip: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  filtreChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  filtreText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textMuted },
  filtreTextActive: { color: colors.accent },
  promoBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 12 },
  promoIcon: { color: colors.accent, fontSize: 14 },
  promoText: { flex: 1, fontFamily: fontFamily.manropeSemi, fontSize: 11.5, color: colors.accent, lineHeight: 16 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  listLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  listCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  card: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cardTop: { flexDirection: 'row', gap: 13 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: 19 },
  musaitDot: { position: 'absolute', bottom: -3, right: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.panel },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.lg, color: colors.textBright },
  musaitPill: { backgroundColor: colors.accentSoft, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
  musaitPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.4, color: colors.accent },
  doluPill: { backgroundColor: colors.chip, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
  doluPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.4, color: colors.textMuted },
  meta: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  star: { color: colors.warning, fontSize: 12 },
  puan: { fontFamily: fontFamily.manropeExtra, fontSize: 11.5, color: colors.warning },
  dersSay: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim },
  chevron: { color: colors.textDim, fontSize: 16, marginTop: 4 },
  priceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 13 },
  priceBox: { flex: 1, borderRadius: 13, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, padding: 11 },
  priceLabel: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.8, color: colors.textDim },
  priceValue: { fontFamily: fontFamily.archivoBold, fontSize: 15.5, color: colors.textBright, marginTop: 2 },
  priceBoxAccent: { flex: 1, borderRadius: 13, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, padding: 11, position: 'relative' },
  priceLabelAccent: { fontFamily: fontFamily.manropeExtra, fontSize: 9.5, letterSpacing: 0.8, color: colors.accent },
  priceValueAccent: { fontFamily: fontFamily.archivoBold, fontSize: 15.5, color: colors.accent, marginTop: 2 },
  priceNote: { position: 'absolute', top: 9, right: 11, fontFamily: fontFamily.manropeExtra, fontSize: 9, color: colors.accent },
  footerNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim, marginTop: spacing.sm, lineHeight: 17 },
  });
}
