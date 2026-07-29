import { supabase } from '../lib/supabase';

/**
 * Panelden yönetilen mobil özellik bayraklarını (supabase/migrations/0019_mobil_ozellik.sql)
 * anahtar → aktif haritası olarak döndürür.
 *
 * HATA durumunda null döner (boş tablo ise {} — ikisi ayırt edilir): çağıran taraf
 * (OzellikContext) null'da ELİNDEKİ haritayı korur — geçici bir ağ hatası, daha önce
 * başarıyla yüklenmiş "kapalı" bayrakları sıfırlayıp özellikleri geri getirmesin.
 * Haritada olmayan her anahtar AÇIK yorumlanır (fail-open) — bayrak altyapısı
 * hiçbir hata durumunda uygulamayı kilitleyemez.
 */
export async function getMobilOzellikler(): Promise<Record<string, boolean> | null> {
  try {
    const { data, error } = await supabase.from('mobil_ozellik').select('anahtar, aktif');
    if (error) return null;
    const harita: Record<string, boolean> = {};
    for (const satir of data ?? []) harita[satir.anahtar] = satir.aktif;
    return harita;
  } catch {
    return null;
  }
}
