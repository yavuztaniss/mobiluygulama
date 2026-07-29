import { supabase } from '../lib/supabase';
import type { TakvimBlok, TakvimGun } from './types';

// Faz 6'da gerçek `antrenman` (Faz 3) + `etkinlik` (Faz 4) tablolarını birleştiren bir
// sorguya taşındı — bkz. supabase/migrations/0012_servis_magaza_izin.sql'in yorumu, bu
// domain için yeni tablo gerekmiyor, ikisi de zaten var ve başka ekranlarca kullanılıyor.

export const TESIS_LISTESI = ['Salon 1', 'Salon 2', 'Yüzme Havuzu', 'Dış Saha'];

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const ETKINLIK_TUR_ETIKET: Record<string, string> = { mac: 'MAÇ', turnuva: 'TURNUVA', kamp: 'KAMP' };

function toISO(d: Date): string {
  // toISOString() UTC'ye çeviriyor — yerel gece yarısı (setHours(0,0,0,0)) UTC+3'te bir
  // önceki güne kayıyor (ör. 27 Temmuz 00:00 yerel = 26 Temmuz 21:00 UTC). Yerel takvim
  // bileşenlerinden string kurmak bu kaymayı önlüyor (bkz. bireyselRepo.ts'teki aynı düzeltme).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function weekDays(): Date[] {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

type AntrenmanRow = { id: string; tarih: string; saat1: string | null; saat2: string | null; tesis: string | null; grup: { ad: string } | null };
type EtkinlikRow = { id: string; tur: string; baslik: string; tarih: string; saat: string | null; tesis: string | null };

export async function getTakvim(): Promise<TakvimGun[]> {
  const days = weekDays();
  const startStr = toISO(days[0]);
  const endStr = toISO(days[6]);

  const [{ data: antrenmanlar, error: e1 }, { data: etkinlikler, error: e2 }] = await Promise.all([
    supabase.from('antrenman').select('id, tarih, saat1, saat2, tesis, grup:grup(ad)').gte('tarih', startStr).lte('tarih', endStr),
    supabase.from('etkinlik').select('id, tur, baslik, tarih, saat, tesis').gte('tarih', startStr).lte('tarih', endStr),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const aRows = (antrenmanlar ?? []) as unknown as AntrenmanRow[];
  const eRows = (etkinlikler ?? []) as unknown as EtkinlikRow[];

  return days.map((d) => {
    const iso = toISO(d);
    const bloklarA: TakvimBlok[] = aRows
      .filter((a) => a.tarih === iso)
      .map((a) => ({
        id: a.id,
        saat1: a.saat1 ?? '',
        saat2: a.saat2 ?? '',
        baslik: a.grup?.ad ?? 'Antrenman',
        alt: 'Antrenman',
        tesis: a.tesis ?? '',
        kaynak: 'antrenman' as const,
      }));
    const bloklarE: TakvimBlok[] = eRows
      .filter((e) => e.tarih === iso)
      .map((e) => {
        const etiket = ETKINLIK_TUR_ETIKET[e.tur] ?? e.tur.toUpperCase();
        return {
          id: e.id,
          saat1: e.saat ?? '',
          saat2: '',
          baslik: e.baslik,
          alt: etiket,
          tesis: e.tesis ?? '',
          kaynak: 'etkinlik' as const,
          turEtiketi: etiket,
        };
      });
    const bloklar = [...bloklarA, ...bloklarE].sort((x, y) => x.saat1.localeCompare(y.saat1));
    return {
      tarih: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }),
      gunAdi: GUN_ADLARI[(d.getDay() + 6) % 7],
      gunNo: String(d.getDate()),
      tesisler: TESIS_LISTESI,
      bloklar,
    };
  });
}

export async function addAntrenman(input: {
  gunIndex: number;
  grupId: string;
  tesis: string;
  saat1: string;
  saat2: string;
}): Promise<{ conflict: TakvimBlok | null }> {
  const days = weekDays();
  const tarih = toISO(days[input.gunIndex]);

  const { data: mevcut } = await supabase
    .from('antrenman')
    .select('id, saat1, saat2, tesis, grup:grup(ad)')
    .eq('tarih', tarih)
    .eq('tesis', input.tesis);
  const conflictRow = ((mevcut ?? []) as unknown as AntrenmanRow[]).find((a) => a.saat1 === input.saat1);
  if (conflictRow) {
    return {
      conflict: {
        id: conflictRow.id,
        saat1: conflictRow.saat1 ?? '',
        saat2: conflictRow.saat2 ?? '',
        baslik: conflictRow.grup?.ad ?? 'Antrenman',
        alt: 'Antrenman',
        tesis: conflictRow.tesis ?? '',
      },
    };
  }

  const { error } = await supabase
    .from('antrenman')
    .insert({ grup_id: input.grupId, tarih, saat1: input.saat1, saat2: input.saat2, tesis: input.tesis });
  if (error) throw error;
  return { conflict: null };
}
