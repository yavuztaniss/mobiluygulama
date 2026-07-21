import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { getAntrenorKonusma } from '../../../src/data/antrenorRepo';
import type { AntrenorKonusma } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../../src/theme';

interface LocalMsg {
  mine: boolean;
  text: string;
  time: string;
}

export default function AntrenorSohbetScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [konusma, setKonusma] = useState<AntrenorKonusma | null>(null);
  const [mesajlar, setMesajlar] = useState<LocalMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const k = await getAntrenorKonusma(id);
      setKonusma(k);
      setMesajlar([{ mine: false, text: k.son, time: k.zaman }]);
    } catch {
      setError('Sohbet yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function onSend() {
    const t = draft.trim();
    if (!t) return;
    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    setMesajlar((prev) => [...prev, { mine: true, text: t, time }]);
    setDraft('');
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
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.headerName}>{konusma.ad}</Text>
                <Text style={styles.headerRole}>{konusma.role}</Text>
              </View>
            </>
          )}
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && konusma && (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.chatScroll} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
              {mesajlar.map((m, i) => (
                <View key={i} style={[styles.bubbleRow, { justifyContent: m.mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, m.mine && { color: colors.accentOnDark }]}>{m.text}</Text>
                    <Text style={[styles.bubbleTime, m.mine && { color: colors.accentOnDark, opacity: 0.6 }]}>{m.time}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.composer}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Mesaj yazın…"
                  placeholderTextColor={colors.textFaint}
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={onSend}
                />
                <Pressable style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]} onPress={onSend}>
                  <Text style={{ fontSize: 16 }}>➤</Text>
                </Pressable>
              </View>
            </View>
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
  avatar: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm },
  headerName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.white },
  headerRole: { fontFamily: fontFamily.manropeBold, fontSize: 11, color: colors.accent },
  chatScroll: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.md },
  bubbleRow: { flexDirection: 'row', marginTop: spacing.xs },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.navyChip, borderWidth: 1, borderColor: colors.navyBorderSoft, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.white, lineHeight: 19 },
  bubbleTime: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textFaint, textAlign: 'right', marginTop: 3 },
  composer: { padding: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.navyBorder },
  inputRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  input: { flex: 1, height: 46, borderRadius: 16, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, paddingHorizontal: 15, color: colors.white, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base },
  sendBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.navySurface },
  });
}
