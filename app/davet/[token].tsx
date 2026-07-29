import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/Button';
import { ScreenBackground } from '../../src/components/ScreenBackground';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../src/theme';

// ===========================================================================
// DAVET LİNKİNİN GİRİŞ NOKTASI — karsiyakasporokulu://davet/<token>
// ===========================================================================
// app.json'daki `scheme: "karsiyakasporokulu"` sayesinde expo-router uygulamanın
// TÜM ekranlarını derin linke açar; ayrıca bir Linking dinleyicisi kurmaya gerek
// YOKTUR (bkz. Expo SDK 57 · Linking into your app: "If you are using Expo
// Router, you can ignore this section"). Dosya yolu doğrudan URL yolunu karşılar:
//
//   app/davet/[token].tsx   ⇢   /davet/:token
//
// Aynı ekrana düşen link biçimleri:
//   · Kurulu uygulama       karsiyakasporokulu://davet/<token>
//   · Geliştirme (Expo Go)  exp://<host>:8081/--/davet/<token>
//   · Web (expo start --web) http://localhost:8081/davet/<token>
// Linki üretirken elle string birleştirmek yerine expo-linking kullanılmalı:
//   Linking.createURL('/davet/' + token)   → aktif şemayı kendisi seçer.
//
// BU EKRAN NE YAPAR: token'ı yoldan alır ve kayıt ekranına devreder. Token'ı
// DOĞRULAMAZ — doğrulayamaz da: davet tablosu RLS gereği oturumsuz istemciye
// tamamen kapalıdır ve çözümleyici fonksiyon (private.davet_coz) PostgREST'e
// açılmayan `private` şemadadır. Token'ın geçerliliği kayıt anında sunucuda,
// handle_new_user içinde sınanır (0022_davet.sql bölüm 5-6).
// ===========================================================================
export default function DavetScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { profile, loading, signOut } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);
  const [cikisYapiliyor, setCikisYapiliyor] = useState(false);

  // Dinamik segment her zaman string gelir; yine de savunmacı davranıyoruz.
  const davetToken = typeof token === 'string' ? token.trim() : '';

  // Oturum YOKSA doğrudan kayıt ekranına taşı. `replace` bilinçli: geri tuşuyla
  // bu ara ekrana dönmenin bir anlamı yok. Oturum açma durumu çözülene kadar
  // (loading) bekleniyor — aksi halde kayıt ekranı bir an açılır, ardından
  // (auth)/_layout oturumu görüp kullanıcıyı rol köküne fırlatırdı.
  useEffect(() => {
    if (loading || profile || !davetToken) return;
    router.replace({ pathname: '/(auth)/register', params: { davet: davetToken } });
  }, [loading, profile, davetToken]);

  // Çıkış yapıldığında profile null olur ve yukarıdaki effect devreye girer;
  // burada ayrıca yönlendirme yapılmıyor (çift replace olmasın).
  async function cikisYapVeDevamEt() {
    setCikisYapiliyor(true);
    await signOut();
  }

  // --- Bozuk link -----------------------------------------------------------
  if (!davetToken) {
    return (
      <ScreenBackground>
        <View style={styles.wrap}>
          <Text style={styles.title}>Davet bağlantısı okunamadı</Text>
          <Text style={styles.text}>
            Bağlantı eksik veya bozuk görünüyor. Kulüp yöneticinizden bağlantıyı yeniden göndermesini isteyin.
          </Text>
          <Button label="Girişe Dön" variant="secondary" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </ScreenBackground>
    );
  }

  // --- Zaten oturum açık ----------------------------------------------------
  // Davet her zaman YENİ bir hesap açar; açık oturumla kayıt ekranına gidilemez
  // ((auth)/_layout oturumlu kullanıcıyı geri yollar). Kullanıcıyı sessizce
  // ana ekrana düşürmek yerine ne olduğunu anlatıp seçimi ona bırakıyoruz.
  if (!loading && profile) {
    return (
      <ScreenBackground>
        <View style={styles.wrap}>
          <Text style={styles.title}>Bir davet bağlantısı açtınız</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Şu anda <Text style={styles.infoStrong}>{profile.ad}</Text> hesabıyla giriş yapmış durumdasınız. Davet
              bağlantısı yeni bir hesap oluşturmak içindir; kullanmak için önce bu hesaptan çıkmanız gerekir.
            </Text>
          </View>
          <Button label="Çıkış Yap ve Daveti Kullan" onPress={cikisYapVeDevamEt} loading={cikisYapiliyor} />
          <Button
            label="Vazgeç"
            variant="secondary"
            disabled={cikisYapiliyor}
            onPress={() => router.replace('/')}
          />
        </View>
      </ScreenBackground>
    );
  }

  // --- Yönlendirme bekleniyor ----------------------------------------------
  return (
    <ScreenBackground>
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.text}>Davet bağlantısı açılıyor…</Text>
      </View>
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
    title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright, textAlign: 'center' },
    text: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.base,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    infoBox: {
      borderRadius: radius.lg,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: spacing.md,
    },
    infoText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
    infoStrong: { fontFamily: fontFamily.manropeExtra, color: colors.textBright },
  });
}
