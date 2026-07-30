import { supabase } from '../lib/supabase';
import { GELISIM_NOT_SABLONLARI } from './mock/antrenor';
import type {
  AntrenmanBaslik,
  AntrenorBildirim,
  AntrenorProfil,
  BugunkuGrup,
  GelisimKaydi,
  KadroSatiri,
  Sporcu,
  YoklamaDurum,
  YoklamaSatiri,
} from './types-antrenor';

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function todayStr(): string {
  // toISOString() UTC'ye çevirdiği için UTC+3'te 00:00-03:00 arası bir önceki günü
  // verir (Faz 7'de takvimRepo/bireyselRepo'da düzeltilen aynı kayma) — yerel bileşenlerden kur.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// Yoklama ekranının açılma kilidi: şu an saat aralığı içinde olan (devam eden) antrenman.
// yoklama_kaydedildi'ye bakılmaz — kaydedilmiş antrenman da saat bitene dek açık kalır
// ("Düzenle" akışı). Aralık dışındaysa null döner ve ekran kilitli görünür.
export interface AktifAntrenman {
  id: string;
  ad: string;
  saat1: string;
  saat2: string;
  tesis: string;
}

// Belirli bir antrenmanın başlık bilgisi. Yoklama Özeti ekranı route param ile
// gelen id'nin HANGİ gruba ait olduğunu başlıkta yazabilsin diye var — böylece
// param bugünün listesinde bulunamadığında bile "hangi grup?" sorusu yanıtsız
// (ya da yanlış) kalmaz. Bulunamazsa null döner, ekran sessizce başka bir grubu
// göstermez.
export async function getAntrenmanBaslik(antrenmanId: string): Promise<AntrenmanBaslik | null> {
  const { data, error } = await supabase
    .from('antrenman')
    .select('id, tarih, saat1, saat2, tesis, grup:grup(ad)')
    .eq('id', antrenmanId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as any;
  return {
    id: r.id,
    ad: r.grup?.ad ?? '',
    saat1: r.saat1 ?? '',
    saat2: r.saat2 ?? '',
    tesis: r.tesis ?? '',
    tarih: r.tarih,
  };
}

export async function getAktifAntrenman(): Promise<AktifAntrenman | null> {
  const { data, error } = await supabase
    .from('antrenman')
    .select('id, saat1, saat2, tesis, yoklama_kaydedildi, grup:grup(ad)')
    .eq('tarih', todayStr());
  if (error) throw error;
  const now = new Date();
  const rows = (data ?? []) as any[];
  const adaylar = rows.filter((r) => {
    if (!r.saat1 || !r.saat2) return false;
    const [h1, m1] = r.saat1.split(':').map(Number);
    const [h2, m2] = r.saat2.split(':').map(Number);
    const start = new Date(now);
    start.setHours(h1, m1, 0, 0);
    const end = new Date(now);
    end.setHours(h2, m2, 0, 0);
    return now >= start && now <= end;
  });
  // Aynı saat aralığında birden fazla grup varsa Bugün ekranının 'simdi' mantığıyla
  // tutarlı davran: önce yoklaması HENÜZ kaydedilmemiş olanı seç.
  const aktif = adaylar.find((r) => !r.yoklama_kaydedildi) ?? adaylar[0];
  if (!aktif) return null;
  return { id: aktif.id, ad: aktif.grup?.ad ?? '', saat1: aktif.saat1, saat2: aktif.saat2, tesis: aktif.tesis ?? '' };
}

// Yoklama satırlarının roster'ı antrenmanın KENDİ grubuna daraltılır — aynı gün
// birden fazla grup antrenmanı olduğunda tüm RLS-görünür sporcular karışmasın.
async function rosterForAntrenman(antrenmanId: string | null): Promise<{ id: string; ad: string; init: string; veliTelefon: string }[]> {
  if (antrenmanId) {
    const { data: ant } = await supabase.from('antrenman').select('grup_id').eq('id', antrenmanId).maybeSingle();
    const grupId = (ant as { grup_id: string } | null)?.grup_id;
    if (grupId) {
      const { data } = await supabase.from('sporcular').select('id, ad, veli_telefon').eq('grup_id', grupId).order('ad');
      return ((data ?? []) as { id: string; ad: string; veli_telefon: string | null }[]).map((s) => ({
        id: s.id,
        ad: s.ad,
        init: initialsOf(s.ad),
        veliTelefon: s.veli_telefon ?? '',
      }));
    }
  }
  const roster = await getSporcular();
  return roster.map((s) => ({ id: s.id, ad: s.ad, init: s.init, veliTelefon: s.veliTelefon }));
}

export async function getYoklamaSatirlari(antrenmanId?: string): Promise<YoklamaSatiri[]> {
  const id = antrenmanId ?? (await getTodayAntrenmanId());
  const roster = await rosterForAntrenman(id);
  if (!id) {
    return roster.map((s) => ({ id: s.id, ad: s.ad, init: s.init, durum: null, izinli: false, veliTelefon: s.veliTelefon }));
  }
  const { data } = await supabase.from('yoklama').select('sporcu_id, durum, izinli, izin_detay').eq('antrenman_id', id);
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
      veliTelefon: s.veliTelefon,
    };
  });
}

