import { supabase } from '../lib/supabase';
import type { AidatPlani, FinansOzet, GelirGiderAy, GelirKategori, OdemeYontemi, TahsilatKaydi } from './types';

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseTutar(input: string): number {
  return parseInt(input.replace(/[^\d]/g, ''), 10) || 0;
}

// toISOString() UTC'ye çevirdiği için UTC+3'te 00:00-03:00 arası bir önceki günü
// verir — yerel bileşenlerden kurulur (aynı desen: antrenorRepo.todayStr).
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Kaydın tarihine göre "Bugün" / "Dün" / "19 Temmuz" etiketi üretir — mock'taki
// sabit metinlerin aksine gerçek tarihe göre her okumada yeniden hesaplanıyor.
function gunEtiketi(tarihStr: string): string {
  const tarih = new Date(tarihStr + 'T00:00:00');
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const dun = new Date(bugun);
  dun.setDate(dun.getDate() - 1);
  if (tarih.getTime() === bugun.getTime()) return 'Bugün';
  if (tarih.getTime() === dun.getTime()) return 'Dün';
  return tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

type AidatPlaniRow = { id: string; ad: string; alt: string | null; fiyat: number; beklenen: number | null };
type OdemeRow = {
  id: string;
  aciklama: string;
  tutar: number;
  yontem: OdemeYontemi;
  odendi_tarihi: string | null;
  created_at: string;
  sporcu: { ad: string } | null;
};

function mapPlan(p: AidatPlaniRow): AidatPlani {
  return { id: p.id, ad: p.ad, alt: p.alt ?? '', fiyat: formatTL(p.fiyat), beklenen: formatTL(p.beklenen ?? p.fiyat) };
}

const SELECT_PLAN = 'id, ad, alt, fiyat, beklenen';

// Gelir/gider trendi, kategori kırılımı ve toplamlar artık gerçek tablolardan hesaplanıyor
// (mock finansAggregates kaldırıldı): gelir = odeme(durum='odendi'), gider = gider tablosu (0014),
// Mağaza = siparis_kalem (adet × birim_fiyat), Bireysel Ders = bireysel_rezervasyon(tamamlandi).
// Yönetici bu tabloların tümünü RLS ile okuyabiliyor.
export async function getFinansOzet(): Promise<FinansOzet> {
  const bugun = new Date();

  const [
    { data: planRows, error: e1 },
    { data: odemeRows, error: e2 },
    { data: giderRows, error: e3 },
    { data: kalemRows, error: e4 },
    { data: bireyselRows, error: e5 },
    { data: subeRow, error: e6 },
  ] = await Promise.all([
    supabase.from('aidat_plani').select(SELECT_PLAN).order('fiyat', { ascending: false }),
    supabase
      .from('odeme')
      .select('id, aciklama, tutar, yontem, odendi_tarihi, created_at, sporcu:sporcular(ad)')
      .eq('durum', 'odendi')
      .order('odendi_tarihi', { ascending: false }),
    supabase.from('gider').select('tutar, tarih'),
    supabase.from('siparis_kalem').select('adet, birim_fiyat, siparis:siparis(durum)'),
    supabase.from('bireysel_rezervasyon').select('tutar').eq('durum', 'tamamlandi'),
    supabase.from('sube').select('ad').order('ad').limit(1).maybeSingle(),
  ]);
  const hata = e1 || e2 || e3 || e4 || e5 || e6;
  if (hata) throw hata;

  const planlar = (planRows as AidatPlaniRow[]).map(mapPlan);

  // created_at UTC timestamptz — 00:00-03:00 TR aralığında slice(0,10) bir önceki
  // günü verirdi; yerel bileşenlerden çevrilir (odendi_tarihi zaten date, dokunulmaz).
  const localDateStr = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const tahsilatlar: TahsilatKaydi[] = (odemeRows as unknown as OdemeRow[]).map((o) => {
    const gun = gunEtiketi(o.odendi_tarihi ?? localDateStr(o.created_at));
    return {
      id: o.id,
      ad: o.sporcu?.ad ?? '—',
      ne: o.aciklama,
      sub: gun,
      tutar: Math.round(o.tutar).toString(),
      yontem: o.yontem,
      grup: gun,
    };
  });

  const tahsilatToplam = tahsilatlar.reduce((a, t) => a + parseTutar(t.tutar), 0);

  // Aylık gelir/gider serisi (son 4 ay) — odeme.odendi_tarihi ve gider.tarih
  // YYYY-MM anahtarına göre gruplanır.
  const gelirAylik = new Map<string, number>();
  (odemeRows as unknown as OdemeRow[]).forEach((o) => {
    const t = o.odendi_tarihi ?? localDateStr(o.created_at);
    const key = t.slice(0, 7);
    gelirAylik.set(key, (gelirAylik.get(key) ?? 0) + Number(o.tutar));
  });
  const giderAylik = new Map<string, number>();
  ((giderRows ?? []) as { tutar: number; tarih: string }[]).forEach((g) => {
    const key = g.tarih.slice(0, 7);
    giderAylik.set(key, (giderAylik.get(key) ?? 0) + Number(g.tutar));
  });
  const ggAylar: GelirGiderAy[] = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - (3 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { ay: AY_KISA[d.getMonth()], gelir: gelirAylik.get(key) ?? 0, gider: giderAylik.get(key) ?? 0 };
  });

  // Gelir kategorileri — yalnızca gerçek tablolardan türetilebilen üç kalem;
  // tutarı 0 olan kalem gösterilmez (uydurma yüzde yok).
  // Yalnızca TESLİM edilmiş siparişler gelir sayılır — hazırlanıyor/hazır durumundaki
  // siparişler henüz tahsil edilmemiş olabilir (bireysel tarafın 'tamamlandi' filtresiyle tutarlı).
  const magazaToplam = ((kalemRows ?? []) as unknown as { adet: number; birim_fiyat: number; siparis: { durum: string } | null }[])
    .filter((k) => k.siparis?.durum === 'teslim')
    .reduce((a, k) => a + Number(k.adet) * Number(k.birim_fiyat), 0);
  const bireyselToplam = ((bireyselRows ?? []) as { tutar: number }[]).reduce((a, r) => a + Number(r.tutar), 0);
  const tumKategoriler: { ad: string; tutarN: number; renkAnahtar: GelirKategori['renkAnahtar'] }[] = [
    { ad: 'Aidatlar', tutarN: tahsilatToplam, renkAnahtar: 'accent' },
    { ad: 'Bireysel Ders', tutarN: bireyselToplam, renkAnahtar: 'info' },
    { ad: 'Mağaza', tutarN: magazaToplam, renkAnahtar: 'warning' },
  ];
  const hamKategoriler = tumKategoriler.filter((k) => k.tutarN > 0);
  const kategoriToplamN = hamKategoriler.reduce((a, k) => a + k.tutarN, 0);
  const kategoriler: GelirKategori[] = hamKategoriler.map((k) => ({
    ad: k.ad,
    tutar: formatTL(k.tutarN),
    pct: `%${Math.round((k.tutarN / kategoriToplamN) * 100)}`,
    renkAnahtar: k.renkAnahtar,
  }));

  const giderToplam = ((giderRows ?? []) as { tutar: number }[]).reduce((a, g) => a + Number(g.tutar), 0);
  const net = tahsilatToplam - giderToplam;

  return {
    subeAd: (subeRow as { ad: string } | null)?.ad ?? '—',
    planlar,
    tahsilatlar,
    islemSayisi: tahsilatlar.length,
    tahsilatToplam: formatTL(tahsilatToplam),
    ggAylar,
    kategoriler,
    kategoriToplam: formatTL(kategoriToplamN),
    toplamGelir: formatTL(tahsilatToplam),
    toplamGider: giderToplam > 0 ? `−${formatTL(giderToplam)}` : formatTL(0),
    net: `${net < 0 ? '−' : ''}${formatTL(Math.abs(net))}`,
  };
}

