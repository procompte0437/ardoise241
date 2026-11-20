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
  commerce: null, // espace boutique / client (dernier état reçu, gardé hors ligne)
  outbox: [], // actions en attente d'envoi (commandes, messages…), comme WhatsApp
  notice: null, // { id, text } : nouvelle commande ou nouveau message à signaler
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
  state.commerce = (await db.meta.get('commerce')) || null
  state.outbox = (await db.meta.get('outbox')) || []
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

// Le numéro du compte reste mémorisé sur le téléphone, même après une déconnexion :
// la connexion suivante ne demande plus que le code.
const PHONE_KEY = 'ardoise241_phone'
export function knownPhone() {
  try { return localStorage.getItem(PHONE_KEY) || '' } catch { return '' }
}
export function forgetPhone() {
  try { localStorage.removeItem(PHONE_KEY) } catch { /* sans importance */ }
}
function rememberPhone(phone) {
  try { if (phone) localStorage.setItem(PHONE_KEY, phone) } catch { /* sans importance */ }
}

async function startSession(data) {
  rememberPhone(data.account?.phone)
  await db.clearAll()
  // Le cahier (noms, images) ne sert qu'aux commerçants.
  if (data.account?.role !== 'customer') await seedDefaults()
  state.commerce = null
  state.outbox = []
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
  // Un nouveau nom pas encore envoyé reste affiché, même si le serveur renvoie l'ancien.
  const pending = [...(state.outbox || [])].reverse().find((a) => a.kind === 'profile')
  if (pending) account = { ...account, name: pending.json.name }
  state.account = account
  state.clockOffset = account.serverTime ? account.serverTime - Date.now() : state.clockOffset
  await db.meta.set('account', account)
  await db.meta.set('clockOffset', state.clockOffset)
}

export async function register({ phone, name, code, confirm, role = 'merchant' }) {
  const data = await http('/api/app/register', { method: 'POST', json: { phone, name, code, code_confirmation: confirm, role, device: deviceName() } })
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
  Object.assign(state, { token: null, account: null, people: [], foods: [], entries: [], images: {}, commerce: null, outbox: [], notice: null })
  state.sync.pending = 0
  emit()
}

// ---------------------------------------------------------------- accès

export function now() { return Date.now() + (state.clockOffset || 0) }

export function access() {
  const a = state.account
  if (!a) return { ok: false, reason: 'none' }
  if (a.blocked) return { ok: false, reason: 'blocked' }
  if (a.role === 'customer') return { ok: true, daysLeft: Infinity } // espace client gratuit
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

/** « Client » réservé aux ventes encaissées tout de suite (pas de bon). */
export const CASH = '_caisse'

/** Dette de chaque client : un trop-payé ramène à 0, jamais en dessous. */
export function debts(entries = state.entries) {
  const byPerson = {}
  for (const e of entries) {
    if (e.person === CASH) continue
    ;(byPerson[e.person] ||= []).push(e)
  }
  const out = {}
  for (const [person, list] of Object.entries(byPerson)) {
    out[person] = ledger(list).reduce((sum, b) => sum + b.remaining, 0)
  }
  return out
}

/**
 * Bons d'un client avec ce qui a été payé dessus.
 * Un paiement qui vise un bon (ref) va d'abord à ce bon ; le reste, ou un paiement
 * sans ref, solde les bons du plus ancien au plus récent. Un trop-payé est perdu
 * (la dette ne devient jamais négative). Même règle que le back-office.
 *
 * @returns {{ entry, paid, remaining, status, payments: {entry, amount}[] }[]}
 */
export function ledger(entries) {
  const list = [...entries].sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1))
  const bons = []
  const byUid = {}
  for (const e of list) {
    if (!e.pay) {
      const b = { entry: e, paid: 0, remaining: e.amount, payments: [] }
      bons.push(b)
      byUid[e.uid] = b
      continue
    }
    let left = e.amount
    const apply = (b) => {
      const take = Math.min(left, b.remaining)
      if (take > 0) {
        b.paid += take
        b.remaining -= take
        b.payments.push({ entry: e, amount: take })
        left -= take
      }
    }
    const target = e.ref && byUid[e.ref]
    if (target) apply(target)
    for (const b of bons) {
      if (left <= 0) break
      if (b !== target) apply(b)
    }
  }
  for (const b of bons) b.status = b.remaining <= 0 ? 'paid' : b.paid > 0 ? 'partial' : 'open'
  return bons
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

