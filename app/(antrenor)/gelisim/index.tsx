import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useIslem, useToast } from '../../../src/components/Toast';
import {
  GELISIM_TEMPLATES,
  gelisimGonder,
  gelisimKilidiAc,
  getGelisimKaydi,
  getSporcular,
  setGelisimNot,
  setGelisimSeviye,
} from '../../../src/data/antrenorRepo';
import type { GelisimKaydi, Sporcu } from '../../../src/data/types-antrenor';
import { useAuth } from '../../../src/context/AuthContext';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing, avatarColorAt } from '../../../src/theme';

export default function GelisimScreen() {
  const colors = useColors();
  const styles = createStyles(colors);
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ sporcuId?: string }>();
  const [sporcular, setSporcular] = useState<Sporcu[]>([]);
  const [seciliId, setSeciliId] = useState<string>(params.sporcuId || '');
  const [kayit, setKayit] = useState<GelisimKaydi | null>(null);
  const [not, setNot] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toastMessage, showToast } = useToast();
  const calistir = useIslem(showToast);

  const loadSporcular = useCallback(async () => {
    try {
      const s = await getSporcular();
      setSporcular(s);
      setSeciliId((prev) => (prev ? prev : (s[0]?.id ?? '')));
    } catch {
      setError('Sporcular yüklenemedi.');
    }
  }, []);

  const loadKayit = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const k = await getGelisimKaydi(id);
      setKayit(k);
      setNot(k.not);
    } catch {
      setError('Gelişim kaydı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSporcular();
  }, [loadSporcular]);

  useEffect(() => {
    if (seciliId) loadKayit(seciliId);
  }, [seciliId, loadKayit]);

  const seciliSporcu = sporcular.find((s) => s.id === seciliId);

  async function onSeviyeSec(beceriId: string, seviye: number) {
    if (kayit?.gonderildi) {
      showToast('Kayıt kilitli — "Düzenle"ye dokunun');
      return;
    }
    const oldu = await calistir(() => setGelisimSeviye(seciliId, beceriId, seviye), 'Seviye kaydedilemedi. Bağlantınızı kontrol edin.');
    if (oldu) setKayit(await getGelisimKaydi(seciliId));
  }

  // NOT YAZMA — her tuş vuruşunda sunucuya yazılıyor ve hata SESSİZCE yutuluyordu.
  // Sonuç: antrenör uzun bir gelişim notu yazar, ekranda "kaydedilmiş gibi" durur,
  // ama "Gönder"e bastığında veliye NOTSUZ bir değerlendirme giderdi. Artık hata
  // görünüyor; metin state'te durduğu için antrenör tekrar deneyebiliyor.
  async function onNotChange(text: string) {
    setNot(text);
    await calistir(() => setGelisimNot(seciliId, text), 'Not kaydedilemedi — yazdıklarınız henüz sunucuya ulaşmadı.');
  }

  // Şablon ekleme: promise hiç await EDİLMİYORDU (floating promise), yani hata
  // yakalanamaz haldeydi. Artık bekleniyor ve hata bildiriliyor.
  async function ekleTemplate(t: string) {
    const yeni = not ? not + ' ' + t + '.' : t + '.';
    setNot(yeni);
    await calistir(() => setGelisimNot(seciliId, yeni), 'Not kaydedilemedi — yazdıklarınız henüz sunucuya ulaşmadı.');
  }

  async function onGonder() {
    setSaving(true);
    try {
      const oldu = await calistir(() => gelisimGonder(seciliId), 'Değerlendirme gönderilemedi. Tekrar deneyin.');
      if (oldu) {
        setKayit(await getGelisimKaydi(seciliId));
        showToast('Gelişim değerlendirmesi veliye iletildi');
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDuzenle() {
    const oldu = await calistir(() => gelisimKilidiAc(seciliId), 'Kilit açılamadı. Tekrar deneyin.');
    if (oldu) setKayit(await getGelisimKaydi(seciliId));
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Gelişim Değerlendirme</Text>
            {/* Sabit "U12 Basketbol" grup adı kaldırıldı — liste tüm bağlı sporcuları kapsıyor. */}
            <Text style={styles.headerSub}>{new Date().toLocaleDateString('tr-TR', { month: 'long' })} dönemi</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sporcuScroll} contentContainerStyle={styles.sporcuRow}>
          {sporcular.map((s) => {
            const active = s.id === seciliId;
            return (
              <Pressable key={s.id} style={[styles.sporcuChip, active && styles.sporcuChipActive]} onPress={() => setSeciliId(s.id)}>
                <View style={[styles.sporcuAvatar, active && styles.sporcuAvatarActive]}>
                  <Text style={[styles.sporcuAvatarText, active && styles.sporcuAvatarTextActive]}>{s.init}</Text>
                </View>
                <Text style={[styles.sporcuName, active && styles.sporcuNameActive]} numberOfLines={1}>{s.ad.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading && <LoadingState label="Yükleniyor…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => loadKayit(seciliId)} />}

        {!loading && !error && kayit && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>BECERİLER · {seciliSporcu?.ad.split(' ')[0]}</Text>
            <View style={styles.skillCard}>
              {kayit.beceriler.map((b, bi) => (
                <View key={b.beceriId} style={[styles.skillRow, bi === kayit.beceriler.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.skillName} numberOfLines={1}>{b.ad}</Text>
                    {/* seviye 0 = henuz degerlendirilmedi. Eskiden beceri satiri yalnizca
                        kayitli seviyeden geliyordu; artik katalogdan geldigi icin
                        puanlanmamis beceri de listeleniyor ve durumu yaziyor. */}
                    <Text style={styles.skillLvl}>{b.seviye > 0 ? LEVELS[b.seviye - 1] : "Henüz değerlendirilmedi"}</Text>
                  </View>
                  <View style={styles.segRow}>
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <Pressable key={lvl} onPress={() => onSeviyeSec(b.beceriId, lvl)}>
                        <View style={[styles.segBar, { backgroundColor: lvl <= b.seviye ? colors.accent : colors.border }]} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>VELİYE NOT</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Bu ayki gelişimi 2-3 cümleyle özetleyin…"
              placeholderTextColor={colors.textDim}
              value={not}
              onChangeText={onNotChange}
              editable={!kayit.gonderildi}
              multiline
            />
            {!kayit.gonderildi && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tplScroll} contentContainerStyle={styles.tplRow}>
                {GELISIM_TEMPLATES.map((t) => (
                  <Pressable hitSlop={{ top: 8, bottom: 8 }} key={t} style={styles.tplChip} onPress={() => ekleTemplate(t)}>
                    <Text style={styles.tplChipText}>+ {t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {!kayit.gonderildi ? (
              <Pressable style={[styles.sendBtn, !not.trim() && styles.sendBtnDisabled]} disabled={!not.trim() || saving} onPress={onGonder}>
                <Text style={[styles.sendBtnText, !not.trim() && styles.sendBtnTextDisabled]}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet ve Veliye Gönder'}
                </Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.sentBox}>
                  <Text style={styles.sentBoxText}>✓ Kaydedildi · Veliye iletildi</Text>
                </View>
                <Pressable onPress={onDuzenle}>
                  <Text style={styles.duzenleLink}>Düzenle</Text>
                </Pressable>

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>VELİ UYGULAMASINDA GÖRÜNÜMÜ</Text>
                <View style={styles.previewCard}>
                  <Text style={styles.previewLabel}>ANTRENÖR NOTU</Text>
                  <Text style={styles.previewNote}>{kayit.not}</Text>
                  <View style={styles.previewFooter}>
                    <View style={styles.previewAvatar}>
                      <Text style={styles.previewAvatarText}>
                        {(profile?.ad || 'A').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.previewCoach}>{profile?.ad || 'Antrenör'}</Text>
                      <Text style={styles.previewDate}>{kayit.tarih}</Text>
                    </View>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      <Toast message={toastMessage} />
    </ScreenBackground>
  );
}

const LEVELS = ['Başlangıç', 'Gelişiyor', 'Orta', 'İyi', 'Çok iyi'];

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.textMuted, fontSize: 22, marginTop: -2 },
  headerTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  headerSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 2 },
  sporcuScroll: { flexGrow: 0, marginTop: spacing.xs },
  sporcuRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg },
  sporcuChip: { alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border, minWidth: 74 },
  sporcuChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  sporcuAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  sporcuAvatarActive: { backgroundColor: colors.accent },
  sporcuAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.textMuted },
  sporcuAvatarTextActive: { color: colors.onAccent },
  sporcuName: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  sporcuNameActive: { color: colors.textBright },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.2, color: colors.textDim, marginBottom: spacing.xs },
  skillCard: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  skillName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.base, color: colors.textBright },
  skillLvl: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  segRow: { flexDirection: 'row', gap: 4 },
  segBar: { width: 22, height: 10, borderRadius: 5 },
  noteInput: { minHeight: 92, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.textBright, fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, textAlignVertical: 'top' },
  tplScroll: { flexGrow: 0, marginTop: spacing.xs },
  tplRow: { flexDirection: 'row', gap: spacing.xs },
  tplChip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 99, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder },
  tplChipText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  sendBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.panel },
  sendBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  sendBtnTextDisabled: { color: colors.textDim },
  sentBox: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  sentBoxText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.accent },
  duzenleLink: { textAlign: 'center', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  previewCard: { borderRadius: radius.xxl, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.accentBorder, padding: spacing.md },
  previewLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.accent },
  previewNote: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 20 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  previewAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: avatarColorAt(0).avBg, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: avatarColorAt(0).avFg },
  previewCoach: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textBright },
  previewDate: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textDim },
  });
}
