import {
  ANTRENOR_BILDIRIMLER,
  ANTRENOR_KONUSMALAR,
  ANTRENOR_PROFIL,
  BUGUNKU_GRUPLAR,
  GELISIM_BECERI_ADLARI,
  GELISIM_NOT_SABLONLARI,
  GELISIM_VARSAYILAN,
  KADRO_VARSAYILAN,
  U12_SPORCULAR,
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

let gruplar = [...BUGUNKU_GRUPLAR];
export async function getBugunkuGruplar(): Promise<BugunkuGrup[]> {
  return delay(gruplar);
}

export async function getSporcular(): Promise<Sporcu[]> {
  return delay(U12_SPORCULAR);
}

let yoklamaState: Record<string, YoklamaDurum> = (() => {
  const m: Record<string, YoklamaDurum> = {};
  U12_SPORCULAR.forEach((s) => {
    m[s.id] = s.id === 'deniz' ? 'out' : 'in';
  });
  return m;
})();
let yoklamaKaydedildi = false;
let yoklamaKaydedilmeZamani: string | null = null;

export async function getYoklamaSatirlari(): Promise<YoklamaSatiri[]> {
  const satirlar: YoklamaSatiri[] = U12_SPORCULAR.map((s) => ({
    id: s.id,
    ad: s.ad,
    init: s.init,
    durum: yoklamaState[s.id],
    izinli: s.id === 'deniz',
    izinDetay: s.id === 'deniz' ? 'Hastalık · veli notu: "Ateşi var, evde dinlenecek" · 09:12' : undefined,
  }));
  return delay(satirlar);
}

export async function setYoklamaDurum(id: string, durum: YoklamaDurum): Promise<void> {
  yoklamaState = { ...yoklamaState, [id]: durum };
  await delay(null);
}

export async function tumunuKatildiYap(): Promise<void> {
  const next: Record<string, YoklamaDurum> = {};
  U12_SPORCULAR.forEach((s) => (next[s.id] = 'in'));
  yoklamaState = next;
  await delay(null);
}

export async function getYoklamaKayitDurumu(): Promise<{ kaydedildi: boolean; zaman: string | null }> {
  return delay({ kaydedildi: yoklamaKaydedildi, zaman: yoklamaKaydedilmeZamani });
}

export async function yoklamaKaydet(): Promise<{ inCount: number; outCount: number }> {
  const now = new Date();
  yoklamaKaydedilmeZamani = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  yoklamaKaydedildi = true;
  const inCount = Object.values(yoklamaState).filter((v) => v === 'in').length;
  const outCount = Object.values(yoklamaState).filter((v) => v === 'out').length;
  await delay(null);
  return { inCount, outCount };
}

export async function yoklamaKilidiAc(): Promise<void> {
  yoklamaKaydedildi = false;
  await delay(null);
}

export async function getVeliBildirimleri(): Promise<VeliBildirimi[]> {
  return delay(VELI_BILDIRIMLERI);
}

export const GELISIM_SKILL_NAMES = GELISIM_BECERI_ADLARI;
export const GELISIM_TEMPLATES = GELISIM_NOT_SABLONLARI;

const gelisimState: Record<string, { beceriler: number[]; not: string; gonderildi: boolean }> = JSON.parse(
  JSON.stringify(GELISIM_VARSAYILAN)
);

export async function getGelisimKaydi(sporcuId: string): Promise<GelisimKaydi> {
  const s = gelisimState[sporcuId] ?? { beceriler: [3, 3, 3, 3], not: '', gonderildi: false };
  return delay({
    sporcuId,
    beceriler: GELISIM_BECERI_ADLARI.map((ad, i) => ({ ad, seviye: s.beceriler[i] })),
    not: s.not,
    gonderildi: s.gonderildi,
    tarih: s.gonderildi ? '19 Temmuz' : undefined,
  });
}

export async function setGelisimSeviye(sporcuId: string, beceriIndex: number, seviye: number): Promise<void> {
  const s = gelisimState[sporcuId] ?? { beceriler: [3, 3, 3, 3], not: '', gonderildi: false };
  const beceriler = [...s.beceriler];
  beceriler[beceriIndex] = seviye;
  gelisimState[sporcuId] = { ...s, beceriler };
  await delay(null);
}

export async function setGelisimNot(sporcuId: string, not: string): Promise<void> {
  const s = gelisimState[sporcuId] ?? { beceriler: [3, 3, 3, 3], not: '', gonderildi: false };
  gelisimState[sporcuId] = { ...s, not };
  await delay(null);
}

export async function gelisimGonder(sporcuId: string): Promise<void> {
  const s = gelisimState[sporcuId] ?? { beceriler: [3, 3, 3, 3], not: '', gonderildi: false };
  gelisimState[sporcuId] = { ...s, gonderildi: true };
  await delay(null);
}

export async function gelisimKilidiAc(sporcuId: string): Promise<void> {
  const s = gelisimState[sporcuId] ?? { beceriler: [3, 3, 3, 3], not: '', gonderildi: false };
  gelisimState[sporcuId] = { ...s, gonderildi: false };
  await delay(null);
}

let kadro: KadroSatiri[] = [...KADRO_VARSAYILAN];
let kadroYayinlandi = false;

export async function getKadro(): Promise<KadroSatiri[]> {
  return delay(kadro);
}

export async function toggleKadroSecim(id: string): Promise<void> {
  kadro = kadro.map((k) => (k.id === id ? { ...k, secili: !k.secili } : k));
  await delay(null);
}

export async function lcvKatilanlariEkle(): Promise<void> {
  kadro = kadro.map((k) => (k.lcv === 'katiliyor' ? { ...k, secili: true } : k));
  await delay(null);
}

export async function getKadroYayinDurumu(): Promise<boolean> {
  return delay(kadroYayinlandi);
}

export async function kadroYayinla(): Promise<void> {
  kadroYayinlandi = true;
  await delay(null);
}

export async function kadroKilidiAc(): Promise<void> {
  kadroYayinlandi = false;
  await delay(null);
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
