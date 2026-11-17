// Données de l'ardoise : lecture/écriture locale + synchronisation en arrière-plan.
//
// Chaque modification est enregistrée tout de suite dans IndexedDB avec
// dirty = true. Dès que le réseau est là, sync() envoie ces lignes au serveur et
// récupère celles modifiées ailleurs (curseur « cursor »). Les photos voyagent à
// part : envoyées quand imgDirty, téléchargées quand le serveur a une autre version.

import * as db from './db'

export const MAX_NAMES = 200
export const MAX_FOODS = 150

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

const state = {
  ready: false,
  token: null,
  account: null,
  clockOffset: 0,
  people: [],
  foods: [],
  entries: [],
  images: {}, // uid -> object URL
  sync: { running: false, pending: 0, lastAt: null, error: '', online: navigator.onLine },
}

const listeners = new Set()
let version = 0
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function snapshot() { return version }
export function getState() { return state }
function emit() {
  version++
  for (const fn of listeners) fn()
}

// ---------------------------------------------------------------- réseau

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function http(path, { method = 'GET', json, body, raw } = {}) {
  const headers = { Accept: 'application/json' }
  if (state.token) headers.Authorization = 'Bearer ' + state.token
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body })
  } catch {
    throw new ApiError('Pas de connexion internet.', 0)
  }
  if (raw && res.ok) return res
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.message || (data.errors && Object.values(data.errors)[0]?.[0]) || 'Une erreur est survenue.'
    throw new ApiError(msg, res.status, data)
  }
  return data
}

export function deviceName() {
  const ua = navigator.userAgent
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Appareil'
  const app = window.Capacitor?.isNativePlatform?.() ? 'application' : 'navigateur'
  return os + ' · ' + app
}

// ---------------------------------------------------------------- démarrage

export async function boot() {
  db.persist()
  state.token = (await db.meta.get('token')) || null
  state.account = (await db.meta.get('account')) || null
  state.clockOffset = (await db.meta.get('clockOffset')) || 0
  if (state.token) await reload()
  state.ready = true
  emit()
  if (state.token) {
    startBackgroundSync()
    sync()
  }
}

async function reload() {
  const [people, foods, entries] = await Promise.all([db.all('people'), db.all('foods'), db.all('entries')])
  state.people = people.filter((p) => !p.deleted).sort((a, b) => a.position - b.position)
  state.foods = foods.filter((f) => !f.deleted).sort((a, b) => a.position - b.position)
  state.entries = entries.filter((e) => !e.deleted).sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1))
  state.sync.pending = people.filter((p) => p.dirty).length + foods.filter((f) => f.dirty || f.imgDirty).length + entries.filter((e) => e.dirty).length
  await loadImages(foods)
}

async function loadImages(foods) {
  for (const f of foods) {
    if (!f.imgHave) continue
    const tag = f.uid + ':' + f.imgHave
    if (state.images[f.uid]?.tag === tag) continue
    const blob = await db.get('images', f.uid)
    if (!blob) continue
    if (state.images[f.uid]) URL.revokeObjectURL(state.images[f.uid].url)
    state.images[f.uid] = { tag, url: URL.createObjectURL(blob) }
  }
}

async function seedDefaults() {
  const people = []
  for (let i = 1; i <= MAX_NAMES; i++) people.push({ uid: 'p' + i, name: 'Nom ' + i, position: i, updatedAt: 0, deleted: false, dirty: false })
  const foods = []
  for (let j = 1; j <= MAX_FOODS; j++) foods.push({ uid: 'f' + j, name: 'Image ' + j, price: 0, position: j, img: null, imgHave: null, imgDirty: false, updatedAt: 0, deleted: false, dirty: false })
  await db.putMany('people', people)
  await db.putMany('foods', foods)
}

async function startSession(data) {
  await db.clearAll()
  await seedDefaults()
  state.token = data.token
  await db.meta.set('token', data.token)
  await db.meta.set('cursor', 0)
  await saveAccount(data.account)
  await reload()
  emit()
  startBackgroundSync()
  await sync()
}

