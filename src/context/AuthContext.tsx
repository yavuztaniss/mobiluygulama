import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerPushToken, unregisterPushToken } from '../data/pushRepo';
import type { Profile } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: {
    email: string;
    password: string;
    ad: string;
    /**
     * Davet linkinden gelen tek kullanımlık token (karsiyakasporokulu://davet/<token>).
     * Verilirse kullanıcının KULÜBÜ ve ROLÜ bu token'ın işaret ettiği davet satırından
     * belirlenir. Verilmezse kayıt yalnızca tek kulüplü kurulumlarda kabul edilir.
     */
    davetToken?: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  /** Gerçek Supabase projesi bağlanana kadar ekranları test etmek için — sonra kaldırılacak. */
  devSignInAs: (role: Profile['role']) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error) setProfile(data as Profile);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (data.session) {
          await loadProfile(data.session.user.id);
          // Push token kaydı — fire-and-forget; web/emülatör/EAS'sız kurulumda sessizce atlar.
          registerPushToken();
        }
      })
      .catch(() => {
        // Supabase'e ulaşılamıyor (örn. .env henüz gerçek proje bilgileriyle doldurulmadı) —
        // login ekranını göstermeye devam et, sessizce boğma.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
        registerPushToken();
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp({
    email,
    password,
    ad,
    davetToken,
  }: {
    email: string;
    password: string;
    ad: string;
    davetToken?: string;
  }) {
    // profiles satırı auth.users insert tetikleyicisiyle (handle_new_user) otomatik oluşur,
    // bkz. supabase/migrations/0022_davet.sql.
    //
    // ROL ARTIK GÖNDERİLMİYOR. Eskiden options.data içinde `role` de vardı; 0016'dan beri
    // handle_new_user bu alanı OKUMUYOR — metadata self-signup'ta istemci kontrollüdür,
    // oradan okunsaydı herkes data:{role:'yonetici'} yazıp kendini yönetici yapabilirdi.
    // 0022 ile rol (ve kulüp) DAVET SATIRINDAN geliyor.
    //
    // Metadata'ya konan tek yeni alan `davet_token`. Bu güvenlidir, çünkü token bir İDDİA
    // değil KANITTIR: 16 rastgele bayt, uydurulan bir değer hiçbir davet satırıyla
    // eşleşmez ve tetikleyici kaydı reddeder. Anahtar adı sunucudaki okumayla birebir
    // aynı olmalı: raw_user_meta_data ->> 'davet_token'.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: davetToken ? { ad, davet_token: davetToken } : { ad } },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    // Çıkış yapılmış cihaza push gitmesin — token kaydı oturum kapanmadan silinir
    // (silme RLS gereği oturum gerektirir).
    await unregisterPushToken();
    await supabase.auth.signOut().catch(() => {});
    setProfile(null);
    setSession(null);
  }

  // ŞİFRE SIFIRLAMA — bağlantı UYGULAMAYA DEĞİL PANELE gider, bilinçli.
  //
  // redirectTo verilmiyor; Supabase o zaman projenin `site_url` ayarını kullanır
  // ve o adres YÖNETİM PANELİDİR. Veli bağlantıya dokununca panelin
  // /sifre-belirle ekranı açılır, yeni şifresini yazar ve ekran ona "artık mobil
  // uygulamadan giriş yapabilirsiniz" der (admin-panel/app/sifre-belirle).
  //
  // NEDEN UYGULAMAYA DEĞİL: e-postadaki bağlantının uygulamayı açabilmesi için
  // https'li universal link kurulumu gerekir (alan adı + doğrulama dosyası).
  // O kurulana kadar custom scheme'li bir bağlantı e-posta istemcilerinde
  // çoğunlukla tıklanabilir bile olmaz — yani "uygulamaya yönlendirmek"
  // çalışmayan bir akış üretirdi.
  //
  // ⚠ ÖN KOŞUL: Supabase panelinde Authentication > URL Configuration >
  // Site URL, panelin gerçek adresine ayarlı olmalı. Ayarlı değilse bağlantı
  // hiçbir yere gitmez ve veli şifresini sıfırlayamaz.
  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  function devSignInAs(role: Profile['role']) {
    if (!__DEV__) return;
    setProfile({
      id: 'dev-' + role,
      role,
      ad: 'Test Kullanıcı',
      telefon: null,
      sube_id: null,
      avatar_url: null,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signIn, signUp, signOut, resetPassword, refreshProfile, devSignInAs }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
