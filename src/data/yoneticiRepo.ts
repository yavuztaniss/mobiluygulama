import { supabase } from '../lib/supabase';
import { getVeliPushTokenlari, sendExpoPush } from './pushRepo';
import type { DuyuruGonderSonuc, DuyuruHedefi, DuyuruTuru, Sube, YoneticiOzet } from './types';

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// toISOString() UTC'ye çevirdiği için UTC+3'te 00:00-03:00 arası bir önceki günü
// verir — yerel bileşenlerden kurulur (aynı desen: antrenorRepo.todayStr).
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ayBasiStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Şube filtresi "seçim varsa uygula" demek; seçim yoksa sorgu olduğu gibi geçer
// ("Tüm Şubeler"). Sekiz sorguda aynı if'i tekrarlamak, birinde unutmaya açık
// olurdu ve unutulan yerde KPI sessizce kurum geneline dönerdi.
//
// ⚠ `select()` DİZGİSİ SABİT KALMALI. supabase-js, select metnini DERLEME
// ZAMANINDA ayrıştırıp dönüş tipini üretiyor. Şablon dizgiyle (`id${gomme}`)
// yazılınca ayrıştırıcı metni çözemiyor ve tip `ParserError<...>`'a düşüyor;
// TS2589 ("excessively deep") ve satır tipi kayıpları oradan geliyordu. Bu
// yüzden her sorgu, gömmeli ve gömmesiz iki AYRI sabit dizgiyle kuruluyor.
type SayimSorgusu = PromiseLike<{ count: number | null; error: unknown }>;
type SatirSorgusu<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

// Şubeler artık gerçek `sube` tablosundan geliyor.
export async function getSubeler(): Promise<Sube[]> {
  const { data, error } = await supabase.from('sube').select('id, ad, alt_bilgi').order('ad');
  if (error) throw error;
  return ((data ?? []) as { id: string; ad: string; alt_bilgi: string | null }[]).map((s) => ({
    id: s.id,
    ad: s.ad,
    altBilgi: s.alt_bilgi ?? '',
  }));
}