async function saveAccount(account) {
  state.account = account
  state.clockOffset = account.serverTime ? account.serverTime - Date.now() : state.clockOffset
  await db.meta.set('account', account)
  await db.meta.set('clockOffset', state.clockOffset)
}

export async function register({ phone, name, code, confirm }) {
  const data = await http('/api/app/register', { method: 'POST', json: { phone, name, code, code_confirmation: confirm, device: deviceName() } })
  await startSession(data)
}

export async function login({ phone, code }) {
  const data = await http('/api/app/login', { method: 'POST', json: { phone, code, device: deviceName() } })
  await startSession(data)
}

/** Jeton révoqué (back-office) : on se reconnecte sans effacer ce qui est sur le téléphone. */
export async function relogin(code) {
  const data = await http('/api/app/login', { method: 'POST', json: { phone: state.account?.phone, code, device: deviceName() } })
  state.token = data.token
  await db.meta.set('token', data.token)
  await saveAccount(data.account)
  emit()
  await sync()
}

export async function logout() {
  try { await http('/api/app/logout', { method: 'POST' }) } catch { /* hors ligne : on oublie quand même le jeton */ }
  stopBackgroundSync()
  await db.clearAll()
  for (const img of Object.values(state.images)) URL.revokeObjectURL(img.url)
  Object.assign(state, { token: null, account: null, people: [], foods: [], entries: [], images: {} })
  state.sync.pending = 0
  emit()
}

// ---------------------------------------------------------------- accès

export function now() { return Date.now() + (state.clockOffset || 0) }

