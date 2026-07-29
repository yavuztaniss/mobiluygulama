import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useColors, fontFamily, fontSize, spacing } from '../src/theme';

export default function Index() {
  const { profile, loading, signOut } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgDeep }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!profile) return <Redirect href="/(auth)/login" />;

  if (profile.role === 'yonetici') return <Redirect href="/(yonetici)" />;
  if (profile.role === 'veli') return <Redirect href="/(veli)" />;
  if (profile.role === 'antrenor') return <Redirect href="/(antrenor)" />;

  // muhasebeci (veya ileride eklenecek başka bir rol) — mobil arayüzü yok,
  // web yönetim paneline yönlendirilir; antrenör arayüzüne düşürmek yanlıştı.
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgDeep, padding: spacing.xl, gap: spacing.md }}>
      <Text style={{ fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, textAlign: 'center' }}>
        Bu hesap mobil uygulamayı kullanmıyor
      </Text>
      <Text style={{ fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center' }}>
        Muhasebe hesapları yalnızca web yönetim panelinde çalışır. Lütfen bilgisayardan yönetim paneline giriş yapın.
      </Text>
      <Pressable
        onPress={signOut}
        style={{ marginTop: spacing.md, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
      >
        <Text style={{ fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright }}>Çıkış Yap</Text>
      </Pressable>
    </View>
  );
}
