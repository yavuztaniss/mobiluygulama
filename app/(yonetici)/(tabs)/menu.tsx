import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { ThemePreferencePicker } from '../../../src/components/ThemePreferencePicker';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../../src/theme';

const MENU_ITEMS: { label: string; href: string }[] = [
  { label: 'Duyurular', href: '/duyuru-gonder' },
  { label: 'Kurum Branşları', href: '/kurum-branslari' },
  { label: 'Mağaza Yönetimi', href: '/magaza' },
  { label: 'Servis Rotaları', href: '/servis' },
  { label: 'Etkinlik Oluştur', href: '/etkinlik-olustur' },
  { label: 'Başvurular', href: '/basvurular' },
  { label: 'Antrenör Kadrosu & Hakediş', href: '/antrenor-kadrosu' },
];

export default function MenuScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile, signOut, devSignInAs } = useAuth();
  const { toastMessage, showToast } = useToast();
  const [gecisYapiliyor, setGecisYapiliyor] = useState(false);

  function onRolAntrenor() {
    setGecisYapiliyor(true);
    showToast('Antrenör arayüzüne geçiliyor…');
    setTimeout(() => {
      devSignInAs('antrenor');
      router.replace('/(antrenor)/(tabs)');
    }, 500);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Menü</Text>
          <Card style={styles.profileCard}>
            <Text style={styles.profileName}>{profile?.ad || 'Yönetici'}</Text>
            <Text style={styles.profileRole}>Yönetici · Karşıyaka Spor Okulu</Text>

            {__DEV__ && (
              <>
                <View style={styles.rolDivider} />
                <View style={styles.rolHeaderRow}>
                  <Text style={styles.rolLabel}>HESAP DEĞİŞTİR (DEV)</Text>
                  <Text style={styles.rolCount}>test amaçlı</Text>
                </View>
                <View style={styles.rolRow}>
                  <View style={[styles.rolCard, styles.rolCardActive]}>
                    <Text style={styles.rolCardTitle}>Yönetici</Text>
                    <Text style={styles.rolCardSubActive}>Aktif oturum</Text>
                  </View>
                  <Pressable style={styles.rolCard} onPress={onRolAntrenor} disabled={gecisYapiliyor}>
                    <Text style={styles.rolCardTitleMuted}>Antrenör</Text>
                    <Text style={styles.rolCardSub}>{gecisYapiliyor ? 'Geçiliyor…' : 'Geçiş yap'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Card>

          <Text style={styles.sectionLabel}>GÖRÜNÜM</Text>
          <Card>
            <ThemePreferencePicker />
          </Card>

          <View style={styles.list}>
            {MENU_ITEMS.map((item) => (
              <Pressable key={item.label} style={styles.row} onPress={() => router.push(item.href)}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.signOutWrap}>
            <Button label="Çıkış Yap" variant="secondary" onPress={signOut} />
          </View>
        </ScrollView>
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  profileCard: { gap: 4 },
  profileName: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.lg, color: colors.textBright },
  profileRole: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim },
  rolDivider: { height: 1, backgroundColor: colors.border, marginTop: spacing.md, marginBottom: spacing.sm },
  rolHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rolLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  rolCount: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim },
  rolRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  rolCard: { flex: 1, borderRadius: 14, backgroundColor: colors.chip, borderWidth: 1.5, borderColor: colors.border, padding: 11 },
  rolCardActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  rolCardTitle: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textBright },
  rolCardSubActive: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.accent, marginTop: 1 },
  rolCardTitleMuted: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  rolCardSub: { fontFamily: fontFamily.manropeBold, fontSize: 10, color: colors.textDim, marginTop: 1 },
  list: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: 15,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLabel: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.md, color: colors.textBright },
  chevron: { color: colors.textDim, fontSize: 16 },
  signOutWrap: { marginTop: spacing.lg },
  });
}
