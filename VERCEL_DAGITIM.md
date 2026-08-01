# PWA'yı Vercel'e Yayınlama

Bu depo (`mobiluygulama`) veli ve antrenörün kullandığı mobil uygulamayı içeriyor.
Uygulama bir **PWA**: mağazaya yüklenmiyor, tarayıcıdan açılıp ana ekrana ekleniyor.
Yani yayınlamak = statik bir siteyi bir adrese koymak.

Panel ve tanıtım sitesi AYRI bir Vercel projesinde (`mobiluygulamaweb`). İkisi aynı
Supabase projesine bağlanıyor; ayrı olmalarının sebebi farklı derleme araçları
(Expo / Next.js), farklı veri değil.

---

## 1. Vercel projesini oluştur

Vercel → **Add New → Project** → `yavuztaniss/mobiluygulama` deposunu seç.

`vercel.json` deponun kökünde olduğu için derleme ayarlarını Vercel kendisi
okuyacak; ekranda çıkan Framework/Build alanlarına **dokunma**:

| Ayar | Değer | Nereden geliyor |
|---|---|---|
| Framework Preset | Other | `vercel.json → framework: null` |
| Build Command | `npx expo export -p web --clear` | `vercel.json` |
| Output Directory | `dist` | `vercel.json` |

## 2. Ortam değişkenleri

**Deploy'a basmadan önce** ekle (Environment Variables):

```
EXPO_PUBLIC_SUPABASE_URL       = https://owgxwobxnugrqagtzrrl.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY  = sb_publishable_WfiLbaxRmBNnaqU9qsAYhA_KknfsNlj
```

Üçünü de (Production / Preview / Development) işaretle.

⚠ **`SUPABASE_SERVICE_ROLE_KEY` BURAYA KONMAZ.** O anahtar yalnızca panel
projesinde, yalnızca sunucu tarafında kullanılıyor. Buraya konsaydı `EXPO_PUBLIC_`
olmasa bile derlemeye girme riski doğardı; uygulama tamamen istemci tarafında
çalışıyor ve orada saklanabilecek bir sır yok.

⚠ **`EXPO_PUBLIC_*` DEĞERLERİ DERLEME ANINDA KODA GÖMÜLÜYOR.** Değiştirdiğin gün
yeniden dağıtmadan hiçbir şey değişmez. `vercel.json`'daki `--clear` bayrağı da
tam bu yüzden var: Metro'nun önbelleği eski değeri saklıyor ve yerelde bir kez
ÖLÇÜLDÜ — `.env` yeni projeye çevrilmiş olmasına rağmen paket ölü projeye
bağlanıyordu.

## 3. Supabase Auth ayarı

Supabase → Authentication → **URL Configuration** → **Redirect URLs** listesine
uygulamanın adresini ekle:

```
https://<uygulama-adresin>/**
```

Bu yapılmazsa davet ve şifre sıfırlama bağlantıları sessizce `site_url`'e düşer —
hata vermez, sadece yanlış yere gider ve davet edilen kişi hesabını hiç açamaz.

## 4. Adresi panele yaz

Platform konsolu → **Site Ayarları** → *Mobil Uygulama Adresi* alanına yayınlanan
adresi yaz.

O ana kadar tanıtım sitesindeki giriş ekranında **Veli** ve **Antrenör** butonları
ölü bağlantı yerine "Mobil Uygulama" anlatım sayfasına gidiyor. Adresi yazdığın an
gerçek hedefe dönüyorlar — kodda hiçbir değişiklik gerekmiyor.

## 5. Kontrol listesi (yayından sonra)

- [ ] Adres tarayıcıda açılıyor, giriş ekranı geliyor
- [ ] Konsolda hata yok
- [ ] `https://<adres>/manifest.json` → 200 dönüyor
- [ ] `https://<adres>/sw.js` → 200 dönüyor
- [ ] Telefonda "Ana Ekrana Ekle" çıkıyor ve eklenen simge tam ekran açılıyor
- [ ] Gerçek bir hesapla giriş yapılabiliyor

---

## Bilinen eksik: push bildirimleri

`app.json` içinde `extra.eas.projectId` **tanımlı değil**, bu yüzden push
bildirimi hiçbir derlemede çalışmıyor (bkz. `src/data/pushRepo.ts` — koşullardan
biri sağlanmadığı için kayıt hiç yapılmıyor, sessizce çıkılıyor).

`npx eas init` bu alanı yazıyor. Yapılmadan önce veliye "bildirim alacaksınız"
denmemeli.

Ayrıca 0050 sonrası: bir cihaz aynı anda yalnızca TEK kulüpte kayıtlı olabiliyor.
Kulüp değiştiren bir ailenin cihazı yeni kulüpte kaydolmak isterse açık bir hata
alıyor. Bu bilinçli — eskiden çapraz kulüp silme mümkündü ve sömürülebilirdi
(ölçüldü). Push gerçekten açılmadan önce cihaz sahipliğini kanıtlayan bir el
sıkışma tasarlanmalı.
