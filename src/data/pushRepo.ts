import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Push bildirim altyapısı (0020_push_token.sql). Tasarım ilkesi: push HİÇBİR
// koşulda uygulamayı kıramaz — her adım koşullu, her hata sessizce yutulur.
//
// Token kaydı yalnızca şu koşulların TAMAMI sağlanınca yapılır:
//   - native platform (web'de expo-notifications desteklenmiyor),
//   - fiziksel cihaz (emülatörde gerçek push yok),
//   - EAS projectId tanımlı (app.json > extra.eas.projectId — `eas init` yazar),
//   - kullanıcı bildirim izni verdi.
// Not: Android'de Expo Go remote push desteklemez (SDK 53+) — development build gerekir.
// expo-notifications/expo-device dinamik import edilir: modül fabrikaları yalnızca
// native yol çalıştığında evaluate olur (web'i koruyan asıl şey aşağıdaki erken return).

// Kayıt hangi kullanıcı için yapıldı — hesap değişiminde (A çıkış → B giriş)
// yeniden kayıt denensin; aynı kullanıcı için tekrar tekrar denenmesin.
let kayitliUserId: string | null = null;
// Bu cihazın token'ı — çıkışta kendi satırımızı silebilmek için tutulur.
let cihazToken: string | null = null;

export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId || userId === kayitliUserId) return;

    const Device = await import('expo-device');
    if (!Device.isDevice) return;

    const Constants = (await import('expo-constants')).default;
    const projectId: string | undefined =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return; // EAS projesi bağlanana dek sessizce atla

    const Notifications = await import('expo-notifications');

    // Uygulama ön plandayken gelen bildirim de banner olarak gösterilsin.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      // Android 8+ kanal zorunlu — token almadan ÖNCE kurulmalı (Android 13+).
      // Gönderilen mesajlar da channelId: 'varsayilan' ile bu kanalı hedefler.
      await Notifications.setNotificationChannelAsync('varsayilan', {
        name: 'Kulüp Bildirimleri',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const mevcut = await Notifications.getPermissionsAsync();
    let izin = mevcut.status;
    if (izin !== 'granted') {
      const istek = await Notifications.requestPermissionsAsync();
      izin = istek.status;
    }
    if (izin !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    // Düz INSERT — 0020'deki on_push_token_devral trigger'ı aynı token'ın eski
    // satırını (önceki kullanıcı dahil) silip cihazı bu kullanıcıya devreder.
    const { error } = await supabase
      .from('push_token')
      .insert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() });
    if (!error) {
      kayitliUserId = userId;
      cihazToken = token;
    }
  } catch {
    // push kaydı asla akışı bozmaz
  }
}

// Çıkışta bu cihazın token kaydı silinir — çıkış yapılmış cihaza push gitmesin.
export async function unregisterPushToken(): Promise<void> {
  try {
    if (cihazToken) {
      await supabase.from('push_token').delete().eq('token', cihazToken);
    }
  } catch {
    // sessiz — bir sonraki girişte devral trigger'ı zaten düzeltir
  } finally {
    kayitliUserId = null;
    cihazToken = null;
  }
}

// ---------------------------------------------------------------------------
// Gönderim — Expo Push API (exp.host). Kimlik doğrulaması gerektirmez; alıcı
// token'ları zaten RLS ile kısıtlı (yönetici tümünü okur, herkes kendininkini).

type PushTicket = { status: string; details?: { error?: string } };

function timeoutSignal(ms: number): AbortSignal {
  // AbortSignal.timeout her RN/Hermes sürümünde yok — elle kur.
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function sendExpoPush(tokens: string[], title: string, body: string): Promise<number> {
  const temiz = [...new Set(tokens)].filter((t) => t.startsWith('ExponentPushToken'));
  if (temiz.length === 0) return 0;
  let gonderilen = 0;
  const oluTokenlar: string[] = [];
  // Expo Push API istek başına en çok 100 mesaj kabul eder.
  for (let i = 0; i < temiz.length; i += 100) {
    const grup = temiz.slice(i, i + 100);
    const mesajlar = grup.map((to) => ({ to, title, body, sound: 'default', channelId: 'varsayilan' }));
    try {
      const yanit = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mesajlar),
        signal: timeoutSignal(10000),
      });
      if (!yanit.ok) continue;
      // HTTP 200 teslimat garantisi değil — per-ticket durum sayılır; ölü
      // (DeviceNotRegistered) token'lar temizlenmek üzere toplanır.
      const govde = (await yanit.json().catch(() => null)) as { data?: PushTicket[] } | null;
      const biletler = govde?.data;
      if (!Array.isArray(biletler)) {
        gonderilen += grup.length; // gövde çözülemedi — iyimser say, akışı bozma
        continue;
      }
      biletler.forEach((bilet, idx) => {
        if (bilet.status === 'ok') gonderilen += 1;
        else if (bilet.details?.error === 'DeviceNotRegistered' && grup[idx]) oluTokenlar.push(grup[idx]);
      });
    } catch {
      // ağ hatası/timeout — kalan gruplar denenmeye devam eder
    }
  }
  if (oluTokenlar.length > 0) {
    // RLS: yönetici ölü token'ları silebilir (0020) — hata yutulur.
    await supabase.from('push_token').delete().in('token', oluTokenlar).then(
      () => undefined,
      () => undefined
    );
  }
  return gonderilen;
}

// Duyuru hedefine göre veli push token'larını çözer (yönetici oturumu gerektirir —
// push_token "yönetici tümünü okur" politikası).
export async function getVeliPushTokenlari(hedefGrupIds: string[] | 'tum'): Promise<string[]> {
  try {
    if (hedefGrupIds === 'tum') {
      const { data } = await supabase.from('push_token').select('token, profil:profiles(role)');
      return ((data ?? []) as unknown as { token: string; profil: { role: string } | null }[])
        .filter((r) => r.profil?.role === 'veli')
        .map((r) => r.token);
    }
    if (hedefGrupIds.length === 0) return [];
    const { data: sporcuRows } = await supabase.from('sporcular').select('id').in('grup_id', hedefGrupIds);
    const sporcuIds = ((sporcuRows ?? []) as { id: string }[]).map((s) => s.id);
    if (sporcuIds.length === 0) return [];
    const { data: veliRows } = await supabase.from('veli_sporcu').select('veli_id').in('sporcu_id', sporcuIds);
    const veliIds = [...new Set(((veliRows ?? []) as { veli_id: string }[]).map((v) => v.veli_id))];
    if (veliIds.length === 0) return [];
    const { data: tokenRows } = await supabase.from('push_token').select('token').in('user_id', veliIds);
    return ((tokenRows ?? []) as { token: string }[]).map((t) => t.token);
  } catch {
    return [];
  }
}
