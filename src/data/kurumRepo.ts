import { supabase } from '../lib/supabase';
import type { Brans, HizmetTuruSecenegi, KurumBranslariDurumu } from './types';

/** Beyaz etiket bilgileri — kulübün görünen adı ve iletişim alanları. */
export interface KurumBilgi {
  kulupAdi: string;
  telefon: string | null;
  eposta: string | null;
  adres: string | null;
}

/**
 * Kulübün ŞUBESİ artık sabit değil (0021 çok kiracılılık).
 *
 * Eskiden burada MERKEZ_SUBE_ID adında, 0004'teki seed satırının uuid'sini
 * taşıyan bir sabit vardı. Çok kiracılı kurulumda bu id İKİNCİ kulüpte hiçbir
 * satıra karşılık gelmez: kurum_brans_secimi okumaları boş döner, yazmalar ise
 * `sube_id` FK'sine (ve restrictive kiracı duvarına) takılır. Kısacası ikinci
 * kulüpte "Kurum Branşları" ekranı sessizce kırılırdı.
 *
 * Yerine kullanıcının KENDİ kulübünün ilk şubesi okunuyor. RLS zaten sorguyu
 * kullanıcının kulübüne daraltır (sube.kulup_id = current_kulup_id()), bu yüzden
 * ayrıca kulup_id filtresi geçmeye gerek yok — geçilseydi de aynı sonuç çıkardı.
 *
 * SIRALAMA: `sube` tablosunda created_at kolonu YOK (bkz. 0004 ve 0021 —
 * eklenmedi). Deterministik bir "ilk şube" için ada, eşitlikte id'ye göre
 * sıralanıyor; getSubeler()/getOzet() de aynı `order('ad')` desenini kullanıyor.
 *
 * ÖNBELLEK YOK: id modül düzeyinde saklanmıyor. Aynı uygulama örneğinde çıkış
 * yapıp başka bir kulübün hesabıyla girildiğinde önceki kulübün şube id'sinin
 * kullanılması ihtimali, tek bir ek sorgudan daha pahalıdır.
 */
async function getVarsayilanSubeId(): Promise<string> {
  const { data, error } = await supabase
    .from('sube')
    .select('id')
    .order('ad')
    .order('id')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Kulübünüze ait bir şube bulunamadı. Önce panelden şube tanımlayın.');
  return (data as { id: string }).id;
}

/**
 * Beyaz etiket için kulübün görünen adı ve iletişim bilgileri (KurumContext kullanır).
 *
 * İki kaynak okunur: kurum_ayarlari (kulübün panelden düzenlediği bilgiler,
 * kulüp başına tek satır — 0021 sonrası PK kulup_id) ve kulup (platform
 * sahibinin kaydı). Ad için kurum_ayarlari.kulup_adi önceliklidir; boşsa
 * kulup.ad'a düşülür. Her iki tabloda da RLS kullanıcıyı kendi kulübüne
 * kilitler, bu yüzden filtre gerekmez.
 *
 * HATA/BOŞ durumunda null döner — çağıran taraf nötr yer tutucuya düşer
 * (ozellikRepo.getMobilOzellikler ile aynı "sessizce null" deseni).
 */
export async function getKurumBilgi(): Promise<KurumBilgi | null> {
  try {
    const [{ data: ayarlar, error: e1 }, { data: kulup, error: e2 }] = await Promise.all([
      supabase.from('kurum_ayarlari').select('kulup_adi, telefon, eposta, adres').maybeSingle(),
      supabase.from('kulup').select('ad').maybeSingle(),
    ]);
    if (e1 || e2) return null;

    const ad = (ayarlar?.kulup_adi ?? '').trim() || (kulup?.ad ?? '').trim();
    if (!ad) return null;

    return {
      kulupAdi: ad,
      telefon: ayarlar?.telefon ?? null,
      eposta: ayarlar?.eposta ?? null,
      adres: ayarlar?.adres ?? null,
    };
  } catch {
    return null;
  }
}

export async function getBranslar(): Promise<Brans[]> {
  const { data, error } = await supabase.from('brans').select('id, ad, ikon').order('ad');
  if (error) throw error;
  return data as Brans[];
}

export async function getHizmetTurleri(): Promise<HizmetTuruSecenegi[]> {
  const { data, error } = await supabase.from('hizmet_turu').select('id, ad, aciklama, ikon').order('ad');
  if (error) throw error;
  return data as HizmetTuruSecenegi[];
}

export async function getKurumBranslariDurumu(): Promise<KurumBranslariDurumu> {
  const subeId = await getVarsayilanSubeId();
  const [{ data: brans, error: e1 }, { data: hizmet, error: e2 }] = await Promise.all([
    supabase.from('kurum_brans_secimi').select('brans_id').eq('sube_id', subeId),
    supabase.from('kurum_hizmet_turu_secimi').select('hizmet_turu_id').eq('sube_id', subeId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    seciliBranslar: (brans ?? []).map((r) => r.brans_id),
    seciliHizmetTurleri: (hizmet ?? []).map((r) => r.hizmet_turu_id),
  };
}

export async function toggleBrans(id: string): Promise<void> {
  const subeId = await getVarsayilanSubeId();
  const { data } = await supabase
    .from('kurum_brans_secimi')
    .select('brans_id')
    .eq('sube_id', subeId)
    .eq('brans_id', id)
    .maybeSingle();
  if (data) {
    await supabase.from('kurum_brans_secimi').delete().eq('sube_id', subeId).eq('brans_id', id);
  } else {
    await supabase.from('kurum_brans_secimi').insert({ sube_id: subeId, brans_id: id });
  }
}

export async function toggleHizmetTuru(id: string): Promise<void> {
  const subeId = await getVarsayilanSubeId();
  const { data } = await supabase
    .from('kurum_hizmet_turu_secimi')
    .select('hizmet_turu_id')
    .eq('sube_id', subeId)
    .eq('hizmet_turu_id', id)
    .maybeSingle();
  if (data) {
    await supabase.from('kurum_hizmet_turu_secimi').delete().eq('sube_id', subeId).eq('hizmet_turu_id', id);
  } else {
    await supabase.from('kurum_hizmet_turu_secimi').insert({ sube_id: subeId, hizmet_turu_id: id });
  }
}

export async function kurumBranslariKaydet(): Promise<void> {
  // toggleBrans/toggleHizmetTuru artık her tıklamada anında yazıyor, ayrı bir
  // "kaydet" adımına gerek yok — geriye dönük uyum için no-op olarak duruyor.
}

// bagimsizAntrenoreKatil kaldırıldı — sahte bekleme sırası sayacı (214) hiçbir
// tabloya yazmıyordu. Bağımsız antrenör başvuruları gerçek bir tabloya bağlanana
// dek ekran yalnızca "yakında" bilgilendirmesi gösteriyor (bkz. kurum-branslari.tsx).