export async function setYoklamaDurum(id: string, durum: YoklamaDurum, antrenmanId?: string): Promise<void> {
  const hedefId = antrenmanId ?? (await getTodayAntrenmanId());
  if (!hedefId) return;
  const dbDurum = durum === 'in' ? 'katildi' : durum === 'out' ? 'katilmadi' : null;
  const { error } = await supabase
    .from('yoklama')
    .upsert({ antrenman_id: hedefId, sporcu_id: id, durum: dbDurum }, { onConflict: 'antrenman_id,sporcu_id' });
  if (error) throw error;
}

export async function tumunuKatildiYap(antrenmanId?: string): Promise<void> {
  const hedefId = antrenmanId ?? (await getTodayAntrenmanId());
  if (!hedefId) return;
  const roster = await rosterForAntrenman(hedefId);
  const rows = roster.map((s) => ({ antrenman_id: hedefId, sporcu_id: s.id, durum: 'katildi' }));
  const { error } = await supabase.from('yoklama').upsert(rows, { onConflict: 'antrenman_id,sporcu_id' });
  if (error) throw error;
}

export async function getYoklamaKayitDurumu(antrenmanId?: string): Promise<{ kaydedildi: boolean; zaman: string | null }> {
  const hedefId = antrenmanId ?? (await getTodayAntrenmanId());
  if (!hedefId) return { kaydedildi: false, zaman: null };
  const { data } = await supabase.from('antrenman').select('yoklama_kaydedildi, yoklama_kayit_zamani').eq('id', hedefId).single();
  return { kaydedildi: data?.yoklama_kaydedildi ?? false, zaman: data?.yoklama_kayit_zamani ?? null };
}

