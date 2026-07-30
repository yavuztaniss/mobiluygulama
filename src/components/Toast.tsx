import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../theme';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(msg);
    timer.current = setTimeout(() => setMessage(null), 2400);
  }, []);

  return { toastMessage: message, showToast };
}

// MUTASYON ÇALIŞTIRICI — "sessizce başarısız olma" sınıfını tek noktada kapatır.
//
// SORUN: veri yazan handler'ların çoğu `await repoFonksiyonu(...)` deyip geçiyordu.
// Ağ koptuğunda ya da RLS reddettiğinde ortaya çıkan hata hiçbir yerde
// yakalanmadığı için iki şey oluyordu:
//   · SESSİZ NO-OP  — kullanıcı işlemin olduğunu sanıyor, aslında olmuyor.
//   · VERİ KAYBI    — girdi await'ten ÖNCE temizlendiği için yazdığı şey hem
//                     ekrandan siliniyor hem sunucuya ulaşmıyor.
//
// KULLANIM — sıra önemli, önce SONUCU BEKLE sonra temizle:
//   const { toastMessage, showToast } = useToast();
//   const calistir = useIslem(showToast);
//   ...
//   const oldu = await calistir(() => sendMesaj(id, metin), 'Mesaj gönderilemedi.');
//   if (oldu) setDraft('');
//
// Dönüş değeri bilinçli olarak boolean: "girdiyi temizleyeyim mi, modalı kapatayım
// mı, listeyi yenileyeyim mi" kararını çağırana bırakıyor. Hata durumunda
// kullanıcının emeği ekranda DURUYOR ve tekrar deneyebiliyor.
export function useIslem(showToast: (mesaj: string) => void) {
  return useCallback(
    async (islem: () => Promise<unknown>, hataMesaji: string): Promise<boolean> => {
      try {
        await islem();
        return true;
      } catch {
        showToast(hataMesaji);
        return false;
      }
    },
    [showToast]
  );
}

export function Toast({ message }: { message: string | null }) {
  const colors = useColors();
  const styles = createStyles(colors);
  if (!message) return null;
  return <Text style={styles.toast}>{message}</Text>;
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    toast: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: 100,
      zIndex: 90,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: radius.lg,
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
      fontFamily: fontFamily.manropeBold,
      fontSize: fontSize.base,
      lineHeight: lineHeightFor(fontSize.base),
      color: colors.textBright,
      textAlign: 'center',
      overflow: 'hidden',
    },
  });
}
