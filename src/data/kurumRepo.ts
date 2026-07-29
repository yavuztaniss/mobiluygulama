import { supabase } from '../lib/supabase';
import type { Brans, HizmetTuruSecenegi, KurumBranslariDurumu } from './types';

// Faz 1'de tek şube (Merkez) üzerinden çalışıyor — supabase/migrations/0004_kurum_ve_sporcular.sql'deki seed id'si.
// Çoklu şube seçimi (kullanıcının kendi profiles.sube_id'sine göre) ileri bir faz konusu.
const MERKEZ_SUBE_ID = '10000000-0000-0000-0000-000000000001';

export async function getBranslar(): Promise<Brans[]> {
  const { data, error } = await supabase.from('brans').select('id, ad, ikon').order('ad');
  if (error) throw error;
  return data as Brans[];
}

export async function getHizmetTurleri(): Promise<HizmetTuruSecenegi[]> {
  const { data, error } = await supabase.from('hizmet_turu').select('id, ad, aciklama, ikon').order('ad');
  if (error) throw error;
  return data as HizmetTuruSecenegi[];
}

export async function getKurumBranslariDurumu(): Promise<KurumBranslariDurumu> {
  const [{ data: brans, error: e1 }, { data: hizmet, error: e2 }] = await Promise.all([
    supabase.from('kurum_brans_secimi').select('brans_id').eq('sube_id', MERKEZ_SUBE_ID),
    supabase.from('kurum_hizmet_turu_secimi').select('hizmet_turu_id').eq('sube_id', MERKEZ_SUBE_ID),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    seciliBranslar: (brans ?? []).map((r) => r.brans_id),
    seciliHizmetTurleri: (hizmet ?? []).map((r) => r.hizmet_turu_id),
  };
}

export async function toggleBrans(id: string): Promise<void> {
  const { data } = await supabase
    .from('kurum_brans_secimi')
    .select('brans_id')
    .eq('sube_id', MERKEZ_SUBE_ID)
    .eq('brans_id', id)
    .maybeSingle();
  if (data) {
    await supabase.from('kurum_brans_secimi').delete().eq('sube_id', MERKEZ_SUBE_ID).eq('brans_id', id);
  } else {
    await supabase.from('kurum_brans_secimi').insert({ sube_id: MERKEZ_SUBE_ID, brans_id: id });
  }
}

export async function toggleHizmetTuru(id: string): Promise<void> {
  const { data } = await supabase
    .from('kurum_hizmet_turu_secimi')
    .select('hizmet_turu_id')
    .eq('sube_id', MERKEZ_SUBE_ID)
    .eq('hizmet_turu_id', id)
    .maybeSingle();
  if (data) {
    await supabase.from('kurum_hizmet_turu_secimi').delete().eq('sube_id', MERKEZ_SUBE_ID).eq('hizmet_turu_id', id);
  } else {
    await supabase.from('kurum_hizmet_turu_secimi').insert({ sube_id: MERKEZ_SUBE_ID, hizmet_turu_id: id });
  }
}

export async function kurumBranslariKaydet(): Promise<void> {
  // toggleBrans/toggleHizmetTuru artık her tıklamada anında yazıyor, ayrı bir
  // "kaydet" adımına gerek yok — geriye dönük uyum için no-op olarak duruyor.
}

// bagimsizAntrenoreKatil kaldırıldı — sahte bekleme sırası sayacı (214) hiçbir
// tabloya yazmıyordu. Bağımsız antrenör başvuruları gerçek bir tabloya bağlanana
// dek ekran yalnızca "yakında" bilgilendirmesi gösteriyor (bkz. kurum-branslari.tsx).
