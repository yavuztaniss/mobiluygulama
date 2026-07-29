import { supabase } from '../lib/supabase';
import { avatarColorAt } from '../theme/avatarPalette';
import type { Basvuru, BasvuruDurum } from './types';

// Faz 7'de gerçek `basvuru` tablosuna taşındı (bkz.
// supabase/migrations/0013_bireysel_hakedis_basvurular.sql) — yapılandırılmış alanlar
// (dogum_yili/brans_id/grup_id/sube_id), eski serbest-metin altBilgi/detay değil.
// Onaylama artık gerçek `sporcular` satırı oluşturuyor (eskiden yalnızca durum flip'i,
// hiçbir gerçek etkisi yoktu).

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function zamanEtiketi(createdAt: string): string {
  const farkSaat = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000);
  if (farkSaat < 1) return 'az önce';
  if (farkSaat < 24) return `${farkSaat} saat önce`;
  const gun = Math.floor(farkSaat / 24);
  if (gun === 1) return 'dün';
  return `${gun} gün önce`;
}

type BasvuruRow = {
  id: string;
  ad: string;
  dogum_yili: number | null;
  brans_id: string | null;
  grup_id: string | null;
  sube_id: string | null;
  veli_ad: string | null;
  veli_telefon: string | null;
  tag: 'DENEME' | 'KAYIT';
  durum: BasvuruDurum;
  detay_notu: string | null;
  sporcu_id: string | null;
  created_at: string;
  brans: { ad: string } | null;
  grup: { ad: string } | null;
};

export async function getBasvurular(): Promise<Basvuru[]> {
  const { data, error } = await supabase
    .from('basvuru')
    .select('id, ad, dogum_yili, brans_id, grup_id, sube_id, veli_ad, veli_telefon, tag, durum, detay_notu, sporcu_id, created_at, brans:brans(ad), grup:grup(ad)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as BasvuruRow[]).map((b, i) => {
    const palette = avatarColorAt(i);
    const altParcalar = [b.dogum_yili, b.grup?.ad ?? b.brans?.ad, b.tag === 'DENEME' ? 'deneme dersi' : 'doğrudan kayıt'].filter(Boolean);
    return {
      id: b.id,
      init: initialsOf(b.ad),
      ad: b.ad,
      altBilgi: altParcalar.join(' · '),
      detay: b.detay_notu ?? '',
      veli: b.veli_ad ?? '',
      when: zamanEtiketi(b.created_at),
      tag: b.tag,
      avBg: palette.avBg,
      avFg: palette.avFg,
      durum: b.durum,
      grupId: b.grup_id,
    };
  });
}

// Onayla — grupId verilmezse başvurunun kendi grup_id'si (varsa) kullanılır. Başvuru daha
// önce onaylanıp gerçek bir sporcu_id'ye sahipse (ör. "Geri Al" sonrası tekrar onaylanıyor)
// ikinci bir sporcu satırı oluşturulmaz, yalnızca durum tekrar 'onaylandi' yapılır.
export async function onaylaBasvuru(basvuruId: string, grupId?: string | null): Promise<void> {
  const { data, error: e0 } = await supabase.from('basvuru').select('*').eq('id', basvuruId).single();
  if (e0) throw e0;
  const b = data as BasvuruRow;

  if (b.sporcu_id) {
    const { error } = await supabase.from('basvuru').update({ durum: 'onaylandi' }).eq('id', basvuruId);
    if (error) throw error;
    return;
  }

  const finalGrupId = grupId ?? b.grup_id;
  const { data: sporcu, error: e1 } = await supabase
    .from('sporcular')
    .insert({
      ad: b.ad,
      dogum_yili: b.dogum_yili,
      brans_id: b.brans_id,
      grup_id: finalGrupId,
      sube_id: b.sube_id,
      veli_ad: b.veli_ad,
      veli_telefon: b.veli_telefon,
      kayit_tarihi: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from('basvuru')
    .update({ durum: 'onaylandi', sporcu_id: (sporcu as { id: string }).id, grup_id: finalGrupId })
    .eq('id', basvuruId);
  if (e2) throw e2;
}

export async function reddetBasvuru(basvuruId: string): Promise<void> {
  const { error } = await supabase.from('basvuru').update({ durum: 'reddedildi' }).eq('id', basvuruId);
  if (error) throw error;
}

export async function geriAlBasvuru(basvuruId: string): Promise<void> {
  const { error } = await supabase.from('basvuru').update({ durum: 'bekliyor' }).eq('id', basvuruId);
  if (error) throw error;
}
