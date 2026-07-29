import { useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../src/theme';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email) {
      setError('E-posta gerekli.');
      return;
    }
    setLoading(true);
    const { error: resetError } = await resetPassword(email.trim());
    setLoading(false);
    if (resetError) {
      setError(resetError);
      return;
    }
    setSent(true);
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Şifreni Sıfırla</Text>
          <Text style={styles.subtitle}>
            {sent
              ? 'E-postana bir sıfırlama bağlantısı gönderdik.'
              : 'Kayıtlı e-postanı gir, sana sıfırlama bağlantısı gönderelim.'}
          </Text>

          {!sent && (
            <View style={styles.form}>
              <TextField
                label="E-posta"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="ornek@eposta.com"
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Button label="Bağlantı Gönder" onPress={onSubmit} loading={loading} />
            </View>
          )}

          <Link href="/(auth)/login" style={styles.link}>
            Girişe dön
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
    title: { fontFamily: fontFamily.archivoBold, fontSize: 32, color: colors.textBright, letterSpacing: -0.5 },
    subtitle: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
      marginBottom: spacing.xl,
    },
    form: { gap: spacing.lg },
    error: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.danger },
    link: {
      marginTop: spacing.xl,
      textAlign: 'center',
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.base,
      color: colors.accent,
    },
  });
}
