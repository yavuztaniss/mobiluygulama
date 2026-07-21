import { useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';
import type { AppRole } from '../../src/types/database';

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'veli', label: 'Veli' },
  { value: 'antrenor', label: 'Antrenör' },
  { value: 'yonetici', label: 'Yönetici' },
];

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);
  const [ad, setAd] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [role, setRole] = useState<AppRole>('veli');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!ad || !email || !password) {
      setError('Tüm alanları doldur.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setLoading(true);
    const { error: signUpError } = await signUp({ email: email.trim(), password, ad: ad.trim(), role });
    setLoading(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <ScreenBackground>
        <View style={styles.successWrap}>
          <Text style={styles.title}>Hesabın oluşturuldu</Text>
          <Text style={styles.subtitle}>
            E-postana gönderdiğimiz onay bağlantısına tıkladıktan sonra giriş yapabilirsin.
          </Text>
          <Link href="/(auth)/login" style={styles.link}>
            Girişe dön
          </Link>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Kayıt Ol</Text>
          <Text style={styles.subtitle}>Rolünü seç ve hesabını oluştur.</Text>

          <View style={styles.segment}>
            {ROLE_OPTIONS.map((opt) => {
              const active = opt.value === role;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setRole(opt.value)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.form}>
            <TextField label="Ad Soyad" value={ad} onChangeText={setAd} placeholder="Adın Soyadın" />
            <TextField
              label="E-posta"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@eposta.com"
            />
            <TextField label="Şifre" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />
            <TextField
              label="Şifre (Tekrar)"
              secureTextEntry
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              placeholder="••••••••"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Button label="Hesap Oluştur" onPress={onSubmit} loading={loading} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Zaten hesabın var mı?</Text>
            <Link href="/(auth)/login" style={styles.footerLink}>
              Giriş Yap
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
    successWrap: { flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
    title: { fontFamily: fontFamily.archivoBold, fontSize: 32, color: colors.white, letterSpacing: -0.5 },
    subtitle: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.navySurface,
      borderRadius: radius.md,
      padding: 4,
      marginBottom: spacing.lg,
    },
    segmentItem: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.md - 4,
      alignItems: 'center',
    },
    segmentItemActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.base,
      color: colors.textMuted,
    },
    segmentTextActive: {
      color: colors.accentOnDark,
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
    footer: { marginTop: spacing.xxl, flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
    footerText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted },
    footerLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accent },
  });
}
