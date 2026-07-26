import { supabase } from '../lib/supabase';
import type { Etkinlik, EtkinlikTuru } from './types';

function formatDateTR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function parseTutar(s: string): number {
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
}

type EtkinlikRow = {
  id: string;
  tur: EtkinlikTuru;
  baslik: string;
  tesis: string | null;
  tarih: string;
  saat: string | null;
  lcv_istenir: boolean;
  ucretli: boolean;
  tutar: number | null;
  grup: { ad: string } | null;
};

const SELECT_ETKINLIK = 'id, tur, baslik, tesis, tarih, saat, lcv_istenir, ucretli, tutar, grup:grup(ad)';

function mapRow(row: EtkinlikRow): Etkinlik {
  return {
    id: row.id,
    tur: row.tur,
    baslik: row.baslik,
    grup: row.grup?.ad ?? 'Tüm Gruplar',
    tesis: row.tesis ?? '',
    tarih: formatDateTR(row.tarih),
    saat: row.saat ?? '',
    lcv: row.lcv_istenir,
    ucretli: row.ucretli,
    tutar: row.tutar != null ? formatTL(row.tutar) : undefined,
  };
}

export async function getGruplar(): Promise<{ id: string; ad: string }[]> {
  const { data, error } = await supabase.from('grup').select('id, ad').order('ad');
  if (error) throw error;
  return data ?? [];
}

export async function getEtkinlikler(): Promise<Etkinlik[]> {
  const { data, error } = await supabase.from('etkinlik').select(SELECT_ETKINLIK).order('tarih');
  if (error) throw error;
  return (data as unknown as EtkinlikRow[]).map(mapRow);
}

export async function publishEtkinlik(input: {
  tur: EtkinlikTuru;
  baslik: string;
  grupId: string | null;
  tesis: string;
  tarih: string;
  saat: string;
  lcv: boolean;
  ucretli: boolean;
  tutar?: string;
}): Promise<Etkinlik> {
  const { data, error } = await supabase
    .from('etkinlik')
    .insert({
      tur: input.tur,
      baslik: input.baslik,
      grup_id: input.grupId,
      tesis: input.tesis,
      tarih: input.tarih,
      saat: input.saat,
      lcv_istenir: input.lcv,
      ucretli: input.ucretli,
      tutar: input.ucretli && input.tutar ? parseTutar(input.tutar) : null,
    })
    .select(SELECT_ETKINLIK)
    .single();
  if (error) throw error;
  return mapRow(data as unknown as EtkinlikRow);
}
