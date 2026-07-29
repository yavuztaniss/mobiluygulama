import { supabase } from '../lib/supabase';
import type { ServisDurak, ServisRota, ServisSporcu } from './types';

// Faz 6'da gerçek `servis_rota`/`servis_durak`/`servis_sporcu` tablolarına taşındı
// (bkz. supabase/migrations/0012_servis_magaza_izin.sql) — riderlar gerçek `sporcular`
// satırlarına bağlı (U12 Basketbol roster'ının gerçek bir alt kümesi), ~34 icat isim yok.

type RotaRow = {
  id: string;
  ad: string;
  sofor: string;
  sofor_telefon: string | null;
  plaka: string;
  arac: string;
  alt: string | null;
  durum_txt: string;
  yolda: boolean;
  konum_saat: string | null;
  konum_hiz: string | null;
};

type DurakRow = { id: string; rota_id: string; ad: string; sub: string | null; saat: string | null; sira: number; durum: 'gecti' | 'suan' | 'bekliyor' };

type SporcuRow = {
  rota_id: string;
  sporcu_id: string;
  sporcu: { ad: string; veli_ad: string | null; veli_telefon: string | null } | null;
  durak: { ad: string } | null;
};

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function buildRota(r: RotaRow, durakRows: DurakRow[], sporcuRows: SporcuRow[]): ServisRota {
  const duraklar: ServisDurak[] = durakRows
    .filter((d) => d.rota_id === r.id)
    .map((d) => ({ id: d.id, ad: d.ad, sub: d.sub ?? '', saat: d.saat ?? '', durum: d.durum }));
  const sporcular: ServisSporcu[] = sporcuRows
    .filter((s) => s.rota_id === r.id)
    .map((s) => {
      const ad = s.sporcu?.ad ?? '';
      return {
        id: s.sporcu_id,
        ad,
        init: initialsOf(ad),
        durakAd: s.durak?.ad ?? '',
        veliAd: s.sporcu?.veli_ad ?? '',
        veliTelefon: s.sporcu?.veli_telefon ?? '',
      };
    });
  return {
    id: r.id,
    ad: r.ad,
    sofor: r.sofor,
    soforTelefon: (r.sofor_telefon ?? '').trim() || null,
    plaka: r.plaka,
    arac: r.arac,
    alt: r.alt ?? '',
    sporcuSayisi: sporcular.length,
    yolda: r.yolda,
    durumTxt: r.durum_txt,
    konumSaat: r.konum_saat ?? '—',
    konumHiz: r.konum_hiz ?? '—',
    duraklar,
    sporcular,
  };
}

async function fetchDetay(rotalar: RotaRow[]): Promise<{ duraklar: DurakRow[]; sporcular: SporcuRow[] }> {
  if (rotalar.length === 0) return { duraklar: [], sporcular: [] };
  const ids = rotalar.map((r) => r.id);
  const [{ data: duraklar, error: e1 }, { data: sporcular, error: e2 }] = await Promise.all([
    supabase.from('servis_durak').select('id, rota_id, ad, sub, saat, sira, durum').in('rota_id', ids).order('sira'),
    supabase.from('servis_sporcu').select('rota_id, sporcu_id, sporcu:sporcular(ad, veli_ad, veli_telefon), durak:servis_durak(ad)').in('rota_id', ids),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { duraklar: (duraklar ?? []) as DurakRow[], sporcular: (sporcular ?? []) as unknown as SporcuRow[] };
}

export async function getRotalar(): Promise<ServisRota[]> {
  const { data, error } = await supabase.from('servis_rota').select('*').order('created_at');
  if (error) throw error;
  const rotalar = (data ?? []) as RotaRow[];
  const { duraklar, sporcular } = await fetchDetay(rotalar);
  return rotalar.map((r) => buildRota(r, duraklar, sporcular));
}

export async function getRotaDetay(id: string): Promise<ServisRota> {
  const { data, error } = await supabase.from('servis_rota').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Rota bulunamadı');
  const rota = data as RotaRow;
  const { duraklar, sporcular } = await fetchDetay([rota]);
  return buildRota(rota, duraklar, sporcular);
}

export async function addRota(input: { ad: string; sofor: string; soforTelefon?: string; plaka: string; arac: string; alt: string }): Promise<ServisRota> {
  const { data, error } = await supabase
    .from('servis_rota')
    .insert({
      ad: input.ad,
      sofor: input.sofor,
      sofor_telefon: input.soforTelefon?.trim() || null,
      plaka: input.plaka,
      arac: input.arac,
      alt: input.alt,
    })
    .select('*')
    .single();
  if (error) throw error;
  return buildRota(data as RotaRow, [], []);
}
