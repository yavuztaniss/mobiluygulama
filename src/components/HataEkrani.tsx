import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ErrorBoundaryProps } from 'expo-router';

// ===========================================================================
// ÇÖKME EKRANI — expo-router'ın ErrorBoundary sözleşmesi
// ===========================================================================
// Bir ekran render sırasında hata atarsa expo-router bu bileşeni çizer.
// Daha önce hiç ErrorBoundary yoktu; tek bir render hatası uygulamayı native
// çökme ekranına (üretim derlemesinde beyaz ekran) düşürüyor ve kullanıcı orada
// sıkışıyordu — uygulamayı kapatıp açmaktan başka çıkış yolu kalmıyordu.
//
// TEMA KULLANILMIYOR — BİLİNÇLİ. Bu ekran, tema/context sağlayıcılarının kendisi
// çöktüğünde de çizilebilmek zorunda. useColors() çağırsaydı hata ekranının
// kendisi hata atabilir ve kullanıcı hiçbir şey göremezdi. Bu yüzden renkler
// sabit ve karanlık moda da uyan nötr tonlarda.
//
// HATA METNİ GÖSTERİLİYOR ama küçük ve ikincil: kullanıcı okumasa da destek
// istediğinde ekran görüntüsüyle gönderebilsin. Hata izleme servisi (Sentry)
// bağlandığında bu bileşen aynı zamanda raporlamanın da yeri olacak.
export function HataEkrani({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.kok}>
      <ScrollView contentContainerStyle={styles.icerik}>
        <View style={styles.rozet}>
          <Text style={styles.rozetMetin}>!</Text>
        </View>

        <Text style={styles.baslik}>Bir şeyler ters gitti</Text>
        <Text style={styles.aciklama}>
          Bu ekran açılırken beklenmeyen bir hata oluştu. Tekrar denemek çoğu zaman yeterli olur; sorun
          sürerse uygulamayı kapatıp yeniden açın.
        </Text>

        <Pressable style={styles.buton} onPress={retry} hitSlop={8}>
          <Text style={styles.butonMetin}>Tekrar Dene</Text>
        </Pressable>

        <View style={styles.detayKutu}>
          <Text style={styles.detayBaslik}>Teknik ayrıntı</Text>
          <Text style={styles.detayMetin} selectable>
            {error?.message || 'Bilinmeyen hata'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1, backgroundColor: '#101418' },
  icerik: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14 },
  rozet: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2a1d1d',
    borderWidth: 1,
    borderColor: '#5c2f2c',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  rozetMetin: { color: '#e88a80', fontSize: 26, fontWeight: '700', lineHeight: 32 },
  baslik: { color: '#f2f4f7', fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  aciklama: { color: '#9aa4b2', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  buton: {
    marginTop: 6,
    backgroundColor: '#ff6a3d',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  butonMetin: { color: '#ffffff', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  detayKutu: {
    marginTop: 10,
    backgroundColor: '#171c22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#272e37',
    padding: 14,
    gap: 6,
  },
  detayBaslik: { color: '#6f7a88', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  detayMetin: { color: '#8b95a3', fontSize: 12, lineHeight: 18 },
});
