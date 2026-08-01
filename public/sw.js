/* =============================================================================
 * SERVICE WORKER — Spor Coach PWA
 * =============================================================================
 * NEDEN VAR
 *   Android/Chrome'un "Uygulamayı yükle" istemi, geçerli bir manifest'e EK
 *   OLARAK fetch olayını dinleyen bir service worker istiyor. Bu dosya olmadan
 *   manifest doğru olsa bile yükleme istemi hiç çıkmıyor. (iOS'ta "Ana Ekrana
 *   Ekle" service worker olmadan da çalışıyor; bu dosya oradaki davranışı
 *   değiştirmiyor, yalnızca çevrimdışı dayanıklılığı ekliyor.)
 *
 * ⚠ EN BÜYÜK İKİ TEHLİKE VE NASIL KAPATILDIĞI
 *
 *   1) OTURUM VE VERİ SIZINTISI — Supabase istekleri ASLA önbelleğe alınmamalı.
 *      Bir velinin çocuğunun verisi ya da erişim belirteci diske yazılırsa,
 *      aynı cihazı kullanan başka biri onu görebilir; üstelik RLS bu noktada
 *      devrede değildir, çünkü yanıt zaten verilmiş ve saklanmıştır.
 *      Aşağıda YALNIZCA kendi kaynağımızdan (same-origin) gelen GET istekleri
 *      ele alınıyor; Supabase farklı bir kaynak olduğu için tamamı dokunulmadan
 *      ağa geçiyor.
 *
 *   2) DAĞITIM SONRASI ESKİ PAKET — SPA kabuğu (index.html) agresif önbelleğe
 *      alınırsa, yeni sürüm yayınlandıktan sonra kullanıcı eski index.html'i
 *      alır. O dosya artık var olmayan hash'li paket adreslerine işaret eder ve
 *      uygulama BEYAZ EKRANDA kalır — üstelik kullanıcı sayfayı yenilese bile
 *      düzelmez, çünkü eski kabuk yine önbellekten gelir.
 *      Bu yüzden gezinme istekleri ÖNCE AĞDAN çekiliyor; önbellek yalnızca ağ
 *      erişilemediğinde devreye giriyor.
 *
 * ÖNBELLEK STRATEJİSİ
 *   · Gezinme (navigate)        → önce ağ, olmazsa önbellekteki kabuk
 *   · /_expo/static/** (hash'li) → önce önbellek (içerik değişirse ad değişir)
 *   · /assets/**, ikonlar        → önce önbellek
 *   · Diğer her şey              → dokunulmuyor
 * ========================================================================== */

// Sürüm değiştiğinde eski önbellekler siliniyor. Kabuk davranışını etkileyen
// bir değişiklik yapıldığında bu numarayı artır.
const SURUM = 'spor-coach-v1';
const KABUK = '/index.html';

// Kurulumda yalnızca kabuk ve ikonlar alınıyor. Hash'li paketleri burada
// listelemek imkânsız (adları her derlemede değişiyor) — onlar ilk kullanımda
// kendiliğinden önbelleğe giriyor.
const ON_YUKLE = [KABUK, '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (olay) => {
  olay.waitUntil(
    caches
      .open(SURUM)
      .then((onbellek) =>
        // addAll tek bir dosya bile düşse TÜMÜNÜ iptal ediyor; bu da kurulumu
        // tamamen başarısız kılar. Tek tek eklenip hatalar yutuluyor:
        // eksik bir ikon yüzünden service worker hiç kurulmaması saçma olurdu.
        Promise.all(
          ON_YUKLE.map((yol) =>
            onbellek.add(yol).catch(() => {
              /* bu dosya yoksa yoluna devam */
            })
          )
        )
      )
      // Yeni service worker beklemeden devreye girsin: aksi hâlde güncelleme
      // ancak kullanıcı TÜM sekmeleri kapatınca etkili olur.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    caches
      .keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))))
      // Açık sayfaların kontrolünü hemen al.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (olay) => {
  const istek = olay.request;

  // Yalnızca GET. POST/PATCH/DELETE yanıtlarının önbelleğe alınması hem
  // anlamsız hem tehlikeli olurdu.
  if (istek.method !== 'GET') return;

  const url = new URL(istek.url);

  // ⚠ BAŞKA KAYNAK = DOKUNMA. Supabase (REST, Auth, Realtime) buraya düşüyor.
  if (url.origin !== self.location.origin) return;

  // --- Gezinme: önce ağ ---------------------------------------------------
  // `mode === 'navigate'` adres çubuğuna yazılan/tıklanan gezinmeleri yakalıyor.
  if (istek.mode === 'navigate') {
    olay.respondWith(
      fetch(istek)
        .then((yanit) => {
          // Taze kabuğu sakla ki çevrimdışıyken açılabilsin.
          const kopya = yanit.clone();
          caches.open(SURUM).then((onbellek) => onbellek.put(KABUK, kopya));
          return yanit;
        })
        .catch(() => caches.match(KABUK).then((k) => k || Response.error()))
    );
    return;
  }

  // --- Hash'li varlıklar: önce önbellek ------------------------------------
  // Expo bu dosyaları içerik hash'iyle adlandırıyor; içerik değişirse ad da
  // değişiyor, dolayısıyla bayat sürüm servis etme riski yok.
  const onbelleklenebilir =
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|otf)$/i.test(url.pathname);

  if (!onbelleklenebilir) return;

  olay.respondWith(
    caches.match(istek).then(
      (bulunan) =>
        bulunan ||
        fetch(istek).then((yanit) => {
          // Yalnızca sağlıklı, temel (opaque olmayan) yanıtlar saklanıyor;
          // hata sayfasını önbelleğe almak kalıcı bir arıza üretirdi.
          if (yanit && yanit.status === 200 && yanit.type === 'basic') {
            const kopya = yanit.clone();
            caches.open(SURUM).then((onbellek) => onbellek.put(istek, kopya));
          }
          return yanit;
        })
    )
  );
});
