import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import { getSporcuDetay, updateSporcuBilgi } from '../../../src/data/sporcularRepo';
import type { SporcuDetay } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, radius, spacing } from '../../../src/theme';

function getGunRenk(colors: AppColors): Record<string, { bg: string; c: string }> {
  return {
    katildi: { bg: colors.accentSoft, c: colors.accent },
    gelmedi: { bg: colors.dangerSoft, c: colors.danger },
    planli: { bg: 'transparent', c: colors.textDim },
  };
}

export default function SporcuDetayScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const GUN_RENK = getGunRenk(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detay, setDetay] = useState<SporcuDetay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editAd, setEditAd] = useState('');
  const [editGrup, setEditGrup] = useState('');
  const [editVeliAd, setEditVeliAd] = useState('');
  const [editVeliTelefon, setEditVeliTelefon] = useState('');
  const [editVeliYakinlik, setEditVeliYakinlik] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [notArsivOpen, setNotArsivOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDetay(await getSporcuDetay(id));
    } catch {
      setError('Sporcu bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function callVeli() {
    if (!detay) return;
    Linking.openURL(`tel:${detay.veliTelefon.replace(/\s/g, '')}`).catch(() => showToast('Arama başlatılamadı'));
  }

  function messageVeli() {
    if (!detay) return;
    Linking.openURL(`sms:${detay.veliTelefon.replace(/\s/g, '')}`).catch(() => showToast('Mesaj başlatılamadı'));
  }

  function openEdit() {
    if (!detay) return;
    setEditAd(detay.ad);
    setEditGrup(detay.grup);
    setEditVeliAd(detay.veliAd);
    setEditVeliTelefon(detay.veliTelefon);
    setEditVeliYakinlik(detay.veliYakinlik);
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!id || !editAd.trim() || !editGrup.trim() || !editVeliAd.trim() || !editVeliTelefon.trim()) {
      showToast('Tüm alanları doldur.');
      return;
    }
    setKaydediliyor(true);
    try {
      await updateSporcuBilgi(id, {
        ad: editAd.trim(),
        grup: editGrup.trim(),
        veliAd: editVeliAd.trim(),
        veliTelefon: editVeliTelefon.trim(),
        veliYakinlik: editVeliYakinlik.trim() || 'Veli',
      });
      await load();
      setEditOpen(false);
      showToast('Bilgiler güncellendi');
    } finally {
      setKaydediliyor(false);
    }
  }

  function remindPayment(kayitId: string) {
    if (!detay) return;
    const body = encodeURIComponent(
      `Merhaba ${detay.veliAd}, ${detay.ad} için gecikmiş aidat hatırlatması. Ödemeni yapman için teşekkürler!`
    );
    Linking.openURL(`sms:${detay.veliTelefon.replace(/\s/g, '')}?body=${body}`).catch(() =>
      showToast('Hatırlatma gönderilemedi')
    );
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Sporcu Detayı</Text>
          <Pressable onPress={openEdit}>
            <Text style={styles.editLink}>Düzenle</Text>
          </Pressable>
        </View>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && detay && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Card style={styles.profileCard}>
              <View style={styles.profileRow}>
                <View style={[styles.avatar, detay.odemeDurumu === 'gecikmis' && styles.avatarDanger]}>
                  <Text style={styles.avatarText}>{detay.init}</Text>
                </View>
                <View style={styles.profileMid}>
                  <Text style={styles.profileName}>{detay.ad}</Text>
                  <Text style={styles.profileSub}>{detay.grup} · {detay.sube}</Text>
                </View>
                {detay.odemeDurumu === 'gecikmis' && (
                  <View style={styles.badgeDanger}>
                    <Text style={styles.badgeDangerText}>Gecikmiş</Text>
                  </View>
                )}
              </View>
              <View style={styles.divider} />
              <View style={styles.veliRow}>
                <View style={styles.veliAvatar}>
                  <Text style={styles.veliAvatarText}>
                    {detay.veliAd.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.profileMid}>
                  <Text style={styles.veliName}>{detay.veliAd}</Text>
                  <Text style={styles.veliInfo}>Veli · {detay.veliYakinlik} · {detay.veliTelefon}</Text>
                </View>
                <Pressable style={styles.iconBtn} onPress={callVeli}>
                  <Text style={styles.iconBtnText}>📞</Text>
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={messageVeli}>
                  <Text style={styles.iconBtnText}>💬</Text>
                </Pressable>
              </View>
            </Card>

            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>%{detay.yoklamaOrani}</Text>
                <Text style={styles.statLabel}>YOKLAMA</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{detay.aylikAidat}</Text>
                <Text style={styles.statLabel}>AYLIK AİDAT</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{detay.kayitTarihi}</Text>
                <Text style={styles.statLabel}>KAYIT</Text>
              </Card>
            </View>

            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>YOKLAMA TAKVİMİ</Text>
                <View style={styles.legendRow}>
                  <LegendDot color={colors.accent} label="Katıldı" />
                  <LegendDot color={colors.danger} label="Gelmedi" />
                  <LegendDot color={colors.textDim} label="Planlı" />
                </View>
              </View>
              <View style={styles.calGrid}>
                {detay.calDays.map((d) => (
                  <View key={d.gun} style={[styles.calCell, { backgroundColor: GUN_RENK[d.durum].bg }]}>
                    <Text style={[styles.calCellText, { color: GUN_RENK[d.durum].c }]}>{d.gun}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>ÖDEME GEÇMİŞİ</Text>
              {detay.odemeGecmisi.map((o) => (
                <View key={o.id} style={styles.paymentRow}>
                  <View style={[styles.paymentIcon, o.durum === 'gecikti' ? styles.paymentIconDanger : styles.paymentIconOk]}>
                    <Text>{o.durum === 'gecikti' ? '⏱' : '✓'}</Text>
                  </View>
                  <View style={styles.profileMid}>
                    <Text style={styles.paymentTitle}>{o.baslik}</Text>
                    <Text style={o.durum === 'gecikti' ? styles.paymentDetailDanger : styles.paymentDetail}>{o.detay}</Text>
                  </View>
                  {o.durum === 'gecikti' ? (
                    <View style={styles.paymentAction}>
                      <Text style={styles.paymentTutar}>{o.tutar}</Text>
                      <Pressable style={styles.remindBtn} onPress={() => remindPayment(o.id)}>
                        <Text style={styles.remindBtnText}>Hatırlat</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.paymentTutar}>{o.tutar}</Text>
                  )}
                </View>
              ))}
            </Card>

            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>ANTRENÖR GELİŞİM NOTLARI</Text>
                {detay.gelisimNotlari.length > 2 && (
                  <Pressable onPress={() => setNotArsivOpen(true)}>
                    <Text style={styles.editLink}>Tümü ({detay.gelisimNotlari.length})</Text>
                  </Pressable>
                )}
              </View>
              {detay.gelisimNotlari.slice(0, 2).map((n, i) => (
                <View key={i} style={styles.noteBox}>
                  <Text style={styles.noteText}>{n.metin}</Text>
                  <Text style={styles.noteMeta}>{n.yazan} · {n.tarih}</Text>
                </View>
              ))}
            </Card>
          </ScrollView>
        )}
      </SafeAreaView>

      <AppModal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sporcu Bilgilerini Düzenle</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }} keyboardShouldPersistTaps="handled">
              <FormField label="AD SOYAD" value={editAd} onChangeText={setEditAd} />
              <FormField label="GRUP" value={editGrup} onChangeText={setEditGrup} />
              <FormField label="VELİ ADI" value={editVeliAd} onChangeText={setEditVeliAd} />
              <FormField label="VELİ TELEFONU" value={editVeliTelefon} onChangeText={setEditVeliTelefon} keyboardType="phone-pad" />
              <FormField label="YAKINLIK" value={editVeliYakinlik} onChangeText={setEditVeliYakinlik} placeholder="Anne / Baba / Vasi" />
            </ScrollView>
            <Pressable style={styles.saveBtn} onPress={onSaveEdit} disabled={kaydediliyor}>
              <Text style={styles.saveBtnText}>{kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </AppModal>

      <AppModal visible={notArsivOpen} transparent animationType="slide" onRequestClose={() => setNotArsivOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setNotArsivOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Gelişim Notları Arşivi</Text>
            <ScrollView contentContainerStyle={{ gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
              {detay?.gelisimNotlari.map((n, i) => (
                <View key={i} style={styles.noteBox}>
                  <Text style={styles.noteText}>{n.metin}</Text>
                  <Text style={styles.noteMeta}>{n.yazan} · {n.tarih}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>

      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

function FormField(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: 'default' | 'phone-pad' }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textDim}
        keyboardType={props.keyboardType}
        style={styles.input}
      />
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const colors = useColors();
  const styles = createStyles(colors);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { flex: 1, fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  editLink: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accent },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  profileCard: {},
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  avatarDanger: { backgroundColor: colors.dangerSoft },
  avatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.danger },
  profileMid: { flex: 1, minWidth: 0 },
  profileName: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.xl, color: colors.textBright },
  profileSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  badgeDanger: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.dangerSoft },
  badgeDangerText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.danger },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  veliRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  veliAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  veliAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.textMuted },
  veliName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  veliInfo: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  statLabel: { fontFamily: fontFamily.mono, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: colors.textDim },
  sectionCard: { gap: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  legendRow: { flexDirection: 'row', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontFamily: fontFamily.manropeBold, fontSize: 9.5, color: colors.textMuted },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  calCell: { width: '12.5%', height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calCellText: { fontFamily: fontFamily.manropeBold, fontSize: 10 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  paymentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  paymentIconDanger: { backgroundColor: colors.dangerSoft },
  paymentIconOk: { backgroundColor: colors.accentSoft },
  paymentTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  paymentDetail: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  paymentDetailDanger: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.danger, marginTop: 1 },
  paymentTutar: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.md, color: colors.textBright },
  paymentAction: { alignItems: 'flex-end', gap: 6 },
  remindBtn: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.accent },
  remindBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: 10.5, color: colors.onAccent },
  noteBox: { backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 13, marginTop: spacing.xs },
  noteText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, lineHeight: 19 },
  noteMeta: { fontFamily: fontFamily.manropeBold, fontSize: 10.5, color: colors.textDim, marginTop: spacing.xs },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginBottom: 7 },
  input: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.textBright, fontSize: fontSize.base, fontFamily: fontFamily.manropeSemi },
  saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  });
}
