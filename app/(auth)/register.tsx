import { useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

// ROL SEÇİMİ YOK — VE ARTIK İSTEMCİ ROL GÖNDERMİYOR DA.
// Burada eskiden `SELF_SIGNUP_ROLE = 'veli'` sabiti vardı ve signUp'a geçiliyordu.
// Sabit KALDIRILDI, çünkü artık hiçbir anlamı yok:
//   · 0016 migration'ından beri handle_new_user rolü user_metadata'dan OKUMUYOR —
//     metadata self-signup'ta istemci kontrollüdür, oradan okunsaydı herkes
//     kendini 'yonetici' yapabilirdi. Yani gönderilen rol zaten yok sayılıyordu.
//   · 0022 ile rol DAVET SATIRINDAN geliyor (davet.rol): veli, antrenör,
//     muhasebeci veya yönetici. Rolü belirleyen tek yer, daveti çıkaran kulüp
//     yöneticisidir.
// İstemcinin taşıdığı tek şey davet TOKEN'ıdır; o da bir iddia değil, kanıttır.

export default function RegisterScreen() {
  const { signUp } = useAuth();
  // Davet linki bu ekrana `davet` parametresiyle gelir: girişi app/davet/[token].tsx
  // karşılar, token'ı buraya devreder. Parametre yoksa ekran eski davranışını sürdürür.
  const { davet } = useLocalSearchParams<{ davet?: string }>();
  const colors = useColors();
  const styles = createStyles(colors);
  const [ad, setAd] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const davetToken = typeof davet === 'string' ? davet.trim() : '';
  const davetliMi = davetToken.length > 0;

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
    const { error: signUpError } = await signUp({
      email: email.trim(),
      password,
      ad: ad.trim(),
      davetToken: davetliMi ? davetToken : undefined,
    });
    setLoading(false);
    if (signUpError) {
      setError(kayitHatasiniCevir(signUpError, davetliMi));
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
          {davetliMi && (
            <Text style={styles.ipucu}>
              Davet bağlantınız kullanıldı; tek kullanımlıktır ve aynı bağlantıyla ikinci bir hesap açılamaz.
            </Text>
          )}
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
          <Text style={styles.subtitle}>
            {davetliMi ? 'Kulübünüzün gönderdiği davet bağlantısıyla hesabını oluştur.' : 'Veli hesabını oluştur.'}
          </Text>

          {/* Kulüp ADI bilinçli olarak gösterilmiyor: davet tablosu oturumsuz
              istemciye kapalı (0022 bölüm 3) ve çözümleyici fonksiyon PostgREST'e
              açılmıyor. Adı gösterebilmek için yalnızca kulüp adını döndüren dar
              bir RPC gerekir (0022 bölüm 8, madde U4) — o gelene kadar nötr metin. */}
          {davetliMi && (
            <View style={styles.davetBox}>
              <Text style={styles.davetBaslik}>Davetiye ile kayıt oluyorsunuz</Text>
              <Text style={styles.davetMetin}>
                Kulübünüz ve uygulamadaki rolünüz davet bağlantısından gelir, burada seçmenize gerek yok. Davet size
                özel bir e-posta adresine çıkarıldıysa kaydı o adresle tamamlamalısınız.
              </Text>
            </View>
          )}

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

          {/* Davetsiz kayıt YASAK DEĞİL: sistemde tek kulüp varsa sunucu bunu
              'veli' olarak kabul eder (0022 dal b). Bu yüzden form kapatılmıyor,
              yalnızca hatırlatma yapılıyor; birden fazla kulüp varsa sunucu
              reddedecek ve aşağıdaki çeviri devreye girecek. */}
          {!davetliMi && (
            <Text style={styles.ipucu}>Kulübünüzden davet bağlantısı aldıysanız kaydınızı o bağlantıdan açın.</Text>
          )}

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

// ---------------------------------------------------------------------------
// HATA ÇEVİRİSİ
// ---------------------------------------------------------------------------
// handle_new_user içinde atılan exception kullanıcıya HAM Postgres mesajıyla
// ulaşmaz: Supabase Auth (GoTrue) tetikleyici hatalarını tek tip bir sunucu
// hatasına sarar ("Database error saving new user" gibi). Yani "davet linki
// gerekli" bilgisini mesajın içeriğinden okumaya çalışmak kırılgan olurdu.
// Bu yüzden önce TANINAN auth hataları elenir, geri kalan her şey kayıt
// tetikleyicisinden gelmiş sayılır ve metin DAVETİN VARLIĞINA göre seçilir —
// kullanıcı için asıl ayrım zaten bu.
function kayitHatasiniCevir(ham: string, davetliMi: boolean): string {
  const m = ham.toLowerCase();

  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) {
    return 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı ya da şifrenizi sıfırlamayı deneyin.';
  }
  if (m.includes('invalid email') || m.includes('unable to validate email')) {
    return 'E-posta adresi geçersiz görünüyor. Adresi kontrol edip tekrar deneyin.';
  }
  if (m.includes('password')) {
    return 'Şifre kabul edilmedi. En az 6 karakterli, biraz daha güçlü bir şifre deneyin.';
  }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('over_email_send_rate')) {
    return 'Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.';
  }
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('timeout')) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }

  // Buraya düşen hata pratikte kayıt tetikleyicisinden gelir.
  if (davetliMi) {
    return 'Davet bağlantısı kabul edilmedi. Bağlantının süresi dolmuş, daha önce kullanılmış ya da başka bir e-posta adresine düzenlenmiş olabilir. Kulüp yöneticinizden yeni bir davet bağlantısı isteyin.';
  }
  return 'Kayıt olabilmek için kulübünüzden davet bağlantısı almanız gerekiyor. Kulüp yöneticinize başvurun; size gönderilecek bağlantıyı açtığınızda kaydınızı buradan tamamlayabilirsiniz.';
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
    successWrap: { flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
    title: { fontFamily: fontFamily.archivoBold, fontSize: 32, color: colors.textBright, letterSpacing: -0.5 },
    subtitle: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    davetBox: {
      borderRadius: radius.lg,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: spacing.md,
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    davetBaslik: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accent },
    davetMetin: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
    ipucu: {
      marginTop: spacing.md,
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.sm,
      color: colors.textDim,
      textAlign: 'center',
      lineHeight: 18,
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
