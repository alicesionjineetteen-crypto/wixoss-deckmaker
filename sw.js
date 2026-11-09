// WIXOSS Deck Builder - Service Worker
// 更新したファイルを確実に配信したいときは、下の CACHE_VERSION を上げる
const CACHE_VERSION = "v1";
const CACHE_NAME = `wixoss-deckbuilder-${CACHE_VERSION}`;

// 起動に必要なファイル（相対パスは sw.js の置き場所が基準）
const CORE_FILES = [
  "./",
  "index.html",
  "style.css",
  "main.js",
  "js/card_info.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

// 外部CDNのライブラリ（キャッシュ優先）
const CDN_FILES = [
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all([
      ...CORE_FILES.map(url => cache.add(url).catch(() => {})),
      ...CDN_FILES.map(url => cache.add(new Request(url, { mode: "no-cors" })).catch(() => {}))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("wixoss-deckbuilder-") && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// 通信を優先し、遅い・オフラインのときだけキャッシュを使う
// （card_info.js など、頻繁に更新するファイルが古いまま残らないようにするため）
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS))
    ]);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 自サイトのファイル
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 外部CDNのライブラリ
  if (CDN_FILES.includes(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // それ以外（カード画像など）はブラウザの標準動作に任せる
});
