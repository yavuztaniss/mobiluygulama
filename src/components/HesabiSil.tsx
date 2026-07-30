import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal } from './AppModal';
import { useAuth } from '../context/AuthContext';
import { hesabimiSil } from '../data/hesapRepo';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../theme';

// ===========================================================================
// HESABIMI SİL — App Store Guideline 5.1.1(v)
// ===========================================================================
// Apple, hesap oluşturmaya izin veren her uygulamada hesabın UYGULAMA İÇİNDEN
// silinebilmesini zorunlu tutuyor. "Bize yazın" ya da web'e yönlendirmek kabul
// edilmiyor; pasife almak da yetmiyor. İncelemede doğrudan ret sebebi.
// Aynı zamanda KVKK'daki silme hakkının karşılığı.
//
// ONAY METNİ YAZDIRILIYOR — sebebi
//   Bu işlem geri alınamaz ve yanlışlıkla yapılması kullanıcının hesabını
//   kaybetmesi demek. Tek bir "Emin misiniz?" düğmesi, yanlış dokunuşu
//   engellemek için zayıf bir eşik; kullanıcının kelimeyi yazması hem niyeti
//   doğruluyor hem de okumaya zorluyor.
//
// NE SİLİNİYOR / NE KALIYOR — kullanıcıya AÇIKÇA söyleniyor. Silme sonrası
// "ödeme geçmişim de gitti mi?" sorusuyla gelen destek talebini önlemenin tek
// yolu bunu önceden yazmak. Sunucu tarafı ayrımın gerekçesi:
// supabase/migrations/0029.
const ONAY_KELIMESI = 'SİL';

export function HesabiSil() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { signOut } = useAuth();
  const [acik, setAcik] = useState(false);
  const [onay, setOnay] = useState('');
  const [siliniyor, setSiliniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  function kapat() {
    if (siliniyor) return;
    setAcik(false);
    setOnay('');
    setHata(null);
  }

  async function sil() {
    setHata(null);
    setSiliniyor(true);
    try {
      await hesabimiSil();
      // Sunucu hesabı sildi; elimizdeki belirteç süresi dolana kadar teknik
      // olarak geçerli kalır ama hiçbir veri göremez (profil satırı yok →
      // kiracı duvarı kapalı). Yine de oturumu hemen kapatıyoruz ki uygulama
      // giriş ekranına dönsün.
      await signOut();
    } catch (e) {
      // Sunucudan gelen mesaj kullanıcıya AYNEN gösteriliyor: tek gerçek hata
      // yolu "kulübün son yöneticisisiniz" ve o mesaj ne yapılması gerektiğini
      // söylüyor. Genel bir "bir hata oluştu" metni burada işe yaramazdı.
      setHata(e instanceof Error ? e.message : 'Hesap silinemedi. Tekrar deneyin.');
      setSiliniyor(false);
    }
  }

  return (
    <>
      <Pressable hitSlop={8} onPress={() => setAcik(true)}>
        <Text style={styles.tetikleyici}>Hesabımı Sil</Text>
      </Pressable>

      <AppModal visible={acik} transparent animationType="fade" onRequestClose={kapat}>
        <Pressable style={styles.arkaplan} onPress={kapat}>
          <Pressable style={styles.kutu} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.baslik}>Hesabınızı silmek üzeresiniz</Text>

            <Text style={styles.metin}>Bu işlem geri alınamaz.</Text>

            <View style={styles.liste}>
              <Text style={styles.listeBaslik}>SİLİNECEKLER</Text>
              <Text style={styles.listeSatir}>• Giriş bilgileriniz ve profiliniz</Text>
              <Text style={styles.listeSatir}>• Mesajlarınız ve sohbet geçmişiniz</Text>
              <Text style={styles.listeSatir}>• Bildirim gönderilen cihaz kayıtlarınız</Text>
              <Text style={styles.listeSatir}>• Sporcuyla olan veli bağınız</Text>
            </View>

            <View style={styles.liste}>
              <Text style={styles.listeBaslik}>KULÜPTE KALACAKLAR</Text>
              <Text style={styles.listeSatir}>• Sporcunun kulüp kaydı ve yoklamaları</Text>
              <Text style={styles.listeSatir}>• Ödeme kayıtları (yasal saklama)</Text>
              <Text style={styles.listeAciklama}>
                Bunlar kulübün kendi kayıtlarıdır; sizinle bağlantısı kaldırılır.
              </Text>
            </View>

            <Text style={styles.onayEtiket}>
              Onaylamak için <Text style={styles.onayKelime}>{ONAY_KELIMESI}</Text> yazın
            </Text>
            <TextInput
              value={onay}
              onChangeText={setOnay}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!siliniyor}
              style={styles.girdi}
              placeholderTextColor={colors.textDim}
              placeholder={ONAY_KELIMESI}
            />

            {hata && <Text style={styles.hata}>{hata}</Text>}

            <Pressable
              style={[styles.silBtn, (onay.trim().toLocaleUpperCase('tr-TR') !== ONAY_KELIMESI || siliniyor) && styles.silBtnPasif]}
              disabled={onay.trim().toLocaleUpperCase('tr-TR') !== ONAY_KELIMESI || siliniyor}
              onPress={sil}
            >
              <Text style={styles.silBtnMetin}>{siliniyor ? 'Siliniyor…' : 'Hesabımı Kalıcı Olarak Sil'}</Text>
            </Pressable>

            <Pressable hitSlop={8} onPress={kapat} disabled={siliniyor}>
              <Text style={styles.vazgec}>Vazgeç</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    tetikleyici: {
      textAlign: 'center',
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.sm,
      lineHeight: lineHeightFor(fontSize.sm),
      color: colors.danger,
      marginTop: spacing.sm,
    },
    arkaplan: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.lg },
    kutu: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    baslik: {
      fontFamily: fontFamily.archivoBold,
      fontSize: fontSize.lg,
      lineHeight: lineHeightFor(fontSize.lg),
      color: colors.textBright,
    },
    metin: {
      fontFamily: fontFamily.manropeBold,
      fontSize: fontSize.base,
      lineHeight: lineHeightFor(fontSize.base),
      color: colors.danger,
    },
    liste: {
      backgroundColor: colors.panel,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 3,
    },
    listeBaslik: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textDim,
      marginBottom: 4,
    },
    listeSatir: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.sm,
      lineHeight: lineHeightFor(fontSize.sm),
      color: colors.text,
    },
    listeAciklama: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.xs,
      lineHeight: lineHeightFor(fontSize.xs),
      color: colors.textMuted,
      marginTop: 4,
    },
    onayEtiket: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.sm,
      lineHeight: lineHeightFor(fontSize.sm),
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    onayKelime: { fontFamily: fontFamily.manropeExtra, color: colors.textBright },
    girdi: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      color: colors.textBright,
      fontSize: fontSize.base,
      fontFamily: fontFamily.manropeSemi,
    },
    hata: {
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.sm,
      lineHeight: lineHeightFor(fontSize.sm),
      color: colors.danger,
    },
    silBtn: {
      marginTop: spacing.xs,
      height: 50,
      borderRadius: radius.lg,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    silBtnPasif: { opacity: 0.4 },
    silBtnMetin: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: '#FFFFFF' },
    vazgec: {
      textAlign: 'center',
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.base,
      color: colors.textMuted,
      paddingVertical: spacing.xs,
    },
  });
}
