// Stockage local du téléphone (IndexedDB). L'application lit et écrit toujours
// ici d'abord : elle marche donc sans réseau. La synchro (sync.js) recopie
// ensuite les lignes marquées « dirty » vers le serveur.

const DB_NAME = 'ardoise241'
const STORES = ['meta', 'people', 'foods', 'entries', 'images']

let dbPromise = null

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('meta')
        db.createObjectStore('people', { keyPath: 'uid' })
        db.createObjectStore('foods', { keyPath: 'uid' })
        db.createObjectStore('entries', { keyPath: 'uid' })
        db.createObjectStore('images')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function all(store) {
  const db = await open()
  return result(db.transaction(store).objectStore(store).getAll())
}

export async function get(store, key) {
  const db = await open()
  return result(db.transaction(store).objectStore(store).get(key))
}

export async function put(store, value, key) {
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  if (key === undefined) tx.objectStore(store).put(value)
  else tx.objectStore(store).put(value, key)
  return done(tx)
}

export async function putMany(store, values) {
  if (!values.length) return
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  return done(tx)
}

export async function del(store, key) {
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  return done(tx)
}

export async function clearAll() {
  const db = await open()
  const tx = db.transaction(STORES, 'readwrite')
  for (const s of STORES) tx.objectStore(s).clear()
  return done(tx)
}

export const meta = {
  get: (key) => get('meta', key),
  set: (key, value) => put('meta', value, key),
}

// Demande au navigateur de ne pas effacer ces données pour faire de la place.
export function persist() {
  try { navigator.storage?.persist?.() } catch { /* sans importance */ }
}
