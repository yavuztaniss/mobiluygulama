import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { ThemePreferencePicker } from '../../../src/components/ThemePreferencePicker';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { getVeliProfil, updateVeliProfil } from '../../../src/data/veliRepo';
import type { VeliProfil } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, spacing, avatarColorAt } from '../../../src/theme';

export default function ProfilScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { signOut } = useAuth();
  const [profil, setProfil] = useState<VeliProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();
  const [prefYok, setPrefYok] = useState(true);
  const [prefOdeme, setPrefOdeme] = useState(true);
  const [prefDuyuru, setPrefDuyuru] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editAd, setEditAd] = useState('');
  const [editTelefon, setEditTelefon] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfil(await getVeliProfil());
    } catch {
      setError('Profil yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit() {
    if (!profil) return;
    setEditAd(profil.ad);
    setEditTelefon(profil.telefon);
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editAd.trim() || !editTelefon.trim()) {
      showToast('Ad soyad ve telefon gerekli.');
      return;
    }
    setKaydediliyor(true);
    try {
      // E-posta oturuma bağlı (auth) — buradan yalnızca profiles.ad/telefon güncellenir.
      const guncel = await updateVeliProfil({ ad: editAd.trim(), telefon: editTelefon.trim() });
      setProfil(guncel);
      setEditOpen(false);
      showToast('Profil güncellendi');
    } catch {
      showToast('Profil güncellenemedi — tekrar deneyin.');
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && profil && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Profil</Text>

            <Card style={styles.profileRow}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>
                  {profil.ad.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.profileName} numberOfLines={1}>{profil.ad || 'Veli'}</Text>
                <Text style={styles.profileSub}>{[profil.telefon, profil.eposta].filter(Boolean).join(' · ') || '—'}</Text>
              </View>
              <Pressable hitSlop={12} onPress={openEdit}>
                <Text style={styles.editLink}>Düzenle</Text>
              </Pressable>
            </Card>

            <Text style={styles.sectionLabel}>SPORCULARIM</Text>
            <View style={{ gap: spacing.xs }}>
              {profil.cocuklar.map((c) => (
                <View key={c.id} style={styles.childRow}>
                  <View style={styles.childAvatar}>
                    <Text style={styles.childAvatarText}>{c.ad[0]}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.childName} numberOfLines={1}>{c.ad}</Text>
                    <Text style={styles.childBrans}>{c.brans || '—'}</Text>
                  </View>
                </View>
              ))}
              <Pressable style={styles.addChildRow} onPress={() => router.push('/sporcu-ekle')}>
                <Text style={styles.addChildText}>+ Sporcu Ekle</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>GÖRÜNÜM</Text>
            <Card>
              <ThemePreferencePicker />
            </Card>

            <Text style={styles.sectionLabel}>BİLDİRİM TERCİHLERİ</Text>
            <Card style={{ gap: 0 }}>
              <PrefRow label="Yoklama Bildirimleri" sub="Antrenmana katılım/gelmedi" value={prefYok} onChange={setPrefYok} />
              <PrefRow label="Ödeme Hatırlatmaları" sub="Aidat son ödeme tarihi" value={prefOdeme} onChange={setPrefOdeme} />
              <PrefRow label="Kulüp Duyuruları" sub="Genel duyuru ve kampanyalar" value={prefDuyuru} onChange={setPrefDuyuru} last />
            </Card>

            <View style={styles.signOutWrap}>
              <Button label="Çıkış Yap" variant="secondary" onPress={signOut} />
            </View>
            <Text style={styles.versionText}>Sürüm 2.4.1 · KVKK aydınlatma metni</Text>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Profili Düzenle</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <View>
                <Text style={styles.fieldLabel}>AD SOYAD</Text>
                <TextInput value={editAd} onChangeText={setEditAd} placeholderTextColor={colors.textDim} style={styles.input} />
              </View>
              <View>
                <Text style={styles.fieldLabel}>TELEFON</Text>
                <TextInput value={editTelefon} onChangeText={setEditTelefon} keyboardType="phone-pad" placeholderTextColor={colors.textDim} style={styles.input} />
              </View>
              <Text style={styles.sheetNote}>E-posta adresi hesabınıza bağlıdır, buradan değiştirilemez.</Text>
            </View>
            <Pressable style={styles.saveBtn} onPress={onSaveEdit} disabled={kaydediliyor}>
              <Text style={styles.saveBtnText}>{kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function PrefRow({
  label,
  sub,
  value,
  onChange,
  last,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={[styles.prefRow, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.prefLabel}>{label}</Text>
        <Text style={styles.prefSub}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#FFFFFF" />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  profileAvatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: avatarColorAt(0).avFg },
  profileName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.textBright },
  profileSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  editLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginTop: spacing.sm },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: 13 },
  childAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  childAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  childName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  childBrans: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  addChildRow: { borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, padding: 13, alignItems: 'center' },
  addChildText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  prefLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  prefSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  signOutWrap: { marginTop: spacing.md },
  versionText: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim, marginTop: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  sheetNote: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginBottom: 7 },
  input: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.textBright, fontSize: fontSize.base, fontFamily: fontFamily.manropeSemi },
  saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  });
}
