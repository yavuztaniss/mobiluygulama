import { supabase } from '../lib/supabase';
import type { Etkinlik, EtkinlikTuru } from './types';

function formatDateTR(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
function todayStr(): string {
  // toISOString() UTC'ye çevirdiği için UTC+3'te 00:00-03:00 arası bir önceki günü
  // verir (bkz. antrenorRepo.todayStr) — yerel bileşenlerden kur.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      // Maçta form alanının etiketi zaten "RAKİP" (bkz. etkinlik-olustur TURLER) ama
      // değer yalnızca baslik'e yazılıyordu; rakip kolonu NULL kalıyordu. Veli tarafındaki
      // sonuç listesi (veliRepo.getEtkinlikSonuclari) rakip'i okuduğu için sonuç girilen
      // maçlar orada rakipsiz görünürdü. Turnuva/kamp'ta rakip kavramı yok → null.
      rakip: input.tur === 'mac' ? input.baslik : null,
    })
    .select(SELECT_ETKINLIK)
    .single();
  if (error) throw error;
  return mapRow(data as unknown as EtkinlikRow);
}

// ---------------------------------------------------------------------------
// MAÇ SONUCU
// ---------------------------------------------------------------------------
// 0009 skor_biz / skor_rakip / sonuc / sonuc_notu kolonlarını açtı, veli tarafı
// okuyor (veliRepo.getEtkinlikSonuclari) ama yazan hiçbir ekran yoktu. Yazma
// izinleri: yönetici 0009'dan beri, antrenör kendi grubunun oynanmış maçı için
// 0025 ile (satır izni politikada, kolon izni protect_etkinlik_sonuc trigger'ında).
// Aşağıdaki sorgular rol filtresi İÇERMEZ — hangi maçın görüneceğini RLS belirler:
// yönetici tüm kulübü, antrenör yalnızca kendi grubunu görür.

export type MacSonucu = 'galibiyet' | 'beraberlik' | 'maglubiyet';

export interface MacSonucSatiri {
  id: string;
  rakip: string;
  grup: string;
  tesis: string;
  tarih: string;
  saat: string;
  skorBiz: number | null;
  skorRakip: number | null;
  sonuc: MacSonucu | null;
  sonucNotu: string;
}

type MacSonucRow = {
  id: string;
  baslik: string;
  rakip: string | null;
  tesis: string | null;
  tarih: string;
  saat: string | null;
  skor_biz: number | null;
  skor_rakip: number | null;
  sonuc: MacSonucu | null;
  sonuc_notu: string | null;
  grup: { ad: string } | null;
};

const SELECT_MAC_SONUC =
  'id, baslik, rakip, tesis, tarih, saat, skor_biz, skor_rakip, sonuc, sonuc_notu, grup:grup(ad)';

function mapMacRow(row: MacSonucRow): MacSonucSatiri {
  return {
    id: row.id,
    // 0025 öncesi oluşturulan maçlarda rakip kolonu NULL — başlığa düş
    // (antrenorRepo.getKadroBaslik ile aynı geri düşme).
    rakip: row.rakip ?? row.baslik,
    grup: row.grup?.ad ?? 'Tüm Gruplar',
    tesis: row.tesis ?? '',
    tarih: formatDateTR(row.tarih),
    saat: row.saat ?? '',
    skorBiz: row.skor_biz,
    skorRakip: row.skor_rakip,
    sonuc: row.sonuc,
    sonucNotu: row.sonuc_notu ?? '',
  };
}

// Skordan sonuç türetme — iki ekranın da tek kaynağı. Sunucuda zorlanmıyor
// (bkz. 0025 bölüm 2: hükmen galibiyet gibi skorla uyuşmayan meşru durumlar var).
export function sonucTuret(skorBiz: number, skorRakip: number): MacSonucu {
  if (skorBiz > skorRakip) return 'galibiyet';
  if (skorBiz < skorRakip) return 'maglubiyet';
  return 'beraberlik';
}

// Oynanmış ama sonucu girilmemiş maçlar — en yeni maç en üstte.
// Tarih sınırı `<= bugün`: aynı gün oynanan maçın sonucu akşam girilebilsin
// (0025'teki antrenör politikasındaki `tarih <= current_date` ile aynı sınır).
export async function getSonucBekleyenMaclar(): Promise<MacSonucSatiri[]> {
  const { data, error } = await supabase
    .from('etkinlik')
    .select(SELECT_MAC_SONUC)
    .eq('tur', 'mac')
    .lte('tarih', todayStr())
    .is('sonuc', null)
    .order('tarih', { ascending: false });
  if (error) throw error;
  return (data as unknown as MacSonucRow[]).map(mapMacRow);
}

// Sonucu girilmiş son maçlar — yanlış girilen skoru düzeltebilmek için.
export async function getSonuclananMaclar(limit = 5): Promise<MacSonucSatiri[]> {
  const { data, error } = await supabase
    .from('etkinlik')
    .select(SELECT_MAC_SONUC)
    .eq('tur', 'mac')
    .not('sonuc', 'is', null)
    .order('tarih', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as MacSonucRow[]).map(mapMacRow);
}

export async function macSonucuKaydet(input: {
  etkinlikId: string;
  skorBiz: number;
  skorRakip: number;
  sonucNotu: string;
}): Promise<MacSonucSatiri> {
  const { data, error } = await supabase
    .from('etkinlik')
    .update({
      skor_biz: input.skorBiz,
      skor_rakip: input.skorRakip,
      sonuc: sonucTuret(input.skorBiz, input.skorRakip),
      sonuc_notu: input.sonucNotu.trim() || null,
    })
    .eq('id', input.etkinlikId)
    .select(SELECT_MAC_SONUC)
    .maybeSingle();
  if (error) throw error;
  // RLS reddi PostgREST'te hata değil, BOŞ sonuçtur: politikadan geçmeyen satır
  // (başka grubun maçı, henüz oynanmamış maç) sessizce 0 satır günceller.
  // Sessiz başarısızlık ekranda "kaydedildi" gibi görünmesin diye açık hata.
  if (!data) throw new Error('Bu maçın sonucu güncellenemedi — yetkiniz olmayabilir.');
  return mapMacRow(data as unknown as MacSonucRow);
}
