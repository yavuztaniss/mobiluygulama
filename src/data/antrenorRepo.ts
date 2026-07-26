import { supabase } from '../lib/supabase';
import {
  ANTRENOR_BILDIRIMLER,
  ANTRENOR_KONUSMALAR,
  ANTRENOR_PROFIL,
  GELISIM_NOT_SABLONLARI,
  VELI_BILDIRIMLERI,
} from './mock/antrenor';
import type {
  AntrenorBildirim,
  AntrenorKonusma,
  AntrenorProfil,
  BugunkuGrup,
  GelisimKaydi,
  KadroSatiri,
  Sporcu,
  VeliBildirimi,
  YoklamaDurum,
  YoklamaSatiri,
} from './types-antrenor';

const DELAY_MS = 300;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

function computeDurum(saat1: string | null, saat2: string | null, kaydedildi: boolean): 'tamamlandi' | 'simdi' | 'sirada' {
  if (kaydedildi) return 'tamamlandi';
  if (!saat1 || !saat2) return 'sirada';
  const now = new Date();
  const [h1, m1] = saat1.split(':').map(Number);
  const [h2, m2] = saat2.split(':').map(Number);
  const start = new Date(now);
  start.setHours(h1, m1, 0, 0);
  const end = new Date(now);
  end.setHours(h2, m2, 0, 0);
  if (now >= start && now <= end) return 'simdi';
  return 'sirada';
}

// RLS zaten `antrenman`/`sporcular`/`yoklama` sorgularını bu antrenöre bağlı gruba/sporculara
// göre kısıtlıyor (bkz. supabase/migrations/0008_yoklama_gelisim.sql) — client tarafında ayrıca
// grup/antrenör filtresi yazmaya gerek yok.

export async function getBugunkuGruplar(): Promise<BugunkuGrup[]> {
  const { data, error } = await supabase
    .from('antrenman')
    .select('id, grup_id, saat1, saat2, tesis, yoklama_kaydedildi, grup:grup(ad)')
    .eq('tarih', todayStr());
  if (error) throw error;
  const rows = (data ?? []) as any[];

  return Promise.all(
    rows.map(async (r) => {
      const [{ count: sporcuSayisi }, { data: yoklamaRows }] = await Promise.all([
        supabase.from('sporcular').select('id', { count: 'exact', head: true }).eq('grup_id', r.grup_id),
        supabase.from('yoklama').select('durum, izinli, izin_detay, sporcu:sporcular(ad)').eq('antrenman_id', r.id),
      ]);
      const yRows = (yoklamaRows ?? []) as any[];
      const izinRow = yRows.find((y) => y.izinli);
      return {
        id: r.id,
        ad: r.grup?.ad ?? '',
        saat1: r.saat1 ?? '',
        saat2: r.saat2 ?? '',
        tesis: r.tesis ?? '',
        sporcuSayisi: sporcuSayisi ?? 0,
        durum: computeDurum(r.saat1, r.saat2, r.yoklama_kaydedildi),
        yoklamaAlindi: r.yoklama_kaydedildi,
        katilanSayisi: r.yoklama_kaydedildi ? yRows.filter((y) => y.durum === 'katildi').length : undefined,
        izinliAd: izinRow?.sporcu?.ad,
        izinliSebep: izinRow?.izin_detay?.split(' · ')[0],
      } satisfies BugunkuGrup;
    })
  );
}

export async function getSporcular(): Promise<Sporcu[]> {
  const { data, error } = await supabase.from('sporcular').select('id, ad, numara, veli_ad, veli_telefon').order('ad');
  if (error) throw error;
  const roster = (data ?? []) as { id: string; ad: string; numara: number | null; veli_ad: string | null; veli_telefon: string | null }[];
  if (roster.length === 0) return [];

  const ids = roster.map((s) => s.id);
  const { data: yoklamaRows } = await supabase.from('yoklama').select('sporcu_id, durum').in('sporcu_id', ids).not('durum', 'is', null);
  const yRows = (yoklamaRows ?? []) as { sporcu_id: string; durum: string }[];

  return roster.map((s) => {
    const kendi = yRows.filter((y) => y.sporcu_id === s.id);
    const pct = kendi.length ? Math.round((kendi.filter((y) => y.durum === 'katildi').length / kendi.length) * 100) : 100;
    return {
      id: s.id,
      ad: s.ad,
      init: initialsOf(s.ad),
      numara: s.numara ?? 0,
      pct,
      veliAd: s.veli_ad ?? '',
      veliTelefon: s.veli_telefon ?? '',
    };
  });
}