function itemsOf(counts) {
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
  return { items, total }
}

/** Vente payée tout de suite : gardée pour la fiche d'inventaire, sans créer de bon. */
export async function addCashSale(counts) {
  const { items, total } = itemsOf(counts)
  const at = Date.now()
  await db.put('entries', { uid: uid('c'), person: CASH, amount: total, pay: false, label: 'Encaissé', items, at, updatedAt: at, deleted: false, dirty: true })
  await changed()
  return { total }
}

/**
 * Fiche d'inventaire sur une période [from, to[ (millisecondes).
 * - ventes encaissées : « Encaissé » dans la calculatrice
 * - crédit : bons mis sur un client
 * - paiements : remboursements des bons (dont « Payé sur place »)
 * - articles : tout ce qui est sorti (encaissé + en bon)
 */
export function inventory(from, to, entries = state.entries) {
  const out = { cash: 0, cashCount: 0, credit: 0, creditCount: 0, payments: 0, paymentCount: 0, articles: [], sales: [] }
  const byName = new Map()
  for (const e of entries) {
    if (e.at < from || e.at >= to) continue
    if (e.pay) {
      out.payments += e.amount
      out.paymentCount++
      continue
    }
    if (e.person === CASH) {
      out.cash += e.amount
      out.cashCount++
      out.sales.push(e)
    } else {
      out.credit += e.amount
      out.creditCount++
    }
    for (const it of e.items || []) {
      const a = byName.get(it.n) || { n: it.n, q: 0, amount: 0, cash: 0, credit: 0 }
      a.q += it.q
      a.amount += it.q * it.p
      if (e.person === CASH) a.cash += it.q
      else a.credit += it.q
      byName.set(it.n, a)
    }
  }
  out.articles = [...byName.values()].sort((a, b) => b.amount - a.amount || b.q - a.q)
  out.sales.sort((a, b) => b.at - a.at)
  out.received = out.cash + out.payments
  return out
}

export async function addSession(personUid, counts, paid = 0) {
  const { items, total } = itemsOf(counts)
  const at = Date.now()
  const rows = [{ uid: uid('e'), person: personUid, amount: total, pay: false, label: null, items, at, updatedAt: at, deleted: false, dirty: true }]
  const cash = Math.min(total, Math.max(0, Math.round(Number(paid) || 0)))
  if (cash > 0) rows.push({ uid: uid('e'), person: personUid, amount: cash, pay: true, label: 'Payé sur place', ref: rows[0].uid, items: [], at: at + 1, updatedAt: at, deleted: false, dirty: true })
  await db.putMany('entries', rows)
  await changed()
  return { total, owed: total - cash }
}

export async function addPayment(personUid, amount, ref = null, label = 'Paiement') {
  const value = Math.round(Number(amount))
  if (!(value > 0)) throw new Error('Entrez un montant supérieur à 0.')
  const at = Date.now()
  await db.put('entries', { uid: uid('e'), person: personUid, amount: value, pay: true, label, ref, items: [], at, updatedAt: at, deleted: false, dirty: true })
  await changed()
}

