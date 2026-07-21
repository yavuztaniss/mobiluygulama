import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { getAntrenorProfil, updateAntrenorProfil } from '../../../src/data/antrenorRepo';
import type { AntrenorProfil } from '../../../src/data/types-antrenor';
import { useColors, type AppColors, fontFamily, fontSize, spacing } from '../../../src/theme';

export default function AntrenorProfilScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { signOut } = useAuth();
  const [profil, setProfil] = useState<AntrenorProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();
  const [prefYoklama, setPrefYoklama] = useState(true);
  const [prefIzin, setPrefIzin] = useState(true);
  const [prefMesaj, setPrefMesaj] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editAd, setEditAd] = useState('');
  const [editTelefon, setEditTelefon] = useState('');
  const [editEposta, setEditEposta] = useState('');
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
    setEditEposta(profil.eposta);
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editAd.trim() || !editTelefon.trim()) {
      showToast('Ad soyad ve telefon gerekli.');
      return;
    }
    setKaydediliyor(true);
    try {
      await updateAntrenorProfil({ ad: editAd.trim(), telefon: editTelefon.trim(), eposta: editEposta.trim() });
      await load();
      setEditOpen(false);
      showToast('Profil güncellendi');
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
                <Text style={styles.name}>{profil.ad}</Text>
                <Text style={styles.role}>{profil.rol}</Text>
                <Text style={styles.contact}>{profil.telefon} · {profil.eposta}</Text>
              </View>
              <Pressable onPress={openEdit}>
                <Text style={styles.editLink}>Düzenle</Text>
              </Pressable>
            </Card>

            <Text style={styles.sectionLabel}>GRUPLARIM</Text>
            <Card style={{ gap: 0 }}>
              {profil.gruplar.map((g, i) => (
                <View key={g.ad} style={[styles.groupRow, i === profil.gruplar.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.groupName}>{g.ad}</Text>
                  <Text style={styles.groupCount}>{g.sporcuSayisi} sporcu</Text>
                </View>
              ))}
            </Card>

            <Text style={styles.sectionLabel}>BİLDİRİM TERCİHLERİ</Text>
            <Card style={{ gap: 0 }}>
              <PrefRow label="Yoklama hatırlatmaları" sub="Antrenman saatinde bildir" value={prefYoklama} onChange={setPrefYoklama} />
              <PrefRow label="Veli izin bildirimleri" sub="Yeni izin geldiğinde bildir" value={prefIzin} onChange={setPrefIzin} />
              <PrefRow label="Mesaj bildirimleri" sub="Yeni mesaj geldiğinde bildir" value={prefMesaj} onChange={setPrefMesaj} last />
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
                <TextInput value={editAd} onChangeText={setEditAd} placeholderTextColor={colors.textFaint} style={styles.input} />
              </View>
              <View>
                <Text style={styles.fieldLabel}>TELEFON</Text>
                <TextInput value={editTelefon} onChangeText={setEditTelefon} keyboardType="phone-pad" placeholderTextColor={colors.textFaint} style={styles.input} />
              </View>
              <View>
                <Text style={styles.fieldLabel}>E-POSTA</Text>
                <TextInput value={editEposta} onChangeText={setEditEposta} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.textFaint} style={styles.input} />
              </View>
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
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.navyBorderStrong }} thumbColor="#FFFFFF" />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xxl, color: colors.white },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: '#9FE8CE' },
  name: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.white },
  role: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.accent, marginTop: 2 },
  contact: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  editLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginTop: spacing.sm },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  groupName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  groupCount: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  prefLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  prefSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  signOutWrap: { marginTop: spacing.md },
  versionText: { textAlign: 'center', fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textFaint, marginTop: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(4,10,20,0.62)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.navySheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.navyBorderStrong, padding: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.white, marginTop: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textFaint, marginBottom: 7 },
  input: { backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorderSoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.white, fontSize: fontSize.base, fontFamily: fontFamily.manropeSemi },
  saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.accentOnDark },
  });
}
