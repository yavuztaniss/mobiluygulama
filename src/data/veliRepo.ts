import { supabase } from '../lib/supabase';
import type { ChildId } from '../context/ChildContext';
import { IZIN_SEBEPLERI } from './mock/veli';
import type {
  AnaSayfaOzet,
  Bildirim,
  Etkinlik,
  EtkinlikSonuc,
  GelisimBeceri,
  IznAntrenman,
  KulupDuyurusu,
  OdemeGecmisKalem,
  OdemeOzet,
  ServisTakip,
  VeliProfil,
  YoklamaGelisim,
  YoklamaGun,
} from './types-veli';
import type { OdemeYontemi } from './types';

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parseTutar(s: string): number {
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
}
function todayStr(): string {
  // toISOString() UTC'ye çevirdiği için UTC+3'te 00:00-03:00 arası bir önceki günü
  // verir (bkz. antrenorRepo.todayStr / bireyselRepo.toISO) — yerel bileşenlerden kur.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
// Kayıtlı kart bilgisi tutulmuyor — yöntem etiketi yalnızca `odeme.yontem` kolonundaki
// gerçek değeri anlatır, sahte kart numarası ("•••• 4521") gösterilmez.
const YONTEM_ETIKET: Record<OdemeYontemi, string> = {
  kart: 'Kart',
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
const BOS_ODEME_OZET: OdemeOzet = { durum: 'odendi', tutar: '₺0', kapsam: '', sonOdeme: '', gecmis: [] };

export async function getOdemeOzet(sporcuId: ChildId): Promise<OdemeOzet> {
  // ChildContext ilk render'da selectedChildId'yi henüz gerçek uuid ile doldurmamış
  // olabilir (async veli_sporcu sorgusu sürerken) — boş id'yle sorgu atmak Postgres'te
  // "invalid input syntax for type uuid" hatası verir, o yüzden burada erken çıkılıyor.
  if (!sporcuId) return BOS_ODEME_OZET;

  const [{ data: guncelRows, error: e1 }, { data: gecmisRows, error: e2 }] = await Promise.all([
    supabase
      // 0033: efektif_durum — 'gecikti' kolona hiç yazılmıyor, hesaplanıyor.
      // Velinin GECİKTİ rozeti bu alandan yanıyor.
      .from('odeme_gorunum')
      .select('id, aciklama, tutar, yontem, durum:efektif_durum, son_odeme_tarihi, odendi_tarihi')
      .eq('sporcu_id', sporcuId)
      .in('efektif_durum', ['bekliyor', 'gecikti'])
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
      // taksit alanı KALDIRILDI: tutarın üçe bölünmesi uydurmaydı — sistemde
      // taksit kavramı hiç yok, hiçbir plan taksitli değil ve hiçbir ekran da
      // bu değeri göstermiyordu. Veliye olmayan bir ödeme seçeneği ima ediyordu.
      gecmis,
    };
  }
  const son = gecmis[0];
  return {
    durum: 'odendi',
    tutar: son?.amount ?? '₺0',
    kapsam: son?.title ?? '',
    sonOdeme: '',
    odemeTarihi: son?.date,
    gecmis,
  };
}

const BOS_ANA_SAYFA: AnaSayfaOzet = {
  bugunAntrenman: { var: false, branch: '', title: '', saat1: '', saat2: '', venue: '', coach: '', coachInit: '', coachRole: '' },
  sonYoklama: { title: '', sub: '', pct: 0, katildi: false },
  aidat: { durum: 'odendi', tutar: '₺0', kapsam: '', sonOdeme: '' },
  duyurular: [],
};

// Ana sayfa özeti artık tamamen gerçek tablolardan: bugünkü antrenman `antrenman`
// (grup_id + bugünün tarihi), son yoklama `yoklama`⋈`antrenman`, antrenör
// `sporcu_antrenor`⋈`profiles`, aidat `odeme`, duyurular `duyuru`.
export async function getAnaSayfa(childId: ChildId): Promise<AnaSayfaOzet> {
  // Aynı yarış durumu (bkz. getOdemeOzet yorumu): selectedChildId henüz gelmediyse erken çık.
  // devSignInAs'in sahte 'dev-*' id'leri de uuid olmadığından sorguya sokulmaz.
  if (!childId || childId.startsWith('dev-')) return BOS_ANA_SAYFA;

  const [{ data: sporcuRow }, odeme, duyurular] = await Promise.all([
    supabase.from('sporcular').select('grup_id, brans:brans(ad), grup:grup(ad)').eq('id', childId).maybeSingle(),
    getOdemeOzet(childId),
    getTumDuyurular(),
  ]);
  const sporcu = sporcuRow as unknown as { grup_id: string | null; brans: { ad: string } | null; grup: { ad: string } | null } | null;
  const aidat = { durum: odeme.durum, tutar: odeme.tutar, kapsam: odeme.kapsam, sonOdeme: odeme.sonOdeme };
  const ilkDuyurular = duyurular.slice(0, 3);

  const grupId = sporcu?.grup_id ?? null;
  if (!grupId) return { ...BOS_ANA_SAYFA, aidat, duyurular: ilkDuyurular };

  const bugun = todayStr();
  const [{ data: bugunRow }, { data: sonrakiRows }, { data: antrenorRow }, { data: yoklamaRows }] = await Promise.all([
    supabase.from('antrenman').select('saat1, saat2, tesis').eq('grup_id', grupId).eq('tarih', bugun).maybeSingle(),
    supabase.from('antrenman').select('tarih, saat1, tesis').eq('grup_id', grupId).gt('tarih', bugun).order('tarih').limit(1),
    supabase.from('sporcu_antrenor').select('antrenor:profiles(ad)').eq('sporcu_id', childId).limit(1).maybeSingle(),
    supabase.from('yoklama').select('durum, antrenman:antrenman(tarih, tesis)').eq('sporcu_id', childId).not('durum', 'is', null),
  ]);

  const bugunA = bugunRow as { saat1: string | null; saat2: string | null; tesis: string | null } | null;
  const sonraki = ((sonrakiRows ?? []) as { tarih: string; saat1: string | null; tesis: string | null }[])[0];
  const coachAd = (antrenorRow as any)?.antrenor?.ad ?? '';
  const grupAd = sporcu?.grup?.ad ?? '';

  let nextTraining: string | undefined;
  if (!bugunA && sonraki) {
    const gunAdi = new Date(sonraki.tarih + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long' });
    nextTraining = [gunAdi + (sonraki.saat1 ? ` ${sonraki.saat1}` : ''), sonraki.tesis].filter(Boolean).join(' · ');
  }

  // Son yoklama: durum'u işlenmiş (katıldı/katılmadı) en güncel yoklama satırı.
  const yRows = ((yoklamaRows ?? []) as unknown as { durum: string; antrenman: { tarih: string; tesis: string | null } | null }[])
    .filter((y) => y.antrenman)
    .sort((a, b) => (a.antrenman!.tarih < b.antrenman!.tarih ? 1 : -1));
  const sonY = yRows[0];
  const attCount = yRows.filter((y) => y.durum === 'katildi').length;
  const pct = yRows.length > 0 ? Math.round((attCount / yRows.length) * 100) : 0;
  const sonYoklama = sonY
    ? {
        title: `${new Date(sonY.antrenman!.tarih + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long' })} antrenmanı`,
        sub: [grupAd, sonY.antrenman!.tesis].filter(Boolean).join(' · '),
        pct,
        katildi: sonY.durum === 'katildi',
      }
    : BOS_ANA_SAYFA.sonYoklama;

  return {
    bugunAntrenman: {
      var: !!bugunA,
      branch: sporcu?.brans?.ad ?? '',
      title: grupAd || 'Antrenman',
      saat1: bugunA?.saat1 ?? '',
      saat2: bugunA?.saat2 ?? '',
      venue: bugunA?.tesis ?? '',
      coach: coachAd,
      coachInit: coachAd ? initialsOf(coachAd) : '',
      coachRole: coachAd ? 'Antrenör' : '',
      nextTraining,
    },
    sonYoklama,
    aidat,
    duyurular: ilkDuyurular,
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

  // Katılım yüzdesi/takvimi içinde bulunulan AY ile sınırlı — ekran "{Ay} KATILIMI"
  // başlığı kullanıyor; tüm-zamanlar verisi ay dönümünde hem etiketle çelişir hem
  // takvim grid'inde farklı ayların aynı gün numaraları çakışırdı.
  const simdi = new Date();
  const ayBasi = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-01`;
  const aySonu = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-31`;
  const [{ data: antrenmanlar }, { data: gd }, { data: antrenorRow }] = await Promise.all([
    supabase.from('antrenman').select('id, tarih').eq('grup_id', grupId).gte('tarih', ayBasi).lte('tarih', aySonu).order('tarih'),
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

// Servis artık gerçek `servis_rota`/`servis_durak`/`servis_sporcu` tablolarından (bkz.
// supabase/migrations/0012_servis_magaza_izin.sql) — seçili çocuğun bağlı olduğu rotayı
// çözüyor. Gerçek GPS/canlı konum YOK — ekran rota PLANINI gösterir; ETA yalnızca varış
// durağının planlı saatinden hesaplanan tek seferlik bir tahmin.
function dakikaFarki(saat: string): number {
  const [h, m] = saat.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  const hedef = new Date();
  hedef.setHours(h, m, 0, 0);
  const fark = Math.round((hedef.getTime() - Date.now()) / 60000);
  return fark > 0 ? fark : 0;
}

export async function getServisTakip(childId: ChildId): Promise<ServisTakip | null> {
  if (!childId) return null;
  const { data: ss } = await supabase.from('servis_sporcu').select('rota_id, durak_id').eq('sporcu_id', childId).maybeSingle();
  const baglanti = ss as { rota_id: string; durak_id: string | null } | null;
  if (!baglanti) return null;

  const [{ data: rotaRow }, { data: durakRows }] = await Promise.all([
    supabase.from('servis_rota').select('*').eq('id', baglanti.rota_id).maybeSingle(),
    supabase.from('servis_durak').select('id, ad, saat').eq('rota_id', baglanti.rota_id).order('sira'),
  ]);
  if (!rotaRow) return null;
  const rota = rotaRow as { ad: string; plaka: string; sofor: string; sofor_telefon: string | null; durum_txt: string; yolda: boolean };
  const duraklar = (durakRows ?? []) as { id: string; ad: string; saat: string | null }[];
  const suankiIdx = duraklar.findIndex((d) => d.id === baglanti.durak_id);
  const varis = duraklar[duraklar.length - 1];

  return {
    hatAdi: rota.ad,
    plaka: rota.plaka,
    soforAdi: rota.sofor,
    soforInit: initialsOf(rota.sofor),
    // 0018 ile eklenen kolon — boşsa ekran "Ara" butonunu hiç göstermez
    // (yalnızca boşluktan oluşan değerler de boş sayılır, servisRepo ile aynı normalizasyon).
    soforTelefon: (rota.sofor_telefon ?? '').trim() || null,
    etaMin: varis?.saat ? dakikaFarki(varis.saat) : 0,
    etaClock: varis?.saat ?? '—',
    durum: rota.durum_txt,
    suankiDurak: suankiIdx >= 0 ? duraklar[suankiIdx].ad : (duraklar[0]?.ad ?? ''),
    routePct: rota.yolda && duraklar.length > 1 && suankiIdx >= 0 ? Math.round((suankiIdx / (duraklar.length - 1)) * 100) : 0,
    stopsLeft: suankiIdx >= 0 ? Math.max(duraklar.length - 1 - suankiIdx, 0) : Math.max(duraklar.length - 1, 0),
    bindiMesaji: rota.yolda ? `${rota.ad} planlanan rotada` : 'Servis henüz yola çıkmadı',
  };
}

// Mesajlaşma (konuşmalar/mesajlar) Faz 5'te src/data/mesajRepo.ts'e taşındı — gerçek
// `konusma`/`mesaj` tabloları + Realtime, hem Veli hem Antrenör ekranları oradan okuyor.
// Mağaza artık src/data/magazaRepo.ts'te — Yönetici ile aynı gerçek katalog/sipariş kaynağı.

// İzin Bildir — hedef zaten Faz 3'ten beri vardı (yoklama.izinli/izin_detay), yalnızca
// Veli'nin yazma izni yoktu (bkz. 0012_servis_magaza_izin.sql'deki 2 yeni policy).
type IznAntrenmanRow = { id: string; tarih: string; saat1: string | null; saat2: string | null; grup: { ad: string } | null };

function gunKisaltma(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'short' }).toUpperCase().replace('.', '');
}

export async function getIznAntrenmanlar(childId: ChildId): Promise<IznAntrenman[]> {
  if (!childId) return [];
  const { data: sporcuRow } = await supabase.from('sporcular').select('grup_id').eq('id', childId).maybeSingle();
  const grupId = (sporcuRow as { grup_id: string | null } | null)?.grup_id;
  if (!grupId) return [];

  const { data: antrenmanlar, error } = await supabase
    .from('antrenman')
    .select('id, tarih, saat1, saat2, grup:grup(ad)')
    .eq('grup_id', grupId)
    .gte('tarih', todayStr())
    .order('tarih');
  if (error) throw error;
  const aRows = (antrenmanlar ?? []) as unknown as IznAntrenmanRow[];
  if (aRows.length === 0) return [];

  const { data: yoklamalar } = await supabase
    .from('yoklama')
    .select('antrenman_id, durum, izinli')
    .eq('sporcu_id', childId)
    .in('antrenman_id', aRows.map((a) => a.id));
  const kapali = new Set(
    ((yoklamalar ?? []) as { antrenman_id: string; durum: string | null; izinli: boolean }[])
      .filter((y) => y.durum !== null || y.izinli)
      .map((y) => y.antrenman_id)
  );

  return aRows
    .filter((a) => !kapali.has(a.id))
    .map((a) => ({
      id: a.id,
      gun1: gunKisaltma(a.tarih),
      gun2: String(new Date(a.tarih + 'T00:00:00').getDate()),
      baslik: a.grup?.ad ?? 'Antrenman',
      detay: a.saat1 && a.saat2 ? `${a.saat1} – ${a.saat2}` : formatDateTR(a.tarih),
    }));
}

export async function getIznSebepleri(): Promise<string[]> {
  // Statik seçenek listesi (gerçek tablo gerektirmiyor) — sahte delay kaldırıldı.
  return IZIN_SEBEPLERI;
}

export async function izinGonder(antrenmanId: string, sporcuId: ChildId, sebep: string, detay: string): Promise<void> {
  if (!sporcuId) return;
  const izinDetay = detay.trim() ? `${sebep} · veli notu: "${detay.trim()}"` : sebep;
  const { error } = await supabase
    .from('yoklama')
    .upsert(
      { antrenman_id: antrenmanId, sporcu_id: sporcuId, izinli: true, izin_detay: izinDetay },
      { onConflict: 'antrenman_id,sporcu_id' }
    );
  if (error) {
    if (error.code === '42501') throw new Error('Bu antrenman için yoklama zaten alındı.');
    throw error;
  }
}

// İZNİ GERİ ALMA — ekrandaki "Geri Al" düğmesi bugüne kadar YALNIZCA FORMU
// SIFIRLIYORDU; veritabanına hiç dokunmuyordu. Veli izni yanlışlıkla bildirip
// geri aldığını sanıyor, antrenör yoklamada çocuğu hâlâ "izinli" görüyordu.
//
// Yoklama ALINDIKTAN SONRA geri alınamaz: RLS zaten reddediyor (veli yalnızca
// işaretlenmemiş satırı güncelleyebilir) ve mantıken de doğru — antrenman
// olmuş, katılım kaydı girilmiş, artık velinin beyanı geçerli değil.
export async function izinGeriAl(antrenmanId: string, sporcuId: ChildId): Promise<void> {
  if (!sporcuId) return;
  const { error } = await supabase
    .from('yoklama')
    .update({ izinli: false, izin_detay: null })
    .eq('antrenman_id', antrenmanId)
    .eq('sporcu_id', sporcuId);
  if (error) {
    if (error.code === '42501') throw new Error('Yoklama alındığı için izin geri alınamıyor.');
    throw error;
  }
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
  // Bu üç alan şemada VAR ama sorguda HİÇ SEÇİLMİYORDU: yönetici ücretli bir
  // kamp yayınlıyor, veli ekranında ücretsiz görünüyordu; LCV istenmeyen bir
  // etkinlikte de veliye yanıt düğmeleri gösteriliyordu.
  ucretli: boolean;
  tutar: number | null;
  lcv_istenir: boolean;
};

export async function getEtkinlikler(childId: ChildId): Promise<Etkinlik[]> {
  if (!childId) return [];
  const { data, error } = await supabase
    .from('etkinlik')
    .select('id, tur, baslik, tesis, tarih, saat, aciklama, ucretli, tutar, lcv_istenir')
    .is('sonuc', null)
    .gte('tarih', todayStr())
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
    ucretli: r.ucretli,
    // Tutar yalnızca ücretliyse anlamlı; ücretsiz etkinlikte '0 TL' yazmak
    // gereksiz gürültü.
    tutar: r.ucretli && r.tutar != null ? formatTL(r.tutar) : null,
    lcvIstenir: r.lcv_istenir,
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

export async function getEtkinlikSonuclari(): Promise<EtkinlikSonuc[]> {
  const { data, error } = await supabase
    .from('etkinlik')
    .select('id, tarih, rakip, skor_biz, skor_rakip, sonuc, sonuc_notu')
    .not('sonuc', 'is', null)
    .order('tarih', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    sonuc: (r.sonuc as EtkinlikSonuc['sonuc']) ?? 'beraberlik',
    score: `${r.skor_biz ?? 0} – ${r.skor_rakip ?? 0}`,
    opp: r.rakip ?? '',
    date: formatDateTR(r.tarih),
    note: r.sonuc_notu ?? '',
  }));
}

// Kalıcı bir bildirim tablosu henüz YOK (ileriki iş) — buradaki liste yalnızca gerçek
// verilerden (gecikmiş `odeme` satırları + `duyuru` tablosu) okuma anında sentezlenir,
// sabit/mock taban bildirim tutulmaz. "Okundu" durumu da bu yüzden yalnızca uygulama
// oturumu boyunca hafızada yaşar; kalıcı okundu takibi bildirim tablosuyla gelecek.
let bildirimler: Bildirim[] = [];
// Liste hangi hesap için sentezlendi? Aynı oturumda hesap değişirse (çıkış → farklı
// veli girişi) önceki kullanıcının bildirimleri (çocuk adı + aidat bilgisi) yeni
// kullanıcıya SIZMASIN diye sahibi değişince liste sıfırlanır.
let bildirimSahibi: string | null = null;

async function resetBildirimlerIfUserChanged(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (uid !== bildirimSahibi) {
    bildirimler = [];
    bildirimSahibi = uid;
  }
}

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
  await resetBildirimlerIfUserChanged();
  await syncOdemeGecikmeBildirimleri();
  await syncDuyuruBildirimleri();
  return bildirimler;
}
export async function markBildirimOkundu(id: string): Promise<void> {
  bildirimler = bildirimler.map((b) => (b.id === id ? { ...b, okundu: true } : b));
}
export async function markTumuOkundu(): Promise<void> {
  bildirimler = bildirimler.map((b) => ({ ...b, okundu: true }));
}

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

// Veli profili artık gerçek: ad/telefon `profiles` tablosundan, e-posta oturumdan,
// çocuk listesi `veli_sporcu`⋈`sporcular` ilişkisinden. (Eski mock'taki "belgeler" ve
// "kayıtlı kart" bölümlerinin gerçek karşılığı yok — tamamen kaldırıldı.)
const BOS_VELI_PROFIL: VeliProfil = { ad: '', telefon: '', eposta: '', cocuklar: [] };

export async function getVeliProfil(): Promise<VeliProfil> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return BOS_VELI_PROFIL;

  const [{ data: profilRow, error }, { data: baglar }] = await Promise.all([
    supabase.from('profiles').select('ad, telefon').eq('id', user.id).maybeSingle(),
    supabase
      .from('veli_sporcu')
      .select('sporcu:sporcular(id, ad, dogum_yili, numara, grup:grup(ad), brans:brans(ad))')
      .eq('veli_id', user.id),
  ]);
  if (error) throw error;

  const p = profilRow as { ad: string; telefon: string | null } | null;
  const cocuklar = ((baglar ?? []) as any[])
    .map((r) => r.sporcu)
    .filter(Boolean)
    .map((s: any) => ({
      id: s.id as string,
      ad: s.ad as string,
      brans: [s.brans?.ad, s.grup?.ad, s.dogum_yili, s.numara ? `Forma #${s.numara}` : null].filter(Boolean).join(' · '),
    }));

  return { ad: p?.ad ?? '', telefon: p?.telefon ?? '', eposta: user.email ?? '', cocuklar };
}

export async function updateVeliProfil(input: { ad: string; telefon: string }): Promise<VeliProfil> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Oturum bulunamadı — yeniden giriş yapın.');
  // role/sube_id kasıtlı olarak GÖNDERİLMİYOR — profiles üzerindeki koruma trigger'ı
  // velinin kendi rolünü/şubesini değiştirmesini reddeder.
  const { error } = await supabase.from('profiles').update({ ad: input.ad, telefon: input.telefon }).eq('id', userId);
  if (error) throw error;
  return getVeliProfil();
}
