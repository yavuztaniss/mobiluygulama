import type { ChildId } from '../context/ChildContext';
import type { OdemeYontemi } from './types';
import type { OdemeOzet } from './types-veli';
import { ODEME_OZET, VELI_PROFIL } from './mock/veli';

// Yönetici (Finans > Ödeme Kaydet) ve Veli (Ödemeler) ekranları aynı aidat durumunu
// bu tek kaynaktan okuyup yazıyor — ödeme artık yalnızca kulüp tarafından işlenir.
let state: Record<ChildId, OdemeOzet> = { ...ODEME_OZET };

export function getOdemeDurumu(childId: ChildId): OdemeOzet {
  return state[childId];
}

const YONTEM_ETIKET: Record<OdemeYontemi, string> = {
  kart: 'Kredi kartı •••• 4521',
  havale: 'Havale / EFT',
  elden: 'Elden',
};

export function kaydetOdeme(childId: ChildId, tutar: string, yontem: OdemeYontemi): void {
  const current = state[childId];
  const baslik = current.kapsam.split(' · ')[0] || 'Aidat';
  const tutarEtiketi = tutar.startsWith('₺') ? tutar : `₺${tutar}`;
  state = {
    ...state,
    [childId]: {
      ...current,
      durum: 'odendi',
      odemeTarihi: 'Bugün',
      gecmis: [
        { id: 'pay-' + Date.now(), title: baslik, date: 'Bugün', method: YONTEM_ETIKET[yontem], amount: tutarEtiketi },
        ...current.gecmis,
      ],
    },
  };
}

/** Yönetici tarafında sporcu tam adıyla çalışılıyor — bunu veli tarafındaki ChildId'ye eşler. */
export function findChildIdByAd(ad: string): ChildId | null {
  const found = VELI_PROFIL.cocuklar.find((c) => c.ad === ad);
  return found ? found.id : null;
}
