/*
 * Service worker: keeps a copy of the app on the phone so it opens without
 * internet, while always fetching the newest version when you're online.
 *
 *  - App files (this site): network first, saved copy if offline.
 *  - Recipe photos and fonts: saved copy first (they never change).
 *  - Spoonacular API: always live, never stored here (your key stays out of the cache).
 */
var VERSION = 'batch-prep-v1';
var APP_CACHE = VERSION + '-app';
var MEDIA_CACHE = 'batch-prep-media';
var APP_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/mealmath.js', 'js/storage.js', 'js/units.js', 'js/prices.js', 'js/tuning.js', 'js/recipes.js',
  'js/grocery.js', 'js/api.js', 'js/app.js', 'js/favorites.js', 'js/recipes-ui.js', 'js/grocery-ui.js',
  'js/favorites-ui.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
var MEDIA_LIMIT = 150;

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(APP_CACHE).then(function (c) { return c.addAll(APP_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== APP_CACHE && k !== MEDIA_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trimMedia() {
  return caches.open(MEDIA_CACHE).then(function (c) {
    return c.keys().then(function (keys) {
      return Promise.all(keys.slice(0, Math.max(0, keys.length - MEDIA_LIMIT)).map(function (k) { return c.delete(k); }));
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.hostname === 'api.spoonacular.com') return;   // always live

  if (url.origin === self.location.origin) {
    // Network first, so updates show up straight away; fall back to the saved copy offline.
    event.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(APP_CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
      });
    }));
    return;
  }

  if (/(^|\.)spoonacular\.com$/.test(url.hostname) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // Photos and fonts: use the saved copy if we have one.
    event.respondWith(caches.open(MEDIA_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trimMedia(); }
          return res;
        });
      });
    }));
  }
});
