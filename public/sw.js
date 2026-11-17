// Garde l'application elle-même (HTML, JS, CSS, icônes) pour l'ouvrir sans réseau.
// Les données ne passent pas par ici : elles sont dans IndexedDB.
const CACHE = 'ardoise241-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/flag.png', '/icon192.png', '/manifest.webmanifest'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    // Réseau d'abord pour avoir la dernière version, sinon la copie gardée.
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put('/index.html', copy))
      return res
    }).catch(() => caches.match('/index.html')))
    return
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy))
    }
    return res
  })))
})
