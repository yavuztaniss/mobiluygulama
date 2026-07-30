import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal } from './AppModal';
import {
  SIKAYET_SEBEPLERI,
  engelle,
  engeliKaldir,
  engelliMi,
  sikayetGonder,
  type SikayetSebebi,
} from '../data/moderasyonRepo';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../theme';

// ===========================================================================
// SOHBET MODERASYONU — App Store Guideline 1.2
// ===========================================================================
// Apple, kullanıcı üretimi içerik barındıran uygulamalarda ŞİKÂYET ETME ve
// KULLANICI ENGELLEME imkânını zorunlu tutuyor. Bu uygulamada veli ↔ antrenör
// serbest yazışması var ve konu çocuklar; incelemede özellikle bakılan yer.
//
// Sohbet başlığındaki "⋯" düğmesinden açılıyor: her sohbet ekranında, konuştuğu
// kişi bağlamındayken. Ayarlar altına gömülseydi kullanıcı rahatsız edildiği
// anda bulamazdı — ki bu özelliğin tek kullanıldığı an odur.
// ===========================================================================

type Panel = null | 'menu' | 'sikayet';

export function SohbetModerasyon({
  hedefId,
  hedefAd,
  konusmaId,
  onDegisim,
}: {
  hedefId: string | null;
  hedefAd: string;
  konusmaId: string | null;
  /** Engel durumu değişince sohbet ekranı yazma alanını güncelleyebilsin. */
  onDegisim?: (engelli: boolean) => void;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  const [panel, setPanel] = useState<Panel>(null);
  const [engelli, setEngelli] = useState(false);
  const [isliyor, setIsliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const [sebep, setSebep] = useState<SikayetSebebi>('uygunsuz_icerik');
  const [aciklama, setAciklama] = useState('');
  const [gonderildi, setGonderildi] = useState(false);

  const durumOku = useCallback(async () => {
    if (!hedefId) return;
    try {
      const v = await engelliMi(hedefId);
      setEngelli(v);
      onDegisim?.(v);
    } catch {
      // Durum okunamadıysa menü yine açılır; "Engelle" varsayılanı gösterilir.
      // Yanlış tarafta hata vermek yerine işlem anında gerçek sonuç alınır.
    }
  }, [hedefId, onDegisim]);

  useEffect(() => {
    durumOku();
  }, [durumOku]);

  async function engelDegistir() {
    if (!hedefId) return;
    setHata(null);
    setIsliyor(true);
    try {
      if (engelli) await engeliKaldir(hedefId);
      else await engelle(hedefId);
      const yeni = !engelli;
      setEngelli(yeni);
      onDegisim?.(yeni);
      setPanel(null);
    } catch {
      setHata('İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setIsliyor(false);
    }
  }

  async function sikayetiGonder() {
    setHata(null);
    setIsliyor(true);
    try {
      await sikayetGonder({ hedefId, konusmaId, sebep, aciklama });
      setGonderildi(true);
    } catch {
      setHata('Şikâyet gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setIsliyor(false);
    }
  }

  function kapat() {
    if (isliyor) return;
    setPanel(null);
    setHata(null);
    setGonderildi(false);
    setAciklama('');
  }

  return (
    <>
      <Pressable hitSlop={12} onPress={() => setPanel('menu')} accessibilityLabel="Sohbet seçenekleri">
        <Text style={styles.nokta}>⋯</Text>
      </Pressable>

      <AppModal visible={panel !== null} transparent animationType="fade" onRequestClose={kapat}>
        <Pressable style={styles.arkaplan} onPress={kapat}>
          <Pressable style={styles.kutu} onPress={(e) => e.stopPropagation()}>
            {panel === 'menu' && (
              <>
                <Text style={styles.baslik}>{hedefAd}</Text>

                <Pressable style={styles.satir} onPress={() => setPanel('sikayet')} disabled={isliyor}>
                  <Text style={styles.satirMetin}>Şikâyet Et</Text>
                  <Text style={styles.satirAlt}>Uygunsuz içerik veya davranışı kulüp yöneticisine bildir</Text>
                </Pressable>

                <Pressable style={styles.satir} onPress={engelDegistir} disabled={isliyor || !hedefId}>
                  <Text style={[styles.satirMetin, !engelli && styles.tehlike]}>
                    {engelli ? 'Engeli Kaldır' : 'Engelle'}
                  </Text>
                  <Text style={styles.satirAlt}>
                    {engelli
                      ? 'Yeniden mesajlaşabilirsiniz.'
                      : 'Karşılıklı mesajlaşma durur. Geçmiş mesajlar silinmez, istediğiniz zaman geri alabilirsiniz.'}
                  </Text>
                </Pressable>

                {hata && <Text style={styles.hata}>{hata}</Text>}

                <Pressable hitSlop={8} onPress={kapat} disabled={isliyor}>
                  <Text style={styles.vazgec}>Kapat</Text>
                </Pressable>
              </>
            )}

            {panel === 'sikayet' && !gonderildi && (
              <>
                <Text style={styles.baslik}>Şikâyet Et</Text>
                <Text style={styles.aciklamaMetin}>
                  Şikâyetiniz kulüp yöneticinize iletilir. Yönetici sohbeti inceleyebilir ve gerekirse ilgili
                  kişinin erişimini kaldırabilir.
                </Text>

                <Text style={styles.etiket}>SEBEP</Text>
                <ScrollView style={{ maxHeight: 210 }}>
                  {SIKAYET_SEBEPLERI.map((s) => (
                    <Pressable
                      key={s.deger}
                      style={[styles.secenek, sebep === s.deger && styles.secenekAktif]}
                      onPress={() => setSebep(s.deger)}
                    >
                      <Text style={[styles.secenekMetin, sebep === s.deger && styles.secenekMetinAktif]}>
                        {s.etiket}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.etiket}>AÇIKLAMA (İSTEĞE BAĞLI)</Text>
                <TextInput
                  value={aciklama}
                  onChangeText={setAciklama}
                  multiline
                  editable={!isliyor}
                  placeholder="Ne olduğunu kısaca anlatın…"
                  placeholderTextColor={colors.textDim}
                  style={styles.girdi}
                />

                {hata && <Text style={styles.hata}>{hata}</Text>}

                <Pressable style={[styles.gonderBtn, isliyor && { opacity: 0.5 }]} onPress={sikayetiGonder} disabled={isliyor}>
                  <Text style={styles.gonderMetin}>{isliyor ? 'Gönderiliyor…' : 'Şikâyeti Gönder'}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setPanel('menu')} disabled={isliyor}>
                  <Text style={styles.vazgec}>Geri</Text>
                </Pressable>
              </>
            )}

            {panel === 'sikayet' && gonderildi && (
              <>
                <Text style={styles.baslik}>Şikâyetiniz iletildi</Text>
                <Text style={styles.aciklamaMetin}>
                  Kulüp yöneticiniz şikâyetinizi görecek. İsterseniz bu kişiyi ayrıca engelleyebilirsiniz.
                </Text>
                {!engelli && (
                  <Pressable style={styles.satir} onPress={engelDegistir} disabled={isliyor}>
                    <Text style={[styles.satirMetin, styles.tehlike]}>Bu kişiyi de engelle</Text>
                  </Pressable>
                )}
                <Pressable hitSlop={8} onPress={kapat}>
                  <Text style={styles.vazgec}>Kapat</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </AppModal>
    </>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    nokta: { fontSize: 22, color: colors.textMuted, paddingHorizontal: 4, lineHeight: 26 },
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
    aciklamaMetin: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.sm,
      lineHeight: lineHeightFor(fontSize.sm),
      color: colors.textMuted,
    },
    satir: {
      backgroundColor: colors.panel,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 3,
    },
    satirMetin: {
      fontFamily: fontFamily.manropeBold,
      fontSize: fontSize.base,
      lineHeight: lineHeightFor(fontSize.base),
      color: colors.textBright,
    },
    tehlike: { color: colors.danger },
    satirAlt: {
      fontFamily: fontFamily.manropeMedium,
      fontSize: fontSize.xs,
      lineHeight: lineHeightFor(fontSize.xs),
      color: colors.textMuted,
    },
    etiket: {
      fontFamily: fontFamily.mono,
      fontSize: fontSize.xs,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textDim,
      marginTop: spacing.xs,
    },
    secenek: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      paddingVertical: 11,
      paddingHorizontal: 14,
      marginBottom: 6,
    },
    secenekAktif: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
    secenekMetin: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.text },
    secenekMetinAktif: { color: colors.accent, fontFamily: fontFamily.manropeExtra },
    girdi: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 76,
      textAlignVertical: 'top',
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
    gonderBtn: {
      marginTop: spacing.xs,
      height: 50,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gonderMetin: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
    vazgec: {
      textAlign: 'center',
      fontFamily: fontFamily.manropeSemi,
      fontSize: fontSize.base,
      color: colors.textMuted,
      paddingVertical: spacing.xs,
    },
  });
}
