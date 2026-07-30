import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { HesabiSil } from '../../../src/components/HesabiSil';
import { ThemePreferencePicker } from '../../../src/components/ThemePreferencePicker';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { getAntrenorProfil, updateAntrenorProfil } from '../../../src/data/antrenorRepo';
import type { AntrenorProfil } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, spacing, avatarColorAt } from '../../../src/theme';

export default function AntrenorProfilScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { signOut, refreshProfile } = useAuth();
  const [profil, setProfil] = useState<AntrenorProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editAd, setEditAd] = useState('');
  const [editTelefon, setEditTelefon] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfil(await getAntrenorProfil());
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
      await updateAntrenorProfil({ ad: editAd.trim(), telefon: editTelefon.trim() });
      await Promise.all([load(), refreshProfile()]);
      setEditOpen(false);
      showToast('Profil güncellendi');
    } catch {
      showToast('Profil güncellenemedi.');
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
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {profil.ad.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{profil.ad}</Text>
                <Text style={styles.role} numberOfLines={1}>{profil.rol}</Text>
                <Text style={styles.contact}>{[profil.telefon, profil.eposta].filter(Boolean).join(' · ') || '—'}</Text>
              </View>
              <Pressable hitSlop={12} onPress={openEdit}>
                <Text style={styles.editLink}>Düzenle</Text>
              </Pressable>
            </Card>

            <Text style={styles.sectionLabel}>GRUPLARIM</Text>
            <Card style={{ gap: 0 }}>
              {profil.gruplar.length === 0 ? (
                <Text style={styles.emptyGroupText}>Henüz bağlı sporcu grubu yok</Text>
              ) : (
                profil.gruplar.map((g, i) => (
                  <View key={g.ad} style={[styles.groupRow, i === profil.gruplar.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={styles.groupName} numberOfLines={1}>{g.ad}</Text>
                    <Text style={styles.groupCount}>{g.sporcuSayisi} sporcu</Text>
                  </View>
                ))
              )}
            </Card>

            <Text style={styles.sectionLabel}>GÖRÜNÜM</Text>
            <Card>
              <ThemePreferencePicker />
            </Card>

            {/* "Bildirim tercihleri" anahtarları kaldırıldı — push bildirim altyapısı olmadığından
                hiçbir yere kaydedilmeyen, etkisiz sahte ayarlardı. */}

            <View style={styles.signOutWrap}>
              <Button label="Çıkış Yap" variant="secondary" onPress={signOut} />
            </View>
            <HesabiSil />
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
              {/* E-posta düzenlenemez — giriş (auth) e-postasıdır, profiles tablosunda tutulmaz. */}
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

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.textBright },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: avatarColorAt(0).avFg },
  name: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.textBright },
  role: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.accent, marginTop: 2 },
  contact: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  editLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginTop: spacing.sm },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  groupName: { flex: 1, minWidth: 0, fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  groupCount: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  emptyGroupText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, paddingVertical: 12 },
  signOutWrap: { marginTop: spacing.md },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginBottom: 7 },
  input: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.textBright, fontSize: fontSize.base, fontFamily: fontFamily.manropeSemi },
  saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  });
}
