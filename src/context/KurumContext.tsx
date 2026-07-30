import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getKurumBilgi } from '../data/kurumRepo';

/**
 * BEYAZ ETİKET — kulübün adı ve iletişim bilgileri tek kaynaktan.
 *
 * Uygulama artık tek bir kulübe ait değil (0021 çok kiracılılık): ekranlardaki
 * marka metni sabit yazılamaz, oturum açan kullanıcının KENDİ kulübünden gelir.
 * Kaynak sırası (bkz. kurumRepo.getKurumBilgi): kurum_ayarlari.kulup_adi →
 * kulup.ad → yer tutucu. İlk kaynak kulübün panelden düzenlediği ad, ikincisi
 * platform sahibinin kulüp kaydındaki ad.
 *
 * FAIL-SAFE kuralı (OzellikContext'in fail-open kuralının kardeşi): ad
 * yüklenemediyse, henüz yüklenmediyse veya kullanıcının oturumu yoksa nötr
 * VARSAYILAN_AD döner — hiçbir ekran boş bir başlıkla açılmaz ve hiçbir ekran
 * başka bir kulübün adını göstermez. Marka metni bir güvenlik sınırı değil,
 * sunum katmanıdır; verinin kendisini RLS ayırır.
 */

const VARSAYILAN_AD = 'Spor Kulübü';

interface KurumContextValue {
  /** Kulübün görünen adı. Yüklenmeden önce/hata durumunda 'Spor Kulübü'. */
  kulupAdi: string;
  telefon: string | null;
  eposta: string | null;
  adres: string | null;
  /** İlk okuma sürüyor — ekranlar isterse iskelet gösterebilir (zorunlu değil). */
  yukleniyor: boolean;
}

const BOS: Omit<KurumContextValue, 'yukleniyor'> = {
  kulupAdi: VARSAYILAN_AD,
  telefon: null,
  eposta: null,
  adres: null,
};

const KurumContext = createContext<KurumContextValue | null>(null);

export function KurumProvider({ children }: { children: ReactNode }) {
  const [bilgi, setBilgi] = useState(BOS);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function yukle() {
      // Hata/erişilemezlik durumunda null döner — nötr yer tutucuya düşülür.
      const gelen = await getKurumBilgi();
      if (!mounted) return;
      setBilgi(gelen ?? BOS);
      setYukleniyor(false);
    }

    // AuthContext/OzellikContext ile aynı desen: önce mevcut oturum, sonra
    // auth değişimleri. Oturum kapanınca bilgi SIFIRLANIR — bir sonraki
    // kullanıcı, önceki kulübün adını bir an bile görmemeli.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        if (data.session) yukle();
        else setYukleniyor(false);
      })
      .catch(() => {
        if (mounted) setYukleniyor(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        yukle();
      } else {
        setBilgi(BOS);
        setYukleniyor(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <KurumContext.Provider value={{ ...bilgi, yukleniyor }}>{children}</KurumContext.Provider>;
}

export function useKurum() {
  const ctx = useContext(KurumContext);
  if (!ctx) throw new Error('useKurum, KurumProvider içinde kullanılmalı');
  return ctx;
}
