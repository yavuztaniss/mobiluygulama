import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAsgariSurum } from '../data/surumRepo';

// ===========================================================================
// ZORUNLU GÜNCELLEME KAPISI
// ===========================================================================
// Şema değiştiren bir migration sonrası, güncellemeyi almamış telefonlar eski
// sorguları atmaya devam eder ve ekranlar SESSİZCE boş açılır. Bu kapı o
// durumda kullanıcıya ne olduğunu söyleyip mağazaya yönlendirir.
//
// FAIL-OPEN — bu dosyadaki en önemli karar.
//   Kontrol herhangi bir sebeple yapılamazsa (ağ yok, sunucu erişilemez, tablo
//   henüz yok) uygulama AÇILIR. Ters tasarım felaket olurdu: Supabase'de
//   yaşanacak beş dakikalık bir kesinti, güncel sürümdeki herkesi de
//   "güncelleyin" ekranında kilitlerdi. Kapı bir güvenlik sınırı değil, bir
//   kullanıcı deneyimi önlemi; şüphede kalırsa geçirmeli.
//
// Kontrol OTURUMDAN BAĞIMSIZ: tablo anon'a açık (0030). Oturumu bozulmuş bir
// kullanıcı da kapıyı görebilmeli.
// ===========================================================================

// Semver karşılaştırması. Düz metin karşılaştırması ('1.10.0' < '1.9.0' der)
// bu iş için YANLIŞ sonuç verir; parçalar sayı olarak karşılaştırılmalı.
// Eksik parçalar 0 sayılır ('1.2' = '1.2.0'), sayıya çevrilemeyen parça da 0 —
// bozuk bir sürüm metni yüzünden kullanıcıyı kilitlemek istemiyoruz.
function surumKucukMu(mevcut: string, asgari: string): boolean {
  const parcala = (s: string) => s.trim().split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });

  const a = parcala(mevcut);
  const b = parcala(asgari);
  const uzunluk = Math.max(a.length, b.length);

  for (let i = 0; i < uzunluk; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

type Durum = { engelli: false } | { engelli: true; mesaj: string; url: string | null };

export function SurumKapisi({ children }: { children: React.ReactNode }) {
  const [durum, setDurum] = useState<Durum>({ engelli: false });

  useEffect(() => {
    let gecerli = true;

    (async () => {
      const kural = await getAsgariSurum();
      if (!gecerli || !kural) return; // fail-open

      const mevcut = Constants.expoConfig?.version;
      if (!mevcut) return; // sürüm okunamadıysa engelleme

      if (surumKucukMu(mevcut, kural.asgariSurum)) {
        setDurum({
          engelli: true,
          mesaj: kural.mesaj || 'Uygulamanın yeni bir sürümü var. Devam etmek için güncelleyin.',
          url: Platform.OS === 'ios' ? kural.iosUrl : kural.androidUrl,
        });
      }
    })();

    return () => {
      gecerli = false;
    };
  }, []);

  if (!durum.engelli) return <>{children}</>;

  return (
    <SafeAreaView style={styles.kok}>
      <View style={styles.icerik}>
        <View style={styles.rozet}>
          <Text style={styles.rozetMetin}>↑</Text>
        </View>
        <Text style={styles.baslik}>Güncelleme gerekli</Text>
        <Text style={styles.metin}>{durum.mesaj}</Text>

        {/* Mağaza adresi girilmemişse düğme çizilmiyor: çalışmayan bir düğme,
            hiç düğme olmamasından kötü. Kullanıcı mağazadan elle arayabilir. */}
        {durum.url && (
          <Pressable style={styles.buton} onPress={() => Linking.openURL(durum.url!)}>
            <Text style={styles.butonMetin}>Mağazada Aç</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// Tema kullanılmıyor: bu ekran uygulamanın geri kalanı yüklenmeden de
// çizilebilmeli (HataEkrani ile aynı gerekçe).
const styles = StyleSheet.create({
  kok: { flex: 1, backgroundColor: '#101418' },
  icerik: { flex: 1, justifyContent: 'center', padding: 28, gap: 14 },
  rozet: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1c2a22',
    borderWidth: 1,
    borderColor: '#2f5c40',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  rozetMetin: { color: '#7fd8a0', fontSize: 26, fontWeight: '700', lineHeight: 32 },
  baslik: { color: '#f2f4f7', fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  metin: { color: '#9aa4b2', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  buton: { marginTop: 6, backgroundColor: '#ff6a3d', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  butonMetin: { color: '#ffffff', fontSize: 15, fontWeight: '700', lineHeight: 20 },
});
