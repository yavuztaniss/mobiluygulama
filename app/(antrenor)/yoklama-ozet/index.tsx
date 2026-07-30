import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { AppModal } from '../../../src/components/AppModal';
import { getAntrenmanBaslik, getBugunkuGruplar, getYoklamaSatirlari } from '../../../src/data/antrenorRepo';
import type { BugunkuGrup, YoklamaSatiri } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing, avatarColorAt } from '../../../src/theme';

function bugunEtiketi(): string {
  const d = new Date();
  return `${d.toLocaleDateString('tr-TR', { weekday: 'long' })}, ${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`;
}

/** Özetin ait olduğu antrenman — başlıkta AÇIKÇA yazılır, tahmin edilmez. */
type Hedef = { id: string; ad: string; saat1: string; saat2: string };

function hedefEtiketi(h: Hedef): string {
  const saat = h.saat1 && h.saat2 ? ` · ${h.saat1} – ${h.saat2}` : '';
  return `${h.ad || 'Grup adı yok'}${saat}`;
}

export default function YoklamaOzetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  // Bugün ekranından tıklanan grubun antrenman id'si — varsa tahmin yerine o kullanılır.
  const { antrenmanId: paramAntrenmanId } = useLocalSearchParams<{ antrenmanId?: string }>();
  const [satirlar, setSatirlar] = useState<YoklamaSatiri[]>([]);
  const [hedef, setHedef] = useState<Hedef | null>(null);
  const [gruplar, setGruplar] = useState<BugunkuGrup[]>([]);
  const [secimOpen, setSecimOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servisOnaylandi, setServisOnaylandi] = useState<Record<string, boolean>>({});
  const { toastMessage, showToast } = useToast();

  // Yoklama satırları YALNIZCA hedef antrenman belliyken yüklenir. Eskiden hedef
  // bulunamadığında getYoklamaSatirlari() parametresiz çağrılıyor ve repo bugünün
  // ilk antrenmanını seçiyordu — kullanıcı hangi grubun özetine baktığını bilmeden
  // yanlış listeyi görebiliyordu.
  const satirlariYukle = useCallback(async (h: Hedef) => {
    setLoading(true);
    setError(null);
    try {
      setHedef(h);
      setSatirlar(await getYoklamaSatirlari(h.id));
    } catch {
      setError('Özet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bugunkuler = await getBugunkuGruplar();
      setGruplar(bugunkuler);

      // (1) Route param'la gelen id (Bugün ekranında tıklanan grup) her zaman kazanır.
      if (paramAntrenmanId) {
        const g = bugunkuler.find((x) => x.id === paramAntrenmanId);
        if (g) {
          setHedef(g);
          setSatirlar(await getYoklamaSatirlari(g.id));
          return;
        }
        // Param bugünün listesinde yoksa (ör. geçmiş bir antrenman) başlık
        // doğrudan antrenman kaydından çözülür — "hangi grup?" yanıtsız kalmasın.
        const b = await getAntrenmanBaslik(paramAntrenmanId);
        if (b) {
          setHedef(b);
          setSatirlar(await getYoklamaSatirlari(b.id));
          return;
        }
        setHedef(null);
        setSatirlar([]);
        setError('Antrenman bulunamadı.');
        return;
      }

      // (2) Param yok: bugün tek antrenman varsa belirsizlik de yok.
      if (bugunkuler.length === 1) {
        setHedef(bugunkuler[0]);
        setSatirlar(await getYoklamaSatirlari(bugunkuler[0].id));
        return;
      }

      // (3) Birden fazla antrenman: sessizce birini seçmek yerine seçim sun.
      // Devam eden antrenman listede "şu an" olarak işaretlenir ama otomatik
      // açılmaz — eskiden bu tahmin başlıkta belirtilmeden yapılıyordu.
      if (bugunkuler.length > 1) {
        setHedef(null);
        setSatirlar([]);
        setSecimOpen(true);
        return;
      }

      // (4) Bugün hiç antrenman yok — özet gösterilecek bir şey de yok.
      setHedef(null);
      setSatirlar([]);
    } catch {
      setError('Özet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [paramAntrenmanId]);

  useEffect(() => {
    load();
  }, [load]);

  const katilanlar = satirlar.filter((s) => s.durum === 'in');
  const katilmayanlar = satirlar.filter((s) => s.durum === 'out');
  const pct = satirlar.length ? Math.round((katilanlar.length / satirlar.length) * 100) : 0;
  const size = 92;
  const r = 38;
  const circumference = 2 * Math.PI * r;

  function veliyiAra(telefon: string) {
    Linking.openURL(`tel:${telefon}`).catch(() => showToast('Arama başlatılamadı'));
  }

  // Salt YEREL işaretleme — veliye herhangi bir bildirim GİTMEZ (push altyapısı yok);
  // işaret yalnızca bu ekran açıkken bellekte tutulur.
  function onServisOnay(id: string) {
    setServisOnaylandi((prev) => ({ ...prev, [id]: true }));
    showToast('İşaretlendi');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Yoklama Özeti</Text>
            {/* Özetin HANGİ gruba ait olduğu her zaman burada yazılı. */}
            <Text style={styles.headerSub}>
              {hedef ? hedefEtiketi(hedef) : 'Grup seçilmedi'} · {bugunEtiketi()}
            </Text>
          </View>
          {gruplar.length > 1 && (
            <Pressable hitSlop={8} style={styles.degistirBtn} onPress={() => setSecimOpen(true)}>
              <Text style={styles.degistirBtnText}>Grup değiştir</Text>
            </Pressable>
          )}
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && !hedef && (
          <View style={styles.bosDurum}>
            <Text style={styles.bosBaslik}>
              {gruplar.length > 1 ? 'Bugün birden fazla antrenman var' : 'Bugün antrenman yok'}
            </Text>
            <Text style={styles.bosMetin}>
              {gruplar.length > 1
                ? 'Hangi grubun özetini görmek istediğini seç — yanlış grubu göstermemek için otomatik seçim yapılmıyor.'
                : 'Yoklama özeti gösterilebilmesi için bugüne planlanmış bir antrenman gerekiyor.'}
            </Text>
            {gruplar.length > 1 && (
              <Pressable style={styles.bosBtn} onPress={() => setSecimOpen(true)}>
                <Text style={styles.bosBtnText}>Grup Seç</Text>
              </Pressable>
            )}
          </View>
        )}

        {!loading && !error && hedef && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.heroCard}>
              <View style={{ width: size, height: size }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={8} fill="none" />
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={colors.accent}
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
                  />
                </Svg>
                <View style={styles.heroPctWrap} pointerEvents="none">
                  <Text style={styles.heroPct}>%{pct}</Text>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroLabel}>KATILIM ORANI</Text>
                <Text style={styles.heroSub}>{katilanlar.length}/{satirlar.length} sporcu katıldı</Text>
                {katilmayanlar.length > 0 && (
                  <Text style={styles.heroMiss}>✕ Katılmayan: {katilmayanlar.map((k) => k.ad.split(' ')[0]).join(', ')}</Text>
                )}
              </View>
            </View>

            {/* Sahte "Veli bildirimleri" (İletildi/Görüldü/Ulaşılamadı) ve "SMS ile yinelenir"
                bölümleri kaldırıldı — gerçek push/SMS altyapısı yok. Yerine katılmayan
                sporcuların velilerini gerçek telefon numarasından arama listesi kondu. */}
            {katilmayanlar.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>KATILMAYANLAR</Text>
                  <Text style={styles.sectionCount}>{katilmayanlar.length} sporcu</Text>
                </View>
                {katilmayanlar.map((s) => (
                  <View key={s.id} style={styles.servisRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{s.init}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>{s.ad}</Text>
                      <Text style={styles.servisSub}>{s.veliTelefon ? `Veli: ${s.veliTelefon}` : 'Veli telefonu kayıtlı değil'}</Text>
                    </View>
                    {!!s.veliTelefon && (
                      <Pressable hitSlop={8} style={styles.callBtn} onPress={() => veliyiAra(s.veliTelefon!)}>
                        <Text>📞</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>SERVİS TAKİBİ</Text>
              <Text style={styles.sectionCount}>{katilanlar.length} sporcu</Text>
            </View>
            {katilanlar.map((s) => (
              <View key={s.id} style={styles.servisRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{s.init}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{s.ad}</Text>
                  <Text style={styles.servisSub}>{servisOnaylandi[s.id] ? 'Servise bindi olarak işaretlendi ✓' : 'Henüz işaretlenmedi'}</Text>
                </View>
                {!servisOnaylandi[s.id] ? (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} style={styles.servisBtn} onPress={() => onServisOnay(s.id)}>
                    <Text style={styles.servisBtnText}>Bindi</Text>
                  </Pressable>
                ) : (
                  <View style={styles.servisOkBadge}>
                    <Text style={styles.servisOkText}>✓</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.servisNote}>Servis işaretleri yalnızca bu cihazda tutulur, veliye bildirim gitmez</Text>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Basit grup seçici — bugünün antrenmanları. Devam eden antrenman
          işaretlenir ama otomatik seçilmez. */}
      <AppModal visible={secimOpen} transparent animationType="slide" onRequestClose={() => setSecimOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSecimOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Grup Seç</Text>
            <Text style={styles.sheetSub}>Bugün {gruplar.length} antrenman var · {bugunEtiketi()}</Text>
            <ScrollView contentContainerStyle={styles.sheetList}>
              {gruplar.map((g) => {
                const secili = hedef?.id === g.id;
                return (
                  <Pressable
                    key={g.id}
                    style={[styles.sheetRow, secili && styles.sheetRowActive]}
                    onPress={() => {
                      setSecimOpen(false);
                      satirlariYukle(g);
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.sheetRowTitle}>{g.ad || 'Grup adı yok'}</Text>
                      <Text style={styles.sheetRowSub}>
                        {g.saat1} – {g.saat2}
                        {g.tesis ? ` · ${g.tesis}` : ''}
                        {g.durum === 'simdi' ? ' · şu an' : ''}
                        {g.yoklamaAlindi ? ' · yoklama alındı' : ' · yoklama alınmadı'}
                      </Text>
                    </View>
                    {secili && <Text style={styles.sheetCheck}>✓</Text>}
                  </Pressable>
                );
              })}
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
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radius.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.sm },
  heroPctWrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  heroPct: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright },
  heroLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.8, color: colors.accent },
  heroSub: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, lineHeight: lineHeightFor(fontSize.xl), color: colors.textBright, marginTop: 5 },
  heroMiss: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.danger, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  sectionCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  callBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  servisRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 11 },
  servisNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: spacing.xs },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.base, color: avatarColorAt(0).avFg },
  name: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  servisSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  servisBtn: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12 },
  servisBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  servisOkBadge: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  servisOkText: { color: colors.accent, fontFamily: fontFamily.archivoBold },
  degistirBtn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder,
  },
  degistirBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  bosDurum: { padding: spacing.lg, gap: spacing.sm },
  bosBaslik: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: colors.textBright },
  bosMetin: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted },
  bosBtn: { alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.accent },
  bosBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.onAccent },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '75%',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  sheetSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 3 },
  sheetList: { gap: 7, paddingTop: spacing.sm, paddingBottom: spacing.md },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 13, borderRadius: 16,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border,
  },
  sheetRowActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  sheetRowTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  sheetRowSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  sheetCheck: { color: colors.accent, fontSize: fontSize.md },
  });
}