export async function updateAidatPlani(id: string, input: { ad: string; alt: string; fiyat: string; beklenen: string }): Promise<AidatPlani> {
  const { data, error } = await supabase
    .from('aidat_plani')
    .update({ ad: input.ad, alt: input.alt, fiyat: parseTutar(input.fiyat), beklenen: parseTutar(input.beklenen) })
    .eq('id', id)
    .select(SELECT_PLAN)
    .single();
  if (error) throw error;
  return mapPlan(data as AidatPlaniRow);
}

export async function addAidatPlani(input: { ad: string; alt: string; fiyat: string; beklenen: string }): Promise<AidatPlani> {
  const fiyat = parseTutar(input.fiyat);
  const { data, error } = await supabase
    .from('aidat_plani')
    .insert({ ad: input.ad, alt: input.alt, fiyat, beklenen: parseTutar(input.beklenen) || fiyat })
    .select(SELECT_PLAN)
    .single();
  if (error) throw error;
  return mapPlan(data as AidatPlaniRow);
}

export async function recordPayment(input: {
  sporcuId: string;
  aciklama: string;
  tutar: string;
  yontem: OdemeYontemi;
}): Promise<void> {
  // Sporcunun AÇIK borcu (gecikti/bekliyor) varsa yeni satır eklemek yerine o satır
  // 'odendi'ye çevrilir — yoksa hem borç açık kalır (Sporcular rozeti + GECİKEN KPI
  // hiç düşmezdi) hem de aynı dönem için ikinci bir 'odendi' kaydı doğardı.
  const { data: acikRows, error: eAcik } = await supabase
    .from('odeme')
    .select('id')
    .eq('sporcu_id', input.sporcuId)
    .in('durum', ['gecikti', 'bekliyor'])
    .order('created_at')
    .limit(1);
  if (eAcik) throw eAcik;
  const acik = ((acikRows ?? []) as { id: string }[])[0];

  if (acik) {
    const { error } = await supabase
      .from('odeme')
      .update({ durum: 'odendi', tutar: parseTutar(input.tutar), yontem: input.yontem, odendi_tarihi: todayStr() })
      .eq('id', acik.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('odeme').insert({
    sporcu_id: input.sporcuId,
    aciklama: input.aciklama,
    tutar: parseTutar(input.tutar),
    yontem: input.yontem,
    durum: 'odendi',
    odendi_tarihi: todayStr(),
  });
  if (error) throw error;
}
