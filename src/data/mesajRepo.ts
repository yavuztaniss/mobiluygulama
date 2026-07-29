import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { avatarColorAt } from '../theme/avatarPalette';
import type { KonusmaSatir, Mesaj, RehberKisi } from './types-mesaj';

// Mesajlaşma Faz 5'te gerçek `konusma`/`mesaj` tablolarına + Supabase Realtime'a taşındı
// (bkz. supabase/migrations/0010_mesajlasma.sql, 0011_mesaj_gonderen_rol.sql). Rol bağımsız
// tek gerçek kaynak — hem Veli hem Antrenör ekranları buradan import ediyor.
//
// "Hangi taraf olduğumu" salt auth.uid() ile değil, gerçek profil ROLÜ ile çözüyoruz
// (bkz. currentUserRole). Bunun nedeni: paylaşılan tek test hesabı hem veli hem antrenör
// olarak test edildiğinde (veli_id = antrenor_id, self-chat) id eşleştirmesi ayırt edemiyor
// — gerçek iki farklı hesapta rol her zaman sabit olduğundan bu, id eşleştirmesiyle birebir
// aynı sonucu verir, sadece self-chat test senaryosunda doğru ayrışmayı sağlıyor.

function initialsOf(ad: string): string {
  return ad.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function saatEtiketi(iso: string): string {
  const d = new Date(iso);
  const gunFarki = Math.floor((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000);
  if (gunFarki <= 0) return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (gunFarki === 1) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function currentUserRole(myId: string): Promise<'veli' | 'antrenor' | 'yonetici' | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', myId).maybeSingle();
  return (data?.role as 'veli' | 'antrenor' | 'yonetici' | undefined) ?? null;
}

// self-chat'te (veli_id = antrenor_id) hangi taraf olduğumu rolüme göre çözer; gerçek
// iki farklı hesapta myRole zaten sabit olduğundan bu id eşleştirmesiyle aynı sonucu verir.
function resolveBenVeliyim(myRole: string | null, veliId: string, myId: string): boolean {
  if (myRole === 'veli') return true;
  if (myRole === 'antrenor') return false;
  return veliId === myId;
}

type KonusmaRow = {
  id: string;
  veli_id: string;
  antrenor_id: string;
  son_mesaj: string | null;
  son_mesaj_zaman: string | null;
  veli_okundu_zaman: string | null;
  antrenor_okundu_zaman: string | null;
  veli: { ad: string } | null;
  antrenor: { ad: string } | null;
};

export async function getKonusmalar(): Promise<KonusmaSatir[]> {
  const myId = await currentUserId();
  if (!myId) return [];
  const myRole = await currentUserRole(myId);

  const { data, error } = await supabase
    .from('konusma')
    .select(
      'id, veli_id, antrenor_id, son_mesaj, son_mesaj_zaman, veli_okundu_zaman, antrenor_okundu_zaman, ' +
        'veli:profiles!konusma_veli_id_fkey(ad), antrenor:profiles!konusma_antrenor_id_fkey(ad)'
    )
    .order('son_mesaj_zaman', { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as KonusmaRow[];
  if (rows.length === 0) return [];

  const { data: mesajRows } = await supabase
    .from('mesaj')
    .select('konusma_id, gonderen_rol, created_at')
    .in('konusma_id', rows.map((r) => r.id));
  const mRows = (mesajRows ?? []) as { konusma_id: string; gonderen_rol: string; created_at: string }[];

  return rows.map((r, i) => {
    const benVeliyim = resolveBenVeliyim(myRole, r.veli_id, myId);
    const karsiAd = benVeliyim ? r.antrenor?.ad ?? 'Antrenör' : r.veli?.ad ?? 'Veli';
    const okunduZaman = benVeliyim ? r.veli_okundu_zaman : r.antrenor_okundu_zaman;
    const karsiRol = benVeliyim ? 'antrenor' : 'veli';
    const unread = mRows.filter(
      (m) => m.konusma_id === r.id && m.gonderen_rol === karsiRol && (!okunduZaman || m.created_at > okunduZaman)
    ).length;
    const palette = avatarColorAt(i);
    return {
      id: r.id,
      ad: karsiAd,
      init: initialsOf(karsiAd),
      role: benVeliyim ? 'Antrenör' : 'Veli',
      avBg: palette.avBg,
      avFg: palette.avFg,
      son: r.son_mesaj ?? '',
      zaman: r.son_mesaj_zaman ? saatEtiketi(r.son_mesaj_zaman) : '',
      unread,
    };
  });
}

export async function getKonusmaBasligi(konusmaId: string): Promise<KonusmaSatir | null> {
  const list = await getKonusmalar();
  return list.find((k) => k.id === konusmaId) ?? null;
}

export async function getMesajlar(konusmaId: string): Promise<Mesaj[]> {
  const myId = await currentUserId();
  const myRole = myId ? await currentUserRole(myId) : null;
  const { data, error } = await supabase
    .from('mesaj')
    .select('id, gonderen_id, gonderen_rol, metin, created_at')
    .eq('konusma_id', konusmaId)
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as { id: string; gonderen_id: string; gonderen_rol: string; metin: string; created_at: string }[]).map(
    (m) => ({
      id: m.id,
      benim: myRole ? m.gonderen_rol === myRole : m.gonderen_id === myId,
      text: m.metin,
      time: saatEtiketi(m.created_at),
    })
  );
}

export async function sendMesaj(konusmaId: string, text: string): Promise<void> {
  const myId = await currentUserId();
  const temiz = text.trim();
  if (!myId || !temiz) return;
  const myRole = await currentUserRole(myId);
  const { error } = await supabase
    .from('mesaj')
    .insert({ konusma_id: konusmaId, gonderen_id: myId, gonderen_rol: myRole === 'antrenor' ? 'antrenor' : 'veli', metin: temiz });
  if (error) throw error;
  await supabase.from('konusma').update({ son_mesaj: temiz, son_mesaj_zaman: new Date().toISOString() }).eq('id', konusmaId);
}

export async function konusmaOku(konusmaId: string): Promise<void> {
  const myId = await currentUserId();
  if (!myId) return;
  const myRole = await currentUserRole(myId);
  const { data: k } = await supabase.from('konusma').select('veli_id').eq('id', konusmaId).maybeSingle();
  if (!k) return;
  const benVeliyim = resolveBenVeliyim(myRole, k.veli_id, myId);
  const kolon = benVeliyim ? 'veli_okundu_zaman' : 'antrenor_okundu_zaman';
  await supabase.from('konusma').update({ [kolon]: new Date().toISOString() }).eq('id', konusmaId);
}

// Veli-only: yeni sohbet rehberi + başlatma. Antrenör tarafında "yeni sohbet" akışı yok
// (bugünkü mock'ta da yalnızca veli sohbet başlatabiliyordu).
export async function getRehber(): Promise<RehberKisi[]> {
  const veliId = await currentUserId();
  if (!veliId) return [];

  const { data: baglar } = await supabase.from('veli_sporcu').select('sporcu_id').eq('veli_id', veliId);
  const sporcuIds = ((baglar ?? []) as { sporcu_id: string }[]).map((b) => b.sporcu_id);
  if (sporcuIds.length === 0) return [];

  const { data: antrenorlar } = await supabase
    .from('sporcu_antrenor')
    .select('antrenor:profiles(id, ad)')
    .in('sporcu_id', sporcuIds);
  const antrenorMap = new Map<string, string>();
  ((antrenorlar ?? []) as any[]).forEach((r) => {
    if (r.antrenor) antrenorMap.set(r.antrenor.id, r.antrenor.ad);
  });

  const { data: mevcut } = await supabase.from('konusma').select('antrenor_id').eq('veli_id', veliId);
  const mevcutIds = new Set(((mevcut ?? []) as { antrenor_id: string }[]).map((k) => k.antrenor_id));

  return Array.from(antrenorMap.entries())
    .filter(([id]) => !mevcutIds.has(id))
    .map(([id, ad], i) => ({
      id,
      ad,
      role: 'Antrenör',
      init: initialsOf(ad),
      ...avatarColorAt(i),
    }));
}

export async function sohbetBaslat(antrenorId: string): Promise<string> {
  const veliId = await currentUserId();
  if (!veliId) throw new Error('Oturum yok');
  const { data: existing } = await supabase
    .from('konusma')
    .select('id')
    .eq('veli_id', veliId)
    .eq('antrenor_id', antrenorId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from('konusma')
    .insert({ veli_id: veliId, antrenor_id: antrenorId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export function subscribeToKonusma(konusmaId: string, onInsert: (m: Mesaj) => void): RealtimeChannel {
  const channel = supabase.channel(`konusma-${konusmaId}`).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'mesaj', filter: `konusma_id=eq.${konusmaId}` },
    async (payload) => {
      const myId = await currentUserId();
      const myRole = myId ? await currentUserRole(myId) : null;
      const row = payload.new as { id: string; gonderen_id: string; gonderen_rol: string; metin: string; created_at: string };
      onInsert({
        id: row.id,
        benim: myRole ? row.gonderen_rol === myRole : row.gonderen_id === myId,
        text: row.metin,
        time: saatEtiketi(row.created_at),
      });
    }
  );
  return channel.subscribe();
}

export function unsubscribeKonusma(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}
