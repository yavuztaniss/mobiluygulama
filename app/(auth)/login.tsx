import { useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../src/theme';

export default function LoginScreen() {
  const { signIn, devSignInAs } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email || !password) {
      setError('E-posta ve şifre gerekli.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) setError(signInError);
    // başarılıysa app/index.tsx auth state değişimini yakalayıp role yönlendirir
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.dot} />
            <Text style={styles.brand}>KARŞIYAKA SPOR OKULU</Text>
          </View>
          <Text style={styles.title}>Giriş Yap</Text>
          <Text style={styles.subtitle}>Hesabına giriş yaparak devam et.</Text>

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
            <TextField
              label="Şifre"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Button label="Giriş Yap" onPress={onSubmit} loading={loading} />
          </View>

          <Link href="/(auth)/forgot-password" style={styles.link}>
            Şifremi unuttum
          </Link>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Hesabın yok mu?</Text>
            <Link href="/(auth)/register" style={styles.footerLink}>
              Kayıt Ol
            </Link>
          </View>

          {/* Çok kulüplü kurulumda kayıt DAVET BAĞLANTISI gerektirir (0022): kulüp ve rol
              bilgisi bağlantıdan gelir. Kullanıcı bunu kayıt denemesi başarısız olduğunda
              değil, öncesinde bilsin. */}
          <Text style={styles.davetNot}>
            Kulübünüzden davet bağlantısı aldıysanız hesabınızı o bağlantıdan oluşturun.
          </Text>

          {__DEV__ && (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>DEV · SUPABASE BAĞLANMADAN TEST</Text>
              <View style={styles.devRow}>
                <View style={styles.devBtn}>
                  <Button label="Yönetici" variant="secondary" onPress={() => devSignInAs('yonetici')} />
                </View>
                <View style={styles.devBtn}>
                  <Button label="Veli" variant="secondary" onPress={() => devSignInAs('veli')} />
                </View>
                <View style={styles.devBtn}>
                  <Button label="Antrenör" variant="secondary" onPress={() => devSignInAs('antrenor')} />
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xxl,
      gap: spacing.sm,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
    brand: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: '800',
      letterSpacing: 1.8,
      color: colors.accent,
    },
    title: {
      fontFamily: fontFamily.archivoBold,
      fontSize: 32,
      color: colors.textBright,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
      marginBottom: spacing.xl,
    },
    form: { gap: spacing.lg },
    error: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.danger,
    },
    link: {
      marginTop: spacing.xl,
      textAlign: 'center',
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.base,
      color: colors.accent,
    },
    footer: {
      marginTop: spacing.xxl,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    footerText: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
    },
    footerLink: {
      fontFamily: fontFamily.manropeExtra,
      fontSize: fontSize.base,
      color: colors.accent,
    },
    davetNot: {
      marginTop: spacing.md,
      textAlign: 'center',
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.sm,
      color: colors.textDim,
      lineHeight: 18,
    },
    devBox: {
      marginTop: spacing.xxl,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.lg,
      gap: spacing.sm,
    },
    devLabel: {
      fontFamily: fontFamily.mono,
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: colors.textDim,
      textAlign: 'center',
    },
    devRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    devBtn: {
      flex: 1,
    },
  });
}
