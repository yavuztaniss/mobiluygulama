import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useColors } from '../../src/theme';

export default function YoneticiLayout() {
  const { profile, loading } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgDeep }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // FAIL-CLOSED — profil DOĞRULANMADAN bu ağaca girilmiyor.
  //
  // Eski hâli fail-OPEN idi. AuthContext.loadProfile hata durumunda profile
  // alanını null bırakıyor (yalnızca hata YOKSA setProfile çağrılıyor). O
  // durumda oturum VAR ama profil YOK oluyor ve eski iki koşul da tutmuyordu:
  //   · "!session && !profile"  → oturum var, tutmaz
  //   · "profile && role !== x" → profil null, tutmaz
  // Sonuç: ekran ÇİZİLİYORDU. Veri RLS yüzünden yine gelmezdi ama kullanıcı
  // ait olmadığı rolün arayüzünde boş ekranlarla kalıyor, asıl sebep
  // (kulüp askıda / erişim kaldırılmış / ağ hatası) hiç söylenmiyordu.
  //
  // KOŞUL SESSION DEĞİL PROFILE ÜZERİNDEN: __DEV__ rol kısayolu (devSignInAs)
  // oturum AÇMADAN profil kuruyor; session şartı o akışı kırardı. Üretimde
  // profil zaten yalnızca geçerli bir oturumdan yüklenir.
  //
  // Profil yoksa köke gönderiliyor: app/index.tsx profilsiz kullanıcıyı
  // girişe atıyor, (auth)/_layout da profilsizken login ekranını çiziyor —
  // yönlendirme döngüsü oluşmuyor.
  if (!profile) return <Redirect href="/" />;
  if (profile.role !== 'yonetici') return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
