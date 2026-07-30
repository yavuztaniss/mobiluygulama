import { supabase } from '../lib/supabase';

// Hesap silme — App Store Guideline 5.1.1(v) ve KVKK silme hakkı.
//
// SUNUCU TARAFI RPC KULLANILIYOR, İSTEMCİ SİLMİYOR. İki sebep:
//   1) Bir kullanıcı anon key ile auth.users satırını silemez; bu tabloya yazma
//      yetkisi yok. Silmenin gerçekten olması için sunucuda ayrıcalıklı bir
//      fonksiyon şart.
//   2) Neyin silinip neyin kalacağı bir KARAR (mesajlar gider, ödeme kaydı
//      kalır). O kararın istemcide, yani kullanıcının değiştirebileceği bir
//      yerde durması yanlış olurdu — sıra ve kapsam sunucuda sabit.
//
// Fonksiyon parametre ALMIYOR: hedef her zaman auth.uid(). Parametre alsaydı
// "başkasının hesabını sil" ucu doğardı (bkz. 0029 bölüm 5).
export async function hesabimiSil(): Promise<void> {
  const { error } = await supabase.rpc('hesabimi_sil');
  if (error) {
    // Sunucudan gelen mesaj kullanıcıya olduğu gibi gösterilecek: tek beklenen
    // hata "kulübün son yöneticisisiniz" ve ne yapılması gerektiğini söylüyor.
    throw new Error(error.message);
  }
}
