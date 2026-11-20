import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as store from './store'
import { App as NativeApp } from '@capacitor/app'
import Customer from './Client.jsx'
import * as pdf from './pdf'
import { SideNav, useNavOpen, MenuButton, PdfButton, OrdersView, ClientsView, ClientView, MessagesView } from './Shop.jsx'

export const fmt = (n) => Number(n || 0).toLocaleString('fr-FR') + ' F'
export const hour = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() }
export function dayLabel(t) {
  const d = new Date(t)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  if (dayKey(d) === dayKey(today)) return "Aujourd'hui"
  if (dayKey(d) === dayKey(yesterday)) return 'Hier'
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function useStore() {
  useSyncExternalStore(store.subscribe, store.snapshot)
  return store.getState()
}

// ------------------------------------------------------------------ petits composants

/**
 * Souris (ordinateur) : on peut placer le curseur tout seul dans le champ.
 * Écran tactile : non, sinon le clavier s'ouvre seul et décale la fenêtre.
 */
function finePointer() {
  try { return window.matchMedia('(pointer: fine)').matches } catch { return false }
}

// Bouton retour du téléphone : les fenêtres ouvertes s'empilent ici pour être
// fermées en premier, avant de revenir à la page précédente.
const openSheets = []

export function handleBack() {
  if (openSheets.length) { openSheets[openSheets.length - 1].current(); return true }
  const back = document.querySelector('button.back')
  if (back) { back.click(); return true }
  return false // accueil ou connexion : rien à fermer
}
if (import.meta.env.DEV) window.__back = handleBack // pour les tests

/** Le bouton retour du téléphone ferme d'abord cette fenêtre (ou ce menu). */
export function useBackClose(onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    openSheets.push(closeRef)
    return () => { const i = openSheets.indexOf(closeRef); if (i >= 0) openSheets.splice(i, 1) }
  }, [])
}