/** Paiement d'un bon précis : tout le reste (solde) ou une partie (avance). */
export async function payBon(personUid, bonUid, amount) {
  const bon = ledger(state.entries.filter((e) => e.person === personUid)).find((b) => b.entry.uid === bonUid)
  if (!bon) throw new Error('Bon introuvable.')
  const value = Math.round(Number(amount))
  if (!(value > 0)) throw new Error('Entrez un montant supérieur à 0.')
  if (value > bon.remaining) throw new Error('Le reste à payer de ce bon est ' + bon.remaining.toLocaleString('fr-FR') + ' F.')
  await addPayment(personUid, value, bonUid, value === bon.remaining ? 'Bon soldé' : 'Avance')
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
/** « poulet_braise.jpg » devient « Poulet braise » : nom proposé, modifiable ensuite. */
export function nameFromFile(file) {
  const base = String(file?.name || '').replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!base) return ''
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 30)
}

export async function fillPhotos(files) {
  const empty = state.foods.filter((f) => !f.imgHave)
  let n = 0
  for (const file of files) {
    const slot = empty[n]
    if (!slot) break
    await setFoodImage(slot.uid, file)
    const name = nameFromFile(file)
    if (name) await updateFood(slot.uid, { name })
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
    if (isCustomer()) {
      await commerceSync()
      state.sync.lastAt = Date.now()
      state.sync.online = true
      return
    }
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
    await commerceSync()

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

// ---------------------------------------------------------------- espace boutique / client
//
// Les commandes, changements d'état et messages partent d'une file d'attente
// (outbox) gardée sur le téléphone : sans réseau, ils attendent et partent tout
// seuls à la connexion suivante. L'état reçu (boutiques, catalogues, bons,
// commandes, messages) est gardé pour être consulté hors ligne.

export function isCustomer() { return state.account?.role === 'customer' }

export function imageUrl(shopId, food) {
  return food.img ? BASE + '/api/app/shops/' + shopId + '/foods/' + encodeURIComponent(food.uid) + '/image?h=' + food.img : null
}

async function saveOutbox() {
  await db.meta.set('outbox', state.outbox)
}

async function saveCommerce() {
  await db.meta.set('commerce', state.commerce)
}

/** Met l'action en file et tente l'envoi ; renvoie true si elle est partie (4 s max d'attente). */
async function queue(action) {
  const id = uid('q')
  state.outbox = [...state.outbox, { id, at: Date.now(), ...action }]
  await saveOutbox()
  emit()
  const sent = flushOutbox().then(() => {
    if (!state.outbox.length) refreshCommerce().catch(() => {})
    return !state.outbox.some((a) => a.id === id)
  })
  return Promise.race([sent, new Promise((r) => setTimeout(() => r(false), 4000))])
}

let flushing = false
async function flushOutbox() {
  if (flushing || !state.token) return
  flushing = true
  try {
    while (state.outbox.length) {
      const a = state.outbox[0]
      try {
        await http(a.path, { method: a.method || 'POST', json: a.json })
        state.sync.online = true
      } catch (e) {
        if (e.status === 0) { state.sync.online = false; emit() }
        if (e.status === 0 || e.status >= 500 || e.status === 401) break // réseau : on réessaiera
        state.notice = { id: uid('n'), text: e.message, error: true } // refusé : on l'abandonne
      }
      state.outbox = state.outbox.slice(1)
      await saveOutbox()
      emit()
    }
  } finally {
    flushing = false
  }
}

let lastCommerceFetch = 0
async function refreshCommerce() {
  const data = await http('/api/app/commerce')
  lastCommerceFetch = Date.now()
  announce(state.commerce, data)
  state.commerce = data
  await saveCommerce()
  emit()
}

async function commerceSync() {
  await flushOutbox()
  if (state.outbox.length) return // encore hors ligne
  await refreshCommerce()
}

/** Synchro rapide de l'espace boutique seul (appelée toutes les 20 s quand l'appli est ouverte). */
export async function pollCommerce() {
  if (!state.token || state.sync.running || Date.now() - lastCommerceFetch < 15000 || document.visibilityState !== 'visible') return
  try { await commerceSync() } catch { /* hors ligne */ }
}

// Nouvelles commandes (commerçant) et nouveaux messages (client) : un bandeau
// dans l'appli, et une notification du téléphone dans l'application Android.
function announce(before, after) {
  if (!before || before.role !== after.role) return // premier chargement : rien de « nouveau »
  const texts = []
  if (after.role === 'merchant') {
    const known = new Set((before.orders || []).map((o) => o.id))
    for (const o of after.orders || []) if (!known.has(o.id) && o.status === 'envoyee') texts.push(['Nouvelle commande', o.customer?.name + ' · ' + o.total.toLocaleString('fr-FR') + ' F'])
  } else {
    const known = new Set((before.messages || []).map((m) => m.id))
    for (const m of after.messages || []) if (!known.has(m.id)) texts.push([m.shop?.name || 'Message', m.title])
    const prev = Object.fromEntries((before.orders || []).map((o) => [o.uid, o.status]))
    for (const o of after.orders || []) if (prev[o.uid] && prev[o.uid] !== o.status) texts.push([o.shop?.name || 'Commande', 'Votre commande est ' + (ORDER_STATUS[o.status] || '').toLowerCase()])
  }
  if (!texts.length) return
  state.notice = { id: uid('n'), text: texts.map((t) => t.join(' : ')).join(' · ') }
  notifyPhone(texts)
}

async function notifyPhone(texts) {
  if (!window.Capacitor?.isNativePlatform?.()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: texts.slice(0, 5).map(([title, body], i) => ({ id: (Date.now() % 100000000) + i, title, body })),
    })
  } catch { /* notification impossible : le bandeau suffit */ }
}

