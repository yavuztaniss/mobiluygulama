import { supabase } from '../lib/supabase';
import type { SepetKalemGirdi, Siparis, SiparisDurum, Urun } from './types-magaza';

// Faz 6'da gerçek `urun`/`siparis`/`siparis_kalem` tablolarına taşındı (bkz.
// supabase/migrations/0012_servis_magaza_izin.sql) — Yönetici ve Veli artık AYNI
// katalogu okuyor (eskiden tamamen ayrı, hiç kesişmeyen iki mock katalogtu). RLS
// `urun` için herkese açık okuma sağlıyor; pasif ürünleri gizlemek Veli ekranının
// sorumluluğu (Yönetici pasif ürünleri de görüp tekrar aktif edebilmeli).

function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function formatDateTR(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

type UrunRow = {
  id: string;
  ad: string;
  aciklama: string | null;
  kategori: string;
  fiyat: number;
  stok: number;
  aktif: boolean;
  badge: string | null;
  jersey: boolean;
};

function toUrun(r: UrunRow): Urun {
  return {
    id: r.id,
    ad: r.ad,
    aciklama: r.aciklama ?? '',
    kategori: r.kategori,
    fiyat: formatTL(r.fiyat),
    fiyatN: r.fiyat,
    stok: r.stok,
    aktif: r.aktif,
    badge: r.badge ?? undefined,
    jersey: r.jersey,
  };
}

export async function getUrunler(): Promise<Urun[]> {
  const { data, error } = await supabase.from('urun').select('*').order('created_at');
  if (error) throw error;
  return ((data ?? []) as UrunRow[]).map(toUrun);
}

export async function toggleUrunAktif(id: string): Promise<void> {
  const { data } = await supabase.from('urun').select('aktif').eq('id', id).maybeSingle();
  const aktif = (data as { aktif: boolean } | null)?.aktif ?? true;
  const { error } = await supabase.from('urun').update({ aktif: !aktif }).eq('id', id);
  if (error) throw error;
}

export async function addUrun(input: { ad: string; fiyat: string; stok: number }): Promise<void> {
  const fiyatN = parseInt(input.fiyat.replace(/[^\d]/g, ''), 10) || 0;
  const { error } = await supabase.from('urun').insert({ ad: input.ad, fiyat: fiyatN, stok: input.stok, kategori: 'Aksesuar' });
  if (error) throw error;
}

type SiparisRow = {
  id: string;
  tutar: number;
  durum: SiparisDurum;
  created_at: string;
  sporcu: { ad: string; veli_ad: string | null } | null;
  siparis_kalem: { adet: number; beden: string | null; urun: { ad: string } | null }[];
};

function toSiparis(r: SiparisRow): Siparis {
  const urunOzet = r.siparis_kalem
    .map((k) => (k.urun?.ad ?? '') + (k.beden ? ' · ' + k.beden : '') + (k.adet > 1 ? ` ×${k.adet}` : ''))
    .join(', ');
  return {
    id: r.id,
    urun: urunOzet,
    veli: r.sporcu?.veli_ad ?? '',
    sporcu: r.sporcu?.ad ?? '',
    tarih: formatDateTR(r.created_at),
    tutar: formatTL(r.tutar),
    durum: r.durum,
  };
}

const SIPARIS_SELECT = 'id, tutar, durum, created_at, sporcu:sporcular(ad, veli_ad), siparis_kalem(adet, beden, urun:urun(ad))';

export async function getSiparisler(): Promise<Siparis[]> {
  const { data, error } = await supabase.from('siparis').select(SIPARIS_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as SiparisRow[]).map(toSiparis);
}

export async function setSiparisDurum(id: string, durum: SiparisDurum): Promise<void> {
  const { error } = await supabase.from('siparis').update({ durum }).eq('id', id);
  if (error) throw error;
}

// Veli — checkout: sepetteki kalemlerden gerçek `siparis`+`siparis_kalem` oluşturur.
export async function olusturSiparis(sporcuId: string, kalemler: SepetKalemGirdi[]): Promise<void> {
  if (!sporcuId || kalemler.length === 0) return;
  const tutar = kalemler.reduce((a, k) => a + k.fiyatN * k.adet, 0);
  const { data: siparis, error: e1 } = await supabase.from('siparis').insert({ sporcu_id: sporcuId, tutar }).select('id').single();
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('siparis_kalem').insert(
    kalemler.map((k) => ({
      siparis_id: (siparis as { id: string }).id,
      urun_id: k.urunId,
      beden: k.beden,
      adet: k.adet,
      birim_fiyat: k.fiyatN,
      not_metni: k.not,
    }))
  );
  if (e2) throw e2;
}

const BOS: Siparis[] = [];
export async function getSiparislerim(sporcuId: string): Promise<Siparis[]> {
  if (!sporcuId) return BOS;
  const { data, error } = await supabase
    .from('siparis')
    .select(SIPARIS_SELECT)
    .eq('sporcu_id', sporcuId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as SiparisRow[]).map(toSiparis);
}