export function Sheet({ dialog, onClose, children }) {
  useBackClose(onClose)
  // Sur téléphone, toucher un champ ouvre le clavier : la fenêtre remonte et le
  // « clic » qui suit peut tomber sur le fond. On ne ferme donc que si le toucher
  // a commencé ET fini sur le fond, jamais quand il a commencé dans la fenêtre.
  const downOnBackdrop = useRef(false)
  return (
    <div
      className={dialog ? 'ov mid' : 'ov'}
      onPointerDown={(e) => {
        // Clavier ouvert (un champ de la fenêtre a le focus) : ce toucher ne fait que
        // fermer le clavier, la fenêtre reste ouverte.
        const active = document.activeElement
        const typing = active && e.currentTarget.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
        downOnBackdrop.current = !typing && e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
        downOnBackdrop.current = false
      }}
    >
      <div className={dialog ? 'sheet dlg' : 'sheet'} role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

function FieldModal({ title, text, placeholder, maxLength, type = 'password', inputMode, submitLabel, danger, initial = '', onClose, onSubmit }) {
  const [value, setValue] = useState(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { if (finePointer()) ref.current?.focus() }, [])
  async function go() {
    setBusy(true)
    setErr('')
    try {
      await onSubmit(value)
    } catch (e) {
      setErr(e.message || 'Erreur')
      if (type === 'password') setValue('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet onClose={onClose}>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {type === 'password' ? <Secret ref={ref} inputMode={inputMode} maxLength={maxLength} placeholder={placeholder}
        value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} /> : <input ref={ref} className="field" type={type} inputMode={inputMode} maxLength={maxLength} placeholder={placeholder}
        value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />}
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className={danger ? 'btn danger' : 'btn dark'} type="button" disabled={busy} onClick={go}>{submitLabel}</button>
      </div>
    </Sheet>
  )
}

/** Champ de code avec un œil pour afficher ou masquer ce qu'on tape. */
function Secret({ ref, style, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div className="secret" style={style}>
      <input ref={ref} className="field" type={show ? 'text' : 'password'} autoComplete="off" {...props} />
      <button type="button" className="eye" onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} aria-label={show ? 'Masquer le code' : 'Afficher le code'} aria-pressed={show}>
        {show
          ? <svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.1 4M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6" /></svg>
          : <svg viewBox="0 0 24 24"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>}
      </button>
    </div>
  )
}

/** Icône de la fiche d'inventaire : bloc-notes coché, cartons de stock, flèches de rotation. */
function InventoryIcon() {
  return (
    <svg className="invico" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#F4F2EE" />
      <path d="M22 12c8-6 20-6 27 1" fill="none" stroke="#2D3A4A" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 8l4 6-7 1" fill="none" stroke="#2D3A4A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 54c-8 5-19 5-26-2" fill="none" stroke="#2D3A4A" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 57l-4-6 7-1" fill="none" stroke="#2D3A4A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="17" width="24" height="31" rx="3" fill="#C8174E" />
      <rect x="11" y="21" width="18" height="24" rx="1.5" fill="#D9D9D9" />
      <rect x="16" y="15" width="8" height="6" rx="1.5" fill="#EDB12E" />
      {[26, 32, 38].map((y) => (
        <g key={y}>
          <path d={`M13 ${y}l2 2 3-4`} fill="none" stroke="#2D3A4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="20" y={y - 1} width="7" height="2.4" rx="1.2" fill="#1A9BC4" />
        </g>
      ))}
      {[[44, 19], [44, 35]].map(([x, y]) => (
        <g key={y}>
          <path d={`M${x} ${y}l10 5-10 5-10-5z`} fill="#1A9BC4" />
          <path d={`M${x - 10} ${y + 5}l10 5v10l-10-5z`} fill="#EDB12E" />
          <path d={`M${x} ${y + 10}l10-5v10l-10 5z`} fill="#C9902A" />
        </g>
      ))}
    </svg>
  )
}

function SyncDot({ s }) {
  const sync = s.sync
  let cls = 'ok'
  let label = 'Sauvegardé'
  if (sync.running) { cls = 'run'; label = 'Synchro…' }
  else if (!sync.online) { cls = 'off'; label = sync.pending ? 'Hors ligne · ' + sync.pending + ' en attente' : 'Hors ligne' }
  else if (sync.error) { cls = 'off'; label = 'À synchroniser' }
  else if (sync.pending) { cls = 'run'; label = sync.pending + ' en attente' }
  return <button className={'sync ' + cls} type="button" onClick={() => store.sync()} title={sync.error || label}><i />{label}</button>
}

function Brand() {
  return <img className="flag" src="/flag.png" alt="" />
}

// ------------------------------------------------------------------ accueil sans compte

function Welcome() {
  const [mode, setMode] = useState('login') // l'appli s'ouvre sur la connexion
  const [role, setRole] = useState('merchant') // à la création : commerçant ou client
  const [saved, setSaved] = useState(() => store.knownPhone()) // numéro déjà connu sur ce téléphone
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(1) // client : 1 = numéro et code, 2 = nom et boutiques
  const [shops, setShops] = useState(null) // liste des boutiques (null = en chargement)
  const [picked, setPicked] = useState([])
  const [q, setQ] = useState('')

  function checkStep1() {
    if (String(phone).replace(/\D/g, '').length < 8) return 'Entrez votre numéro de téléphone.'
    if (!/^\d{4,6}$/.test(code)) return 'Le code doit avoir 4 à 6 chiffres.'
    if (code !== confirm) return 'Les deux codes ne sont pas identiques.'
    return ''
  }

  async function nextStep() {
    const e = checkStep1()
    setErr(e)
    if (e) return
    setStep(2)
    if (shops === null || shops.error) {
      setShops(null)
      try { setShops(await store.shopDirectory()) } catch (x) { setShops({ error: x.message }) }
    }
  }

  async function go() {
    setErr('')
    if (mode === 'register') {
      const e = checkStep1()
      if (e) { setStep(1); return setErr(e) }
      if (role === 'customer' && !name.trim()) return setErr('Entrez votre nom : les boutiques le verront sur vos commandes.')
    }
    setBusy(true)
    try {
      if (mode === 'register') await store.register({ phone, name, code, confirm, role, shops: role === 'customer' ? picked : [] })
      else await store.login({ phone: saved || phone, code })
    } catch (e) {
      setErr(e.message)
      if (!(mode === 'register' && role === 'customer')) { setCode(''); setConfirm('') }
    } finally {
      setBusy(false)
    }
  }

  const reg = mode === 'register'
  const codeOnly = !reg && !!saved

  // Création d'un compte client, étape 2 : le nom puis les boutiques à cocher.
  if (reg && role === 'customer' && step === 2) {
    const list = Array.isArray(shops) ? shops : []
    const needle = q.trim().toLowerCase()
    const shown = needle ? list.filter((x) => x.name.toLowerCase().includes(needle)) : list
    const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
    return (
      <div className="lockscreen form">
        <Brand />
        <div className="appname">Lessy aimé Rodrigue</div>
        <h1>Créer mon compte</h1>
        <div className="steps"><span className="done">1</span><i /><span className="on">2</span></div>
        <p>Dites-nous votre nom, puis cochez les boutiques où vous achetez.</p>
        <label className="lbl">Votre nom</label>
        <input className="field" type="text" maxLength={60} autoComplete="name" placeholder="Ex : Aimée Ndong" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="lbl">Vos boutiques {picked.length > 0 && <em className="pickn">{picked.length} cochée(s)</em>}</label>
        {list.length > 6 && <input className="field" type="search" placeholder="Rechercher une boutique" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="shoppick">
          {shops === null && <p className="hint">Chargement des boutiques…</p>}
          {shops?.error && (
            <p className="hint">{shops.error} <button type="button" className="linkbtn" onClick={nextStep}>Réessayer</button></p>
          )}
          {Array.isArray(shops) && shown.length === 0 && <p className="hint">{needle ? 'Aucune boutique à ce nom.' : 'Aucune boutique pour le moment.'}</p>}
          {shown.map((x) => {
            const on = picked.includes(x.id)
            return (
              <button key={x.id} type="button" role="checkbox" aria-checked={on} className={'pick' + (on ? ' on' : '')} onClick={() => toggle(x.id)}>
                <span className="box">{on ? '✓' : ''}</span>
                <span className="pn"><b>{x.name}</b><small>{x.articles > 0 ? x.articles + ' article(s)' : 'Catalogue à venir'} · {x.hint}</small></span>
              </button>
            )
          })}
        </div>
        <p className="hint left">Vous pourrez ajouter ou retirer des boutiques plus tard.</p>
        <div className="err">{err}</div>
        <button className="btn dark" type="button" disabled={busy} onClick={go}>{busy ? 'Création…' : 'Créer mon compte'}</button>
        <button className="btn out" type="button" disabled={busy} onClick={() => { setStep(1); setErr('') }}>‹ Retour</button>
      </div>
    )
  }

  const custStep1 = reg && role === 'customer'
  return (
    <div className="lockscreen form">
      <Brand />
      <div className="appname">Lessy aimé Rodrigue</div>
      <h1>{reg ? 'Créer mon compte' : 'Connexion'}</h1>
      {custStep1 && <div className="steps"><span className="on">1</span><i /><span>2</span></div>}
      {reg && (
        <div className="roles" role="radiogroup" aria-label="Type de compte">
          <button type="button" role="radio" aria-checked={role === 'merchant'} className={role === 'merchant' ? 'on' : ''} onClick={() => setRole('merchant')}>
            <span>🏪</span><b>Je suis commerçant</b><small>Calculatrice, bons, commandes</small>
          </button>
          <button type="button" role="radio" aria-checked={role === 'customer'} className={role === 'customer' ? 'on' : ''} onClick={() => setRole('customer')}>
            <span>🛍️</span><b>Je suis client</b><small>Commander, suivre mes bons</small>
          </button>
        </div>
      )}
      <p>{reg
        ? 'Votre numéro sert d\'identifiant. Choisissez un code d\'accès et confirmez-le.'
        : codeOnly ? 'Entrez votre code d\'accès.' : "Connectez-vous une seule fois : ensuite l'application s'ouvre directement, même sans internet."}</p>
      {codeOnly ? (
        <div className="known">
          <span>Compte <b>{saved}</b></span>
          <button type="button" onClick={() => { setSaved(''); setErr('') }}>Autre numéro</button>
        </div>
      ) : (<>
        <label className="lbl">Numéro de téléphone</label>
        <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ex : 077 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </>)}
      {reg && role === 'merchant' && <>
        <label className="lbl">Nom du commerce</label>
        <input className="field" type="text" maxLength={60} placeholder="Ex : Chez Lessy" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="hint left">Vos clients trouveront votre boutique par ce nom.</p>
      </>}
      <label className="lbl">{reg ? 'Code d\'accès (4 à 6 chiffres)' : 'Code d\'accès'}</label>
      <Secret autoFocus={codeOnly && finePointer()} inputMode="numeric" maxLength={6} placeholder="••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && !reg) go() }} />
      {reg && <>
        <label className="lbl">Confirmer le code</label>
        <Secret inputMode="numeric" maxLength={6} placeholder="••••" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { if (custStep1) nextStep(); else go() } }} />
      </>}
      <div className="err">{err}</div>
      {custStep1
        ? <button className="btn dark" type="button" onClick={nextStep}>Continuer ›</button>
        : <button className="btn dark" type="button" disabled={busy} onClick={go}>{busy ? (reg ? 'Création…' : 'Restauration…') : (reg ? 'Créer mon compte' : 'Se connecter')}</button>}
      <div className="switch">
        <span>{reg ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'}</span>
        <button className="btn out" type="button" onClick={() => { setMode(reg ? 'login' : 'register'); setStep(1); setErr(''); setCode(''); setConfirm('') }}>{reg ? 'Se connecter' : 'Créer mon compte'}</button>
      </div>
      {!navigator.onLine && <p className="hint">La première connexion demande internet. Ensuite, l'application marche hors ligne.</p>}
    </div>
  )
}

function Blocked({ s }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const reason = store.access().reason
  return (
    <div className="lockscreen">
      <Brand />
      <h1>{reason === 'blocked' ? 'Compte suspendu' : 'Abonnement terminé'}</h1>
      <p>{reason === 'blocked'
        ? 'Ce compte a été suspendu. Contactez Ardoise241 pour le réactiver.'
        : 'Votre période gratuite est terminée. Renouvelez votre abonnement auprès d\'Ardoise241 pour continuer. Vos données sont gardées.'}</p>
      <p className="hint">Compte : {s.account?.phone}</p>
      <button className="btn dark" type="button" disabled={busy} onClick={async () => {
        setBusy(true); setMsg('')
        try {
          await store.refreshAccount()
          if (!store.access().ok) setMsg('Toujours pas renouvelé.')
        } catch (e) { setMsg(e.message) } finally { setBusy(false) }
      }}>{busy ? 'Vérification…' : 'J\'ai renouvelé, vérifier'}</button>
      <div className="err">{msg}</div>
    </div>
  )
}

function Relogin({ s }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="lockscreen">
      <Brand />
      <h1>Reconnectez-vous</h1>
      <p>Pour continuer à sauvegarder en ligne, entrez le code d'accès du compte {s.account?.phone}. Rien n'est effacé de ce téléphone.</p>
      <Secret inputMode="numeric" maxLength={6} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      <div className="err">{err}</div>
      <button className="btn dark" type="button" onClick={async () => {
        try { await store.relogin(code) } catch (e) { setErr(e.message); setCode('') }
      }}>Se reconnecter</button>
    </div>
  )
}

// ------------------------------------------------------------------ application

export default function App() {
  const s = useStore()
  useEffect(() => { store.boot() }, [])
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return
    // Retour Android : fermer la fenêtre ou revenir en arrière ; à l'accueil,
    // l'application passe en arrière-plan au lieu de se fermer.
    const sub = NativeApp.addListener('backButton', () => { if (!handleBack()) NativeApp.minimizeApp() })
    return () => { sub.then((h) => h.remove()) }
  }, [])
  // Avant connexion : « Lessy aimé Rodrigue » ; une fois connecté : « Ardoise241 ».
  useEffect(() => { document.title = s.token ? 'Ardoise241' : 'Lessy aimé Rodrigue' }, [s.token])

  if (!s.ready) return <div className="pad"><div className="empty">Chargement…</div></div>
  if (!s.token) return <Welcome />
  if (s.account?.needsLogin) return <Relogin s={s} />
  if (!store.access().ok) return <Blocked s={s} />
  if (s.account?.role === 'customer') return <Customer s={s} />
  return <Main s={s} />
}

