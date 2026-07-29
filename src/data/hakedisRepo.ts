import { supabase } from '../lib/supabase';
import { avatarColorAt } from '../theme/avatarPalette';
import type { AntrenorHakedis, AntrenorKalem } from './types';

// Faz 7'de gerçek `antrenor_grup_ucret`/`hakedis`/`hakedis_kalem` tablolarına taşındı
// (bkz. supabase/migrations/0013_bireysel_hakedis_basvurular.sql). Ders sayısı gerçek
// `antrenman` satırlarından (yoklama_kaydedildi=true) hesaplanıyor — "kilitten sonra
// donma": bir ay `odendi=true` olunca RLS bir daha yeniden hesaplamaya izin vermiyor.

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function donemAyBasi(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
function donemAySonuHaric(donemAy: string): string {
  const d = new Date(donemAy + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
}

type UcretRow = { antrenor_id: string; grup_id: string; ders_ucreti: number; grup: { ad: string; brans: { ad: string } | null } | null };
type KalemGosterim = { grupId: string; grupAd: string; dersSayisi: number; birimUcret: number; tutar: number };

export async function getHakedisler(): Promise<AntrenorHakedis[]> {
  const donemAy = donemAyBasi();
  const donemBitis = donemAySonuHaric(donemAy);

  const { data: ucretRows, error: e1 } = await supabase
    .from('antrenor_grup_ucret')
    .select('antrenor_id, grup_id, ders_ucreti, grup:grup(ad, brans:brans(ad))');
  if (e1) throw e1;
  const rows = (ucretRows ?? []) as unknown as UcretRow[];
  const antrenorIds = Array.from(new Set(rows.map((r) => r.antrenor_id)));
  if (antrenorIds.length === 0) return [];

  const [{ data: profilRows }, { data: mevcutHakedis }] = await Promise.all([
    supabase.from('profiles').select('id, ad').in('id', antrenorIds),
    supabase.from('hakedis').select('id, antrenor_id, tutar, odendi').eq('donem_ay', donemAy).in('antrenor_id', antrenorIds),
  ]);
  const profilMap = new Map(((profilRows ?? []) as { id: string; ad: string }[]).map((p) => [p.id, p.ad]));
  const hakedisMap = new Map(
    ((mevcutHakedis ?? []) as { id: string; antrenor_id: string; tutar: number; odendi: boolean }[]).map((h) => [h.antrenor_id, h])
  );

  const sonuc: AntrenorHakedis[] = [];
  for (let i = 0; i < antrenorIds.length; i++) {
    const antrenorId = antrenorIds[i];
    const mevcut = hakedisMap.get(antrenorId);
    const kendiUcretler = rows.filter((r) => r.antrenor_id === antrenorId);

    let hakedisId: string;
    let tutar: number;
    let odendi: boolean;
    let kalemGosterim: KalemGosterim[];

    if (mevcut && mevcut.odendi) {
      hakedisId = mevcut.id;
      tutar = mevcut.tutar;
      odendi = true;
      const { data: kalemRows } = await supabase
        .from('hakedis_kalem')
        .select('grup_id, ders_sayisi, birim_ucret, tutar, grup:grup(ad)')
        .eq('hakedis_id', hakedisId);
      kalemGosterim = ((kalemRows ?? []) as unknown as { grup_id: string; ders_sayisi: number; birim_ucret: number; tutar: number; grup: { ad: string } | null }[]).map(
        (k) => ({ grupId: k.grup_id, grupAd: k.grup?.ad ?? '', dersSayisi: k.ders_sayisi, birimUcret: k.birim_ucret, tutar: k.tutar })
      );
    } else {
      const kalemler: KalemGosterim[] = [];
      for (const u of kendiUcretler) {
        const { count } = await supabase
          .from('antrenman')
          .select('id', { count: 'exact', head: true })
          .eq('grup_id', u.grup_id)
          .eq('yoklama_kaydedildi', true)
          .gte('tarih', donemAy)
          .lt('tarih', donemBitis);
        const dersSayisi = count ?? 0;
        kalemler.push({ grupId: u.grup_id, grupAd: u.grup?.ad ?? '', dersSayisi, birimUcret: u.ders_ucreti, tutar: dersSayisi * u.ders_ucreti });
      }
      tutar = kalemler.reduce((a, k) => a + k.tutar, 0);
      odendi = false;

      if (mevcut) {
        hakedisId = mevcut.id;
        await supabase.from('hakedis').update({ tutar, updated_at: new Date().toISOString() }).eq('id', hakedisId);
        await supabase.from('hakedis_kalem').delete().eq('hakedis_id', hakedisId);
      } else {
        const { data: yeni, error: e2 } = await supabase.from('hakedis').insert({ antrenor_id: antrenorId, donem_ay: donemAy, tutar }).select('id').single();
        if (e2) throw e2;
        hakedisId = (yeni as { id: string }).id;
      }
      if (kalemler.length > 0) {
        await supabase
          .from('hakedis_kalem')
          .insert(kalemler.map((k) => ({ hakedis_id: hakedisId, grup_id: k.grupId, ders_sayisi: k.dersSayisi, birim_ucret: k.birimUcret, tutar: k.tutar })));
      }
      kalemGosterim = kalemler;
    }

    const ad = profilMap.get(antrenorId) ?? 'Antrenör';
    const branslar = Array.from(new Set(kendiUcretler.map((u) => u.grup?.brans?.ad).filter(Boolean) as string[]));
    const toplamDers = kalemGosterim.reduce((a, k) => a + k.dersSayisi, 0);
    const ortalamaBirim = kalemGosterim.length > 0 ? Math.round(kalemGosterim.reduce((a, k) => a + k.birimUcret, 0) / kalemGosterim.length) : 0;
    const palette = avatarColorAt(i);
    const kalemler: AntrenorKalem[] = kalemGosterim.map((k) => ({ n: `${k.grupAd} · ${k.dersSayisi} ders`, v: formatTL(k.tutar) }));

    sonuc.push({
      id: hakedisId,
      init: initialsOf(ad),
      ad,
      rol: branslar.length ? `Antrenör · ${branslar.join('/')}` : 'Antrenör',
      ders: toplamDers,
      birim: formatTL(ortalamaBirim),
      grup: kendiUcretler.length,
      tutarN: tutar,
      avBg: palette.avBg,
      avFg: palette.avFg,
      kalemler,
      odendi,
    });
  }
  return sonuc;
}

export async function odeHakedis(id: string): Promise<void> {
  const { error } = await supabase
    .from('hakedis')
    .update({ odendi: true, odendi_tarihi: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
    .eq('odendi', false);
  if (error) throw error;
}

// Yönetici — antrenör × grup ders ücreti belirleme (Hakediş hesaplamasının girdisi).
export interface AntrenorSecenegi {
  id: string;
  ad: string;
}

export async function getAntrenorSecenekleri(): Promise<AntrenorSecenegi[]> {
  const { data, error } = await supabase.from('profiles').select('id, ad').eq('role', 'antrenor').order('ad');
  if (error) throw error;
  return (data ?? []) as AntrenorSecenegi[];
}

export async function setDersUcreti(antrenorId: string, grupId: string, dersUcreti: number): Promise<void> {
  const { error } = await supabase
    .from('antrenor_grup_ucret')
    .upsert({ antrenor_id: antrenorId, grup_id: grupId, ders_ucreti: dersUcreti }, { onConflict: 'antrenor_id,grup_id' });
  if (error) throw error;
}
