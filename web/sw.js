/* 馬祖藍眼淚預報 — Service Worker
   策略：
   - App shell（HTML/CSS/JS/字典/MapLibre/圖示/mock）：安裝時預快取，cache-first
   - API（/api/v1/*）：network-first，失敗時回最後一次成功回應
   - Google Fonts：stale-while-revalidate（離線時回退系統字型）
   - 地圖圖磚與樣式（tiles.openfreemap.org）：不快取 */
var VERSION = 'mbt-v1.0.0';
var SHELL_CACHE = VERSION + '-shell';
var API_CACHE = VERSION + '-api';
var FONT_CACHE = VERSION + '-fonts';
var SHELL = [
  './', './index.html', './styles.css', './app.js', './i18n.js', './manifest.webmanifest',
  './vendor/maplibre-gl.js', './vendor/maplibre-gl.css',
  './mock/status.json', './mock/forecast.json', './mock/hotspots.json', './mock/transport.json',
  './privacy-policy.html',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/maskable-192.png', './icons/maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { /* 單一資源失敗不阻擋安裝 */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('mbt-') === 0 && k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 地圖圖磚／樣式：不快取
  if (/openfreemap\.org$/.test(url.hostname) || /\/tiles\//.test(url.pathname)) return;

  // API：network-first
  if (/\/api\/v1\//.test(url.pathname)) {
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(API_CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      // 離線：回最後一次成功回應，並加上標頭讓前端標示為「離線快取」
      return caches.match(req).then(function (cached) {
        if (!cached) return cached;
        var headers = new Headers(cached.headers);
        headers.set('X-MBT-From-Cache', cached.headers.get('date') || 'true');
        return cached.blob().then(function (b) { return new Response(b, { status: 200, headers: headers }); });
      });
    }));
    return;
  }

  // Google Fonts：stale-while-revalidate
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(FONT_CACHE).then(function (c) {
      return c.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return cached; });
        return cached || network;
      });
    }));
    return;
  }

  // 同源 App shell：cache-first，背景更新
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined); });
      return cached || network;
    }));
  }
});
