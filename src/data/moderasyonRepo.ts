import { supabase } from '../lib/supabase';

// ===========================================================================
// Engelleme ve şikâyet — App Store Guideline 1.2
// ===========================================================================

export type SikayetSebebi = 'uygunsuz_icerik' | 'taciz' | 'spam' | 'sahte_hesap' | 'diger';

export const SIKAYET_SEBEPLERI: { deger: SikayetSebebi; etiket: string }[] = [
  { deger: 'uygunsuz_icerik', etiket: 'Uygunsuz içerik' },
  { deger: 'taciz', etiket: 'Taciz veya rahatsız edici davranış' },
  { deger: 'spam', etiket: 'Spam / istenmeyen mesaj' },
  { deger: 'sahte_hesap', etiket: 'Sahte hesap' },
  { deger: 'diger', etiket: 'Diğer' },
];

async function kendiId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Oturum bulunamadı — yeniden giriş yapın.');
  return id;
}

// Bu kullanıcıyı ben engelledim mi?
//
// NOT: "beni kim engelledi" sorusu YANITLANAMAZ ve bu bilinçli (0031 bölüm 1).
// Bu sorgu yalnızca KENDİ engel listemi okur; RLS zaten başkasınınkini
// göstermiyor. Ekranda "Engeli Kaldır" mı "Engelle" mi yazacağını belirler.
export async function engelliMi(hedefId: string): Promise<boolean> {
  const ben = await kendiId();
  const { data, error } = await supabase
    .from('engelleme')
    .select('engellenen_id')
    .eq('engelleyen_id', ben)
    .eq('engellenen_id', hedefId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function engelle(hedefId: string): Promise<void> {
  const ben = await kendiId();
  const { error } = await supabase
    .from('engelleme')
    .insert({ engelleyen_id: ben, engellenen_id: hedefId });
  // 23505 = zaten engellenmiş. Kullanıcı açısından istenen sonuç zaten oluşmuş
  // durumda; hata göstermek kafa karıştırırdı.
  if (error && (error as { code?: string }).code !== '23505') throw error;
}

export async function engeliKaldir(hedefId: string): Promise<void> {
  const ben = await kendiId();
  const { error } = await supabase
    .from('engelleme')
    .delete()
    .eq('engelleyen_id', ben)
    .eq('engellenen_id', hedefId);
  if (error) throw error;
}

export async function sikayetGonder(input: {
  hedefId: string | null;
  konusmaId: string | null;
  sebep: SikayetSebebi;
  aciklama: string;
}): Promise<void> {
  const ben = await kendiId();
  const { error } = await supabase.from('sikayet').insert({
    sikayet_eden_id: ben,
    hedef_id: input.hedefId,
    konusma_id: input.konusmaId,
    sebep: input.sebep,
    aciklama: input.aciklama.trim() || null,
  });
  if (error) throw error;
}
