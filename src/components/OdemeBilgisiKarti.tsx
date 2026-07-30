import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useKurum } from '../context/KurumContext';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../theme';

// ===========================================================================
// ÖDEME BİLGİSİ — "parayı nereye yatıracağım?"
// ===========================================================================
// Uygulama veliyi banka havalesiyle ödemeye yönlendiriyor ama IBAN'ı hiçbir
// yerde yazmıyordu; veli kulübü aramak ya da ödemeyi ertelemek zorunda
// kalıyordu. Kulübün tahsilatını doğrudan yavaşlatan, tamamen sessiz bir eksikti.
//
// IBAN kopyalanabilir olmak ZORUNDA: 26 karakteri bankacılık uygulamasına elle
// yazmak hem zahmetli hem de hata kaynağı — yanlış yazılan bir IBAN paranın
// başka bir hesaba gitmesi demek.
//
// Bilgi girilmemişse kart HİÇ ÇİZİLMİYOR (null döner) ve ekran "kulübünüzle
// iletişime geçin" diyen mevcut metniyle kalıyor. Boş bir IBAN kutusu
// göstermek, hiç göstermemekten kötü olurdu.
export function OdemeBilgisiKarti() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { iban, ibanSahibi, odemeAciklamasi } = useKurum();

  if (!iban) return null;

  // Veritabanında boşluksuz saklanıyor; okunurluk için dörtlü gruplanıyor.
  const gosterilen = iban.replace(/(.{4})/g, '$1 ').trim();

  async function kopyala() {
    // Panoya BOŞLUKSUZ hali yazılıyor: bankacılık uygulamalarının bir kısmı
    // boşluklu yapıştırmayı reddediyor.
    await Clipboard.setStringAsync(iban ?? '');
  }

  return (
    <View style={styles.kart}>
      <Text style={styles.baslik}>ÖDEME BİLGİSİ</Text>

      <Text style={styles.etiket}>IBAN</Text>
      <View style={styles.ibanSatir}>
        <Text style={styles.iban} selectable numberOfLines={2}>
          {gosterilen}
        </Text>
        <Pressable hitSlop={10} style={styles.kopyalaBtn} onPress={kopyala}>
          <Text style={styles.kopyalaMetin}>Kopyala</Text>
        </Pressable>
      </View>

      {ibanSahibi && (
        <>
          <Text style={[styles.etiket, { marginTop: spacing.sm }]}>HESAP SAHİBİ</Text>
          <Text style={styles.deger}>{ibanSahibi}</Text>
        </>
      )}

      {odemeAciklamasi && <Text style={styles.not}>{odemeAciklamasi}</Text>}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    kart: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    baslik: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: '800',
      letterSpacing: 1.5,
      color: colors.textDim,
      marginBottom: spacing.sm,
    },
    etiket: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.xs,
      letterSpacing: 0.6,
      color: colors.textDim,
      marginBottom: 3,
    },
    ibanSatir: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    iban: {
      flex: 1,
      minWidth: 0,
      fontFamily: fontFamily.mono,
      fontSize: fontSize.base,
      lineHeight: lineHeightFor(fontSize.base),
      color: colors.textBright,
    },
    kopyalaBtn: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      backgroundColor: colors.accentSoft,
    },
    kopyalaMetin: {
      fontFamily: fontFamily.manropeBold,
      fontSize: fontSize.sm,
      color: colors.accent,
    },
    deger: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.base,
      lineHeight: lineHeightFor(fontSize.base),
      color: colors.text,
    },
    not: {
      marginTop: spacing.sm,
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.sm,
      lineHeight: lineHeightFor(fontSize.sm),
      color: colors.textMuted,
    },
  });
}