function Main({ s }) {
  const [view, setView] = useState('home') // home | calc | cahier | bilan | foods | settings
  const [cur, setCur] = useState(null) // uid du client ouvert
  const [calcFor, setCalcFor] = useState(null) // calculatrice liée à un client (depuis son bilan)
  const [counts, setCounts] = useState({})
  const [q, setQ] = useState('')
  const [admin, setAdmin] = useState(false)
  const [modal, setModal] = useState(null)
  const [navOpen, setNavOpen] = useNavOpen('ardoise241_nav')
  const showNav = !!admin && navOpen // menu latéral : seulement en mode gérant
  const [clientId, setClientId] = useState(null) // fiche client ouverte (Mes clients)
  const [bilanBack, setBilanBack] = useState('cahier')
  const [toastMsg, setToastMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const toastTimer = useRef(null)

  useEffect(() => { window.scrollTo(0, 0) }, [view])
  useEffect(() => {
    const t = setInterval(() => store.pollCommerce(), 20000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (s.notice) { toast(s.notice.text); store.clearNotice() }
  }, [s.notice]) // eslint-disable-line react-hooks/exhaustive-deps

  const newOrders = (s.commerce?.orders || []).filter((o) => o.status === 'envoyee').length
  const doingOrders = (s.commerce?.orders || []).filter((o) => o.status === 'acceptee' || o.status === 'prete').length
  const prospects = (s.commerce?.customers || []).filter((c) => c.status === 'prospect').length
  const menuItems = [
    { key: 'home', icon: '🏠', label: 'Accueil' },
    { key: 'calc', icon: '🧮', label: 'Calculatrice' },
    { key: 'cahier', icon: '📒', label: 'Cahier Bon' },
    { key: 'sep1', sep: true, label: 'Boutique en ligne' },
    { key: 'orders', icon: '🛍️', label: 'Commandes', badge: newOrders },
    { key: 'clients', icon: '👥', label: 'Mes clients', badge: prospects },
    { key: 'messages', icon: '📣', label: 'Messages et promos' },
    { key: 'sep2', sep: true, label: 'Gestion' },
    { key: 'inventaire', icon: '📊', label: 'Fiche d\'inventaire' },
    { key: 'settings', icon: '⚙️', label: 'Réglages' },
  ]
  async function pickMenu(key) {
    if (key === 'calc') return openCalc(null)
    if (key === 'cahier') setQ('')
    if (key === 'settings') { if (await needAdmin()) setView('settings'); return }
    setView(key)
  }

  function toast(message) {
    setToastMsg(message)
    setToastOn(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastOn(false), 2600)
  }

  const debts = useMemo(() => store.debts(s.entries), [s.entries])
  const owing = useMemo(() => Object.values(debts).filter((d) => d > 0), [debts])
  const todayCash = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    return store.inventory(d.getTime(), d.getTime() + 86400000, s.entries).received
  }, [s.entries])
  const total = useMemo(() => s.foods.reduce((sum, f) => sum + (counts[f.uid] || 0) * f.price, 0), [s.foods, counts])
  const nbItems = Object.values(counts).reduce((a, b) => a + b, 0)
  const person = s.people.find((p) => p.uid === cur) || null
  const days = store.access().daysLeft

  function askCode({ title, text, submitLabel = 'Valider', danger }) {
    return new Promise((resolve) => {
      setModal({
        type: 'code', title, text, submitLabel, danger,
        onCancel: () => { setModal(null); resolve(false) },
        onSubmit: async (code) => {
          const role = await store.checkCode(code)
          if (!role) throw new Error('Code incorrect.')
          setModal(null)
          resolve(role)
        },
      })
    })
  }

  async function needAdmin() {
    if (admin) return true
    const role = await askCode({ title: 'Mode gérant', text: 'Entrez votre code d\'accès, ou le code admin Ardoise241, pour modifier les noms, les images et les prix.', submitLabel: 'Entrer' })
    if (role) { setAdmin(role); toast(role === 'support' ? 'Mode admin Ardoise241 activé.' : 'Mode gérant activé.') }
    return !!role
  }

  function tap(uid) { setCounts((c) => ({ ...c, [uid]: (c[uid] || 0) + 1 })) }
  function untap(uid) {
    setCounts((c) => {
      const next = { ...c }
      if (next[uid] > 0) next[uid] -= 1
      if (!next[uid]) delete next[uid]
      return next
    })
  }

  function openCalc(forUid = null) {
    setCalcFor(forUid)
    setCounts({})
    setModal(null)
    setView('calc')
  }

  function leaveCalc() {
    const back = calcFor ? 'bilan' : 'home'
    if (total > 0) {
      setModal({ type: 'confirm', message: 'Le calcul en cours sera perdu. Quitter ?', label: 'Quitter', onYes: () => { setCounts({}); setModal(null); setView(back) } })
      return
    }
    setView(back)
  }

  async function saveAsBon(personUid, paid) {
    const res = await store.addSession(personUid, counts, paid)
    const who = s.people.find((p) => p.uid === personUid)
    setCounts({})
    setCalcFor(personUid)
    setCur(personUid)
    setQ('')
    setModal(null)
    setView('bilan')
    toast(res.owed > 0 ? fmt(res.owed) + ' ajoutés au bilan de ' + (who?.name || '') : 'Encaissé : ' + fmt(res.total))
    return res
  }

  function openBilan(uid, from = 'cahier') {
    setCur(uid)
    setBilanBack(from)
    setModal(null)
    setView('bilan')
  }

  const lockBtn = (
    <button className="lock" type="button" onClick={() => (admin ? (setAdmin(false), toast('Mode gérant fermé.')) : needAdmin())} aria-label={admin ? 'Quitter le mode gérant' : 'Mode gérant'}>{admin ? '🔓' : '🔒'}</button>
  )

  let body = null

  if (view === 'home') {
    body = (
      <>
        <header className="top">
          {/* Le menu latéral n'apparaît qu'en mode gérant (après le code, via Réglages). */}
          {admin && <MenuButton onClick={() => setNavOpen(!navOpen)} badge={showNav ? 0 : newOrders} />}
          <div className="grow">
            <h1>Ardoise241</h1>
            <p>{s.account?.name || s.account?.phone}{days <= 15 ? ' · essai : ' + days + ' j restants' : ''}</p>
          </div>
          {/* La synchro se fait sans bruit : l'état n'est visible qu'en mode gérant / admin. */}
          {admin && <SyncDot s={s} />}
          {admin && lockBtn}
        </header>
        <div className="pad home">
          <button className="hero" type="button" onClick={() => openCalc(null)}>
            <span className="ico">🧮</span>
            <b>Calculatrice</b>
            <small>Touchez les images pour calculer</small>
          </button>
          <button className="hero small" type="button" onClick={() => { setQ(''); setView('cahier') }}>
            <span className="ico">📒</span>
            <span className="txt"><b>Cahier Bon</b><small>{owing.length ? owing.length + ' client(s) · ' + fmt(owing.reduce((a, b) => a + b, 0)) + ' en bon' : 'Aucun bon en cours'}</small></span>
            <span className="chev">›</span>
          </button>
          <button className={newOrders ? 'hero small hot' : 'hero small'} type="button" onClick={() => setView('orders')}>
            <span className="ico">🛍️</span>
            <span className="txt"><b>Commandes</b><small>{newOrders ? newOrders + ' nouvelle(s) commande(s) !' : doingOrders ? doingOrders + ' en préparation' : 'Les commandes de vos clients arrivent ici'}</small></span>
            {newOrders > 0 ? <span className="hbadge">{newOrders}</span> : <span className="chev">›</span>}
          </button>
          <button className="hero small" type="button" onClick={() => setView('inventaire')}>
            <span className="ico"><InventoryIcon /></span>
            <span className="txt"><b>Fiche d'inventaire</b><small>{todayCash ? 'Encaissé aujourd\'hui : ' + fmt(todayCash) : 'Ventes, encaissements et articles vendus'}</small></span>
            <span className="chev">›</span>
          </button>
          <button className="linkbtn" type="button" onClick={async () => { if (await needAdmin()) setView('settings') }}>⚙ Réglages : images, prix, code, compte</button>
        </div>
      </>
    )
  } else if (view === 'calc') {
    const who = calcFor ? s.people.find((p) => p.uid === calcFor) : null
    body = (
      <>
        <header className="top">
          <button className="back" type="button" onClick={leaveCalc} aria-label="Retour">‹</button>
          <div className="grow">
            <h1>{who ? who.name : 'Calculatrice'}</h1>
            <p>{who ? 'Nouvelle session · bilan ' + fmt(debts[who.uid]) : nbItems ? nbItems + ' article(s)' : 'Touchez une image pour l\'ajouter'}</p>
          </div>
          {lockBtn}
        </header>
        {admin && <div className="pad" style={{ paddingBottom: 0 }}><div className="empty" style={{ padding: 10, fontSize: 14 }}>{admin === 'support' ? 'Mode admin Ardoise241' : 'Mode gérant'} : touchez ✎ sous une image pour changer la photo, le nom et le prix.</div></div>}
        <div className="grid">
          {s.foods.map((food) => {
            const n = counts[food.uid] || 0
            const img = s.images[food.uid]?.url
            return (
              <div className={n ? 'tile on' : 'tile'} key={food.uid} onClick={() => tap(food.uid)}>
                <div className="ph">
                  {img ? <img src={img} alt="" /> : <span className="cam">📷</span>}
                  <i className="badge">×{n}</i>
                  <button className="minus" type="button" aria-label="Retirer un" onClick={(e) => { e.stopPropagation(); untap(food.uid) }}>−</button>
                </div>
                <div className="cf">
                  <div className="ct">{food.name}<small>{fmt(food.price)}</small></div>
                  {admin && <button className="pen" type="button" aria-label={'Modifier ' + food.name} onClick={(e) => { e.stopPropagation(); setModal({ type: 'editFood', uid: food.uid }) }}>✎</button>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="bar">
          <div className="in">
            <button className="tot" type="button" onClick={() => {
              if (total <= 0) return toast('Touchez des images pour calculer.')
              setModal({ type: 'calcBilan' })
            }} aria-label="Voir le bilan du calcul"><small>Total</small><b>{fmt(total)}</b><span className="chipbil">Bilan ›</span></button>
            <button className="btn line" type="button" onClick={() => setCounts({})}>Effacer</button>
            {who
              ? <button className="btn" type="button" onClick={async () => {
                  try { await saveAsBon(who.uid, 0) } catch (e) { toast(e.message) }
                }}>Valider</button>
              : <button className="btn" type="button" onClick={() => {
                  if (total <= 0) return toast('Touchez des images pour calculer.')
                  setModal({ type: 'pickName' })
                }}>Mettre en bon</button>}
          </div>
        </div>
      </>
    )
  } else if (view === 'cahier') {
    body = (
      <>
        <header className="top">
          <button className="back" type="button" onClick={() => setView('home')} aria-label="Retour">‹</button>
          <div className="grow"><h1>Cahier Bon</h1><p>{owing.length} client(s) avec un bon · {fmt(owing.reduce((a, b) => a + b, 0))}</p></div>
          <PdfButton run={pdf.cahier} toast={toast} />
          {lockBtn}
        </header>
        <div className="pad">
          <NameList people={s.people} debts={debts} q={q} setQ={setQ} admin={admin}
            onPick={(p) => openBilan(p.uid)}
            onRename={async (p) => { if (await needAdmin()) setModal({ type: 'rename', person: p }) }} />
        </div>
      </>
    )
  } else if (view === 'bilan' && person) {
    const list = s.entries.filter((e) => e.person === person.uid)
    body = (
      <>
        <header className="top">
          <button className="back" type="button" onClick={() => setView(bilanBack)} aria-label="Retour">‹</button>
          <div className="grow"><h1>{person.name}</h1><p>Bilan</p></div>
          <PdfButton run={() => pdf.bilan(person)} toast={toast} />
          {lockBtn}
        </header>
        <div className="pad">
          <div className="actions">
            <button className="btn dark" type="button" onClick={() => openCalc(person.uid)}>Nouvelle session (images)</button>
            <button className="btn out" type="button" onClick={() => setModal({ type: 'pay' })}>Enregistrer un paiement</button>
            <button className="btn out" type="button" onClick={async () => {
              if (!list.length) return toast('Le bilan est déjà vide.')
              const ok = await askCode({ title: 'Effacer le bilan', text: 'Le bilan de ' + person.name + ' (' + fmt(debts[person.uid]) + ') sera effacé. Entrez votre code pour confirmer.', submitLabel: 'Effacer', danger: true })
              if (ok) { await store.eraseBilan(person.uid); toast('Bilan effacé.') }
            }}>Effacer le bilan</button>
          </div>
          <Bilan entries={list} onPay={(bon) => setModal({ type: 'payBon', bon })} />
          <div className="total"><span>Montant final =</span><b>{fmt(debts[person.uid])}</b></div>
        </div>
      </>
    )
  } else if (view === 'orders') {
    body = <OrdersView s={s} back={() => setView('home')} toast={toast} />
  } else if (view === 'clients') {
    body = <ClientsView s={s} toast={toast} back={() => setView('home')} open={(id) => { setClientId(id); setView('client') }} />
  } else if (view === 'client') {
    body = <ClientView s={s} id={clientId} back={() => setView('clients')} openBons={(uid) => openBilan(uid, 'client')} />
  } else if (view === 'messages') {
    body = <MessagesView s={s} back={() => setView('home')} toast={toast} />
  } else if (view === 'inventaire') {
    body = <Inventory s={s} toast={toast} back={() => setView('home')} />
  } else if (view === 'settings') {
    body = <Settings s={s} back={() => setView('home')} openFoods={() => setView('foods')} toast={toast} setModal={setModal} />
  } else if (view === 'foods') {
    body = <FoodsAdmin s={s} back={() => setView('settings')} toast={toast} edit={(uid) => setModal({ type: 'editFood', uid })} />
  } else {
    body = null
    setTimeout(() => setView('home'))
  }

  return (
    <>
      {body}
      {showNav && (
        <SideNav title="Ardoise241" subtitle={(s.account?.name || s.account?.phone) + ' · commerçant'} items={menuItems}
          current={view === 'client' ? 'clients' : view === 'bilan' ? 'cahier' : view} onPick={pickMenu} onHide={() => setNavOpen(false)} />
      )}
      {modal?.type === 'calcBilan' && (() => {
        const who = calcFor ? s.people.find((p) => p.uid === calcFor) : null
        const lines = s.foods.filter((f) => counts[f.uid] > 0)
        return (
          <Sheet onClose={() => setModal(null)}>
            <h3>Bilan du calcul{who ? ' · ' + who.name : ''}</h3>
            <div className="ses">
              <div className="sl"><span className="lab">Calcul en cours</span><b>{fmt(total)}</b></div>
              <ul className="its">
                {lines.map((f) => (
                  <li key={f.uid}><span>{f.name}</span><span className="q">×{counts[f.uid]}</span><span className="u">{'à ' + fmt(f.price)}</span><span className="p">{fmt(f.price * counts[f.uid])}</span></li>
                ))}
              </ul>
            </div>
            <div className="total"><span>Total =</span><b>{fmt(total)}</b></div>
            <div className="btns">
              {who
                ? <button className="btn dark" type="button" onClick={async () => { try { await saveAsBon(who.uid, 0) } catch (e) { toast(e.message) } }}>Ajouter au bilan de {who.name}</button>
                : <>
                    <button className="btn out" type="button" onClick={async () => {
                      try {
                        await store.addCashSale(counts)
                        setCounts({}); setModal(null); toast('Encaissé : ' + fmt(total) + ' (ajouté à la fiche d\'inventaire)')
                      } catch (e) { toast(e.message) }
                    }}>Encaissé</button>
                    <button className="btn dark" type="button" onClick={() => setModal({ type: 'pickName' })}>Mettre en bon</button>
                  </>}
            </div>
          </Sheet>
        )
      })()}
      {modal?.type === 'pickName' && (
        <Sheet onClose={() => setModal(null)}>
          <h3>Mettre {fmt(total)} en bon pour…</h3>
          <NameList people={s.people} debts={debts} q={q} setQ={setQ} compact onPick={(p) => setModal({ type: 'confirmBon', person: p })} />
        </Sheet>
      )}
      {modal?.type === 'confirmBon' && <ConfirmBon person={modal.person} total={total} debt={debts[modal.person.uid] || 0} onClose={() => setModal({ type: 'pickName' })} onSave={saveAsBon} />}
      {modal?.type === 'confirm' && (
        <Sheet onClose={() => setModal(null)}>
          <h3>Confirmer</h3>
          <p>{modal.message}</p>
          <div className="btns">
            <button className="btn out" type="button" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn danger" type="button" onClick={modal.onYes}>{modal.label || 'Confirmer'}</button>
          </div>
        </Sheet>
      )}
      {modal?.type === 'code' && (
        <FieldModal title={modal.title} text={modal.text} placeholder="Code" maxLength={6} inputMode="numeric"
          submitLabel={modal.submitLabel} danger={modal.danger} onClose={modal.onCancel} onSubmit={modal.onSubmit} />
      )}
      {modal?.type === 'rename' && (
        <FieldModal title="Modifier le nom" type="text" initial={modal.person.name} placeholder="Nom" maxLength={40} submitLabel="Enregistrer"
          onClose={() => setModal(null)}
          onSubmit={async (name) => { await store.renamePerson(modal.person.uid, name); setModal(null) }} />
      )}
      {modal?.type === 'pay' && person && (
        <FieldModal title="Enregistrer un paiement" text={person.name + ' doit ' + fmt(debts[person.uid]) + '. Montant payé (F) :'} placeholder="Ex : 5000" type="number" inputMode="numeric" submitLabel="Enregistrer"
          onClose={() => setModal(null)}
          onSubmit={async (amount) => { await store.addPayment(person.uid, amount); setModal(null); toast('Paiement enregistré.') }} />
      )}
      {modal?.type === 'payBon' && person && <PayBon person={person} bon={modal.bon} onClose={() => setModal(null)} toast={toast} />}
      {modal?.type === 'editFood' && <EditFood food={s.foods.find((f) => f.uid === modal.uid)} img={s.images[modal.uid]?.url} onClose={() => setModal(null)} toast={toast} />}
      {modal?.type === 'changeCode' && <ChangeCode onClose={() => setModal(null)} toast={toast} />}
      {modal?.type === 'shopName' && (
        <FieldModal title="Nom de la boutique" text="Vos clients trouvent votre boutique par ce nom et le voient sur leurs commandes." type="text"
          initial={s.account?.name || ''} placeholder="Ex : Chez Lessy" maxLength={60} submitLabel="Enregistrer"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const sent = await store.renameAccount(name)
            setModal(null)
            toast(sent ? 'Nom de la boutique enregistré.' : 'Nom enregistré : il sera envoyé en ligne dès la connexion.')
          }} />
      )}
      <div id="toast" className={toastOn ? 'on' : ''}>{toastMsg}</div>
    </>
  )
}

function NameList({ people, debts, q, setQ, onPick, onRename, admin, compact }) {
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    return query ? people.filter((p) => p.name.toLowerCase().includes(query) || String(p.position) === query) : people
  }, [people, q])
  return (
    <>
      <input className="search" type="search" placeholder="Chercher un nom ou un numéro" value={q} onChange={(e) => setQ(e.target.value)} />
      {visible.length === 0 && <div className="empty">Aucun nom ne correspond à « {q} ».</div>}
      <div className={compact ? 'names compact' : 'names'}>
        {visible.map((p) => (
          <div className="item" role="button" tabIndex={0} key={p.uid} onClick={() => onPick(p)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(p) }}>
            <span className="num">{p.position >= 100000 ? '★' : p.position}</span>
            <span className="t">{p.name}</span>
            {debts[p.uid] > 0 && <span className="due">{fmt(debts[p.uid])}</span>}
            {onRename && <button className={admin ? 'pen' : 'pen dim'} type="button" aria-label="Modifier le nom" onClick={(e) => { e.stopPropagation(); onRename(p) }}>✎</button>}
            <span className="chev">›</span>
          </div>
        ))}
      </div>
    </>
  )
}

