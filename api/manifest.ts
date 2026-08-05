// =============================================================================
// /api/manifest?k=<slug> — kulübe özel PWA manifest'i
// =============================================================================
// Veli uygulamayı ana ekranına eklediğinde KENDİ kulübünün simgesini ve adını
// görecek. Ana ekrandaki simge ve ad, "Ana Ekrana Ekle" ANINDAKİ manifest'ten
// okunuyor; yani her kulübün ayrı bir manifest'i olmak zorunda.
//
// Uygulama statik dışa aktarım (expo export) — manifest'i kendisi üretemez.
// Bu yüzden Vercel sunucu fonksiyonu. `framework: null` projelerinde sözleşme
// `api/<ad>.ts` + `export default { async fetch(request) }` (Vercel dokümanı).
//
// ⚠ HER KULÜP AYRI `scope` ALMAK ZORUNDA.
//   Tarayıcı kurulu uygulamaları manifest'in scope'una göre ayırıyor. İki kulüp
//   aynı scope'u ("/") kullansaydı ikinci kurulum BİRİNCİNİN SİMGESİNİ EZERDİ:
//   A kulübünün velisi bir gün ana ekranında B kulübünün logosunu bulurdu.
//   Bu yüzden giriş adresi /k/<slug> ve scope /k/<slug>/.
//   (vercel.json'daki SPA rewrite bu yolları zaten index.html'e veriyor.)
//
// ⚠ KULÜP BİLGİSİ DAR BİR UÇTAN OKUNUYOR.
//   public.kulup_marka(slug) (0056) yalnızca ad + logo + slug döndürüyor.
//   `kulup` tablosuna anon okuma açılsaydı sistemdeki tüm kulüplerin listesi
//   herkese görünürdü — rakip için hazır müşteri listesi. Ölçüldü: anon bu
//   fonksiyonu çağırabiliyor ama kulup ve kurum_ayarlari tablolarını okuyamıyor.
//
// ⚠ SERVICE ROLE KULLANILMIYOR ve bu projeye hiç konmamalı: uygulama tamamen
//   istemci tarafında çalışıyor, burada saklanacak bir sır yok.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Kulüp bulunamazsa ya da logosu yoksa ürünün kendi kimliği. Boş bir manifest
// döndürmek yerine çalışan bir manifest döndürmek önemli: bozuk manifest'te
// tarayıcı "Ana Ekrana Ekle" seçeneğini hiç göstermiyor.
const VARSAYILAN = {
  ad: 'Spor Coach',
  ikonlar: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

interface Marka {
  ad: string | null;
  logo_url: string | null;
  slug: string | null;
}

async function markayiOku(slug: string): Promise<Marka | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const yanit = await fetch(`${SUPABASE_URL}/rest/v1/rpc/kulup_marka`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!yanit.ok) return null;
    const satirlar = (await yanit.json()) as Marka[];
    return satirlar?.[0] ?? null;
  } catch {
    // Ağ hatasında manifest yine üretilsin — simge ürünün kendi simgesi olur.
    // Burada patlamak "Ana Ekrana Ekle" seçeneğini tümden kaldırırdı.
    return null;
  }
}

// Slug yalnızca harf/rakam/tire olabilir. Doğrulanmasaydı istemciden gelen dize
// doğrudan start_url'e girer ve manifest üzerinden yönlendirme yapılabilirdi.
function slugTemiz(ham: string | null): string | null {
  if (!ham) return null;
  const s = ham.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(s) ? s : null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const slug = slugTemiz(url.searchParams.get('k'));

    const marka = slug ? await markayiOku(slug) : null;

    const ad = marka?.ad?.trim() || VARSAYILAN.ad;
    const kapsam = slug ? `/k/${slug}/` : '/';
    const baslangic = slug ? `/k/${slug}` : '/';

    // Kulübün logosu varsa TEK ikon olarak veriliyor. `maskable` BİLEREK
    // verilmiyor: logo 512×512'ye "cover" ile kırpılıyor, yani kenarlara kadar
    // dolu. Maskable ilan edilseydi Android onu bir daire içine daha da
    // kırpardı ve logonun kenarları kesilirdi.
    const ikonlar = marka?.logo_url
      ? [{ src: marka.logo_url, sizes: '512x512', type: 'image/png', purpose: 'any' }]
      : VARSAYILAN.ikonlar;

    const manifest = {
      name: ad,
      // 12 karakter sınırı: uzun adlar ana ekranda zaten kırpılıyor, kısaltmayı
      // tarayıcıya bırakmak yerine anlamlı bir yerden kesmek daha iyi.
      short_name: ad.length > 12 ? ad.slice(0, 12).trim() : ad,
      description: `${ad} — yoklama, aidat, gelişim takibi ve kulüp iletişimi.`,
      lang: 'tr',
      dir: 'ltr',
      start_url: baslangic,
      scope: kapsam,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#061923',
      theme_color: '#061923',
      icons: ikonlar,
    };

    return new Response(JSON.stringify(manifest), {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        // Kısa önbellek: kulüp logosunu değiştirdiğinde manifest'in birkaç
        // dakika içinde tazelenmesi gerekiyor. Uzun tutulsaydı "logoyu
        // değiştirdim ama simge eski" şikâyeti gelirdi.
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  },
};