async function getTodayAntrenmanId(): Promise<string | null> {
  const { data } = await supabase.from('antrenman').select('id').eq('tarih', todayStr()).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function getYoklamaSatirlari(): Promise<YoklamaSatiri[]> {
  const roster = await getSporcular();
  const antrenmanId = await getTodayAntrenmanId();
  if (!antrenmanId) {
    return roster.map((s) => ({ id: s.id, ad: s.ad, init: s.init, durum: null, izinli: false }));
  }
  const { data } = await supabase.from('yoklama').select('sporcu_id, durum, izinli, izin_detay').eq('antrenman_id', antrenmanId);
  const rows = (data ?? []) as { sporcu_id: string; durum: string | null; izinli: boolean; izin_detay: string | null }[];
  return roster.map((s) => {
    const row = rows.find((r) => r.sporcu_id === s.id);
    return {
      id: s.id,
      ad: s.ad,
      init: s.init,
      durum: (row?.durum === 'katildi' ? 'in' : row?.durum === 'katilmadi' ? 'out' : null) as YoklamaDurum,
      izinli: row?.izinli ?? false,
      izinDetay: row?.izin_detay ?? undefined,
    };
  });
}

export async function setYoklamaDurum(id: string, durum: YoklamaDurum): Promise<void> {
  const antrenmanId = await getTodayAntrenmanId();
  if (!antrenmanId) return;
  const dbDurum = durum === 'in' ? 'katildi' : durum === 'out' ? 'katilmadi' : null;
  const { error } = await supabase
    .from('yoklama')
    .upsert({ antrenman_id: antrenmanId, sporcu_id: id, durum: dbDurum }, { onConflict: 'antrenman_id,sporcu_id' });
  if (error) throw error;
}

export async function tumunuKatildiYap(): Promise<void> {
  const antrenmanId = await getTodayAntrenmanId();
  if (!antrenmanId) return;
  const roster = await getSporcular();
  const rows = roster.map((s) => ({ antrenman_id: antrenmanId, sporcu_id: s.id, durum: 'katildi' }));
  const { error } = await supabase.from('yoklama').upsert(rows, { onConflict: 'antrenman_id,sporcu_id' });
  if (error) throw error;
}

export async function getYoklamaKayitDurumu(): Promise<{ kaydedildi: boolean; zaman: string | null }> {
  const antrenmanId = await getTodayAntrenmanId();
  if (!antrenmanId) return { kaydedildi: false, zaman: null };
  const { data } = await supabase.from('antrenman').select('yoklama_kaydedildi, yoklama_kayit_zamani').eq('id', antrenmanId).single();
  return { kaydedildi: data?.yoklama_kaydedildi ?? false, zaman: data?.yoklama_kayit_zamani ?? null };
}

export async function yoklamaKaydet(): Promise<{ inCount: number; outCount: number }> {
  const antrenmanId = await getTodayAntrenmanId();
  if (!antrenmanId) return { inCount: 0, outCount: 0 };
  const zaman = new Date();
  const zamanStr = String(zaman.getHours()).padStart(2, '0') + ':' + String(zaman.getMinutes()).padStart(2, '0');
  const { error } = await supabase
    .from('antrenman')
    .update({ yoklama_kaydedildi: true, yoklama_kayit_zamani: zamanStr })
    .eq('id', antrenmanId);
  if (error) throw error;
  const { data } = await supabase.from('yoklama').select('durum').eq('antrenman_id', antrenmanId);
  const rows = (data ?? []) as { durum: string | null }[];
  return {
    inCount: rows.filter((r) => r.durum === 'katildi').length,
    outCount: rows.filter((r) => r.durum === 'katilmadi').length,
  };
}

export async function yoklamaKilidiAc(): Promise<void> {
  const antrenmanId = await getTodayAntrenmanId();
  if (!antrenmanId) return;
  const { error } = await supabase.from('antrenman').update({ yoklama_kaydedildi: false, yoklama_kayit_zamani: null }).eq('id', antrenmanId);
  if (error) throw error;
}

export async function getVeliBildirimleri(): Promise<VeliBildirimi[]> {
  return delay(VELI_BILDIRIMLERI);
}

export const GELISIM_TEMPLATES = GELISIM_NOT_SABLONLARI;

export async function getGelisimKaydi(sporcuId: string): Promise<GelisimKaydi> {
  const { data: gd, error } = await supabase
    .from('gelisim_degerlendirme')
    .select('id, not_metni, gonderildi, tarih')
    .eq('sporcu_id', sporcuId)
    .maybeSingle();
  if (error) throw error;
  if (!gd) return { sporcuId, beceriler: [], not: '', gonderildi: false };

  const { data: seviyeRows } = await supabase
    .from('gelisim_beceri_seviye')
    .select('seviye, beceri:beceri(id, ad, sira)')
    .eq('degerlendirme_id', gd.id);
  const beceriler = ((seviyeRows ?? []) as any[])
    .map((r) => ({ ad: r.beceri?.ad ?? '', seviye: r.seviye as number, beceriId: r.beceri?.id ?? '', sira: r.beceri?.sira ?? 0 }))
    .sort((a, b) => a.sira - b.sira)
    .map(({ ad, seviye, beceriId }) => ({ ad, seviye, beceriId }));

  return {
    sporcuId,
    beceriler,
    not: gd.not_metni,
    gonderildi: gd.gonderildi,
    tarih: gd.tarih ? formatDateTR(gd.tarih) : undefined,
  };
}

export async function setGelisimSeviye(sporcuId: string, beceriId: string, seviye: number): Promise<void> {
  const { data: gd, error } = await supabase.from('gelisim_degerlendirme').select('id').eq('sporcu_id', sporcuId).maybeSingle();
  if (error) throw error;
  if (!gd) return;
  const { error: upErr } = await supabase
    .from('gelisim_beceri_seviye')
    .update({ seviye })
    .eq('degerlendirme_id', gd.id)
    .eq('beceri_id', beceriId);
  if (upErr) throw upErr;
}

export async function setGelisimNot(sporcuId: string, not: string): Promise<void> {
  const { error } = await supabase.from('gelisim_degerlendirme').update({ not_metni: not }).eq('sporcu_id', sporcuId);
  if (error) throw error;
}

export async function gelisimGonder(sporcuId: string): Promise<void> {
  const { error } = await supabase.from('gelisim_degerlendirme').update({ gonderildi: true, tarih: todayStr() }).eq('sporcu_id', sporcuId);
  if (error) throw error;
}

export async function gelisimKilidiAc(sporcuId: string): Promise<void> {
  const { error } = await supabase.from('gelisim_degerlendirme').update({ gonderildi: false }).eq('sporcu_id', sporcuId);
  if (error) throw error;
}

// Maç Kadrosu artık gerçek `mac_kadro`/`mac_kadro_sporcu` tablolarına, "lcv" (veli RSVP'si)
// ise gerçek `etkinlik_katilim`'e bağlı (bkz. supabase/migrations/0009_duyuru_etkinlik.sql) —
// Faz 3'te ertelenmişti çünkü hangi maça ait olduğunu bilen bir `etkinlik` tablosu yoktu.
const LCV_MAP: Record<string, 'katiliyor' | 'katilamiyor' | 'yanit-yok'> = {
  katilir: 'katiliyor',
  katilmaz: 'katilamiyor',
  bekliyor: 'yanit-yok',
};

async function getNextMacId(): Promise<string | null> {
  const today = todayStr();
  const { data } = await supabase.from('etkinlik').select('id').eq('tur', 'mac').gte('tarih', today).order('tarih').limit(1).maybeSingle();
  return data?.id ?? null;
}

async function getOrCreateMacKadroId(etkinlikId: string): Promise<string> {
  const { data: existing } = await supabase.from('mac_kadro').select('id').eq('etkinlik_id', etkinlikId).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase.from('mac_kadro').insert({ etkinlik_id: etkinlikId }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function getKadroBaslik(): Promise<{ rakip: string; tarihSaat: string } | null> {
  const etkinlikId = await getNextMacId();
  if (!etkinlikId) return null;
  const { data } = await supabase.from('etkinlik').select('rakip, baslik, tarih, saat').eq('id', etkinlikId).maybeSingle();
  if (!data) return null;
  const tarihStr = new Date(data.tarih + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long' });
  return { rakip: data.rakip ?? data.baslik, tarihSaat: data.saat ? `${tarihStr} · ${data.saat}` : tarihStr };
}

export async function getKadro(): Promise<KadroSatiri[]> {
  const etkinlikId = await getNextMacId();
  const roster = await getSporcular();
  if (!etkinlikId || roster.length === 0) return [];

  const macKadroId = await getOrCreateMacKadroId(etkinlikId);
  const [{ data: katilimRows }, { data: secimRows }] = await Promise.all([
    supabase.from('etkinlik_katilim').select('sporcu_id, durum').eq('etkinlik_id', etkinlikId).in('sporcu_id', roster.map((r) => r.id)),
    supabase.from('mac_kadro_sporcu').select('sporcu_id, secili').eq('mac_kadro_id', macKadroId),
  ]);
  const kRows = (katilimRows ?? []) as { sporcu_id: string; durum: string }[];
  const sRows = (secimRows ?? []) as { sporcu_id: string; secili: boolean }[];

  return roster.map((s) => ({
    id: s.id,
    ad: s.ad,
    numara: s.numara,
    lcv: LCV_MAP[kRows.find((k) => k.sporcu_id === s.id)?.durum ?? 'bekliyor'],
    secili: sRows.find((r) => r.sporcu_id === s.id)?.secili ?? false,
  }));
}

export async function toggleKadroSecim(id: string): Promise<void> {
  const etkinlikId = await getNextMacId();
  if (!etkinlikId) return;
  const macKadroId = await getOrCreateMacKadroId(etkinlikId);
  const { data: existing } = await supabase.from('mac_kadro_sporcu').select('secili').eq('mac_kadro_id', macKadroId).eq('sporcu_id', id).maybeSingle();
  const { error } = await supabase
    .from('mac_kadro_sporcu')
    .upsert({ mac_kadro_id: macKadroId, sporcu_id: id, secili: !(existing?.secili ?? false) }, { onConflict: 'mac_kadro_id,sporcu_id' });
  if (error) throw error;
}

export async function lcvKatilanlariEkle(): Promise<void> {
  const etkinlikId = await getNextMacId();
  if (!etkinlikId) return;
  const macKadroId = await getOrCreateMacKadroId(etkinlikId);
  const { data: katilimRows } = await supabase.from('etkinlik_katilim').select('sporcu_id').eq('etkinlik_id', etkinlikId).eq('durum', 'katilir');
  const rows = ((katilimRows ?? []) as { sporcu_id: string }[]).map((k) => ({ mac_kadro_id: macKadroId, sporcu_id: k.sporcu_id, secili: true }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('mac_kadro_sporcu').upsert(rows, { onConflict: 'mac_kadro_id,sporcu_id' });
  if (error) throw error;
}

export async function getKadroYayinDurumu(): Promise<boolean> {
  const etkinlikId = await getNextMacId();
  if (!etkinlikId) return false;
  const { data } = await supabase.from('mac_kadro').select('yayinlandi').eq('etkinlik_id', etkinlikId).maybeSingle();
  return data?.yayinlandi ?? false;
}

export async function kadroYayinla(): Promise<void> {
  const etkinlikId = await getNextMacId();
  if (!etkinlikId) return;
  const macKadroId = await getOrCreateMacKadroId(etkinlikId);
  const { error } = await supabase.from('mac_kadro').update({ yayinlandi: true }).eq('id', macKadroId);
  if (error) throw error;
}

export async function kadroKilidiAc(): Promise<void> {
  const etkinlikId = await getNextMacId();
  if (!etkinlikId) return;
  const macKadroId = await getOrCreateMacKadroId(etkinlikId);
  const { error } = await supabase.from('mac_kadro').update({ yayinlandi: false }).eq('id', macKadroId);
  if (error) throw error;
}

export async function getAntrenorKonusmalar(): Promise<AntrenorKonusma[]> {
  return delay(ANTRENOR_KONUSMALAR);
}
export async function getAntrenorKonusma(id: string): Promise<AntrenorKonusma> {
  const k = ANTRENOR_KONUSMALAR.find((c) => c.id === id);
  if (!k) throw new Error('Konuşma bulunamadı');
  return delay(k);
}

let antrenorProfil: AntrenorProfil = { ...ANTRENOR_PROFIL };
export async function getAntrenorProfil(): Promise<AntrenorProfil> {
  return delay(antrenorProfil);
}

export async function updateAntrenorProfil(input: { ad: string; telefon: string; eposta: string }): Promise<AntrenorProfil> {
  antrenorProfil = { ...antrenorProfil, ...input };
  return delay(antrenorProfil);
}

let antrenorBildirimler: AntrenorBildirim[] = [...ANTRENOR_BILDIRIMLER];
export async function getAntrenorBildirimler(): Promise<AntrenorBildirim[]> {
  return delay(antrenorBildirimler);
}
export async function markAntrenorBildirimOkundu(id: string): Promise<void> {
  antrenorBildirimler = antrenorBildirimler.map((b) => (b.id === id ? { ...b, okundu: true } : b));
  await delay(null);
}
export async function markAntrenorTumuOkundu(): Promise<void> {
  antrenorBildirimler = antrenorBildirimler.map((b) => ({ ...b, okundu: true }));
  await delay(null);
}
