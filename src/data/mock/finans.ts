import type { GelirGiderAy, GelirKategori } from '../types';

// Planlar (aidat_plani) ve tahsilatlar (odeme) artık gerçek Supabase tablolarından
// geliyor (bkz. src/data/finansRepo.ts, supabase/migrations/0007_odeme.sql).
// Çok-aylık gelir/gider trendi ve kategori kırılımı hâlâ mock — gerçek zamanlı
// finansal raporlama (aylık toplamlar, kategori etiketleme) Faz 2 kapsamı dışında.

const GG_AYLAR: GelirGiderAy[] = [
  { ay: 'Nis', gelir: 191000, gider: 118000 },
  { ay: 'May', gelir: 202000, gider: 121000 },
  { ay: 'Haz', gelir: 196000, gider: 119500 },
  { ay: 'Tem', gelir: 214500, gider: 126300 },
];

const KATEGORILER: GelirKategori[] = [
  { ad: 'Aidatlar', tutar: '₺154.400', pct: '%72', renkAnahtar: 'accent' },
  { ad: 'Bireysel Ders', tutar: '₺30.000', pct: '%14', renkAnahtar: 'info' },
  { ad: 'Mağaza', tutar: '₺19.300', pct: '%9', renkAnahtar: 'warning' },
  { ad: 'Etkinlik/Kamp', tutar: '₺10.800', pct: '%5', renkAnahtar: 'purple' },
];

export function finansAggregates() {
  return {
    ggAylar: GG_AYLAR,
    kategoriler: KATEGORILER,
    toplamGelir: '₺214.500',
    toplamGider: '−₺126.300',
    net: '₺88.200',
  };
}
