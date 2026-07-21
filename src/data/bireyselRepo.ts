import {
  BEKLEYEN_REZERVASYON,
  BIREYSEL_ANTRENORLER,
  BIREYSEL_FILTRELER,
  BIREYSEL_PAKETLERIM,
  ISTISNA_VARSAYILAN,
  KAZANC_AYLAR,
  KAZANC_HAM,
  MUSAITLIK_VARSAYILAN,
  bireyselHaftaSlotlari,
  bireyselTakvimHaftasi,
} from './mock/bireysel';
import type {
  AntrenorTakvimGun,
  BekleyenRezervasyon,
  BireyselAntrenor,
  BireyselGunSlotlari,
  BireyselOdemeTipi,
  BireyselPaketDurumu,
  BireyselRezervasyonSonuc,
  KazancAySecenegi,
  KazancOzet,
  MusaitlikGunu,
  MusaitlikIstisna,
} from './types-bireysel';

const DELAY_MS = 300;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export function formatTL(n: number): string {
  return '₺' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function paketAvantajYuzdesi(a: BireyselAntrenor): number {
  return Math.round((1 - a.paketFiyatN / (a.tekFiyatN * 10)) * 100);
}

// ---- Veli tarafı ----

export async function getBireyselAntrenorler(): Promise<BireyselAntrenor[]> {
  return delay(BIREYSEL_ANTRENORLER);
}

export async function getBireyselFiltreler(): Promise<string[]> {
  return delay(BIREYSEL_FILTRELER);
}

export async function getBireyselAntrenor(id: string): Promise<BireyselAntrenor> {
  const a = BIREYSEL_ANTRENORLER.find((x) => x.id === id);
  if (!a) throw new Error('Antrenör bulunamadı');
  return delay(a);
}

let paketState: Record<string, BireyselPaketDurumu> = { ...BIREYSEL_PAKETLERIM };
export async function getBireyselPaket(antrenorId: string): Promise<BireyselPaketDurumu | null> {
  return delay(paketState[antrenorId] ?? null);
}

const haftaState: Record<string, BireyselGunSlotlari[]> = {};
function haftaFor(antrenorId: string): BireyselGunSlotlari[] {
  if (!haftaState[antrenorId]) haftaState[antrenorId] = bireyselHaftaSlotlari(antrenorId);
  return haftaState[antrenorId];
}

export async function getBireyselHafta(antrenorId: string): Promise<BireyselGunSlotlari[]> {
  return delay(haftaFor(antrenorId));
}

export async function rezervasyonOlustur(
  antrenorId: string,
  gunIndex: number,
  saat: string,
  odemeTipi: BireyselOdemeTipi
): Promise<BireyselRezervasyonSonuc> {
  const hafta = haftaFor(antrenorId);
  const gun = hafta[gunIndex];
  const slot = gun?.slotlar.find((s) => s.saat === saat);
  if (slot) slot.durum = 'dolu';

  if (odemeTipi === 'paket') {
    const mevcut = paketState[antrenorId];
    if (mevcut && mevcut.kalan > 0) {
      const kalan = mevcut.kalan - 1;
      paketState = { ...paketState, [antrenorId]: { ...mevcut, kalan } };
      return delay({ odemeNotu: `Paketten düşüldü · kalan ${kalan}/${mevcut.toplam} ders`, kalanPaket: kalan });
    }
  }

  const antrenor = BIREYSEL_ANTRENORLER.find((a) => a.id === antrenorId);
  const tutar = antrenor ? formatTL(antrenor.tekFiyatN) : '';
  return delay({ odemeNotu: `${tutar} · kart •••• 4521 ile ödendi` });
}

// ---- Antrenör tarafı ----

let takvim: AntrenorTakvimGun[] = bireyselTakvimHaftasi();
let bekleyen: BekleyenRezervasyon | null = { ...BEKLEYEN_REZERVASYON };

export async function getBireyselTakvimHaftasi(): Promise<AntrenorTakvimGun[]> {
  return delay(takvim);
}

export async function getBekleyenRezervasyon(): Promise<BekleyenRezervasyon | null> {
  return delay(bekleyen);
}

export async function rezervasyonYanitla(cevap: 'onayla' | 'reddet'): Promise<{ mesaj: string }> {
  const pending = bekleyen;
  if (!pending) return delay({ mesaj: '' });

  takvim = takvim.map((gun) => {
    if (gun.gunNo !== pending.gunNo) return gun;
    return {
      ...gun,
      bloklar: gun.bloklar.map((b) => {
        if (b.saat !== pending.saat) return b;
        if (cevap === 'onayla') {
          return { ...b, tur: 'bireysel' as const, bekliyor: false, sub: 'Salon 2 · Paket 6/10' };
        }
        return { ...b, tur: 'bos' as const, baslik: '', sub: '', bekliyor: false };
      }),
    };
  });
  bekleyen = null;

  const mesaj = cevap === 'onayla'
    ? `${pending.sporcuAd} · Salı ${pending.saat} onaylandı — takvime işlendi`
    : `${pending.sporcuAd} · Salı ${pending.saat} reddedildi — slot yeniden açıldı`;
  return delay({ mesaj });
}

let musaitlik: MusaitlikGunu[] = [...MUSAITLIK_VARSAYILAN];
export async function getMusaitlik(): Promise<MusaitlikGunu[]> {
  return delay(musaitlik);
}
export async function toggleMusaitlikGun(index: number): Promise<void> {
  musaitlik = musaitlik.map((m, i) => (i === index ? { ...m, aktif: !m.aktif } : m));
  await delay(null);
}
export async function musaitlikKaydet(): Promise<void> {
  await delay(null);
}

let istisnalar: MusaitlikIstisna[] = [...ISTISNA_VARSAYILAN];
export async function getIstisnalar(): Promise<MusaitlikIstisna[]> {
  return delay(istisnalar);
}
export async function istisnaEkle(etiket: string): Promise<void> {
  istisnalar = [...istisnalar, { id: 'i' + Date.now(), etiket }];
  await delay(null);
}
export async function istisnaSil(id: string): Promise<void> {
  istisnalar = istisnalar.filter((i) => i.id !== id);
  await delay(null);
}

export async function getKazancAylar(): Promise<KazancAySecenegi[]> {
  return delay(KAZANC_AYLAR);
}

export async function getKazancOzet(ayId: string): Promise<KazancOzet> {
  const ay = KAZANC_HAM[ayId] ?? KAZANC_HAM.tem;
  const pay = Math.round(ay.brut * 0.2);
  const net = ay.brut - pay;
  const toplamSeans = ay.tamam + ay.iptal + ay.noshow;
  const pct = (n: number) => Math.round((n / toplamSeans) * 100);
  const maxHafta = Math.max(...ay.haftalar.map((h) => h[1]));

  const ozet: KazancOzet = {
    ayAd: ay.ad,
    ayAd2: ay.ad2,
    net: formatTL(net),
    brut: formatTL(ay.brut),
    kulupPay: formatTL(pay),
    odemeNotu: ay.odeme,
    trend: ay.trend,
    dersAdet: ay.ders,
    saat: ay.ders,
    ogrenci: ay.ogrenci,
    ortalamaDersUcret: formatTL(Math.round(ay.brut / ay.ders)),
    toplamSeans,
    tamamlanan: ay.tamam,
    tamamlananPct: pct(ay.tamam),
    iptal: ay.iptal,
    iptalPct: pct(ay.iptal),
    noshow: ay.noshow,
    noshowPct: pct(ay.noshow),
    haftalar: ay.haftalar.map(([ad, tutar], i) => ({
      ad,
      val: '₺' + (tutar / 1000).toFixed(1).replace('.', ',') + 'b',
      pct: Math.max(8, Math.round((tutar / maxHafta) * 78)),
      aktif: i === ay.aktifHafta,
    })),
    altNot: ay.not,
  };
  return delay(ozet);
}
