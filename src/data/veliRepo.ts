import type { ChildId } from '../context/ChildContext';
import { getOdemeDurumu } from './paymentLedger';
import {
  ANA_SAYFA,
  BILDIRIMLER,
  ETKINLIKLER,
  ETKINLIK_SONUCLARI,
  IZIN_ANTRENMANLAR,
  IZIN_SEBEPLERI,
  KONUSMALAR,
  MAGAZA_KATEGORILER,
  MAGAZA_URUNLER,
  REHBER,
  SERVIS_TAKIP,
  TUM_DUYURULAR,
  VELI_PROFIL,
  YOKLAMA_GELISIM,
} from './mock/veli';
import type {
  AnaSayfaOzet,
  Bildirim,
  ChatMesaj,
  Etkinlik,
  EtkinlikSonuc,
  IznAntrenman,
  Konusma,
  KulupDuyurusu,
  MagazaUrunVeli,
  OdemeOzet,
  RehberKisi,
  ServisTakip,
  VeliProfil,
  YoklamaGelisim,
} from './types-veli';

const DELAY_MS = 300;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY_MS));
}

export async function getAnaSayfa(childId: ChildId): Promise<AnaSayfaOzet> {
  const base = ANA_SAYFA[childId];
  const odeme = getOdemeDurumu(childId);
  return delay({
    ...base,
    aidat: { durum: odeme.durum, tutar: odeme.tutar, sonOdeme: odeme.sonOdeme, taksit: odeme.taksit },
  });
}

export async function getYoklamaGelisim(childId: ChildId): Promise<YoklamaGelisim> {
  return delay(YOKLAMA_GELISIM[childId]);
}

// Aidat durumu ve ödeme kaydı artık src/data/paymentLedger.ts'te tutuluyor —
// tek kaynak, hem burada hem Yönetici > Finans (finansRepo.recordPayment) tarafından okunup yazılıyor.
export async function getOdemeOzet(childId: ChildId): Promise<OdemeOzet> {
  return delay(getOdemeDurumu(childId));
}

export async function getServisTakip(): Promise<ServisTakip> {
  return delay(SERVIS_TAKIP);
}

export async function getMagazaKategoriler(): Promise<string[]> {
  return delay(MAGAZA_KATEGORILER);
}
export async function getMagazaUrunler(): Promise<MagazaUrunVeli[]> {
  return delay(MAGAZA_URUNLER);
}

let konusmalar: Konusma[] = [...KONUSMALAR];
export async function getKonusmalar(): Promise<Konusma[]> {
  return delay(konusmalar);
}
export async function getKonusma(id: string): Promise<Konusma> {
  const k = konusmalar.find((c) => c.id === id);
  if (!k) throw new Error('Konuşma bulunamadı');
  return delay(k);
}

export async function getRehber(): Promise<RehberKisi[]> {
  const mevcutAdlar = new Set(konusmalar.map((k) => k.ad));
  return delay(REHBER.filter((r) => !mevcutAdlar.has(r.ad)));
}

export async function sohbetBaslat(rehberId: string): Promise<Konusma> {
  const kisi = REHBER.find((r) => r.id === rehberId);
  if (!kisi) throw new Error('Kişi bulunamadı');
  const mevcut = konusmalar.find((k) => k.ad === kisi.ad);
  if (mevcut) return delay(mevcut);
  const yeni: Konusma = {
    id: 'k' + Date.now(),
    init: kisi.init,
    ad: kisi.ad,
    role: kisi.role,
    roleColor: kisi.roleColor,
    avBg: kisi.avBg,
    avFg: kisi.avFg,
    son: 'Yeni sohbet başlattınız',
    zaman: 'Şimdi',
    unread: 0,
  };
  konusmalar = [yeni, ...konusmalar];
  return delay(yeni);
}

const BASE_CHAT: ChatMesaj[] = [
  { who: 'c', text: 'Merhaba Elif Hanım, Ali bugün şut çalışmasında çok iyiydi. Kısa videosunu veli kanalına yükledim.', time: '14:20' },
  { who: 'c', text: "Cuma antrenmanı 30 dk erken başlayacak, 16:30'da salonda olalım.", time: '14:21' },
  { who: 'p', text: 'Merhaba hocam, harika haber! Cuma erken geliriz.', time: '14:32' },
];
let chatMessages = [...BASE_CHAT];
const AUTO_REPLIES = ['Rica ederim, iyi akşamlar dilerim.', 'Not aldım, teşekkür ederim.', 'Tamamdır, Cuma görüşürüz.'];
let replyIdx = 0;

