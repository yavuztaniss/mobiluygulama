import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getMobilOzellikler } from '../data/ozellikRepo';

/**
 * Mobil özellik bayrakları (mesajlar, magaza, servis, bireysel_ders, etkinlikler) —
 * admin panelden aç/kapa yapılır, mobil taraf oturum açılınca bir kez okur.
 *
 * FAIL-OPEN kuralı: bayraklar yüklenemediyse, tablo boşsa, anahtar haritada yoksa
 * veya yükleme henüz bitmediyse ozellikAcik() TRUE döner. Yükleme sırasında da true
 * dönmesi bilinçli — ekran titremesin; kapalı bir özellik bayraklar geldikten sonraki
 * render'da gizlenir. Bayrak altyapısı uygulamayı hiçbir koşulda kilitleyemez
 * (devSignInAs sahte oturumunda da harita boş kalır → her şey açık görünür).
 *
 * Derin bağlantı notu: bayrağı kapalı bir özelliğin sekmesi tab bar'dan gizlense de
 * ekranı URL/router.push ile hâlâ açılabilir. Bu bilinçli bir tercih — bayraklar
 * güvenlik sınırı değil, UX aracıdır; erişim kontrolü RLS/rol katmanında yapılır.
 */

interface OzellikContextValue {
  /** Bayrak kapalıysa false; haritada yoksa/yüklenemedıyse TRUE (fail-open). */
  ozellikAcik: (anahtar: string) => boolean;
}

const OzellikContext = createContext<OzellikContextValue | null>(null);

export function OzellikProvider({ children }: { children: ReactNode }) {
  const [bayraklar, setBayraklar] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    async function yukle() {
      // Hata durumunda null döner — bilinen-iyi bayraklar KORUNUR (geçici ağ hatası,
      // panelden kapatılmış bir özelliği yanlışlıkla geri açmasın). İlk yükleme hiç
      // başarısız olursa harita boş kalır → her şey açık (fail-open).
      const harita = await getMobilOzellikler();
      if (mounted && harita !== null) setBayraklar(harita);
    }

    // AuthContext'teki desenle aynı: mevcut oturumu oku, sonra auth değişimlerini izle.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted && data.session) yukle();
      })
      .catch(() => {
        // Supabase'e ulaşılamıyor — harita boş kalır, her şey açık varsayılır.
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        // Oturum açıldı/yenilendi — bayrakları tazele (panel değişiklikleri de böylece yansır).
        yukle();
      } else {
        setBayraklar({});
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const ozellikAcik = useCallback(
    // Yalnızca açıkça false kaydedilmiş bayrak kapatır — diğer her durum açık (fail-open).
    (anahtar: string) => bayraklar[anahtar] !== false,
    [bayraklar]
  );

  return <OzellikContext.Provider value={{ ozellikAcik }}>{children}</OzellikContext.Provider>;
}

export function useOzellik() {
  const ctx = useContext(OzellikContext);
  if (!ctx) throw new Error('useOzellik, OzellikProvider içinde kullanılmalı');
  return ctx;
}
