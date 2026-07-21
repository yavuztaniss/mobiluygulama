import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { getKonusma, getChatMesajlari, sendChatMesaj, scheduleAutoReply } from '../../../src/data/veliRepo';
import type { ChatMesaj, Konusma } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../../src/theme';

const QUICKS = ['Teşekkürler hocam', 'Anlaşıldı', 'Bugün servise binecek'];

export default function SohbetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [konusma, setKonusma] = useState<Konusma | null>(null);
  const [mesajlar, setMesajlar] = useState<ChatMesaj[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const isCoachChat = id === 'k1';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const k = await getKonusma(id);
      setKonusma(k);
      if (isCoachChat) setMesajlar(await getChatMesajlari());
    } catch {
      setError('Sohbet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id, isCoachChat]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSend(text?: string) {
    const t = (text ?? draft).trim();
    if (!t || !isCoachChat) return;
    setDraft('');
    setMesajlar(await sendChatMesaj(t));
    setTyping(true);
    scheduleAutoReply((updated) => {
      setMesajlar(updated);
      setTyping(false);
    });
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          {konusma && (
            <>
              <View style={[styles.avatar, { backgroundColor: konusma.avBg }]}>
                <Text style={[styles.avatarText, { color: konusma.avFg }]}>{konusma.init}</Text>
                <View style={styles.onlineDot} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.headerName}>{konusma.ad}</Text>
                <Text style={styles.headerRole}>{konusma.role} · çevrimiçi</Text>
              </View>
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

              {isCoachChat ? (
                mesajlar.map((m, i) => (
                  <View key={i} style={[styles.bubbleRow, { justifyContent: m.who === 'p' ? 'flex-end' : 'flex-start' }]}>
                    <View style={[styles.bubble, m.who === 'p' ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[styles.bubbleText, m.who === 'p' && { color: colors.accentOnDark }]}>{m.text}</Text>
                      <Text style={[styles.bubbleTime, m.who === 'p' && { color: colors.accentOnDark, opacity: 0.6 }]}>{m.time}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.bubbleRow}>
                  <View style={[styles.bubble, styles.bubbleTheirs]}>
                    <Text style={styles.bubbleText}>{konusma.son}</Text>
                    <Text style={styles.bubbleTime}>{konusma.zaman}</Text>
                  </View>
                </View>
              )}

              {typing && (
                <View style={styles.bubbleRow}>
                  <View style={[styles.bubble, styles.bubbleTheirs, styles.typingBubble]}>
                    <Text style={styles.typingDots}>• • •</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {isCoachChat && (
              <View style={styles.composer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
                  {QUICKS.map((q) => (
                    <Pressable key={q} style={styles.quickChip} onPress={() => onSend(q)}>
                      <Text style={styles.quickChipText}>{q}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Mesaj yazın…"
                    placeholderTextColor={colors.textFaint}
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
      </SafeAreaView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.iconMuted, fontSize: 22, marginTop: -2 },
  avatar: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
  onlineDot: { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2.5, borderColor: colors.navyBg },
  headerName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.white },
  headerRole: { fontFamily: fontFamily.manropeBold, fontSize: 11, color: colors.accent },
  chatScroll: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.md },
  dayPill: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 99 },
  dayPillText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5 },
  dayNote: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textFaint, marginTop: 6, marginBottom: spacing.xs },
  bubbleRow: { flexDirection: 'row', marginTop: spacing.xs },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.navyChip, borderWidth: 1, borderColor: colors.navyBorderSoft, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.white, lineHeight: 19 },
  bubbleTime: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textFaint, textAlign: 'right', marginTop: 3 },
  typingBubble: { paddingVertical: 13 },
  typingDots: { color: colors.textMuted, letterSpacing: 2 },
  composer: { padding: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.navyBorder },
  quickRow: { gap: spacing.xs, paddingBottom: spacing.sm },
  quickChip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 99, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: 'rgba(46,230,168,0.28)' },
  quickChipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.accent },
  inputRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  input: { flex: 1, height: 46, borderRadius: 16, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, paddingHorizontal: 15, color: colors.white, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  sendBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.navySurface },
  });
}
