import { supabase } from '../lib/supabase';
import { finansAggregates } from './mock/finans';
import type { AidatPlani, FinansOzet, OdemeYontemi, TahsilatKaydi } from './types';

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseTutar(input: string): number {
  return parseInt(input.replace(/[^\d]/g, ''), 10) || 0;
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

export async function getFinansOzet(): Promise<FinansOzet> {
  const [{ data: planRows, error: e1 }, { data: odemeRows, error: e2 }] = await Promise.all([
    supabase.from('aidat_plani').select(SELECT_PLAN).order('fiyat', { ascending: false }),
    supabase
      .from('odeme')
      .select('id, aciklama, tutar, yontem, odendi_tarihi, created_at, sporcu:sporcular(ad)')
      .eq('durum', 'odendi')
      .order('odendi_tarihi', { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const planlar = (planRows as AidatPlaniRow[]).map(mapPlan);

  const tahsilatlar: TahsilatKaydi[] = (odemeRows as unknown as OdemeRow[]).map((o) => {
    const gun = gunEtiketi(o.odendi_tarihi ?? o.created_at.slice(0, 10));
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

  return {
    planlar,
    tahsilatlar,
    islemSayisi: tahsilatlar.length,
    tahsilatToplam: formatTL(tahsilatToplam),
    ...finansAggregates(),
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
  const { error } = await supabase.from('odeme').insert({
    sporcu_id: input.sporcuId,
    aciklama: input.aciklama,
    tutar: parseTutar(input.tutar),
    yontem: input.yontem,
    durum: 'odendi',
    odendi_tarihi: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}