export async function yoklamaKaydet(antrenmanIdParam?: string): Promise<{ inCount: number; outCount: number }> {
  const antrenmanId = antrenmanIdParam ?? (await getTodayAntrenmanId());
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

export async function yoklamaKilidiAc(antrenmanIdParam?: string): Promise<void> {
  const antrenmanId = antrenmanIdParam ?? (await getTodayAntrenmanId());
  if (!antrenmanId) return;
  const { error } = await supabase.from('antrenman').update({ yoklama_kaydedildi: false, yoklama_kayit_zamani: null }).eq('id', antrenmanId);
  if (error) throw error;
}

// getVeliBildirimleri kaldırıldı — sahte "İletildi/Görüldü/Ulaşılamadı" teslim-durumu
// listesiydi; gerçek push/teslim altyapısı olmadığından ekranıyla birlikte silindi.

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

// Mesajlaşma Faz 5'te src/data/mesajRepo.ts'e taşındı — bkz. antrenör mesajlar ekranları.

export async function getAntrenorProfil(): Promise<AntrenorProfil> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error('Oturum bulunamadı');

  const [{ data: p, error }, { data: bagRows, error: eBag }, { data: bireysel, error: eBireysel }] = await Promise.all([
    supabase.from('profiles').select('ad, telefon').eq('id', user.id).single(),
    supabase.from('sporcu_antrenor').select('sporcu:sporcular(grup:grup(id, ad))').eq('antrenor_id', user.id),
    supabase.from('bireysel_antrenor').select('brans:brans(ad)').eq('antrenor_id', user.id).maybeSingle(),
  ]);
  // Üç sorgunun da hatası fırlatılır — yoksa geçici bir ağ hatası, ekranda kalıcı
  // "Henüz bağlı sporcu grubu yok" iddiası gibi görünürdü.
  if (error) throw error;
  if (eBag) throw eBag;
  if (eBireysel) throw eBireysel;

  // Gruplar: antrenöre bağlı sporcuların (sporcu_antrenor) grupları — distinct grup adı +
  // her gruptaki bağlı sporcu sayısı.
  const grupMap = new Map<string, { ad: string; sporcuSayisi: number }>();
  for (const r of (bagRows ?? []) as any[]) {
    const g = r.sporcu?.grup;
    if (!g?.id) continue;
    const mevcut = grupMap.get(g.id);
    if (mevcut) mevcut.sporcuSayisi += 1;
    else grupMap.set(g.id, { ad: g.ad ?? '', sporcuSayisi: 1 });
  }

  // Unvan: bireysel_antrenor kaydındaki branş varsa 'Antrenör · {Branş}', yoksa 'Antrenör'.
  const bransAd = (bireysel as any)?.brans?.ad as string | undefined;

  return {
    ad: (p as { ad: string; telefon: string | null } | null)?.ad ?? '',
    rol: bransAd ? `Antrenör · ${bransAd}` : 'Antrenör',
    telefon: (p as { ad: string; telefon: string | null } | null)?.telefon ?? '',
    eposta: user.email ?? '',
    gruplar: [...grupMap.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr')),
  };
}

export async function updateAntrenorProfil(input: { ad: string; telefon: string }): Promise<AntrenorProfil> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Oturum bulunamadı');
  // role/sube_id BİLEREK gönderilmiyor — protect_profile_role trigger'ı (0016) authenticated
  // kullanıcının rol değiştirmesini reddeder; burada yalnızca ad + telefon güncellenir.
  const { error } = await supabase.from('profiles').update({ ad: input.ad, telefon: input.telefon }).eq('id', userId);
  if (error) throw error;
  return getAntrenorProfil();
}

// ---------------------------------------------------------------------------
// Antrenör bildirimleri: DB'de bildirim tablosu yok — liste her okumada GERÇEK
// olaylardan yeniden sentezlenir (veliRepo'daki syncOdemeGecikmeBildirimleri /
// syncDuyuruBildirimleri deseni):
//   1) bugünkü/yaklaşan antrenmanların izinli=true yoklama satırları (veli izin bildirimi),
//   2) durum='onay_bekliyor' bireysel_rezervasyon talepleri.
// "Okundu" durumu YALNIZCA bellekte tutulur — uygulama yeniden başlatılınca sıfırlanır
// (bilinçli tercih; kalıcı okundu takibi için DB tablosu gerekir). Olay ortadan kalkınca
// (izin geri alındı / rezervasyon yanıtlandı) bildirim de listeden düşer.
let antrenorBildirimler: AntrenorBildirim[] = [];
// Liste hangi hesap için sentezlendi — hesap değişiminde önceki kullanıcının
// bildirimleri (ve okundu haritası) yeni kullanıcıya taşınmasın (veliRepo ile aynı desen).
let antrenorBildirimSahibi: string | null = null;

function bildirimGrubu(createdAt: string | null): AntrenorBildirim['grup'] {
  if (!createdAt) return 'bugun';
  const created = new Date(createdAt);
  const simdi = new Date();
  const gunBasi = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
  if (created >= gunBasi) return 'bugun';
  const dunBasi = new Date(gunBasi);
  dunBasi.setDate(dunBasi.getDate() - 1);
  return created >= dunBasi ? 'dun' : 'eski';
}

