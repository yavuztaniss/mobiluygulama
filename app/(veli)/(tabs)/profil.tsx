import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { useAuth } from '../../../src/context/AuthContext';
import { getKayitliKartlar, getVeliProfil, setOdemeYontemi, updateVeliProfil } from '../../../src/data/veliRepo';
import type { VeliProfil } from '../../../src/data/types-veli';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

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
  const [editEposta, setEditEposta] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const [kartSheetOpen, setKartSheetOpen] = useState(false);
  const [kartlar, setKartlar] = useState<string[]>([]);
  const [kartDegistiriliyor, setKartDegistiriliyor] = useState<string | null>(null);

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
      await updateVeliProfil({ ad: editAd.trim(), telefon: editTelefon.trim(), eposta: editEposta.trim() });
      await load();
      setEditOpen(false);
      showToast('Profil güncellendi');
    } finally {
      setKaydediliyor(false);
    }
  }

  async function openKartSheet() {
    setKartSheetOpen(true);
    setKartlar(await getKayitliKartlar());
  }

  async function onSecKart(kart: string) {
    setKartDegistiriliyor(kart);
    try {
      await setOdemeYontemi(kart);
      await load();
      setKartSheetOpen(false);
      showToast('Varsayılan ödeme yöntemi güncellendi');
    } finally {
      setKartDegistiriliyor(null);
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
                <Text style={styles.profileName}>{profil.ad}</Text>
                <Text style={styles.profileSub}>{profil.telefon} · {profil.eposta}</Text>
              </View>
              <Pressable onPress={openEdit}>
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
                    <Text style={styles.childName}>{c.ad}</Text>
                    <Text style={styles.childBrans}>{c.brans}</Text>
                  </View>
                  <View style={[styles.docBadge, c.belgeDurum === 'eksik' && styles.docBadgeWarn]}>
                    <Text style={[styles.docBadgeText, c.belgeDurum === 'eksik' && styles.docBadgeTextWarn]}>
                      {c.belgeDurum === 'tam' ? '✓ BELGELER TAM' : 'BELGE EKSİK'}
                    </Text>
                  </View>
                </View>
              ))}
              <Pressable style={styles.addChildRow} onPress={() => router.push('/sporcu-ekle')}>
                <Text style={styles.addChildText}>+ Sporcu Ekle</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>BELGELER</Text>
            <Card style={{ gap: 0 }}>
              {profil.belgeler.map((d) => (
                <View key={d.id} style={styles.docRow}>
                  <View style={styles.docIcon}>
                    <Text>📄</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.docName}>{d.ad}</Text>
                    <Text style={[styles.docStatus, d.aksiyonGerekli && { color: colors.warning }]}>{d.durum}</Text>
                  </View>
                  {d.aksiyonGerekli && (
                    <Pressable style={styles.renewBtn} onPress={() => showToast('Belge yenileme talebi gönderildi')}>
                      <Text style={styles.renewBtnText}>Yenile</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>

            <Text style={styles.sectionLabel}>BİLDİRİM TERCİHLERİ</Text>
            <Card style={{ gap: 0 }}>
              <PrefRow label="Yoklama Bildirimleri" sub="Antrenmana katılım/gelmedi" value={prefYok} onChange={setPrefYok} />
              <PrefRow label="Ödeme Hatırlatmaları" sub="Aidat son ödeme tarihi" value={prefOdeme} onChange={setPrefOdeme} />
              <PrefRow label="Kulüp Duyuruları" sub="Genel duyuru ve kampanyalar" value={prefDuyuru} onChange={setPrefDuyuru} last />
            </Card>

            <Text style={styles.sectionLabel}>ÖDEME YÖNTEMİ</Text>
            <Card style={styles.payRow}>
              <View style={styles.payIcon}>
                <Text>💳</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.payTitle}>{profil.odemeYontemi}</Text>
                <Text style={styles.paySub}>Aidat ve mağaza ödemelerinde varsayılan</Text>
              </View>
              <Pressable onPress={openKartSheet}>
                <Text style={styles.editLink}>Değiştir</Text>
              </Pressable>
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

      <AppModal visible={kartSheetOpen} transparent animationType="slide" onRequestClose={() => setKartSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setKartSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ödeme Yöntemi Seç</Text>
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              {kartlar.map((k) => {
                const secili = k === profil?.odemeYontemi;
                return (
                  <Pressable key={k} style={[styles.kartRow, secili && styles.kartRowActive]} onPress={() => onSecKart(k)} disabled={!!kartDegistiriliyor}>
                    <Text style={{ fontSize: 16 }}>💳</Text>
                    <Text style={styles.kartText}>{k}</Text>
                    {kartDegistiriliyor === k ? (
                      <Text style={styles.kartLoading}>Seçiliyor…</Text>
                    ) : secili ? (
                      <Text style={styles.kartCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
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
  profileAvatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.md, color: '#9FE8CE' },
  profileName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.white },
  profileSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  editLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginTop: spacing.sm },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: colors.navySurface, borderWidth: 1, borderColor: colors.navyBorder, padding: 13 },
  childAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#1D3560', alignItems: 'center', justifyContent: 'center' },
  childAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: '#9FE8CE' },
  childName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  childBrans: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  docBadge: { backgroundColor: colors.accentTint, paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill },
  docBadgeWarn: { backgroundColor: 'rgba(255,180,84,0.14)' },
  docBadgeText: { fontFamily: fontFamily.manropeExtra, fontSize: 10, color: colors.accent },
  docBadgeTextWarn: { color: colors.warning },
  addChildRow: { borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navyBorderStrong, padding: 13, alignItems: 'center' },
  addChildText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  docIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.navyChip, alignItems: 'center', justifyContent: 'center' },
  docName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.white },
  docStatus: { fontFamily: fontFamily.manropeSemi, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  renewBtn: { backgroundColor: colors.warning, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill },
  renewBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 11, color: colors.accentOnDark },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.navyBorder },
  prefLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  prefSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  payIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,180,84,0.12)', alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  paySub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
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
  kartRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, backgroundColor: colors.navySurface, borderWidth: 1.5, borderColor: colors.navyBorderSoft, padding: 13 },
  kartRowActive: { borderColor: colors.accentBorder, backgroundColor: colors.accentTint },
  kartText: { flex: 1, fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.white },
  kartCheck: { color: colors.accent, fontSize: 16 },
  kartLoading: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.accent },
  });
}
