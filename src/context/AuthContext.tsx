import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
    role: Profile['role'];
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
        if (data.session) await loadProfile(data.session.user.id);
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
    role,
  }: {
    email: string;
    password: string;
    ad: string;
    role: Profile['role'];
  }) {
    // profiles satırı auth.users insert tetikleyicisiyle (handle_new_user) otomatik oluşur,
    // bkz. supabase/migrations — user_metadata.ad / user_metadata.role okunuyor.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { ad, role } },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut().catch(() => {});
    setProfile(null);
    setSession(null);
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  function devSignInAs(role: Profile['role']) {
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
