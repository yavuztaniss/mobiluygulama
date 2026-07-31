import { supabase } from '../lib/supabase';
import { avatarColorAt } from '../theme/avatarPalette';
import type {
  AntrenorTakvimBlok,
  AntrenorTakvimGun,
  BekleyenRezervasyon,
  BireyselAntrenor,
  BireyselGunSlotlari,
  BireyselOdemeTipi,
  BireyselPaketDurumu,
  BireyselRezervasyonSonuc,
  BireyselSlot,
  KazancAySecenegi,
  KazancOzet,
  MusaitlikGunu,
  MusaitlikIstisna,
} from './types-bireysel';

// Faz 7'de gerçek `bireysel_antrenor`/`bireysel_musaitlik`/`bireysel_istisna`/
// `bireysel_paket`/`bireysel_rezervasyon` tablolarına taşındı (bkz.
// supabase/migrations/0013_bireysel_hakedis_basvurular.sql). `BireyselAntrenor.id`
// artık `bireysel_antrenor.antrenor_id` (= gerçek `profiles.id`) — diğer tüm
// tablolar da antrenor_id'yi doğrudan bu şekilde referans alıyor.

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const AYLAR_TR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const AYLAR_TR2 = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function paketAvantajYuzdesi(a: BireyselAntrenor): number {
  return Math.round((1 - a.paketFiyatN / (a.tekFiyatN * 10)) * 100);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function weekDays(): Date[] {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
function toISO(d: Date): string {
  // toISOString() UTC'ye çeviriyor — yerel gece yarısı (setHours(0,0,0,0)) UTC+3'te bir
  // önceki güne kayıyor (ör. 27 Temmuz 00:00 yerel = 26 Temmuz 21:00 UTC). Yerel takvim
  // bileşenlerinden string kurmak bu kaymayı önlüyor.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatTarihUzun(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}
function saatAraligi(bas: string, bit: string): string[] {
  const h1 = parseInt(bas.split(':')[0], 10);
  const h2 = parseInt(bit.split(':')[0], 10);
  const out: string[] = [];
  for (let h = h1; h < h2; h++) out.push(String(h).padStart(2, '0') + ':00');
  return out;
}
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
function mapRezervasyonError(error: { code?: string } & Error): Error {
  if (error.code === '23505') return new Error('Bu saat az önce doldu, başka bir saat seçin.');
  return error;
}

// ---- Veli tarafı ----

type AntrenorRow = {
  antrenor_id: string;
  deneyim_yil: number;
  puan: number | null;
  bio: string | null;
  musait: boolean;
  tek_fiyat: number;
  paket_fiyat: number;
  paket_ders_sayisi: number;
  profiles: { ad: string } | null;
  brans: { ad: string } | null;
};

async function toBireyselAntrenor(row: AntrenorRow, index: number): Promise<BireyselAntrenor> {
  const ad = row.profiles?.ad ?? 'Antrenör';
  const { count } = await supabase
    .from('bireysel_rezervasyon')
    .select('id', { count: 'exact', head: true })
    .eq('antrenor_id', row.antrenor_id)
    .eq('durum', 'tamamlandi');
  const palette = avatarColorAt(index);
  return {
    id: row.antrenor_id,
    ad,
    init: initialsOf(ad),
    brans: row.brans?.ad ?? '',
    deneyim: row.deneyim_yil,
    puan: row.puan != null ? row.puan.toFixed(1).replace('.', ',') : '—',
    dersSayisi: count ?? 0,
    musait: row.musait,
    ilkBosEtiket: row.musait ? undefined : 'Müsaitlik için iletişime geçin',
    tekFiyatN: row.tek_fiyat,
    paketFiyatN: row.paket_fiyat,
    bio: row.bio ?? '',
    avBg: palette.avBg,
    avFg: palette.avFg,
  };
}

const ANTRENOR_SELECT = 'antrenor_id, deneyim_yil, puan, bio, musait, tek_fiyat, paket_fiyat, paket_ders_sayisi, profiles:profiles(ad), brans:brans(ad)';

export async function getBireyselAntrenorler(): Promise<BireyselAntrenor[]> {
  const { data, error } = await supabase.from('bireysel_antrenor').select(ANTRENOR_SELECT).order('created_at');
  if (error) throw error;
  const rows = (data ?? []) as unknown as AntrenorRow[];
  return Promise.all(rows.map((r, i) => toBireyselAntrenor(r, i)));
}

export async function getBireyselFiltreler(): Promise<string[]> {
  const { data, error } = await supabase.from('bireysel_antrenor').select('brans:brans(ad)');
  if (error) throw error;
  const branslar = Array.from(
    new Set(((data ?? []) as unknown as { brans: { ad: string } | null }[]).map((r) => r.brans?.ad).filter(Boolean) as string[])
  );
  return ['Tümü', ...branslar];
}

export async function getBireyselAntrenor(antrenorId: string): Promise<BireyselAntrenor> {
  const { data, error } = await supabase.from('bireysel_antrenor').select(ANTRENOR_SELECT).eq('antrenor_id', antrenorId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Antrenör bulunamadı');
  return toBireyselAntrenor(data as unknown as AntrenorRow, 0);
}

export async function getBireyselPaket(antrenorId: string, sporcuId: string): Promise<BireyselPaketDurumu | null> {
  if (!antrenorId || !sporcuId) return null;
  const { data, error } = await supabase
    .from('bireysel_paket')
    .select('kalan, toplam')
    .eq('antrenor_id', antrenorId)
    .eq('sporcu_id', sporcuId)
    .gt('kalan', 0)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as BireyselPaketDurumu | null;
}

export async function getBireyselHafta(antrenorId: string): Promise<BireyselGunSlotlari[]> {
  const days = weekDays();
  const startStr = toISO(days[0]);
  const endStr = toISO(days[6]);

  const [{ data: musRows }, { data: istRows }, { data: rezRows }] = await Promise.all([
    supabase.from('bireysel_musaitlik').select('gun_index, baslangic_saat, bitis_saat, aktif').eq('antrenor_id', antrenorId),
    supabase.from('bireysel_istisna').select('tarih').eq('antrenor_id', antrenorId).gte('tarih', startStr).lte('tarih', endStr),
    supabase
      .from('bireysel_rezervasyon')
      .select('tarih, saat')
      .eq('antrenor_id', antrenorId)
      .gte('tarih', startStr)
      .lte('tarih', endStr)
      .not('durum', 'in', '(reddedildi,iptal)'),
  ]);
  const mus = (musRows ?? []) as { gun_index: number; baslangic_saat: string; bitis_saat: string; aktif: boolean }[];
  const istisnaTarihler = new Set(((istRows ?? []) as { tarih: string }[]).map((r) => r.tarih));
  const doluSet = new Set(((rezRows ?? []) as { tarih: string; saat: string }[]).map((r) => `${r.tarih}|${r.saat}`));

  return days.map((d, i) => {
    const iso = toISO(d);
    const musRow = mus.find((m) => m.gun_index === i && m.aktif);
    let slotlar: BireyselSlot[] = [];
    if (musRow && !istisnaTarihler.has(iso)) {
      slotlar = saatAraligi(musRow.baslangic_saat, musRow.bitis_saat).map((saat) => ({
        saat,
        durum: doluSet.has(`${iso}|${saat}`) ? 'dolu' : 'musait',
      }));
    }
    return { gunAdi: GUN_ADLARI[i], gunNo: String(d.getDate()), slotlar };
  });
}

export async function rezervasyonOlustur(
  antrenorId: string,
  sporcuId: string,
  gunIndex: number,
  saat: string,
  odemeTipi: BireyselOdemeTipi
): Promise<BireyselRezervasyonSonuc> {
  const days = weekDays();
  const tarih = toISO(days[gunIndex]);
  const { data: antData } = await supabase
    .from('bireysel_antrenor')
    .select('tek_fiyat, paket_fiyat, paket_ders_sayisi')
    .eq('antrenor_id', antrenorId)
    .maybeSingle();
  const ant = antData as { tek_fiyat: number; paket_fiyat: number; paket_ders_sayisi: number } | null;

  if (odemeTipi === 'paket') {
    const { data: paketRow } = await supabase
      .from('bireysel_paket')
      .select('id, kalan, toplam')
      .eq('antrenor_id', antrenorId)
      .eq('sporcu_id', sporcuId)
      .gt('kalan', 0)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (paketRow) {
      const p = paketRow as { id: string; kalan: number; toplam: number };
      // TUTAR GÖNDERİLMİYOR — sunucu antrenörün ilan ettiği ücretten yazıyor (0036).
      // Eskiden istemcinin daha önce okuduğu paket_fiyat üzerinden hesaplanıp
      // gönderiliyordu; değiştirilmiş bir istemci istediği rakamı yazdırabilirdi.
      // TUTAR ve PAKET DÜŞÜMÜ SUNUCUDA (0036 + 0037).
      // Eskiden düşüm burada, AYRI bir istekte yapılıyordu — istemci o isteği
      // atlayabiliyor ve paket hiç azalmadan sınırsız ders alınabiliyordu.
      // Denetimde ölçüldü: 3 rezervasyon açıldı, kalan 6'da kaldı; paket
      // tükendikten sonra bile geçiyordu. Artık düşüm rezervasyonla AYNI
      // transaction'da, tetikleyicide: paket satırı kilitleniyor,
      // sporcu/antrenör eşleşmesi ve kalan > 0 doğrulanıyor, sonra azaltılıyor.
      const { error } = await supabase
        .from('bireysel_rezervasyon')
        .insert({ antrenor_id: antrenorId, sporcu_id: sporcuId, tarih, saat, odeme_tipi: 'paket', paket_id: p.id });
      if (error) throw mapRezervasyonError(error);

      // Güncel kalanı SUNUCUDAN oku. İstemcide hesaplamak, düşümü sunucuya
      // taşımanın anlamını kaybettirirdi: ekranda gösterilen sayı ile
      // veritabanındaki değer ayrışabilirdi.
      const { data: guncel } = await supabase
        .from('bireysel_paket')
        .select('kalan')
        .eq('id', p.id)
        .maybeSingle();
      const kalan = (guncel as { kalan: number } | null)?.kalan ?? p.kalan - 1;
      return { odemeNotu: `Paketten düşüldü · kalan ${kalan}/${p.toplam} ders`, kalanPaket: kalan };
    }
  }

  const tekFiyat = ant?.tek_fiyat ?? 0;
  // Uygulama içi kart tahsilatı YOK — ücret kulüp tarafından (resepsiyon/havale) tahsil edilir,
  // sahte "kart •••• ile ödendi" iddiası gösterilmez.
  const odemeNotu = `Ödeme kulüp üzerinden tahsil edilecektir · ${formatTL(tekFiyat)}`;
  // TUTAR GÖNDERİLMİYOR (0036). tekFiyat yalnızca kullanıcıya gösterilen
  // ödeme notunu kurmak için okunuyor; veritabanına yazılan rakamı sunucu
  // bireysel_antrenor.tek_fiyattan belirliyor.
  const { error } = await supabase
    .from('bireysel_rezervasyon')
    .insert({ antrenor_id: antrenorId, sporcu_id: sporcuId, tarih, saat, odeme_tipi: 'tek', odeme_notu: odemeNotu });
  if (error) throw mapRezervasyonError(error);
  return { odemeNotu };
}

// ---- Antrenör tarafı ----

export async function getBireyselTakvimHaftasi(): Promise<AntrenorTakvimGun[]> {
  const myId = await currentUserId();
  if (!myId) return [];
  const days = weekDays();
  const startStr = toISO(days[0]);
  const endStr = toISO(days[6]);

  const [{ data: antrenmanRows }, { data: rezRows }, { data: musRows }, { data: istRows }] = await Promise.all([
    supabase.from('antrenman').select('id, tarih, saat1, saat2, grup:grup(ad)').gte('tarih', startStr).lte('tarih', endStr),
    supabase
      .from('bireysel_rezervasyon')
      .select('id, tarih, saat, tesis, durum, odeme_tipi, sporcu:sporcular(ad)')
      .eq('antrenor_id', myId)
      .gte('tarih', startStr)
      .lte('tarih', endStr)
      .not('durum', 'in', '(reddedildi,iptal)'),
    supabase.from('bireysel_musaitlik').select('gun_index, baslangic_saat, bitis_saat, aktif').eq('antrenor_id', myId),
    supabase.from('bireysel_istisna').select('tarih, aciklama').eq('antrenor_id', myId).gte('tarih', startStr).lte('tarih', endStr),
  ]);

  const aRows = (antrenmanRows ?? []) as unknown as { id: string; tarih: string; saat1: string | null; saat2: string | null; grup: { ad: string } | null }[];
  const rRows = (rezRows ?? []) as unknown as { id: string; tarih: string; saat: string; tesis: string | null; durum: string; odeme_tipi: string; sporcu: { ad: string } | null }[];
  const mus = (musRows ?? []) as { gun_index: number; baslangic_saat: string; bitis_saat: string; aktif: boolean }[];
  const istRowsTyped = (istRows ?? []) as { tarih: string; aciklama: string | null }[];

  return days.map((d, i) => {
    const iso = toISO(d);
    const istisna = istRowsTyped.find((r) => r.tarih === iso);
    if (istisna) {
      const blok: AntrenorTakvimBlok = { id: 'istisna-' + iso, saat: '—', tur: 'kapali', baslik: 'KAPALI · İstisna gün', sub: istisna.aciklama ?? 'Tüm gün müsait değil' };
      return { gunAdi: GUN_ADLARI[i], gunNo: String(d.getDate()), bloklar: [blok] };
    }

    const bloklar: AntrenorTakvimBlok[] = [];
    aRows
      .filter((a) => a.tarih === iso)
      .forEach((a) => {
        bloklar.push({ id: a.id, saat: a.saat1 ?? '', tur: 'grup', baslik: a.grup?.ad ?? 'Grup Antrenmanı', sub: a.saat2 ? `${a.saat1} – ${a.saat2}` : '' });
      });
    const doluSaatler = new Set<string>();
    rRows
      .filter((r) => r.tarih === iso)
      .forEach((r) => {
        doluSaatler.add(r.saat);
        const ad = r.sporcu?.ad ?? '';
        const bekliyor = r.durum === 'onay_bekliyor';
        const durumEtiket = r.durum === 'tamamlandi' ? 'Tamamlandı' : r.durum === 'gelmedi' ? 'Gelmedi' : bekliyor ? 'Onay bekliyor' : r.odeme_tipi === 'paket' ? 'Paketten' : 'Tek ders';
        bloklar.push({
          id: r.id,
          saat: r.saat,
          tur: 'bireysel',
          baslik: `${ad} · Bireysel`,
          sub: `${r.tesis ?? 'Salon'} · ${durumEtiket}`,
          bekliyor,
          rezervasyonId: r.id,
          sonuclandirilabilir: r.durum === 'onaylandi' && iso <= toISO(new Date()),
        });
      });

    const musRow = mus.find((m) => m.gun_index === i && m.aktif);
    if (musRow) {
      saatAraligi(musRow.baslangic_saat, musRow.bitis_saat).forEach((saat) => {
        if (doluSaatler.has(saat) || aRows.some((a) => a.tarih === iso && a.saat1 === saat)) return;
        bloklar.push({ id: 'bos-' + iso + '-' + saat, saat, tur: 'bos', baslik: '', sub: '' });
      });
    }

    bloklar.sort((x, y) => x.saat.localeCompare(y.saat));
    return { gunAdi: GUN_ADLARI[i], gunNo: String(d.getDate()), bloklar };
  });
}

export async function getBekleyenRezervasyonlar(): Promise<BekleyenRezervasyon[]> {
  const myId = await currentUserId();
  if (!myId) return [];
  const { data, error } = await supabase
    .from('bireysel_rezervasyon')
    .select('id, tarih, saat, sporcu:sporcular(ad)')
    .eq('antrenor_id', myId)
    .eq('durum', 'onay_bekliyor')
    .order('tarih');
  if (error) throw error;
  return ((data ?? []) as unknown as { id: string; tarih: string; saat: string; sporcu: { ad: string } | null }[]).map((r) => {
    const ad = r.sporcu?.ad ?? '';
    return {
      id: r.id,
      gunNo: String(new Date(r.tarih + 'T00:00:00').getDate()),
      saat: r.saat,
      sporcuAd: ad,
      sporcuInit: initialsOf(ad),
      baslik: `${ad} · Bireysel Ders`,
      detay: `${formatTarihUzun(r.tarih)} · ${r.saat} · Onay bekliyor`,
    };
  });
}

export async function rezervasyonYanitla(rezervasyonId: string, cevap: 'onayla' | 'reddet'): Promise<{ mesaj: string }> {
  const durum = cevap === 'onayla' ? 'onaylandi' : 'reddedildi';
  const { data, error } = await supabase
    .from('bireysel_rezervasyon')
    .update({ durum })
    .eq('id', rezervasyonId)
    .select('saat, sporcu:sporcular(ad)')
    .single();
  if (error) throw error;
  const row = data as unknown as { saat: string; sporcu: { ad: string } | null };
  const ad = row.sporcu?.ad ?? '';
  const mesaj = cevap === 'onayla' ? `${ad} · ${row.saat} onaylandı — takvime işlendi` : `${ad} · ${row.saat} reddedildi — slot yeniden açıldı`;
  return { mesaj };
}

export async function rezervasyonSonuclandir(rezervasyonId: string, sonuc: 'tamamlandi' | 'gelmedi'): Promise<void> {
  const { error } = await supabase
    .from('bireysel_rezervasyon')
    .update({ durum: sonuc, sonuc_zamani: new Date().toISOString() })
    .eq('id', rezervasyonId);
  if (error) throw error;
}

export async function getMusaitlik(): Promise<MusaitlikGunu[]> {
  const myId = await currentUserId();
  if (!myId) return [];
  const { data } = await supabase.from('bireysel_musaitlik').select('gun_index, baslangic_saat, bitis_saat, aktif').eq('antrenor_id', myId);
  const rows = (data ?? []) as { gun_index: number; baslangic_saat: string; bitis_saat: string; aktif: boolean }[];
  return GUN_ADLARI.map((gun, i) => {
    const row = rows.find((r) => r.gun_index === i);
    return { gun, saatAraligi: row && row.aktif ? `${row.baslangic_saat} – ${row.bitis_saat}` : 'Kapalı', aktif: row?.aktif ?? false };
  });
}

export async function toggleMusaitlikGun(index: number): Promise<void> {
  const myId = await currentUserId();
  if (!myId) return;
  const { data: existing } = await supabase.from('bireysel_musaitlik').select('id, aktif').eq('antrenor_id', myId).eq('gun_index', index).maybeSingle();
  if (existing) {
    const row = existing as { id: string; aktif: boolean };
    await supabase.from('bireysel_musaitlik').update({ aktif: !row.aktif }).eq('id', row.id);
  } else {
    await supabase.from('bireysel_musaitlik').insert({ antrenor_id: myId, gun_index: index, baslangic_saat: '09:00', bitis_saat: '18:00', aktif: true });
  }
}

export async function musaitlikKaydet(): Promise<void> {
  // Değişiklikler her toggle'da zaten anında yazılıyor — bu buton yalnızca
  // ekranı kapatıp onay mesajı gösteriyor (mock'taki davranışla birebir aynı).
}

export async function getIstisnalar(): Promise<MusaitlikIstisna[]> {
  const myId = await currentUserId();
  if (!myId) return [];
  const { data, error } = await supabase.from('bireysel_istisna').select('id, tarih, aciklama').eq('antrenor_id', myId).order('tarih');
  if (error) throw error;
  return ((data ?? []) as { id: string; tarih: string; aciklama: string | null }[]).map((r) => ({
    id: r.id,
    etiket: `${formatTarihUzun(r.tarih)} · ${r.aciklama ?? 'Tüm gün'}`,
  }));
}

export async function istisnaEkle(): Promise<void> {
  const myId = await currentUserId();
  if (!myId) return;
  const nextSunday = toISO(weekDays()[6]);
  const { error } = await supabase.from('bireysel_istisna').insert({ antrenor_id: myId, tarih: nextSunday, aciklama: 'Tüm gün' });
  if (error && error.code !== '23505') throw error;
}

export async function istisnaSil(id: string): Promise<void> {
  const { error } = await supabase.from('bireysel_istisna').delete().eq('id', id);
  if (error) throw error;
}

async function brutForMonth(myId: string, yil: number, ay: number): Promise<number> {
  const ayBasi = toISO(new Date(yil, ay - 1, 1));
  const ayBitis = toISO(new Date(yil, ay, 1));
  const { data } = await supabase
    .from('bireysel_rezervasyon')
    .select('tutar')
    .eq('antrenor_id', myId)
    .eq('durum', 'tamamlandi')
    .gte('tarih', ayBasi)
    .lt('tarih', ayBitis);
  return ((data ?? []) as { tutar: number }[]).reduce((a, r) => a + r.tutar, 0);
}

export async function getKazancAylar(): Promise<KazancAySecenegi[]> {
  const now = new Date();
  const out: KazancAySecenegi[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, ad: AYLAR_TR2[d.getMonth()] });
  }
  return out;
}

const BOS_KAZANC: KazancOzet = {
  ayAd: '', ayAd2: '', net: '₺0', brut: '₺0', kulupPay: '₺0', odemeNotu: '', trend: '',
  dersAdet: 0, saat: 0, ogrenci: 0, ortalamaDersUcret: '₺0', toplamSeans: 0,
  tamamlanan: 0, tamamlananPct: 0, iptal: 0, iptalPct: 0, noshow: 0, noshowPct: 0, haftalar: [], altNot: '',
};

export async function getKazancOzet(ayId: string): Promise<KazancOzet> {
  const myId = await currentUserId();
  if (!myId) return BOS_KAZANC;

  const [yilStr, ayStr] = ayId.split('-');
  const yil = parseInt(yilStr, 10);
  const ay = parseInt(ayStr, 10);
  const ayBasiIso = toISO(new Date(yil, ay - 1, 1));
  const ayBitisIso = toISO(new Date(yil, ay, 1));

  const [{ data }, oncekiBrut] = await Promise.all([
    supabase
      .from('bireysel_rezervasyon')
      .select('tarih, tutar, durum, sporcu_id')
      .eq('antrenor_id', myId)
      .gte('tarih', ayBasiIso)
      .lt('tarih', ayBitisIso)
      .in('durum', ['tamamlandi', 'iptal', 'gelmedi']),
    brutForMonth(myId, ay === 1 ? yil - 1 : yil, ay === 1 ? 12 : ay - 1),
  ]);
  const rows = (data ?? []) as { tarih: string; tutar: number; durum: string; sporcu_id: string }[];

  const tamamRows = rows.filter((r) => r.durum === 'tamamlandi');
  const brut = tamamRows.reduce((a, r) => a + r.tutar, 0);
  const pay = Math.round(brut * 0.2);
  const net = brut - pay;
  const dersAdet = tamamRows.length;
  const ogrenci = new Set(tamamRows.map((r) => r.sporcu_id)).size;
  const iptal = rows.filter((r) => r.durum === 'iptal').length;
  const noshow = rows.filter((r) => r.durum === 'gelmedi').length;
  const toplamSeans = dersAdet + iptal + noshow;
  const pct = (n: number) => (toplamSeans > 0 ? Math.round((n / toplamSeans) * 100) : 0);

  const haftaMap = new Map<number, number>();
  tamamRows.forEach((r) => {
    const gun = new Date(r.tarih + 'T00:00:00').getDate();
    const haftaNo = Math.floor((gun - 1) / 7);
    haftaMap.set(haftaNo, (haftaMap.get(haftaNo) ?? 0) + r.tutar);
  });
  const haftaGirdiler = Array.from(haftaMap.entries()).sort((a, b) => a[0] - b[0]);
  const maxHafta = Math.max(1, ...haftaGirdiler.map(([, tutar]) => tutar));
  const sonHafta = haftaGirdiler.length > 0 ? haftaGirdiler[haftaGirdiler.length - 1][0] : -1;
  const haftalar = haftaGirdiler.map(([hafta, tutar]) => ({
    ad: `Hafta ${hafta + 1}`,
    val: '₺' + (tutar / 1000).toFixed(1).replace('.', ',') + 'b',
    pct: Math.max(8, Math.round((tutar / maxHafta) * 78)),
    aktif: hafta === sonHafta,
  }));

  const trend = oncekiBrut > 0 ? `${brut >= oncekiBrut ? '+' : ''}%${Math.round(((brut - oncekiBrut) / oncekiBrut) * 100)} · önceki aya göre` : '';

  return {
    ayAd: AYLAR_TR[ay - 1],
    ayAd2: AYLAR_TR2[ay - 1],
    net: formatTL(net),
    brut: formatTL(brut),
    kulupPay: formatTL(pay),
    odemeNotu: "Hakediş her ayın 5'inde IBAN'ınıza aktarılır",
    trend,
    dersAdet,
    saat: dersAdet,
    ogrenci,
    ortalamaDersUcret: dersAdet > 0 ? formatTL(Math.round(brut / dersAdet)) : '₺0',
    toplamSeans,
    tamamlanan: dersAdet,
    tamamlananPct: pct(dersAdet),
    iptal,
    iptalPct: pct(iptal),
    noshow,
    noshowPct: pct(noshow),
    haftalar,
    altNot: 'No-show seanslarda ders ücreti tahsil edilir — hakedişinize dahildir',
  };
}
