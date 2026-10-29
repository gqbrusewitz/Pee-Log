'use strict';
const CACHE = 'peelog-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

let state = { settings: null, lastEntry: 0 };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'settings') state = { settings: e.data.settings, lastEntry: e.data.lastEntry };
});

// Chrome/Android installed PWAs only; fires roughly at the browser's discretion.
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'peelog-remind') return;
  const s = state.settings;
  if (!s || !s.on) return;
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const t = x => { const [h, mi] = x.split(':').map(Number); return h * 60 + mi; };
  const a = t(s.start), b = t(s.end);
  const inside = a <= b ? m >= a && m <= b : m >= a || m <= b;
  if (!inside || Date.now() < Math.max(s.lastNotified, state.lastEntry) + s.every * 60000) return;
  state.settings.lastNotified = Date.now();
  e.waitUntil(self.registration.showNotification('Pee Log', {
    body: 'Time to log your fluids and bathroom trips.', icon: 'icons/icon-192.png', tag: 'peelog-reminder'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