export function clearNotice() {
  state.notice = null
  emit()
}

export const ORDER_STATUS = {
  attente: "En attente d'envoi",
  envoyee: 'Envoyée',
  acceptee: 'Acceptée',
  prete: 'Prête',
  livree: 'Livrée',
  refusee: 'Refusée',
  annulee: 'Annulée',
}

// ---- côté client

export async function searchShops(q) {
  const data = await http('/api/app/shops?q=' + encodeURIComponent(q || ''))
  return data.shops
}

export async function followShop(shop) {
  await http('/api/app/shops/' + shop.id + '/follow', { method: 'POST' }) // en ligne : on vient de chercher
  await refreshCommerce()
}

export async function unfollowShop(shopId) {
  await http('/api/app/shops/' + shopId + '/follow', { method: 'DELETE' })
  await refreshCommerce()
}

/** Commande : enregistrée tout de suite sur le téléphone, envoyée dès qu'il y a du réseau. */
export async function placeOrder(shop, counts, note) {
  const items = []
  let total = 0
  for (const f of shop.catalog) {
    const q = counts[f.uid] || 0
    if (q > 0) { items.push({ uid: f.uid, n: f.name, p: f.price, q }); total += f.price * q }
  }
  if (!items.length) throw new Error('Choisissez au moins un article.')
  const order = { uid: uid('o'), shop: shop.id, items: items.map(({ uid: u, q }) => ({ uid: u, q })), note: note || null, at: now() }
  const sent = await queue({ kind: 'order', path: '/api/app/orders', json: order, view: { items, total, shopName: shop.name } })
  return { total, sent }
}

export async function cancelOrder(orderUid) {
  const pending = state.outbox.find((a) => a.kind === 'order' && a.json.uid === orderUid)
  if (pending) { // pas encore partie : on la retire simplement
    state.outbox = state.outbox.filter((a) => a !== pending)
    await saveOutbox()
    emit()
    return
  }
  patchOrder((o) => o.uid === orderUid, { status: 'annulee' })
  await queue({ kind: 'cancel', path: '/api/app/orders/' + encodeURIComponent(orderUid) + '/cancel' })
}

/** Commandes du client, celles en attente d'envoi en tête. */
export function customerOrders() {
  const sent = state.commerce?.orders || []
  const known = new Set(sent.map((o) => o.uid))
  const waiting = state.outbox.filter((a) => a.kind === 'order' && !known.has(a.json.uid))
    .map((a) => ({ uid: a.json.uid, items: a.view.items, total: a.view.total, note: a.json.note, status: 'attente', at: a.json.at, shop: { id: a.json.shop, name: a.view.shopName } }))
  return [...waiting.reverse(), ...sent]
}