export async function getChatMesajlari(): Promise<ChatMesaj[]> {
  return delay(chatMessages);
}

function nowClock() {
  const n = new Date();
  return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
}

export async function sendChatMesaj(text: string): Promise<ChatMesaj[]> {
  chatMessages = [...chatMessages, { who: 'p', text, time: nowClock() }];
  return delay(chatMessages);
}

export function scheduleAutoReply(onReply: (mesajlar: ChatMesaj[]) => void) {
  return setTimeout(() => {
    chatMessages = [...chatMessages, { who: 'c', text: AUTO_REPLIES[replyIdx % AUTO_REPLIES.length], time: nowClock() }];
    replyIdx += 1;
    onReply(chatMessages);
  }, 1600);
}

export async function getIznAntrenmanlar(): Promise<IznAntrenman[]> {
  return delay(IZIN_ANTRENMANLAR);
}
export async function getIznSebepleri(): Promise<string[]> {
  return delay(IZIN_SEBEPLERI);
}

let etkinlikler = [...ETKINLIKLER];
export async function getEtkinlikler(): Promise<Etkinlik[]> {
  return delay(etkinlikler);
}
export async function setKatilimDurumu(id: string, durum: 'katilir' | 'katilmaz'): Promise<void> {
  etkinlikler = etkinlikler.map((e) => (e.id === id ? { ...e, katilimDurumu: durum } : e));
  await delay(null);
}
export async function getEtkinlikSonuclari(): Promise<EtkinlikSonuc[]> {
  return delay(ETKINLIK_SONUCLARI);
}

let bildirimler = [...BILDIRIMLER];

// Son ödeme tarihi geçmiş (durum: 'gecikti') aidatlar için otomatik hatırlatma bildirimi
// oluşturur/kaldırır — gerçek bir zamanlayıcı olmadığından bildirim listesi her okunduğunda senkronize edilir.
function syncOdemeGecikmeBildirimleri() {
  for (const cocuk of VELI_PROFIL.cocuklar) {
    const odeme = getOdemeDurumu(cocuk.id);
    const bildirimId = 'odeme-gecikme-' + cocuk.id;
    const mevcutIdx = bildirimler.findIndex((b) => b.id === bildirimId);
    if (odeme.durum === 'gecikti') {
      if (mevcutIdx === -1) {
        bildirimler = [
          {
            id: bildirimId,
            grup: 'bugun',
            baslik: 'Aidat gecikti',
            aciklama: `${cocuk.ad} için ${odeme.kapsam} son ödeme tarihini geçti (${odeme.sonOdeme}). Ödeme kulüp tarafından işlenince burada güncellenir.`,
            zaman: 'Şimdi',
            tur: 'odeme',
            okundu: false,
          },
          ...bildirimler,
        ];
      }
    } else if (mevcutIdx !== -1) {
      bildirimler = bildirimler.filter((b) => b.id !== bildirimId);
    }
  }
}

export async function getBildirimler(): Promise<Bildirim[]> {
  syncOdemeGecikmeBildirimleri();
  return delay(bildirimler);
}
export async function markBildirimOkundu(id: string): Promise<void> {
  bildirimler = bildirimler.map((b) => (b.id === id ? { ...b, okundu: true } : b));
  await delay(null);
}
export async function markTumuOkundu(): Promise<void> {
  bildirimler = bildirimler.map((b) => ({ ...b, okundu: true }));
  await delay(null);
}

let veliProfil: VeliProfil = { ...VELI_PROFIL };
export async function getTumDuyurular(): Promise<KulupDuyurusu[]> {
  return delay(TUM_DUYURULAR);
}

export async function getVeliProfil(): Promise<VeliProfil> {
  return delay(veliProfil);
}

export async function updateVeliProfil(input: { ad: string; telefon: string; eposta: string }): Promise<VeliProfil> {
  veliProfil = { ...veliProfil, ...input };
  return delay(veliProfil);
}

const KAYITLI_KARTLAR = ['Kredi kartı •••• 4521', 'Kredi kartı •••• 8890', 'Banka kartı •••• 1122'];
export async function getKayitliKartlar(): Promise<string[]> {
  return delay(KAYITLI_KARTLAR);
}

export async function setOdemeYontemi(kart: string): Promise<VeliProfil> {
  veliProfil = { ...veliProfil, odemeYontemi: kart };
  return delay(veliProfil);
}
