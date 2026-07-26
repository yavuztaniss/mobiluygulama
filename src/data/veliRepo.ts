import { supabase } from '../lib/supabase';
import type { ChildId } from '../context/ChildContext';
import {
  ANA_SAYFA,
  BILDIRIMLER,
  IZIN_ANTRENMANLAR,
  IZIN_SEBEPLERI,
  KONUSMALAR,
  MAGAZA_KATEGORILER,
  MAGAZA_URUNLER,
  REHBER,
  SERVIS_TAKIP,
  VELI_PROFIL,
} from './mock/veli';
import type {
  AnaSayfaOzet,
  Bildirim,
  ChatMesaj,
  Etkinlik,
  EtkinlikSonuc,
  GelisimBeceri,
  IznAntrenman,
  Konusma,
  KulupDuyurusu,
  MagazaUrunVeli,
  OdemeGecmisKalem,
  OdemeOzet,
  RehberKisi,
  ServisTakip,
  VeliProfil,
  YoklamaGelisim,
  YoklamaGun,
} from './types-veli';
import type { OdemeYontemi } from './types';

const DELAY_MS = 300;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parseTutar(s: string): number {
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
}
function formatDateTR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
function formatDateTimeTR(dateStr: string, saat: string | null): string {
  const gun = new Date(dateStr + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  return saat ? `${gun} · ${saat}` : gun;
}
function zamanEtiketi(createdAt: string): string {
  const farkSaat = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
  if (farkSaat < 1) return 'Şimdi';
  if (farkSaat < 24) return `${farkSaat} sa`;
  const gun = Math.floor(farkSaat / 24);
  if (gun === 1) return 'Dün';
  if (gun < 7) return `${gun} gün`;
  return `${Math.floor(gun / 7)} hafta`;
}
function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
const YONTEM_ETIKET: Record<OdemeYontemi, string> = {
  kart: 'Kredi kartı •••• 4521',
  havale: 'Havale / EFT',
  elden: 'Elden',
};

type OdemeRow = {
  id: string;
  aciklama: string;
  tutar: number;
  yontem: OdemeYontemi;
  durum: 'bekliyor' | 'gecikti' | 'odendi';
  son_odeme_tarihi: string | null;
  odendi_tarihi: string | null;
};

// Aidat durumu ve ödeme kaydı artık `odeme` tablosunda (bkz. supabase/migrations/0007_odeme.sql)
// — tek kaynak, hem burada hem Yönetici > Finans (finansRepo.recordPayment) tarafından okunup yazılıyor.
const BOS_ODEME_OZET: OdemeOzet = { durum: 'odendi', tutar: '₺0', kapsam: '', sonOdeme: '', taksit: '₺0', gecmis: [] };

export async function getOdemeOzet(sporcuId: ChildId): Promise<OdemeOzet> {
  // ChildContext ilk render'da selectedChildId'yi henüz gerçek uuid ile doldurmamış
  // olabilir (async veli_sporcu sorgusu sürerken) — boş id'yle sorgu atmak Postgres'te
  // "invalid input syntax for type uuid" hatası verir, o yüzden burada erken çıkılıyor.
  if (!sporcuId) return BOS_ODEME_OZET;

  const [{ data: guncelRows, error: e1 }, { data: gecmisRows, error: e2 }] = await Promise.all([
    supabase
      .from('odeme')
      .select('id, aciklama, tutar, yontem, durum, son_odeme_tarihi, odendi_tarihi')
      .eq('sporcu_id', sporcuId)
      .in('durum', ['bekliyor', 'gecikti'])
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('odeme')
      .select('id, aciklama, tutar, yontem, durum, son_odeme_tarihi, odendi_tarihi')
      .eq('sporcu_id', sporcuId)
      .eq('durum', 'odendi')
      .order('odendi_tarihi', { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const gecmis: OdemeGecmisKalem[] = (gecmisRows as OdemeRow[]).map((o) => ({
    id: o.id,
    title: o.aciklama,
    date: o.odendi_tarihi ? formatDateTR(o.odendi_tarihi) : '',
    method: YONTEM_ETIKET[o.yontem],
    amount: formatTL(o.tutar),
  }));

  const guncel = (guncelRows as OdemeRow[])[0];
  if (guncel) {
    return {
      durum: guncel.durum as 'bekliyor' | 'gecikti',
      tutar: formatTL(guncel.tutar),
      kapsam: guncel.aciklama,
      sonOdeme: guncel.son_odeme_tarihi ? formatDateTR(guncel.son_odeme_tarihi) : '',
      taksit: formatTL(guncel.tutar / 3),
      gecmis,
    };
  }
  const son = gecmis[0];
  return {
    durum: 'odendi',
    tutar: son?.amount ?? '₺0',
    kapsam: son?.title ?? '',
    sonOdeme: '',
    taksit: son ? formatTL(parseTutar(son.amount) / 3) : '₺0',
    odemeTarihi: son?.date,
    gecmis,
  };
}

const BOS_ANA_SAYFA: AnaSayfaOzet = {
  bugunAntrenman: { var: false, branch: '', title: '', saat1: '', saat2: '', venue: '', coach: '', coachInit: '', coachRole: '' },
  sonYoklama: { title: '', sub: '', pct: 0, katildi: false },
  aidat: { durum: 'odendi', tutar: '₺0', sonOdeme: '', taksit: '₺0' },
  duyurular: [],
};

export async function getAnaSayfa(childId: ChildId): Promise<AnaSayfaOzet> {
  // Aynı yarış durumu (bkz. getOdemeOzet yorumu): selectedChildId henüz gelmediyse
  // ANA_SAYFA[''] undefined döner, spread ile bozuk bir nesne oluşmasın diye erken çıkılıyor.
  if (!childId || !ANA_SAYFA[childId]) return BOS_ANA_SAYFA;

  const base = ANA_SAYFA[childId];
  const [odeme, duyurular] = await Promise.all([getOdemeOzet(childId), getTumDuyurular()]);
  return {
    ...base,
    aidat: { durum: odeme.durum, tutar: odeme.tutar, sonOdeme: odeme.sonOdeme, taksit: odeme.taksit },
    duyurular: duyurular.slice(0, 3),
  };
}

// Yoklama+gelişim artık `yoklama`/`antrenman` (katılım) ve `gelisim_degerlendirme`/
// `gelisim_beceri_seviye` (beceri notu, yalnızca gonderildi=true) tablolarından okunuyor —
// bkz. supabase/migrations/0008_yoklama_gelisim.sql. Bu fazda yalnızca U12 Basketbol
// (Ali Kaya) için gerçek antrenman/gelişim verisi seed edildi; başka bir sporcu için
// (henüz gerçek antrenör/antrenman bağlantısı olmayan) boş özet döner.
const BOS_YOKLAMA_GELISIM: YoklamaGelisim = {
  pct: 0,
  attCount: 0,
  missCount: 0,
  planCount: 0,
  trendText: '',
  calDays: [],
  skills: [],
  noteText: '',
  noteDate: '',
  coach: '',
  coachInit: '',
};

export async function getYoklamaGelisim(childId: ChildId): Promise<YoklamaGelisim> {
  if (!childId) return BOS_YOKLAMA_GELISIM;

  const { data: sporcuRow } = await supabase.from('sporcular').select('grup_id').eq('id', childId).maybeSingle();
  const grupId = (sporcuRow as { grup_id: string | null } | null)?.grup_id;
  if (!grupId) return BOS_YOKLAMA_GELISIM;

  const [{ data: antrenmanlar }, { data: gd }, { data: antrenorRow }] = await Promise.all([
    supabase.from('antrenman').select('id, tarih').eq('grup_id', grupId).order('tarih'),
    supabase.from('gelisim_degerlendirme').select('id, not_metni, tarih').eq('sporcu_id', childId).eq('gonderildi', true).maybeSingle(),
    supabase.from('sporcu_antrenor').select('antrenor:profiles(ad)').eq('sporcu_id', childId).limit(1).maybeSingle(),
  ]);

  const aRows = (antrenmanlar ?? []) as { id: string; tarih: string }[];
  if (aRows.length === 0) return BOS_YOKLAMA_GELISIM;

  const antrenmanIds = aRows.map((a) => a.id);
  const { data: yoklamaRows } = await supabase
    .from('yoklama')
    .select('antrenman_id, durum')
    .eq('sporcu_id', childId)
    .in('antrenman_id', antrenmanIds);
  const yRows = (yoklamaRows ?? []) as { antrenman_id: string; durum: string | null }[];

  const attCount = yRows.filter((y) => y.durum === 'katildi').length;
  const missCount = yRows.filter((y) => y.durum === 'katilmadi').length;
  const planCount = aRows.length - yRows.length;
  const pct = attCount + missCount > 0 ? Math.round((attCount / (attCount + missCount)) * 100) : 0;

  const calDays: YoklamaGun[] = aRows.map((a) => {
    const y = yRows.find((r) => r.antrenman_id === a.id);
    const durum: YoklamaGun['durum'] = y?.durum === 'katildi' ? 'katildi' : y?.durum === 'katilmadi' ? 'katilmadi' : 'planli';
    return { d: new Date(a.tarih + 'T00:00:00').getDate(), durum };
  });

  let skills: GelisimBeceri[] = [];
  const gdRow = gd as { id: string; not_metni: string; tarih: string | null } | null;
  if (gdRow) {
    const { data: seviyeRows } = await supabase
      .from('gelisim_beceri_seviye')
      .select('seviye, beceri:beceri(ad, sira)')
      .eq('degerlendirme_id', gdRow.id);
    skills = ((seviyeRows ?? []) as any[])
      .map((r) => ({ name: r.beceri?.ad ?? '', lvl: r.seviye as number, sira: r.beceri?.sira ?? 0 }))
      .sort((a, b) => a.sira - b.sira)
      .map(({ name, lvl }) => ({ name, lvl }));
  }

  const coachAd = (antrenorRow as any)?.antrenor?.ad ?? '';

  return {
    pct,
    attCount,
    missCount,
    planCount,
    trendText: missCount === 0 ? 'Bu dönemde devamsızlık yok' : `Bu dönemde ${missCount} devamsızlık`,
    calDays,
    skills,
    noteText: gdRow?.not_metni ?? '',
    noteDate: gdRow?.tarih ? formatDateTR(gdRow.tarih) : '',
    coach: coachAd,
    coachInit: coachAd ? initialsOf(coachAd) : '',
  };
}

export async function getServisTakip(): Promise<ServisTakip> {
  return delay(SERVIS_TAKIP);
}

export async function getMagazaKategoriler(): Promise<string[]> {
  return delay(MAGAZA_KATEGORILER);
}
export async function getMagazaUrunler(): Promise<MagazaUrunVeli[]> {
  return delay(MAGAZA_URUNLER);
}

let konusmalar: Konusma[] = [...KONUSMALAR];
export async function getKonusmalar(): Promise<Konusma[]> {
  return delay(konusmalar);
}
export async function getKonusma(id: string): Promise<Konusma> {
  const k = konusmalar.find((c) => c.id === id);
  if (!k) throw new Error('Konuşma bulunamadı');
  return delay(k);
}

export async function getRehber(): Promise<RehberKisi[]> {
  const mevcutAdlar = new Set(konusmalar.map((k) => k.ad));
  return delay(REHBER.filter((r) => !mevcutAdlar.has(r.ad)));
}

export async function sohbetBaslat(rehberId: string): Promise<Konusma> {
  const kisi = REHBER.find((r) => r.id === rehberId);
  if (!kisi) throw new Error('Kişi bulunamadı');
  const mevcut = konusmalar.find((k) => k.ad === kisi.ad);
  if (mevcut) return delay(mevcut);
  const yeni: Konusma = {
    id: 'k' + Date.now(),
    init: kisi.init,
    ad: kisi.ad,
    role: kisi.role,
    roleColor: kisi.roleColor,
    avBg: kisi.avBg,
    avFg: kisi.avFg,
    son: 'Yeni sohbet başlattınız',
    zaman: 'Şimdi',
    unread: 0,
  };
  konusmalar = [yeni, ...konusmalar];
  return delay(yeni);
}

const BASE_CHAT: ChatMesaj[] = [
  { who: 'c', text: 'Merhaba Elif Hanım, Ali bugün şut çalışmasında çok iyiydi. Kısa videosunu veli kanalına yükledim.', time: '14:20' },
  { who: 'c', text: "Cuma antrenmanı 30 dk erken başlayacak, 16:30'da salonda olalım.", time: '14:21' },
  { who: 'p', text: 'Merhaba hocam, harika haber! Cuma erken geliriz.', time: '14:32' },
];
let chatMessages = [...BASE_CHAT];
const AUTO_REPLIES = ['Rica ederim, iyi akşamlar dilerim.', 'Not aldım, teşekkür ederim.', 'Tamamdır, Cuma görüşürüz.'];
let replyIdx = 0;

export async function getChatMesajlari(): Promise<ChatMesaj[]> {
  return delay(chatMessages);
}

function nowClock() {
  const n = new Date();
  return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
}

export async function sendChatMesaj(text: string): Promise<ChatMesaj[]> {
  chatMessages = [...chatMessages, { who: 'p', text, time: nowClock() }];
  return delay(chatMessages);
}

export function scheduleAutoReply(onReply: (mesajlar: ChatMesaj[]) => void) {
  return setTimeout(() => {
    chatMessages = [...chatMessages, { who: 'c', text: AUTO_REPLIES[replyIdx % AUTO_REPLIES.length], time: nowClock() }];
    replyIdx += 1;
    onReply(chatMessages);
  }, 1600);
}

export async function getIznAntrenmanlar(): Promise<IznAntrenman[]> {
  return delay(IZIN_ANTRENMANLAR);
}
export async function getIznSebepleri(): Promise<string[]> {
  return delay(IZIN_SEBEPLERI);
}

// Etkinlik (maç/turnuva) + RSVP artık gerçek `etkinlik`/`etkinlik_katilim` tablolarından
// (bkz. supabase/migrations/0009_duyuru_etkinlik.sql) — Yönetici'nin oluşturduğu etkinlik
// gerçekten Veli'ye ulaşıyor, RSVP artık çocuğa özel (eskiden `setKatilimDurumu`'nun
// sporcuId parametresi yoktu, tek çocuklu ailede fark etmiyordu).
const ETKINLIK_TAG: Record<string, string> = { mac: 'MAÇ', turnuva: 'TURNUVA', kamp: 'KAMP' };

type EtkinlikRow = {
  id: string;
  tur: string;
  baslik: string;
  tesis: string | null;
  tarih: string;
  saat: string | null;
  aciklama: string | null;
};

export async function getEtkinlikler(childId: ChildId): Promise<Etkinlik[]> {
  if (!childId) return [];
  const { data, error } = await supabase
    .from('etkinlik')
    .select('id, tur, baslik, tesis, tarih, saat, aciklama')
    .is('sonuc', null)
    .gte('tarih', new Date().toISOString().slice(0, 10))
    .order('tarih');
  if (error) throw error;
  const rows = (data ?? []) as EtkinlikRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: katilimRows } = await supabase
    .from('etkinlik_katilim')
    .select('etkinlik_id, durum')
    .eq('sporcu_id', childId)
    .in('etkinlik_id', ids);
  const kRows = (katilimRows ?? []) as { etkinlik_id: string; durum: 'bekliyor' | 'katilir' | 'katilmaz' }[];

  return rows.map((r) => ({
    id: r.id,
    tag: ETKINLIK_TAG[r.tur] ?? r.tur.toUpperCase(),
    title: r.baslik,
    sub: formatDateTimeTR(r.tarih, r.saat),
    venue: r.tesis ?? '',
    extra: r.aciklama ?? '',
    katilimDurumu: kRows.find((k) => k.etkinlik_id === r.id)?.durum ?? 'bekliyor',
  }));
}

export async function setKatilimDurumu(etkinlikId: string, sporcuId: ChildId, durum: 'katilir' | 'katilmaz'): Promise<void> {
  if (!sporcuId) return;
  const { error } = await supabase
    .from('etkinlik_katilim')
    .upsert({ etkinlik_id: etkinlikId, sporcu_id: sporcuId, durum }, { onConflict: 'etkinlik_id,sporcu_id' });
  if (error) throw error;
}

const SONUC_RENK: Record<string, { r: string; rBg: string; rFg: string }> = {
  galibiyet: { r: 'G', rBg: 'rgba(46,230,168,0.14)', rFg: '#2EE6A8' },
  maglubiyet: { r: 'M', rBg: 'rgba(255,107,122,0.14)', rFg: '#FF6B7A' },
  beraberlik: { r: 'B', rBg: 'rgba(255,180,84,0.14)', rFg: '#FFB454' },
};

export async function getEtkinlikSonuclari(): Promise<EtkinlikSonuc[]> {
  const { data, error } = await supabase
    .from('etkinlik')
    .select('id, tarih, rakip, skor_biz, skor_rakip, sonuc, sonuc_notu')
    .not('sonuc', 'is', null)
    .order('tarih', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => {
    const renk = SONUC_RENK[r.sonuc as string] ?? SONUC_RENK.beraberlik;
    return {
      id: r.id,
      r: renk.r,
      rBg: renk.rBg,
      rFg: renk.rFg,
      score: `${r.skor_biz ?? 0} – ${r.skor_rakip ?? 0}`,
      opp: r.rakip ?? '',
      date: formatDateTR(r.tarih),
      note: r.sonuc_notu ?? '',
    };
  });
}

let bildirimler = [...BILDIRIMLER];

// Son ödeme tarihi geçmiş (durum: 'gecikti') aidatlar için otomatik hatırlatma bildirimi
// oluşturur/kaldırır — gerçek bir zamanlayıcı olmadığından bildirim listesi her okunduğunda senkronize edilir.
// devSignInAs ile sahte girişte gerçek oturum olmadığından bu senkronizasyon sessizce atlanır.
async function syncOdemeGecikmeBildirimleri(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const veliId = sessionData.session?.user.id;
  if (!veliId) return;

  const { data: baglar } = await supabase.from('veli_sporcu').select('sporcu:sporcular(id, ad)').eq('veli_id', veliId);
  const cocuklar = (baglar ?? []).map((r: any) => r.sporcu).filter(Boolean) as { id: string; ad: string }[];

  for (const cocuk of cocuklar) {
    const { data: gecikmisRows } = await supabase
      .from('odeme')
      .select('aciklama, son_odeme_tarihi')
      .eq('sporcu_id', cocuk.id)
      .eq('durum', 'gecikti')
      .limit(1);
    const gecikmis = (gecikmisRows ?? [])[0] as { aciklama: string; son_odeme_tarihi: string | null } | undefined;
    const bildirimId = 'odeme-gecikme-' + cocuk.id;
    const mevcutIdx = bildirimler.findIndex((b) => b.id === bildirimId);
    if (gecikmis) {
      if (mevcutIdx === -1) {
        const tarihEtiketi = gecikmis.son_odeme_tarihi ? ` (${formatDateTR(gecikmis.son_odeme_tarihi)})` : '';
        bildirimler = [
          {
            id: bildirimId,
            grup: 'bugun',
            baslik: 'Aidat gecikti',
            aciklama: `${cocuk.ad} için ${gecikmis.aciklama} son ödeme tarihini geçti${tarihEtiketi}. Ödeme kulüp tarafından işlenince burada güncellenir.`,
            zaman: 'Şimdi',
            tur: 'odeme',
            okundu: false,
          },
          ...bildirimler,
        ];
      }
    } else if (mevcutIdx !== -1) {
      bildirimler = bildirimler.filter((b) => b.id !== bildirimId);
    }
  }
}

// Gerçek duyurular için de aynı okuma-anında-senkronize deseni (bkz. syncOdemeGecikmeBildirimleri) —
// her yeni duyuru satırı için (henüz eklenmemişse) bir bildirim ekleniyor.
async function syncDuyuruBildirimleri(): Promise<void> {
  const duyurular = await getTumDuyurular();
  for (const d of duyurular) {
    const bildirimId = 'duyuru-' + d.id;
    if (bildirimler.some((b) => b.id === bildirimId)) continue;
    bildirimler = [
      { id: bildirimId, grup: 'bugun', baslik: 'Yeni duyuru: ' + d.baslik, aciklama: d.aciklama, zaman: d.zaman, tur: 'duyuru', okundu: false },
      ...bildirimler,
    ];
  }
}

export async function getBildirimler(): Promise<Bildirim[]> {
  await syncOdemeGecikmeBildirimleri();
  await syncDuyuruBildirimleri();
  return delay(bildirimler);
}
export async function markBildirimOkundu(id: string): Promise<void> {
  bildirimler = bildirimler.map((b) => (b.id === id ? { ...b, okundu: true } : b));
  await delay(null);
}
export async function markTumuOkundu(): Promise<void> {
  bildirimler = bildirimler.map((b) => ({ ...b, okundu: true }));
  await delay(null);
}

let veliProfil: VeliProfil = { ...VELI_PROFIL };
// Duyurular artık gerçek `duyuru` tablosundan — RLS zaten yalnızca tum_veliler=true olanları
// veya bağlı sporcusunun grubuna hedeflenmiş olanları döndürüyor (bkz. 0009_duyuru_etkinlik.sql),
// client'ta ek filtre gerekmiyor.
export async function getTumDuyurular(): Promise<KulupDuyurusu[]> {
  const { data, error } = await supabase.from('duyuru').select('id, baslik, mesaj, tur, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as { id: string; baslik: string; mesaj: string; tur: KulupDuyurusu['tur']; created_at: string }[]).map((d) => ({
    id: d.id,
    baslik: d.baslik,
    aciklama: d.mesaj,
    zaman: zamanEtiketi(d.created_at),
    tur: d.tur,
  }));
}

export async function getVeliProfil(): Promise<VeliProfil> {
  return delay(veliProfil);
}

export async function updateVeliProfil(input: { ad: string; telefon: string; eposta: string }): Promise<VeliProfil> {
  veliProfil = { ...veliProfil, ...input };
  return delay(veliProfil);
}

const KAYITLI_KARTLAR = ['Kredi kartı •••• 4521', 'Kredi kartı •••• 8890', 'Banka kartı •••• 1122'];
export async function getKayitliKartlar(): Promise<string[]> {
  return delay(KAYITLI_KARTLAR);
}

export async function setOdemeYontemi(kart: string): Promise<VeliProfil> {
  veliProfil = { ...veliProfil, odemeYontemi: kart };
  return delay(veliProfil);
}
