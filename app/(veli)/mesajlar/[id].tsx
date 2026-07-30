import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useIslem, useToast } from '../../../src/components/Toast';
import { SohbetModerasyon } from '../../../src/components/SohbetModerasyon';
import {
  getKonusmaBasligi,
  getMesajlar,
  konusmaOku,
  sendMesaj,
  subscribeToKonusma,
  unsubscribeKonusma,
} from '../../../src/data/mesajRepo';
import type { KonusmaSatir, Mesaj } from '../../../src/data/types-mesaj';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, spacing } from '../../../src/theme';

export default function SohbetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [konusma, setKonusma] = useState<KonusmaSatir | null>(null);
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { toastMessage, showToast } = useToast();
  // Engelliyken yazma alani kapanir; kullaniciya sebebi yazilir.
  const [engelli, setEngelli] = useState(false);
  const calistir = useIslem(showToast);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [k, m] = await Promise.all([getKonusmaBasligi(id), getMesajlar(id)]);
      setKonusma(k);
      setMesajlar(m);
      await konusmaOku(id);
    } catch {
      setError('Sohbet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — konuşma açıkken gelen yeni mesajlar (kendi gönderdiklerimiz dahil,
  // ekranda tekrar eklememek için lokal optimistik ekleme yapılmıyor, tek kaynak Realtime).
  useEffect(() => {
    if (!id) return;
    const channel = subscribeToKonusma(id, (m) => {
      setMesajlar((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    return () => {
      unsubscribeKonusma(channel);
    };
  }, [id]);

  // SIRA KRİTİK: girdi ancak gönderim BAŞARILI olduktan sonra temizleniyor.
  // Eskiden setDraft('') await'ten önceydi; zayıf sinyalde kullanıcının yazdığı
  // mesaj ekrandan siliniyor, karşı tarafa da ulaşmıyor ve hiçbir uyarı
  // çıkmıyordu — yazılan şey tamamen kayboluyordu.
  async function onSend() {
    const t = draft.trim();
    if (!t || !id) return;
    const gonderildi = await calistir(() => sendMesaj(id, t), 'Mesaj gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    if (gonderildi) setDraft('');
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          {konusma && (
            <>
              <View style={[styles.avatar, { backgroundColor: konusma.avBg }]}>
                <Text style={[styles.avatarText, { color: konusma.avFg }]}>{konusma.init}</Text>
                <View style={styles.onlineDot} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.headerName} numberOfLines={1}>{konusma.ad}</Text>
                <Text style={styles.headerRole} numberOfLines={1}>{konusma.role}</Text>
              </View>
              {/* Guideline 1.2: sikayet ve engelleme, konustugu kisi
                  baglamindayken erisilebilir olmali. */}
              <SohbetModerasyon
                hedefId={konusma.karsiTarafId}
                hedefAd={konusma.ad}
                konusmaId={konusma.id}
                onDegisim={setEngelli}
              />
            </>
          )}
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && konusma && (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.chatScroll}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              <View style={styles.dayPill}>
                <Text style={styles.dayPillText}>BUGÜN</Text>
              </View>
              <Text style={styles.dayNote}>Mesajlar 09:00 – 21:00 arasında iletilir</Text>

              {mesajlar.map((m) => (
                <View key={m.id} style={[styles.bubbleRow, { justifyContent: m.benim ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.bubble, m.benim ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, m.benim && { color: colors.onAccent }]}>{m.text}</Text>
                    <Text style={[styles.bubbleTime, m.benim && { color: colors.onAccent, opacity: 0.6 }]}>{m.time}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* ENGELLİYKEN YAZMA ALANI HİÇ ÇİZİLMİYOR.
                Sunucu zaten reddediyor (0031 mesaj politikası), ama kullanıcıyı
                yazdırıp sonra hata göstermek kötü bir deneyim: emeği boşa gider
                ve sebebini anlamaz. Sebep burada, denemeden önce yazılı. */}
            {engelli ? (
              <View style={styles.composer}>
                <Text style={styles.engelNotu}>
                  Bu kişiyi engellediniz. Mesajlaşmayı yeniden açmak için üstteki ⋯ menüsünden engeli kaldırın.
                </Text>
              </View>
            ) : (
              <View style={styles.composer}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Mesaj yazın…"
                    placeholderTextColor={colors.textDim}
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={() => onSend()}
                  />
                  <Pressable style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]} onPress={() => onSend()}>
                    <Text style={{ fontSize: 16 }}>➤</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        )}
        <Toast message={toastMessage} />
      </SafeAreaView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  avatar: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
  onlineDot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2.5, borderColor: colors.bgDeep },
  headerName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  headerRole: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent },
  chatScroll: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.md },
  dayPill: { alignSelf: 'center', backgroundColor: colors.chip, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 99 },
  dayPillText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.textDim, letterSpacing: 0.5 },
  dayNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim, marginTop: 6, marginBottom: spacing.xs },
  bubbleRow: { flexDirection: 'row', marginTop: spacing.xs },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textBright, lineHeight: 19 },
  bubbleTime: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim, textAlign: 'right', marginTop: 3 },
  composer: { padding: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  engelNotu: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  inputRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  input: { flex: 1, height: 46, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  sendBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.panel },
  });
}