// Özet KPI'ları gerçek tablolardan hesaplanır.
//
// ŞUBE FİLTRESİ GERÇEKTİR (0038/0039).
//   Eskiden `subeId` yalnızca BAŞLIKTAKİ ETİKETİ değiştiriyordu; rakamlar her
//   zaman tüm kurumu kapsıyordu. Ekranda "Rakamlar tüm kurumu kapsar" notu
//   olduğu için yalan değildi, ama seçicinin tek işlevi yanıltıcı bir başlık
//   yazmaktı: "Bostanlı" seçilince Bostanlı yazıyor, Merkez'in rakamları
//   duruyordu.
//
//   Artık `subeId` verildiğinde HER KPI o şubeye daraltılıyor:
//     · sporcular  → doğrudan sube_id
//     · odeme      → sporcular!inner(sube_id) (ödeme sporcuya, sporcu şubeye ait)
//     · yoklama    → sporcular!inner(sube_id)
//     · antrenman  → grup!inner(sube_id) (antrenman gruba, grup şubeye ait)
//
//   `subeId === null` "TÜM ŞUBELER" demektir — eskisi gibi "listedeki ilk şube"
//   değil. Bu ayrım önemli: null'da ilk şubenin adını yazıp kurum rakamını
//   göstermek, tam olarak düzeltilen yanılgının kendisiydi.
//
// ⚠ ŞUBESİZ KAYITLAR: `!inner` gömmesi, şubesi atanmamış (sube_id NULL) bir
//   sporcunun ödemesini/yoklamasını şube filtresinin DIŞINDA bırakır. Bu doğru
//   davranış ("Bostanlı'nın rakamı" sorusunun cevabı değiller), ama şubelerin
//   toplamı kurum toplamını tutmayabilir. Panel bunu Ayarlar > Şubeler
//   ekranındaki "Şubesi atanmamış kayıtlar var" uyarısıyla görünür kılıyor.
export async function getOzet(subeId: string | null): Promise<YoneticiOzet> {
  const bugun = new Date();
  const altiAyOnce = ayBasiStr(new Date(bugun.getFullYear(), bugun.getMonth() - 5, 1));

  const ayBasiUtc = new Date(bugun.getFullYear(), bugun.getMonth(), 1).toISOString();

  // Şube seçiliyken sporcu/grup üzerinden gömülü filtre; seçili değilken gömme
  // HİÇ eklenmiyor (gereksiz join maliyeti olmasın).
  const sporcuSayimi: SayimSorgusu = subeId
    ? supabase.from('sporcular').select('id', { count: 'exact', head: true }).eq('sube_id', subeId)
    : supabase.from('sporcular').select('id', { count: 'exact', head: true });

  // created_at timestamptz — düz 'YYYY-MM-01' string'i UTC gece yarısı sayılır; yerel
  // ay başının gerçek UTC anını (toISOString) göndererek 00:00-03:00 sınır kaçağı önlenir.
  const yeniSporcuSayimi: SayimSorgusu = subeId
    ? supabase
        .from('sporcular')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', ayBasiUtc)
        .eq('sube_id', subeId)
    : supabase.from('sporcular').select('id', { count: 'exact', head: true }).gte('created_at', ayBasiUtc);

  const tahsilatSorgusu: SatirSorgusu<{ tutar: number; odendi_tarihi: string | null }> = subeId
    ? supabase
        .from('odeme')
        .select('tutar, odendi_tarihi, sporcular!inner(sube_id)')
        .eq('durum', 'odendi')
        .gte('odendi_tarihi', altiAyOnce)
        .eq('sporcular.sube_id', subeId)
    : supabase.from('odeme').select('tutar, odendi_tarihi').eq('durum', 'odendi').gte('odendi_tarihi', altiAyOnce);

  const gecikenSorgusu: SatirSorgusu<{ tutar: number }> = subeId
    ? supabase
        .from('odeme_gorunum') // 0033
        .select('tutar, sporcular!inner(sube_id)')
        .eq('efektif_durum', 'gecikti')
        .eq('sporcular.sube_id', subeId)
    : supabase.from('odeme_gorunum').select('tutar').eq('efektif_durum', 'gecikti');

  const katilanSayimi: SayimSorgusu = subeId
    ? supabase
        .from('yoklama')
        .select('id, sporcular!inner(sube_id)', { count: 'exact', head: true })
        .eq('durum', 'katildi')
        .eq('sporcular.sube_id', subeId)
    : supabase.from('yoklama').select('id', { count: 'exact', head: true }).eq('durum', 'katildi');

  const yoklamaSayimi: SayimSorgusu = subeId
    ? supabase
        .from('yoklama')
        .select('id, sporcular!inner(sube_id)', { count: 'exact', head: true })
        .not('durum', 'is', null)
        .eq('sporcular.sube_id', subeId)
    : supabase.from('yoklama').select('id', { count: 'exact', head: true }).not('durum', 'is', null);

  // Antrenman sporcuya değil GRUBA bağlı; şube bağı grup üzerinden kuruluyor.
  const antrenmanSayimi: SayimSorgusu = subeId
    ? supabase
        .from('antrenman')
        .select('id, grup!inner(sube_id)', { count: 'exact', head: true })
        .eq('tarih', todayStr())
        .eq('grup.sube_id', subeId)
    : supabase.from('antrenman').select('id', { count: 'exact', head: true }).eq('tarih', todayStr());

  const [
    { data: subeRows, error: eSube },
    { count: sporcuSayisi, error: eSporcu },
    { count: yeniSporcu, error: eYeni },
    { data: odemeRows, error: eOdeme },
    { data: gecikenRows, error: eGeciken },
    { count: katilanSayisi, error: eKatilan },
    { count: yoklamaSayisi, error: eYoklama },
    { count: bugunAntrenman, error: eAntrenman },
  ] = await Promise.all([
    supabase.from('sube').select('id, ad').order('ad'),
    sporcuSayimi,
    yeniSporcuSayimi,
    tahsilatSorgusu,
    gecikenSorgusu,
    katilanSayimi,
    yoklamaSayimi,
    antrenmanSayimi,
  ]);
  const hata = eSube || eSporcu || eYeni || eOdeme || eGeciken || eKatilan || eYoklama || eAntrenman;
  if (hata) throw hata;

  const subeler = (subeRows ?? []) as { id: string; ad: string }[];
  // subeId null ise "Tüm Şubeler". Bulunamayan bir id de (silinmiş şube)
  // buraya düşer — sessizce başka bir şubenin adını yazmaktansa kapsamı
  // doğru söylemek yeğdir.
  const sube = subeId ? subeler.find((s) => s.id === subeId) : null;

  // Son 6 ayın tahsilat serisi — odendi_tarihi'nin YYYY-MM anahtarına göre gruplanır.
  const aylikTahsilat = new Map<string, number>();
  ((odemeRows ?? []) as { tutar: number; odendi_tarihi: string | null }[]).forEach((o) => {
    if (!o.odendi_tarihi) return;
    const key = o.odendi_tarihi.slice(0, 7);
    aylikTahsilat.set(key, (aylikTahsilat.get(key) ?? 0) + Number(o.tutar));
  });
  const tahsilatSonAltiAy = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - (5 - i), 1);
    return { ay: AY_KISA[d.getMonth()], tutar: aylikTahsilat.get(ayKey(d)) ?? 0 };
  });

  const buAyKey = ayKey(bugun);
  const buAyIslem = ((odemeRows ?? []) as { odendi_tarihi: string | null }[]).filter(
    (o) => o.odendi_tarihi?.slice(0, 7) === buAyKey
  ).length;

  const geciken = (gecikenRows ?? []) as { tutar: number }[];
  const gecikenToplam = geciken.reduce((a, g) => a + Number(g.tutar), 0);

  // Tarih etiketi bugünden üretilir ('Salı, 29 Temmuz' formatı).
  const gunAdi = bugun.toLocaleDateString('tr-TR', { weekday: 'long' });
  const gunAy = bugun.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  return {
    // Şube seçilmemişse etiket "Tüm Şubeler" — ve rakamlar da gerçekten öyle.
    // Tek şubeli kulüpte ekran seçiciyi hiç çizmiyor, orada bu etiket görünmez.
    subeAd: sube?.ad ?? 'Tüm Şubeler',
    tarihEtiketi: `${gunAdi}, ${gunAy} · Yönetim Paneli`,
    kpiSporcu: sporcuSayisi ?? 0,
    kpiSporcuArtis: `+${yeniSporcu ?? 0} bu ay`,
    kpiTahsilat: formatTL(aylikTahsilat.get(buAyKey) ?? 0),
    kpiTahsilatAlt: `${buAyIslem} işlem`,
    kpiGeciken: geciken.length,
    kpiGecikenTutar: geciken.length ? `${formatTL(gecikenToplam)} toplam` : '',
    yoklamaOrani: (yoklamaSayisi ?? 0) > 0 ? Math.round(((katilanSayisi ?? 0) / (yoklamaSayisi ?? 1)) * 100) : 0,
    bugunAntrenman: bugunAntrenman ?? 0,
    tahsilatSonAltiAy,
  };
}