export function access() {
  const a = state.account
  if (!a) return { ok: false, reason: 'none' }
  if (a.blocked) return { ok: false, reason: 'blocked' }
  if (now() >= a.endsAt) return { ok: false, reason: 'expired' }
  return { ok: true, daysLeft: Math.max(0, Math.ceil((a.endsAt - now()) / 86400000)) }
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Vérifie un code sans réseau. Renvoie le rôle qu'il ouvre :
 * 'owner' (code du compte), 'support' (code admin Ardoise241) ou false.
 */
export async function checkCode(code) {
  if (!/^\d{4,6}$/.test(code)) return false
  const { local, support } = state.account || {}
  if (local && (await sha256(local.salt + code)) === local.hash) return 'owner'
  if (support && (await sha256(support.salt + code)) === support.hash) return 'support'
  return false
}

export async function changeCode(current, code, confirm) {
  const data = await http('/api/app/code', { method: 'POST', json: { current, code, code_confirmation: confirm } })
  await saveAccount(data.account)
  emit()
}

export async function refreshAccount() {
  const data = await http('/api/app/me')
  await saveAccount(data.account)
  emit()
}

// ---------------------------------------------------------------- calculs

/** Dette de chaque client : un trop-payé ramène à 0, jamais en dessous. */
export function debts(entries = state.entries) {
  const out = {}
  for (const e of entries) {
    const cur = out[e.person] || 0
    out[e.person] = e.pay ? Math.max(0, cur - e.amount) : cur + e.amount
  }
  return out
}

function uid(prefix) {
  const rnd = crypto.getRandomValues(new Uint32Array(2))
  return prefix + Date.now().toString(36) + rnd[0].toString(36) + rnd[1].toString(36)
}

// ---------------------------------------------------------------- écritures locales

async function changed() {
  await reload()
  emit()
  scheduleSync()
}

export async function renamePerson(personUid, name) {
  const clean = name.trim().slice(0, 40)
  if (!clean) throw new Error('Le nom ne peut pas être vide.')
  const p = await db.get('people', personUid)
  await db.put('people', { ...p, name: clean, updatedAt: Date.now(), dirty: true })
  await changed()
}

export async function addSession(personUid, counts, paid = 0) {
  const items = []
  let total = 0
  for (const f of state.foods) {
    const q = counts[f.uid] || 0
    if (q > 0) {
      items.push({ n: f.name, q, p: f.price })
      total += q * f.price
    }
  }
  if (!items.length) throw new Error('Touchez des images pour ajouter des montants.')
  const at = Date.now()
  const rows = [{ uid: uid('e'), person: personUid, amount: total, pay: false, label: null, items, at, updatedAt: at, deleted: false, dirty: true }]
  const cash = Math.min(total, Math.max(0, Math.round(Number(paid) || 0)))
  if (cash > 0) rows.push({ uid: uid('e'), person: personUid, amount: cash, pay: true, label: 'Payé sur place', items: [], at: at + 1, updatedAt: at, deleted: false, dirty: true })
  await db.putMany('entries', rows)
  await changed()
  return { total, owed: total - cash }
}

export async function addPayment(personUid, amount) {
  const value = Math.round(Number(amount))
  if (!(value > 0)) throw new Error('Entrez un montant supérieur à 0.')
  const at = Date.now()
  await db.put('entries', { uid: uid('e'), person: personUid, amount: value, pay: true, label: 'Paiement', items: [], at, updatedAt: at, deleted: false, dirty: true })
  await changed()
}

export async function eraseBilan(personUid) {
  const all = (await db.all('entries')).filter((e) => e.person === personUid && !e.deleted)
  const t = Date.now()
  await db.putMany('entries', all.map((e) => ({ ...e, deleted: true, updatedAt: t, dirty: true })))
  await changed()
}

export async function updateFood(foodUid, { name, price }) {
  const f = await db.get('foods', foodUid)
  const next = { ...f, updatedAt: Date.now(), dirty: true }
  if (name !== undefined) next.name = name.trim().slice(0, 30) || f.name
  if (price !== undefined) next.price = Math.max(0, Math.round(Number(price) || 0))
  await db.put('foods', next)
  await changed()
}

/** Recadre la photo en 180×180 sur le téléphone avant de la garder. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('Image illisible.')
  const size = 180
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#F3D77A'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75))
}

export async function setFoodImage(foodUid, file) {
  const blob = await shrink(file)
  const tag = 'local' + Date.now()
  await db.put('images', blob, foodUid)
  const f = await db.get('foods', foodUid)
  // La ligne part aussi (dirty) pour que le serveur ait son nom et son prix avant la photo.
  await db.put('foods', { ...f, imgHave: tag, img: tag, imgDirty: true, dirty: true, updatedAt: Date.now() })
  await changed()
}

/** Remplit les images encore sans photo, dans l'ordre (Image 1, Image 2…). */
export async function fillPhotos(files) {
  const empty = state.foods.filter((f) => !f.imgHave)
  let n = 0
  for (const file of files) {
    const slot = empty[n]
    if (!slot) break
    await setFoodImage(slot.uid, file)
    n++
  }
  return { added: n, skipped: files.length - n }
}

// ---------------------------------------------------------------- synchronisation

let timer = null
let interval = null
let again = false

function scheduleSync() {
  clearTimeout(timer)
  timer = setTimeout(() => sync(), 1500)
}

function onOnline() {
  state.sync.online = true
  emit()
  sync()
}
function onOffline() {
  state.sync.online = false
  emit()
}
function onVisible() {
  if (document.visibilityState === 'visible') sync()
}

function startBackgroundSync() {
  stopBackgroundSync()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  interval = setInterval(() => sync(), 60000)
}

function stopBackgroundSync() {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  document.removeEventListener('visibilitychange', onVisible)
  clearInterval(interval)
  clearTimeout(timer)
}

const strip = ({ dirty, imgDirty, imgHave, ...row }) => row // eslint-disable-line no-unused-vars

export async function sync() {
  if (!state.token) return
  if (state.sync.running) { again = true; return }
  state.sync.running = true
  state.sync.error = ''
  emit()
  try {
    const [people, foods, entries] = await Promise.all([db.all('people'), db.all('foods'), db.all('entries')])
    const out = {
      since: (await db.meta.get('cursor')) || 0,
      people: people.filter((p) => p.dirty).map(strip),
      foods: foods.filter((f) => f.dirty).map((f) => ({ ...strip(f), img: undefined })),
      entries: entries.filter((e) => e.dirty).map(strip),
      device: deviceName(),
    }
    const res = await http('/api/app/sync', { method: 'POST', json: out })

    // Les lignes envoyées sont propres, sauf si elles ont encore changé pendant l'envoi.
    await markClean('people', out.people)
    await markClean('foods', out.foods)
    await markClean('entries', out.entries)

    // Ce qui vient du serveur (autre appareil, restauration, back-office).
    await applyIncoming('people', res.people)
    await applyIncoming('entries', res.entries)
    const toDownload = await applyIncomingFoods(res.foods)

    await db.meta.set('cursor', res.cursor)
    await saveAccount(res.account)

    await uploadImages()
    await downloadImages(toDownload)

    state.sync.lastAt = Date.now()
    await db.meta.set('lastSync', state.sync.lastAt)
    state.sync.online = true
  } catch (e) {
    state.sync.error = e.message
    if (e.status === 0) state.sync.online = false
    if (e.status === 401) {
      // Jeton révoqué depuis le back-office : il faut se reconnecter. Les données locales restent.
      state.sync.error = 'Reconnectez-vous pour synchroniser.'
      state.account = { ...(state.account || {}), needsLogin: true }
    }
    if (e.status === 403 && e.data?.account) await saveAccount(e.data.account)
  } finally {
    state.sync.running = false
    await reload()
    emit()
    if (again) {
      again = false
      scheduleSync()
    }
  }
}

async function markClean(store, sent) {
  if (!sent.length) return
  const rows = await Promise.all(sent.map((s) => db.get(store, s.uid)))
  const clean = rows.filter((r, i) => r && r.updatedAt === sent[i].updatedAt).map((r) => ({ ...r, dirty: false }))
  await db.putMany(store, clean)
}

async function applyIncoming(store, rows) {
  if (!rows?.length) return
  const locals = await Promise.all(rows.map((r) => db.get(store, r.uid)))
  const next = []
  rows.forEach((r, i) => {
    const local = locals[i]
    if (local?.dirty && local.updatedAt > r.updatedAt) return // la version du téléphone est plus récente
    next.push({ ...(local || {}), ...r, dirty: false })
  })
  await db.putMany(store, next)
}

async function applyIncomingFoods(rows) {
  const download = []
  if (!rows?.length) return download
  const locals = await Promise.all(rows.map((r) => db.get('foods', r.uid)))
  const next = []
  rows.forEach((r, i) => {
    const local = locals[i] || { imgHave: null, imgDirty: false }
    const keepFields = local.dirty && local.updatedAt > r.updatedAt
    const merged = keepFields ? { ...local } : { ...local, ...r, dirty: false }
    if (local.imgDirty) {
      merged.img = local.img // photo locale pas encore envoyée : on la garde
    } else {
      merged.img = r.img
      if (r.img && r.img !== local.imgHave) download.push(r.uid)
    }
    next.push(merged)
  })
  await db.putMany('foods', next)
  return download
}

async function uploadImages() {
  const pending = (await db.all('foods')).filter((f) => f.imgDirty)
  for (const f of pending) {
    const blob = await db.get('images', f.uid)
    if (!blob) continue
    const body = new FormData()
    body.append('photo', blob, f.uid + '.jpg')
    const res = await http('/api/app/foods/' + encodeURIComponent(f.uid) + '/image', { method: 'POST', body })
    const cur = await db.get('foods', f.uid)
    if (cur.imgHave === f.imgHave) {
      await db.put('foods', { ...cur, img: res.img, imgHave: res.img, imgDirty: false })
    }
  }
}

async function downloadImages(uids) {
  for (const id of uids) {
    const res = await http('/api/app/foods/' + encodeURIComponent(id) + '/image', { raw: true })
    const blob = await res.blob()
    const cur = await db.get('foods', id)
    if (!cur || cur.imgDirty) continue
    await db.put('images', blob, id)
    await db.put('foods', { ...cur, imgHave: cur.img })
  }
}