function bildirimZamani(createdAt: string | null): string {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  const saat = `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
  const grup = bildirimGrubu(createdAt);
  if (grup === 'bugun') return saat;
  if (grup === 'dun') return `Dün ${saat}`;
  return created.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

async function syncAntrenorBildirimleri(): Promise<void> {
  // devSignInAs ile sahte girişte gerçek oturum olmadığından senkronizasyon sessizce atlanır
  // (veliRepo'daki aynı guard).
  const { data: sessionData } = await supabase.auth.getSession();
  const antrenorId = sessionData.session?.user.id;
  if (!antrenorId) return;
  if (antrenorId !== antrenorBildirimSahibi) {
    antrenorBildirimler = [];
    antrenorBildirimSahibi = antrenorId;
  }

  const bugun = todayStr();
  const yeni: AntrenorBildirim[] = [];

  // 1) Bugünkü/yaklaşan antrenmanların izinli işaretli yoklama satırları.
  // Sorgu hatalarında mevcut liste KORUNUR (üzerine boş yazılırsa hem liste hem
  // bellekteki okundu haritası kaybolur — geçici ağ hatası "hepsi okundu" gibi görünürdü).
  const { data: antRows, error: eAnt } = await supabase.from('antrenman').select('id, tarih').gte('tarih', bugun);
  if (eAnt) return;
  const antler = (antRows ?? []) as { id: string; tarih: string }[];
  if (antler.length > 0) {
    const { data: izinRows, error: eIzin } = await supabase
      .from('yoklama')
      .select('antrenman_id, sporcu_id, izin_detay, created_at, sporcu:sporcular(ad)')
      .in('antrenman_id', antler.map((a) => a.id))
      .eq('izinli', true);
    if (eIzin) return;
    for (const r of (izinRows ?? []) as any[]) {
      const antTarih = antler.find((a) => a.id === r.antrenman_id)?.tarih ?? bugun;
      yeni.push({
        id: `izin-${r.antrenman_id}-${r.sporcu_id}`,
        grup: bildirimGrubu(r.created_at),
        baslik: `İzin bildirimi · ${r.sporcu?.ad ?? ''}`,
        aciklama: `${r.izin_detay ?? 'İzinli'} · Antrenman: ${antTarih === bugun ? 'bugün' : formatDateTR(antTarih)}`,
        zaman: bildirimZamani(r.created_at),
        tur: 'izin',
        okundu: false,
      });
    }
  }

  // 2) Onay bekleyen bireysel ders rezervasyon talepleri.
  const { data: rezRows, error: eRez } = await supabase
    .from('bireysel_rezervasyon')
    .select('id, tarih, saat, created_at, sporcu:sporcular(ad)')
    .eq('antrenor_id', antrenorId)
    .eq('durum', 'onay_bekliyor')
    .order('tarih');
  if (eRez) return;
  for (const r of (rezRows ?? []) as any[]) {
    yeni.push({
      id: `rez-${r.id}`,
      grup: bildirimGrubu(r.created_at),
      // Sporcu, antrenörün RLS-görünür roster'ında olmayabilir (bireysel ders grup bağı
      // gerektirmez) — embed null dönerse boş isim yerine nötr etiket.
      baslik: `Yeni rezervasyon talebi · ${r.sporcu?.ad ?? 'Bir sporcu'}`,
      aciklama: `${formatDateTR(r.tarih)} ${r.saat} · Onayınızı bekliyor`,
      zaman: bildirimZamani(r.created_at),
      tur: 'rezervasyon',
      okundu: false,
    });
  }

  // Önceki okumada işaretlenmiş "okundu" durumları korunur.
  const okunduMap = new Map(antrenorBildirimler.map((b) => [b.id, b.okundu]));
  antrenorBildirimler = yeni.map((b) => ({ ...b, okundu: okunduMap.get(b.id) ?? false }));
}

export async function getAntrenorBildirimler(): Promise<AntrenorBildirim[]> {
  await syncAntrenorBildirimleri();
  return antrenorBildirimler;
}
export async function markAntrenorBildirimOkundu(id: string): Promise<void> {
  antrenorBildirimler = antrenorBildirimler.map((b) => (b.id === id ? { ...b, okundu: true } : b));
}
export async function markAntrenorTumuOkundu(): Promise<void> {
  antrenorBildirimler = antrenorBildirimler.map((b) => ({ ...b, okundu: true }));
}
