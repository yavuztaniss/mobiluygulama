import { supabase } from '../lib/supabase';

export interface AsgariSurumKurali {
  asgariSurum: string;
  mesaj: string | null;
  iosUrl: string | null;
  androidUrl: string | null;
}

// Zorunlu güncelleme kuralını okur (0030).
//
// HATA DURUMUNDA null — VE BU BİLİNÇLİ. Çağıran (SurumKapisi) null'ı
// "engelleme" olarak yorumluyor, yani kontrol yapılamadığında uygulama açılıyor.
// Tersi olsaydı Supabase'de yaşanacak kısa bir kesinti, güncel sürümdeki
// kullanıcıları da "güncelleyin" ekranında kilitlerdi.
//
// Tablo anon'a açık: kontrol GİRİŞTEN ÖNCE çalışıyor.
export async function getAsgariSurum(): Promise<AsgariSurumKurali | null> {
  try {
    const { data, error } = await supabase
      .from('uygulama_surumu')
      .select('asgari_surum, mesaj, ios_url, android_url')
      .maybeSingle();

    if (error || !data) return null;

    const satir = data as {
      asgari_surum: string;
      mesaj: string | null;
      ios_url: string | null;
      android_url: string | null;
    };

    return {
      asgariSurum: satir.asgari_surum,
      mesaj: satir.mesaj,
      iosUrl: satir.ios_url,
      androidUrl: satir.android_url,
    };
  } catch {
    return null;
  }
}
