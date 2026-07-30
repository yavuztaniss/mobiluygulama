import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY tanımlı değil. .env dosyasını kontrol et.'
  );
}

// ===========================================================================
// OTURUM DEPOSU — cihazın güvenli alanı (Keychain / Keystore)
// ===========================================================================
// Oturum belirteci daha önce doğrudan AsyncStorage'a yazılıyordu. AsyncStorage
// DÜZ METİNDİR: iOS'ta uygulama kumbarasındaki bir dosya, Android'de bir SQLite
// kaydı. Uygulama kumbarası normal bir cihazda başka uygulamalardan korunur, ama
// root'lanmış/jailbreak'li cihazda ve şifrelenmemiş yedeklerde okunabilir — ve
// bu belirteçle kulübün tüm verisine kullanıcının yetkisiyle erişilir.
// expo-secure-store hem bağımlılık hem eklenti olarak zaten kuruluydu, hiç
// kullanılmıyordu; iOS'ta Keychain'e, Android'de EncryptedSharedPreferences'a yazar.
//
// 2048 BAYT SINIRI — bu dosyadaki asıl incelik.
//   SecureStore tek bir değerde ~2048 bayttan fazlasını saklayamaz (iOS'ta uyarı,
//   Android'de hata). Supabase oturumu access token + refresh token + kullanıcı
//   nesnesini birlikte tuttuğu için tipik olarak 2–4 KB'dır, yani DOĞRUDAN
//   yazılamaz. Bu yüzden değer parçalara bölünüp her parça ayrı anahtarla
//   saklanıyor; parça sayısı da ayrı bir anahtarda tutuluyor.
//
// GERİYE DÖNÜK ETKİ: bu değişiklikten sonra ilk açılışta eski AsyncStorage
// oturumu okunmaz ve kullanıcı BİR KEZ yeniden giriş yapar. Bilinçli — eski
// belirteci güvenli alana taşımak, onu tekrar düz metin olarak okumayı
// gerektirirdi.
const PARCA_BOYU = 1800; // 2048'in altında güvenli pay
const sayacAnahtari = (anahtar: string) => `${anahtar}__parca`;

const guvenliDepo = {
  async getItem(anahtar: string): Promise<string | null> {
    const sayiMetni = await SecureStore.getItemAsync(sayacAnahtari(anahtar));
    if (sayiMetni === null) return null;

    const sayi = parseInt(sayiMetni, 10);
    if (!Number.isFinite(sayi) || sayi <= 0) return null;

    const parcalar: string[] = [];
    for (let i = 0; i < sayi; i += 1) {
      const p = await SecureStore.getItemAsync(`${anahtar}__${i}`);
      // Eksik parça = bozuk kayıt. Yarım bir oturum JSON'u parse hatası verip
      // uygulamayı açılışta kilitlerdi; null dönmek "oturum yok" demektir ve
      // kullanıcı giriş ekranına düşer.
      if (p === null) return null;
      parcalar.push(p);
    }
    return parcalar.join('');
  },

  async setItem(anahtar: string, deger: string): Promise<void> {
    // Önce eskiyi temizle: yeni değer daha az parçaya sığarsa artakalan eski
    // parçalar ortada kalır ve bir sonraki okumada karışırdı.
    await guvenliDepo.removeItem(anahtar);

    const parcalar: string[] = [];
    for (let i = 0; i < deger.length; i += PARCA_BOYU) {
      parcalar.push(deger.slice(i, i + PARCA_BOYU));
    }
    for (let i = 0; i < parcalar.length; i += 1) {
      await SecureStore.setItemAsync(`${anahtar}__${i}`, parcalar[i]);
    }
    // Sayaç EN SON yazılıyor: yazma yarıda kesilirse sayaç hiç oluşmaz ve
    // getItem null döner (yarım oturumla açılmaktansa giriş ekranı).
    await SecureStore.setItemAsync(sayacAnahtari(anahtar), String(parcalar.length));
  },

  async removeItem(anahtar: string): Promise<void> {
    const sayiMetni = await SecureStore.getItemAsync(sayacAnahtari(anahtar));
    await SecureStore.deleteItemAsync(sayacAnahtari(anahtar));
    const sayi = sayiMetni ? parseInt(sayiMetni, 10) : 0;
    for (let i = 0; i < (Number.isFinite(sayi) ? sayi : 0); i += 1) {
      await SecureStore.deleteItemAsync(`${anahtar}__${i}`);
    }
  },
};

// Web'de SecureStore YOKTUR (Keychain/Keystore tarayıcıda karşılığı olmayan
// platform API'leri). `expo start --web` ile yapılan geliştirme ve testler
// kırılmasın diye web'de AsyncStorage'a düşülüyor; üretimde uygulama yalnızca
// iOS/Android'de çalıştığı için güvenli yol her zaman devrede.
const oturumDeposu = Platform.OS === 'web' ? AsyncStorage : guvenliDepo;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: oturumDeposu,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ===========================================================================
// OTOMATİK YENİLEMEYİ UYGULAMA DURUMUNA BAĞLA
// ===========================================================================
// autoRefreshToken: true tek başına YETMEZ. Supabase yenilemeyi bir zamanlayıcı
// ile yapar; uygulama arka plana alındığında işletim sistemi zamanlayıcıları
// dondurur. Uygulama bir süre arka planda kalıp öne döndüğünde belirtecin süresi
// çoktan dolmuş olur ve bir sonraki isteğe kadar yenileme tetiklenmez.
//
// KULLANICININ GÖRDÜĞÜ: "ekranlar boş geliyor", "sürekli çıkış yapıyor",
// "sabah açınca hiçbir şey yüklenmiyor". Sebebi ekranlarda aranır, oysa sorun
// oturumdadır. Expo Go'da hızlı denemede HİÇ görünmez — uygulama arka planda
// yeterince uzun kalmadığı için.
//
// Çözüm Supabase'in React Native için önerdiği desen: öne gelince yenilemeyi
// başlat, arka plana geçince durdur (gereksiz ağ trafiğini de keser).
// Dinleyici modül düzeyinde bir kez kuruluyor; kaldırılmasına gerek yok, ömrü
// uygulamanın ömrüyle aynı.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (durum) => {
    if (durum === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