function ConfirmBon({ person, total, debt, onClose, onSave }) {
  const [paid, setPaid] = useState('')
  const [err, setErr] = useState('')
  const cash = Math.min(total, Math.max(0, Number(paid) || 0))
  return (
    <Sheet onClose={onClose}>
      <h3>{person.name}</h3>
      <div className="recap">
        <div><span>Total du calcul</span><b>{fmt(total)}</b></div>
        <div><span>Payé maintenant</span>
          <input className="field mini" type="number" inputMode="numeric" min="0" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
        <div className="hl"><span>Mis en bon</span><b>{fmt(total - cash)}</b></div>
        <div className="mut"><span>Nouveau bilan</span><b>{fmt(debt + total - cash)}</b></div>
      </div>
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Changer de nom</button>
        <button className="btn dark" type="button" onClick={async () => { try { await onSave(person.uid, cash) } catch (e) { setErr(e.message) } }}>Enregistrer le bon</button>
      </div>
    </Sheet>
  )
}

export const when = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + hour(t)

/**
 * Bilan d'un client, bon par bon : la date une fois par jour, l'heure sur chaque bon,
 * les articles en colonnes, puis l'état du bon (soldé, avance, non payé) et
 * l'historique de ses paiements avec date et heure.
 */
export function Bilan({ entries, onPay }) {
  const [filter, setFilter] = useState('all')
  const bons = useMemo(() => store.ledger(entries), [entries])
  if (!bons.length) return <div className="empty">Aucun bon pour l'instant.</div>
  const counts = { all: bons.length, open: bons.filter((b) => b.status !== 'paid').length, paid: bons.filter((b) => b.status === 'paid').length }
  const shown = bons.filter((b) => filter === 'all' || (filter === 'paid' ? b.status === 'paid' : b.status !== 'paid'))
  const groups = []
  for (const b of shown) {
    const key = dayKey(b.entry.at)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) { g = { key, label: dayLabel(b.entry.at), rows: [] }; groups.push(g) }
    g.rows.push(b)
  }
  return (
    <div className="bil">
      <div className="periods" role="tablist">
        {[['all', 'Tous'], ['open', 'Non payés'], ['paid', 'Payés']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label} ({counts[k]})</button>
        ))}
      </div>
      {groups.length === 0 && <div className="empty">{filter === 'paid' ? 'Aucun bon soldé.' : 'Tous les bons sont soldés.'}</div>}
      {groups.map((g) => {
        const sum = g.rows.reduce((a, b) => a + b.entry.amount, 0)
        return (
          <section className="day" key={g.key}>
            <h4><span>{g.label}</span><small>{fmt(sum)}</small></h4>
            {g.rows.map((b) => {
              const e = b.entry
              return (
                <div className={'ses bon ' + b.status} key={e.uid}>
                  <div className="sl">
                    <time>{hour(e.at)}</time>
                    <span className="lab">Bon</span>
                    <b>{fmt(e.amount)}</b>
                  </div>
                  {e.items?.length > 0 && (
                    <ul className="its">
                      {e.items.map((it, i) => (
                        <li key={i}><span>{it.n}</span><span className="q">×{it.q}</span><span className="u">{it.p ? 'à ' + fmt(it.p) : ''}</span><span className="p">{it.p ? fmt(it.p * it.q) : ''}</span></li>
                      ))}
                    </ul>
                  )}
                  <div className="state">
                    {b.status === 'paid' && <span className="tag ok">✓ Soldé</span>}
                    {b.status === 'partial' && <span className="tag part">Avance {fmt(b.paid)} · reste {fmt(b.remaining)}</span>}
                    {b.status === 'open' && <span className="tag no">Non payé</span>}
                    {b.status !== 'paid' && onPay && <button className="btn dark sm" type="button" onClick={() => onPay(b)}>Payer ce bon</button>}
                  </div>
                  {b.payments.length > 0 && (
                    <ul className="pays">
                      {b.payments.map((p, i) => (
                        <li key={i}><span>{when(p.entry.at)}</span><span>{p.entry.label || 'Paiement'}</span><b>− {fmt(p.amount)}</b></li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

/** Payer un bon : tout solder, ou verser une avance. */
function PayBon({ person, bon, onClose, toast }) {
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function pay(value) {
    setErr('')
    setBusy(true)
    try {
      await store.payBon(person.uid, bon.entry.uid, value)
      onClose()
      toast(Number(value) >= bon.remaining ? 'Bon soldé.' : 'Avance de ' + fmt(value) + ' enregistrée.')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet onClose={onClose}>
      <h3>Payer le bon du {when(bon.entry.at)}</h3>
      <div className="recap">
        <div><span>Montant du bon</span><b>{fmt(bon.entry.amount)}</b></div>
        <div><span>Déjà payé</span><b>{fmt(bon.paid)}</b></div>
        <div className="hl"><span>Reste à payer</span><b>{fmt(bon.remaining)}</b></div>
      </div>
      <button className="btn dark wide" type="button" disabled={busy} style={{ marginTop: 14 }} onClick={() => pay(bon.remaining)}>Tout solder · {fmt(bon.remaining)}</button>
      <p style={{ margin: '14px 0 8px', fontWeight: 700 }}>Ou une avance (en F) :</p>
      <div className="row2">
        <input className="field" type="number" inputMode="numeric" min="1" max={bon.remaining} placeholder="Ex : 2000" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') pay(amount) }} />
        <button className="btn out" type="button" disabled={busy} onClick={() => pay(amount)}>Enregistrer l'avance</button>
      </div>
      <div className="err">{err}</div>
      <div className="btns"><button className="btn out" type="button" onClick={onClose}>Annuler</button></div>
    </Sheet>
  )
}

const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'yesterday', label: 'Hier' },
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
  { key: 'all', label: 'Tout' },
]

function periodRange(key) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const day = 86400000
  const t = start.getTime()
  if (key === 'today') return [t, t + day]
  if (key === 'yesterday') return [t - day, t]
  if (key === 'week') return [t - 6 * day, t + day]
  if (key === 'month') return [t - 29 * day, t + day]
  return [0, Number.MAX_SAFE_INTEGER]
}

/** Fiche d'inventaire : calculée sur le téléphone, donc disponible hors ligne. */
function Inventory({ s, back, toast }) {
  const [period, setPeriod] = useState('today')
  const inv = useMemo(() => {
    const [from, to] = periodRange(period)
    return store.inventory(from, to, s.entries)
  }, [period, s.entries])
  const days = []
  for (const e of inv.sales) {
    const key = dayKey(e.at)
    let g = days[days.length - 1]
    if (!g || g.key !== key) { g = { key, label: dayLabel(e.at), rows: [], sum: 0 }; days.push(g) }
    g.rows.push(e)
    g.sum += e.amount
  }
  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>Fiche d'inventaire</h1><p>Disponible hors ligne · sauvegardée en ligne</p></div>
        <PdfButton toast={toast} run={() => {
          const [from, to] = periodRange(period)
          return pdf.inventory(from, to, (PERIODS.find((p) => p.key === period)?.label || period).toLowerCase())
        }} />
      </header>
      <div className="pad">
        <div className="periods" role="tablist">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={period === p.key} className={period === p.key ? 'on' : ''} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>

        <div className="invk">
          <div className="k main"><small>Total encaissé</small><b>{fmt(inv.received)}</b><i>ventes + paiements de bons</i></div>
          <div className="k"><small>Ventes encaissées</small><b>{fmt(inv.cash)}</b><i>{inv.cashCount} vente(s)</i></div>
          <div className="k"><small>Mis en bon</small><b>{fmt(inv.credit)}</b><i>{inv.creditCount} bon(s)</i></div>
          <div className="k"><small>Paiements de bons</small><b>{fmt(inv.payments)}</b><i>{inv.paymentCount} paiement(s)</i></div>
        </div>

        <h2>Articles vendus</h2>
        {inv.articles.length === 0 ? <div className="empty">Aucun article sur cette période.</div> : (
          <div className="invt">
            <div className="hd"><span>Article</span><span>Qté</span><span>Montant</span></div>
            {inv.articles.map((a) => (
              <div className="rw" key={a.n}>
                <span className="n">{a.n}<small>{a.cash ? a.cash + ' encaissé(s)' : ''}{a.cash && a.credit ? ' · ' : ''}{a.credit ? a.credit + ' en bon' : ''}</small></span>
                <span className="q">{a.q}</span>
                <span className="m">{fmt(a.amount)}</span>
              </div>
            ))}
            <div className="rw tot"><span className="n">Total</span><span className="q">{inv.articles.reduce((x, a) => x + a.q, 0)}</span><span className="m">{fmt(inv.cash + inv.credit)}</span></div>
          </div>
        )}

        <h2>Encaissements</h2>
        {days.length === 0 ? <div className="empty">Aucun encaissement sur cette période. Touchez « Encaissé » dans le bilan de la calculatrice pour en enregistrer.</div> : days.map((g) => (
          <section className="day" key={g.key}>
            <h4><span>{g.label}</span><small>{fmt(g.sum)}</small></h4>
            {g.rows.map((e) => (
              <div className="ses" key={e.uid}>
                <div className="sl"><time>{hour(e.at)}</time><span className="lab">Encaissé</span><b>{fmt(e.amount)}</b></div>
                <ul className="its">
                  {(e.items || []).map((it, i) => (
                    <li key={i}><span>{it.n}</span><span className="q">×{it.q}</span><span className="u">{it.p ? 'à ' + fmt(it.p) : ''}</span><span className="p">{fmt(it.p * it.q)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

function Settings({ s, back, openFoods, toast, setModal }) {
  const a = s.account
  const end = new Date(a.endsAt)
  const last = s.sync.lastAt ? new Date(s.sync.lastAt) : null
  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>Réglages</h1><p>{a.name || a.phone}</p></div>
      </header>
      <div className="pad">
        <div className="card">
          <div className="kv"><span>Nom de la boutique</span><button type="button" className="kvedit" onClick={() => setModal({ type: 'shopName' })}><b>{a.name || 'Sans nom'}</b><span>✎ Modifier</span></button></div>
          <div className="kv"><span>Compte</span><b>{a.phone}</b></div>
          <div className="kv"><span>{a.status === 'abonne' ? 'Abonné jusqu\'au' : 'Essai gratuit jusqu\'au'}</span><b>{end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
          <div className="kv"><span>Jours restants</span><b>{store.access().daysLeft}</b></div>
        </div>
        <div className="card">
          <div className="kv"><span>Sauvegarde en ligne</span><SyncDot s={s} /></div>
          <div className="kv"><span>Dernière synchro</span><b>{last ? last.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais'}</b></div>
          {s.sync.error && <div className="kv"><span>Problème</span><b className="red">{s.sync.error}</b></div>}
          <button className="btn out wide" type="button" onClick={() => store.sync().then(() => toast(store.getState().sync.error || 'Synchronisé.'))}>Synchroniser maintenant</button>
        </div>
        <div className="card">
          <p className="hint left" style={{ margin: 0 }}>Cahier Bon, fiches clients, inventaire, commandes et clients dans un seul PDF.</p>
          <PdfButton run={pdf.everything} toast={toast} label="Exporter tout en PDF" />
        </div>
        <button className="btn dark wide" type="button" onClick={openFoods}>Images et prix</button>
        <button className="btn out wide" type="button" onClick={() => setModal({ type: 'changeCode' })}>Changer mon code d'accès</button>
        <button className="btn out wide" type="button" onClick={() => setModal({
          type: 'confirm',
          message: s.sync.pending
            ? s.sync.pending + ' modification(s) ne sont pas encore sauvegardées en ligne et seront perdues. Se déconnecter quand même ?'
            : 'Les données seront retirées de ce téléphone. Vous les retrouverez avec votre numéro et votre code.',
          label: 'Se déconnecter',
          onYes: () => store.logout(),
        })}>Se déconnecter de ce téléphone</button>
      </div>
    </>
  )
}

function FoodsAdmin({ s, back, toast, edit }) {
  const withPhoto = s.foods.filter((f) => f.imgHave).length
  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>Images et prix</h1><p>{withPhoto} / {s.foods.length} avec photo</p></div>
      </header>
      <div className="pad">
        <div className="actions">
          <label className="btn dark" style={{ cursor: 'pointer' }}>
            Ajouter des photos
            <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
              const files = Array.from(e.target.files || [])
              e.target.value = ''
              if (!files.length) return
              try {
                const r = await store.fillPhotos(files)
                toast(r.added + ' photo(s) ajoutée(s)' + (r.skipped ? ', ' + r.skipped + ' sans place libre' : '') + '.')
              } catch (err) { toast(err.message) }
            }} />
          </label>
        </div>
        <p className="hint">« Ajouter des photos » remplit les images vides dans l'ordre. Touchez une ligne pour changer la photo, le nom ou le prix.</p>
        {s.foods.map((food) => (
          <button className="frow" type="button" key={food.uid} onClick={() => edit(food.uid)}>
            <span className="thumb">{s.images[food.uid] ? <img src={s.images[food.uid].url} alt="" /> : '📷'}</span>
            <span className="f"><b>{food.name}</b><small>{fmt(food.price)}</small></span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </>
  )
}

function EditFood({ food, img, onClose, toast }) {
  const [name, setName] = useState(food.name)
  const [price, setPrice] = useState(String(food.price))
  return (
    <Sheet onClose={onClose}>
      <h3>Modifier l'image</h3>
      <label className="editph">
        {img ? <img src={img} alt="" /> : <span>📷</span>}
        <em>Changer la photo</em>
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            await store.setFoodImage(food.uid, file)
            // Le nom du fichier devient le nom de l'article (on peut le corriger avant d'enregistrer).
            const fromFile = store.nameFromFile(file)
            if (fromFile) {
              setName(fromFile)
              await store.updateFood(food.uid, { name: fromFile })
            }
          } catch (err) { toast(err.message) }
        }} />
      </label>
      <p>Nom :</p>
      <input className="field" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 12 }} />
      <p>Prix (en F) :</p>
      <input className="field" type="number" inputMode="numeric" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className="btn dark" type="button" onClick={async () => {
          try { await store.updateFood(food.uid, { name, price }); onClose() } catch (err) { toast(err.message) }
        }}>Enregistrer</button>
      </div>
    </Sheet>
  )
}

export function ChangeCode({ onClose, toast }) {
  const [current, setCurrent] = useState('')
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = (fn) => (e) => fn(e.target.value.replace(/\D/g, ''))
  return (
    <Sheet onClose={onClose}>
      <h3>Changer mon code d'accès</h3>
      <p>Il faut internet : le nouveau code sert aussi à retrouver vos données sur un autre téléphone.</p>
      <Secret inputMode="numeric" maxLength={6} placeholder="Code actuel" value={current} onChange={digits(setCurrent)} style={{ marginBottom: 8 }} />
      <Secret inputMode="numeric" maxLength={6} placeholder="Nouveau code (4 à 6 chiffres)" value={code} onChange={digits(setCode)} style={{ marginBottom: 8 }} />
      <Secret inputMode="numeric" maxLength={6} placeholder="Confirmer le nouveau code" value={confirm} onChange={digits(setConfirm)} />
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className="btn dark" type="button" disabled={busy} onClick={async () => {
          setErr('')
          if (code !== confirm) return setErr('Les deux codes ne sont pas identiques.')
          setBusy(true)
          try { await store.changeCode(current, code, confirm); onClose(); toast('Code modifié.') } catch (e) { setErr(e.message) } finally { setBusy(false) }
        }}>Enregistrer</button>
      </div>
    </Sheet>
  )
}