export async function markMessagesRead(ids) {
  if (!ids.length || !state.commerce) return
  state.commerce = { ...state.commerce, messages: state.commerce.messages.map((m) => (ids.includes(m.id) ? { ...m, read: true } : m)) }
  await saveCommerce()
  await queue({ kind: 'read', path: '/api/app/messages/read', json: { ids } })
}

// ---- côté commerçant

function patchOrder(match, values) {
  if (!state.commerce) return
  state.commerce = { ...state.commerce, orders: state.commerce.orders.map((o) => (match(o) ? { ...o, ...values } : o)) }
  saveCommerce()
  emit()
}

/** Fiche du client dans le cahier (créée par le serveur ; ici si on est encore hors ligne). */
async function ensurePerson(customer) {
  if (state.people.some((p) => p.uid === customer.person)) return
  const at = Date.now()
  await db.put('people', { uid: customer.person, name: (customer.name || 'Client').slice(0, 40), position: 100000 + customer.id, updatedAt: at, deleted: false, dirty: true })
  await reload()
}

export async function setOrderStatus(order, status) {
  patchOrder((o) => o.id === order.id, { status, statusAt: now() })
  await queue({ kind: 'status', path: '/api/app/orders/' + order.id + '/status', json: { status } })
}

/**
 * Commande livrée : la vente entre dans le cahier comme une vente faite à la
 * calculatrice (encaissée, ou en bon au nom du client avec une avance éventuelle).
 */
export async function deliverOrder(order, mode, paid = 0) {
  const at = Date.now()
  const items = order.items.map((i) => ({ n: i.n, q: i.q, p: i.p }))
  const person = mode === 'bon' ? order.customer.person : CASH
  if (mode === 'bon') await ensurePerson(order.customer)
  const rows = [{ uid: uid('e'), person, amount: order.total, pay: false, label: 'Commande', items, at, updatedAt: at, deleted: false, dirty: true }]
  const cash = mode === 'bon' ? Math.min(order.total, Math.max(0, Math.round(Number(paid) || 0))) : 0
  if (cash > 0) rows.push({ uid: uid('e'), person, amount: cash, pay: true, label: 'Payé à la livraison', ref: rows[0].uid, items: [], at: at + 1, updatedAt: at, deleted: false, dirty: true })
  await db.putMany('entries', rows)
  await reload()
  patchOrder((o) => o.id === order.id, { status: 'livree', mode, statusAt: now() })
  await queue({ kind: 'status', path: '/api/app/orders/' + order.id + '/status', json: { status: 'livree', mode } })
  scheduleSync()
}

/** Message ou promotion aux clients cochés (part dès qu'il y a du réseau). */
export async function sendShopMessage({ kind, title, body, to }) {
  if (!to.length) throw new Error('Cochez au moins un client.')
  if (!title.trim() && !body.trim()) throw new Error('Écrivez votre message.')
  const msg = { uid: uid('m'), kind, title: title.trim(), body: body.trim(), to }
  if (state.commerce) {
    state.commerce = { ...state.commerce, messages: [{ id: msg.uid, ...msg, at: now(), sent: to.length, read: 0, pending: true }, ...(state.commerce.messages || [])] }
    await saveCommerce()
  }
  return queue({ kind: 'message', path: '/api/app/messages', json: msg })
}

/** Nom du commerce : changé tout de suite sur le téléphone, envoyé dès qu'il y a du réseau. */
export async function renameAccount(name) {
  const value = String(name || '').trim().slice(0, 60)
  if (!value) throw new Error('Entrez le nom de votre boutique.')
  state.outbox = state.outbox.filter((a) => a.kind !== 'profile') // seul le dernier nom compte
  await saveOutbox()
  await saveAccount({ ...state.account, name: value })
  emit()
  return queue({ kind: 'profile', path: '/api/app/profile', json: { name: value } })
}
