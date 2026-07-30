import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenBackground } from '../../../src/components/ScreenBackground';
import { AppModal } from '../../../src/components/AppModal';
import { Card } from '../../../src/components/Card';
import { LoadingState, ErrorState } from '../../../src/components/StateViews';
import { Toast, useToast } from '../../../src/components/Toast';
import {
  ayKaydir,
  buAyAnahtari,
  getBranslar,
  getGruplar,
  getSporcuDetay,
  getSporcuYoklamaAyi,
  setSporcuAktif,
  updateSporcuBilgi,
} from '../../../src/data/sporcularRepo';
import type { KatalogSecenegi, SporcuDetay, YoklamaAyi } from '../../../src/data/types';
import { useColors, type AppColors, fontFamily, fontSize, lineHeightFor, radius, spacing } from '../../../src/theme';

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
  // Grup artık serbest metin DEĞİL, katalogdan id ile seçiliyor (bkz. sporcularRepo).
  const [editGrupId, setEditGrupId] = useState<string | null>(null);
  const [gruplar, setGruplar] = useState<KatalogSecenegi[]>([]);
  // Branş da düzenlenebilir: eskiden yalnızca sporcu eklenirken atanıyordu,
  // yanlış seçilen branş mobilden düzeltilemiyordu (panelde düzeltilebiliyor).
  const [editBransId, setEditBransId] = useState<string | null>(null);
  const [branslar, setBranslar] = useState<KatalogSecenegi[]>([]);
  const [editVeliAd, setEditVeliAd] = useState('');
  const [editVeliTelefon, setEditVeliTelefon] = useState('');
  const [editVeliYakinlik, setEditVeliYakinlik] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [notArsivOpen, setNotArsivOpen] = useState(false);

  // Yoklama takvimi artık tek aya kilitli değil — ok tuşlarıyla geçmiş aylar gezilir.
  const [takvim, setTakvim] = useState<YoklamaAyi | null>(null);
  const [takvimYukleniyor, setTakvimYukleniyor] = useState(false);
  const buAy = buAyAnahtari();

  // Pasife alma / geri alma onayı (0024 yumuşak silme).
  const [aktiflikOnayOpen, setAktiflikOnayOpen] = useState(false);
  const [aktiflikKaydediliyor, setAktiflikKaydediliyor] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [d, g, b] = await Promise.all([getSporcuDetay(id), getGruplar(), getBranslar()]);
      setDetay(d);
      setTakvim(d.takvim);
      setGruplar(g);
      setBranslar(b);
    } catch {
      setError('Sporcu bilgisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Ay değişiminde TÜM detay yeniden çekilmez, yalnızca takvim tazelenir.
  async function ayDegistir(delta: number) {
    if (!id || !detay || !takvim || takvimYukleniyor) return;
    const hedefAy = ayKaydir(takvim.ay, delta);
    // İleri yön içinde bulunulan ayda durur — gelecek aylar için yoklama kaydı
    // olamayacağından boş takvimlerde sonsuza kadar ilerlemenin anlamı yok.
    if (hedefAy > buAy) return;
    setTakvimYukleniyor(true);
    try {
      setTakvim(await getSporcuYoklamaAyi(id, detay.grupId, hedefAy));
    } catch {
      showToast('Takvim yüklenemedi');
    } finally {
      setTakvimYukleniyor(false);
    }
  }

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
    setEditGrupId(detay.grupId);
    setEditBransId(detay.bransId);
    setEditVeliAd(detay.veliAd);
    setEditVeliTelefon(detay.veliTelefon);
    setEditVeliYakinlik(detay.veliYakinlik);
    setEditOpen(true);
  }

  // Sporcunun mevcut grubu pasife alınmış olabilir (0024) — getGruplar yalnızca
  // aktif grupları döndürdüğü için listede çıkmaz. Seçenek olarak eklenmezse
  // kaydetmek sporcuyu sessizce grupsuz bırakırdı.
  const grupSecenekleri: KatalogSecenegi[] =
    detay?.grupId && !gruplar.some((g) => g.id === detay.grupId)
      ? [{ id: detay.grupId, ad: `${detay.grup || 'Mevcut grup'} (pasif)` }, ...gruplar]
      : gruplar;

  // Sporcunun mevcut branşı katalogda bulunamazsa (kurum branş listesinden
  // çıkarılmış olabilir) seçenek olarak eklenir — grup seçicideki aynı gerekçe.
  const bransSecenekleri: KatalogSecenegi[] =
    detay?.bransId && !branslar.some((b) => b.id === detay.bransId)
      ? [{ id: detay.bransId, ad: detay.brans || 'Mevcut branş' }, ...branslar]
      : branslar;

  async function onSaveEdit() {
    if (!id || !editAd.trim() || !editVeliAd.trim() || !editVeliTelefon.trim()) {
      showToast('Ad, veli adı ve veli telefonu zorunlu.');
      return;
    }
    if (!editGrupId) {
      showToast('Grup seçimi zorunlu.');
      return;
    }
    setKaydediliyor(true);
    try {
      await updateSporcuBilgi(id, {
        ad: editAd.trim(),
        grupId: editGrupId,
        bransId: editBransId,
        veliAd: editVeliAd.trim(),
        veliTelefon: editVeliTelefon.trim(),
        veliYakinlik: editVeliYakinlik.trim() || 'Veli',
      });
      await load();
      setEditOpen(false);
      showToast('Bilgiler güncellendi');
    } catch {
      // catch YOKKEN hata sessizce yutuluyordu: modal açık kalıyor, kullanıcı
      // kaydın gittiğini sanıyor ve işlenmemiş promise reddi oluşuyordu
      // (onAktiflikDegistir'deki aynı desen).
      showToast('Bilgiler kaydedilemedi, tekrar dene');
    } finally {
      setKaydediliyor(false);
    }
  }

  async function onAktiflikDegistir() {
    if (!id || !detay) return;
    const hedef = !detay.aktif;
    setAktiflikKaydediliyor(true);
    try {
      await setSporcuAktif(id, hedef);
      await load();
      setAktiflikOnayOpen(false);
      showToast(hedef ? 'Sporcu yeniden aktif' : 'Sporcu pasife alındı');
    } catch {
      showToast('İşlem tamamlanamadı, tekrar dene');
    } finally {
      setAktiflikKaydediliyor(false);
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
          <Pressable hitSlop={8} style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Sporcu Detayı</Text>
          <Pressable hitSlop={12} onPress={openEdit}>
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
                  <Text style={styles.profileName} numberOfLines={1}>{detay.ad}</Text>
                  <Text style={styles.profileSub}>{detay.grup || 'Grup atanmadı'} · {detay.sube}</Text>
                </View>
                {!detay.aktif ? (
                  <View style={styles.badgeWarning}>
                    <Text style={styles.badgeWarningText}>Pasif</Text>
                  </View>
                ) : (
                  detay.odemeDurumu === 'gecikmis' && (
                    <View style={styles.badgeDanger}>
                      <Text style={styles.badgeDangerText}>Gecikmiş</Text>
                    </View>
                  )
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
                  <Text style={styles.veliName} numberOfLines={1}>{detay.veliAd}</Text>
                  <Text style={styles.veliInfo} numberOfLines={1}>Veli · {detay.veliYakinlik} · {detay.veliTelefon}</Text>
                </View>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={callVeli}>
                  <Text style={styles.iconBtnText}>📞</Text>
                </Pressable>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={messageVeli}>
                  <Text style={styles.iconBtnText}>💬</Text>
                </Pressable>
              </View>
            </Card>

            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                {/* Oran, takvimde GÖRÜNEN aya ait — etiket hangi ay olduğunu yazar
                    ki ay değiştirildiğinde rakam bağlamsız kalmasın. Yoklama
                    işaretlenmemişse oran uydurulmaz, '—' gösterilir. */}
                <Text style={styles.statValue}>
                  {takvim?.yoklamaOrani == null ? '—' : `%${takvim.yoklamaOrani}`}
                </Text>
                <Text style={styles.statLabel}>YOKLAMA · {takvim?.kisaEtiket ?? ''}</Text>
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

              {/* Ay gezinme: geçmiş aylar serbest, ileri yön içinde bulunulan ayda durur. */}
              <View style={styles.ayRow}>
                <Pressable
                  style={styles.ayBtn}
                  onPress={() => ayDegistir(-1)}
                  disabled={takvimYukleniyor}
                  accessibilityRole="button"
                  accessibilityLabel="Önceki ay"
                >
                  <Text style={styles.ayBtnText}>‹</Text>
                </Pressable>
                <Text style={styles.ayLabel}>{takvim?.etiket ?? ''}</Text>
                <Pressable
                  style={[styles.ayBtn, (takvim?.ay ?? buAy) >= buAy && styles.ayBtnDisabled]}
                  onPress={() => ayDegistir(1)}
                  disabled={takvimYukleniyor || (takvim?.ay ?? buAy) >= buAy}
                  accessibilityRole="button"
                  accessibilityLabel="Sonraki ay"
                >
                  <Text style={styles.ayBtnText}>›</Text>
                </Pressable>
              </View>

              {takvimYukleniyor ? (
                <Text style={styles.emptyText}>Takvim yükleniyor…</Text>
              ) : !takvim || takvim.calDays.length === 0 ? (
                <Text style={styles.emptyText}>
                  {detay.grupId ? 'Bu ayda antrenman kaydı yok' : 'Sporcu bir gruba bağlı değil'}
                </Text>
              ) : (
                <View style={styles.calGrid}>
                  {/* Aynı güne iki antrenman düşebilir — anahtar gün + sıra. */}
                  {takvim.calDays.map((d, i) => (
                    <View key={`${d.gun}-${i}`} style={[styles.calCell, { backgroundColor: GUN_RENK[d.durum].bg }]}>
                      <Text style={[styles.calCellText, { color: GUN_RENK[d.durum].c }]}>{d.gun}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>ÖDEME GEÇMİŞİ</Text>
              {detay.odemeGecmisi.length === 0 && <Text style={styles.emptyText}>Henüz ödeme kaydı yok</Text>}
              {detay.odemeGecmisi.map((o) => (
                <View key={o.id} style={styles.paymentRow}>
                  <View
                    style={[
                      styles.paymentIcon,
                      o.durum === 'gecikti'
                        ? styles.paymentIconDanger
                        : o.durum === 'bekliyor'
                          ? styles.paymentIconBekliyor
                          : styles.paymentIconOk,
                    ]}
                  >
                    <Text>{o.durum === 'gecikti' ? '⏱' : o.durum === 'bekliyor' ? '⏳' : '✓'}</Text>
                  </View>
                  <View style={styles.profileMid}>
                    <Text style={styles.paymentTitle} numberOfLines={1}>{o.baslik}</Text>
                    <Text style={o.durum === 'gecikti' ? styles.paymentDetailDanger : styles.paymentDetail}>{o.detay}</Text>
                  </View>
                  {o.durum === 'gecikti' ? (
                    <View style={styles.paymentAction}>
                      <Text style={styles.paymentTutar}>{o.tutar}</Text>
                      <Pressable hitSlop={{ top: 10, bottom: 10 }} style={styles.remindBtn} onPress={() => remindPayment(o.id)}>
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
                  <Pressable hitSlop={12} onPress={() => setNotArsivOpen(true)}>
                    <Text style={styles.editLink}>Tümü ({detay.gelisimNotlari.length})</Text>
                  </Pressable>
                )}
              </View>
              {detay.gelisimNotlari.length === 0 && <Text style={styles.emptyText}>Henüz gelişim notu yok</Text>}
              {detay.gelisimNotlari.slice(0, 2).map((n, i) => (
                <View key={i} style={styles.noteBox}>
                  <Text style={styles.noteText}>{n.metin}</Text>
                  <Text style={styles.noteMeta}>{n.yazan} · {n.tarih}</Text>
                </View>
              ))}
            </Card>

            {/* 0024 yumuşak silme: kayıt SİLİNMEZ, yalnızca pasife alınır. */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>KAYIT DURUMU</Text>
              <Text style={styles.emptyText}>
                {detay.aktif
                  ? 'Kulüpten ayrılan sporcu pasife alınır; kayıt silinmez, ödeme ve yoklama geçmişi olduğu gibi korunur. Pasif sporcular listede varsayılan olarak gizlenir.'
                  : 'Bu sporcu pasif. Ödeme ve yoklama geçmişi korunuyor; listede yalnızca "Pasifleri göster" filtresiyle görünür.'}
              </Text>
              <Pressable
                style={[styles.aktiflikBtn, detay.aktif ? styles.aktiflikBtnPasife : styles.aktiflikBtnGeri]}
                onPress={() => setAktiflikOnayOpen(true)}
              >
                <Text style={[styles.aktiflikBtnText, detay.aktif ? styles.aktiflikBtnTextPasife : styles.aktiflikBtnTextGeri]}>
                  {detay.aktif ? 'Pasife Al' : 'Geri Al'}
                </Text>
              </Pressable>
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
              {/* Serbest metin kaldırıldı: yazım hatasında sporcu sessizce grupsuz
                  kalıyordu. Artık gerçek grup id'si seçiliyor (panelle aynı). */}
              <View>
                <Text style={styles.fieldLabel}>GRUP</Text>
                {grupSecenekleri.length === 0 ? (
                  <Text style={styles.pickEmpty}>Kayıtlı aktif grup yok — önce panelden grup açılmalı.</Text>
                ) : (
                  <View style={styles.pickRow}>
                    {grupSecenekleri.map((g) => {
                      const secili = editGrupId === g.id;
                      return (
                        <Pressable
                          key={g.id}
                          style={[styles.pickChip, secili && styles.pickChipActive]}
                          onPress={() => setEditGrupId(g.id)}
                        >
                          <Text style={[styles.pickChipText, secili && styles.pickChipTextActive]}>{g.ad}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
              {/* Branş grupla aynı desende seçiliyor — eskiden bu alan formda hiç
                  yoktu ve updateSporcuBilgi brans_id'ye dokunmuyordu. */}
              <View>
                <Text style={styles.fieldLabel}>BRANŞ</Text>
                {bransSecenekleri.length === 0 ? (
                  <Text style={styles.pickEmpty}>Kayıtlı branş yok — önce panelden branş açılmalı.</Text>
                ) : (
                  <View style={styles.pickRow}>
                    {bransSecenekleri.map((b) => {
                      const secili = editBransId === b.id;
                      return (
                        <Pressable
                          key={b.id}
                          style={[styles.pickChip, secili && styles.pickChipActive]}
                          onPress={() => setEditBransId(secili ? null : b.id)}
                        >
                          <Text style={[styles.pickChipText, secili && styles.pickChipTextActive]}>{b.ad}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
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

      {/* Onay sorusu — tek dokunuşla pasife alma yok. */}
      <AppModal visible={aktiflikOnayOpen} transparent animationType="fade" onRequestClose={() => setAktiflikOnayOpen(false)}>
        <Pressable style={styles.onayBackdrop} onPress={() => setAktiflikOnayOpen(false)}>
          <Pressable style={styles.onayCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.onayTitle}>{detay?.aktif ? 'Pasife alınsın mı?' : 'Yeniden aktif edilsin mi?'}</Text>
            <Text style={styles.onayText}>
              {detay?.aktif
                ? `${detay?.ad} sporcu listesinden gizlenecek. Kayıt silinmez; ödeme ve yoklama geçmişi korunur ve istendiğinde geri alınabilir.`
                : `${detay?.ad} yeniden aktif sporcu listesinde görünecek.`}
            </Text>
            <View style={styles.onayActions}>
              <Pressable style={[styles.onayBtn, styles.onayBtnGhost]} onPress={() => setAktiflikOnayOpen(false)}>
                <Text style={styles.onayBtnGhostText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                style={[styles.onayBtn, detay?.aktif ? styles.onayBtnDanger : styles.onayBtnAccent]}
                onPress={onAktiflikDegistir}
                disabled={aktiflikKaydediliyor}
              >
                <Text style={detay?.aktif ? styles.onayBtnDangerText : styles.onayBtnAccentText}>
                  {aktiflikKaydediliyor ? 'İşleniyor…' : detay?.aktif ? 'Pasife Al' : 'Geri Al'}
                </Text>
              </Pressable>
            </View>
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
  profileSub: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted, marginTop: 2 },
  badgeDanger: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.dangerSoft },
  badgeDangerText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.danger },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  veliRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  veliAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  veliAvatarText: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.sm, color: colors.textMuted },
  veliName: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  veliInfo: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textMuted, marginTop: 1 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  statLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.8, color: colors.textDim },
  sectionCard: { gap: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim },
  legendRow: { flexDirection: 'row', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textMuted },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  calCell: { width: '12.5%', height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  calCellText: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  paymentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  paymentIconDanger: { backgroundColor: colors.dangerSoft },
  paymentIconOk: { backgroundColor: colors.accentSoft },
  paymentIconBekliyor: { backgroundColor: colors.chip },
  emptyText: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.textDim },
  paymentTitle: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.md, color: colors.textBright },
  paymentDetail: { fontFamily: fontFamily.manropeSemi, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  paymentDetailDanger: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.danger, marginTop: 1 },
  paymentTutar: { fontFamily: fontFamily.archivoSemi, fontSize: fontSize.md, color: colors.textBright },
  paymentAction: { alignItems: 'flex-end', gap: 6 },
  remindBtn: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.accent },
  remindBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.onAccent },
  noteBox: { backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 13, marginTop: spacing.xs },
  noteText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, color: colors.textMuted, lineHeight: 19 },
  noteMeta: { fontFamily: fontFamily.manropeBold, fontSize: fontSize.sm, color: colors.textDim, marginTop: spacing.xs },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '85%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  sheetTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright, marginTop: spacing.md },
  fieldLabel: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1.5, color: colors.textDim, marginBottom: 7 },
  input: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.textBright, fontSize: fontSize.base, fontFamily: fontFamily.manropeSemi },
  saveBtn: { marginTop: spacing.md, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.md, color: colors.onAccent },
  badgeWarning: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.warningSoft },
  badgeWarningText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.micro, color: colors.warning },
  ayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  ayBtn: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  ayBtnDisabled: { opacity: 0.4 },
  ayBtnText: { color: colors.textMuted, fontSize: fontSize.lg, marginTop: -2 },
  ayLabel: { flex: 1, textAlign: 'center', fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textBright },
  aktiflikBtn: { marginTop: spacing.xs, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  aktiflikBtnPasife: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  aktiflikBtnGeri: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  aktiflikBtnText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base },
  aktiflikBtnTextPasife: { color: colors.danger },
  aktiflikBtnTextGeri: { color: colors.accent },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pickChip: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: radius.sm, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.border },
  pickChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  pickChipText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.sm, color: colors.textMuted },
  pickChipTextActive: { color: colors.accent },
  pickEmpty: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.sm, lineHeight: lineHeightFor(fontSize.sm), color: colors.warning },
  onayBackdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  onayCard: {
    width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.xxl,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm,
  },
  onayTitle: { fontFamily: fontFamily.archivoBold, fontSize: fontSize.lg, color: colors.textBright },
  onayText: { fontFamily: fontFamily.manropeMedium, fontSize: fontSize.base, lineHeight: lineHeightFor(fontSize.base), color: colors.textMuted },
  onayActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  onayBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  onayBtnGhost: { backgroundColor: 'transparent', borderColor: colors.border },
  onayBtnGhostText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.textMuted },
  onayBtnDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  onayBtnDangerText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.danger },
  onayBtnAccent: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  onayBtnAccentText: { fontFamily: fontFamily.manropeExtra, fontSize: fontSize.base, color: colors.accent },
  });
}