// Duyuru hedef kitlesi artık gerçek `grup` tablosundan geliyor — her grubun gerçek
// (distinct) veli sayısı `veli_sporcu` join'iyle hesaplanıyor. "tum" sabit seçeneği
// tüm velilerin distinct sayısını temsil ediyor.
export async function getDuyuruHedefleri(): Promise<DuyuruHedefi[]> {
  const [{ data: gruplar, error: e1 }, { data: baglar, error: e2 }] = await Promise.all([
    supabase.from('grup').select('id, ad').order('ad'),
    supabase.from('veli_sporcu').select('veli_id, sporcu:sporcular(grup_id)'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const veliSetPerGrup = new Map<string, Set<string>>();
  const tumVeliler = new Set<string>();
  (baglar as any[] ?? []).forEach((b) => {
    tumVeliler.add(b.veli_id);
    const grupId = b.sporcu?.grup_id;
    if (!grupId) return;
    if (!veliSetPerGrup.has(grupId)) veliSetPerGrup.set(grupId, new Set());
    veliSetPerGrup.get(grupId)!.add(b.veli_id);
  });

  return [
    { id: 'tum', ad: 'Tüm Veliler', veliSayisi: tumVeliler.size },
    ...((gruplar ?? []) as { id: string; ad: string }[]).map((g) => ({
      id: g.id,
      ad: g.ad,
      veliSayisi: veliSetPerGrup.get(g.id)?.size ?? 0,
    })),
  ];
}

// getDuyuruTaslak kaldırıldı — duyuru formu boş açılıyor (örnek metin placeholder olarak ekranda).

export function duyuruHedefSayisi(hedefler: DuyuruHedefi[], hedefIds: string[]): number {
  if (hedefIds.includes('tum')) return hedefler.find((h) => h.id === 'tum')?.veliSayisi ?? 0;
  return hedefler.filter((h) => hedefIds.includes(h.id)).reduce((a, h) => a + h.veliSayisi, 0);
}

export async function duyuruGonder(input: {
  hedefIds: string[];
  baslik: string;
  mesaj: string;
  tur: DuyuruTuru;
  smsIle: boolean;
}): Promise<DuyuruGonderSonuc> {
  const tumVeliler = input.hedefIds.includes('tum');
  const { data: duyuru, error } = await supabase
    .from('duyuru')
    .insert({ baslik: input.baslik, mesaj: input.mesaj, tur: input.tur, tum_veliler: tumVeliler, sms_ile: input.smsIle })
    .select('id')
    .single();
  if (error) throw error;

  if (!tumVeliler && input.hedefIds.length > 0) {
    const rows = input.hedefIds.map((grupId) => ({ duyuru_id: duyuru.id, grup_id: grupId }));
    const { error: e2 } = await supabase.from('duyuru_hedef').insert(rows);
    if (e2) throw e2;
  }

  // Gerçek push gönderimi (0020): hedef velilerin kayıtlı cihaz token'larına
  // Expo Push API üzerinden — kayıtlı cihaz yoksa 0 döner, akış etkilenmez.
  const tokenlar = await getVeliPushTokenlari(tumVeliler ? 'tum' : input.hedefIds);
  const pushCihaz = await sendExpoPush(tokenlar, input.baslik, input.mesaj);

  const hedefler = await getDuyuruHedefleri();
  return { veliSayisi: duyuruHedefSayisi(hedefler, input.hedefIds), smsIle: input.smsIle, pushCihaz };
}
