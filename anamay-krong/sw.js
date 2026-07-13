const CACHE_NAME = 'anamay-krong-v1';
const urlsToCache = [
  './index.html',
  './script.js',
  './logo.JPEG'
];

// ពេល Install Service Worker វាទាញហ្វាយទុកក្នុង Cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// ពេល App ទាញទិន្នន័យ វានឹងឆែកមើលក្នុង Cache សិនដើម្បីឱ្យដើរលឿន
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // យកពី Cache
        }
        return fetch(event.request); // ទាញពី Internet
      })
  );
});