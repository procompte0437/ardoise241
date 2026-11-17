import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as store from './store'

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR') + ' F'
const hour = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() }
function dayLabel(t) {
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

function Sheet({ dialog, onClose, children }) {
  return (
    <div className={dialog ? 'ov mid' : 'ov'} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={dialog ? 'sheet dlg' : 'sheet'} role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

function FieldModal({ title, text, placeholder, maxLength, type = 'password', inputMode, submitLabel, danger, initial = '', onClose, onSubmit }) {
  const [value, setValue] = useState(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
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
  const [mode, setMode] = useState('start')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    setErr('')
    if (mode === 'register') {
      if (!/^\d{4,6}$/.test(code)) return setErr('Le code doit avoir 4 à 6 chiffres.')
      if (code !== confirm) return setErr('Les deux codes ne sont pas identiques.')
    }
    setBusy(true)
    try {
      if (mode === 'register') await store.register({ phone, name, code, confirm })
      else await store.login({ phone, code })
    } catch (e) {
      setErr(e.message)
      setCode('')
      setConfirm('')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'start') {
    return (
      <div className="lockscreen">
        <Brand />
        <h1>Lessy aimé Rodrigue</h1>
        <p>Votre calculatrice et votre cahier de bons, même sans internet.</p>
        <button className="btn dark" type="button" onClick={() => setMode('register')}>Créer mon compte</button>
        <button className="btn out" type="button" onClick={() => setMode('login')}>J'ai déjà un compte</button>
        {!navigator.onLine && <p className="hint">La première connexion demande internet. Ensuite, l'application marche hors ligne.</p>}
      </div>
    )
  }

  const reg = mode === 'register'
  return (
    <div className="lockscreen form">
      <Brand />
      <h1>{reg ? 'Créer mon compte' : 'Retrouver mon compte'}</h1>
      <p>{reg ? 'Votre numéro sert d\'identifiant. Choisissez un code d\'accès et confirmez-le.' : 'Entrez votre numéro et votre code : vos bons, vos images et vos prix reviennent sur ce téléphone.'}</p>
      <label className="lbl">Numéro de téléphone</label>
      <input className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="Ex : 077 12 34 56" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {reg && <>
        <label className="lbl">Nom du commerce (facultatif)</label>
        <input className="field" type="text" maxLength={60} placeholder="Ex : Chez Lessy" value={name} onChange={(e) => setName(e.target.value)} />
      </>}
      <label className="lbl">{reg ? 'Code d\'accès (4 à 6 chiffres)' : 'Code d\'accès'}</label>
      <Secret inputMode="numeric" maxLength={6} placeholder="••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && !reg) go() }} />
      {reg && <>
        <label className="lbl">Confirmer le code</label>
        <Secret inputMode="numeric" maxLength={6} placeholder="••••" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
      </>}
      <div className="err">{err}</div>
      <button className="btn dark" type="button" disabled={busy} onClick={go}>{busy ? (reg ? 'Création…' : 'Restauration…') : (reg ? 'Créer mon compte' : 'Se connecter')}</button>
      <button className="btn out" type="button" onClick={() => { setMode('start'); setErr('') }}>Retour</button>
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

  if (!s.ready) return <div className="pad"><div className="empty">Chargement…</div></div>
  if (!s.token) return <Welcome />
  if (s.account?.needsLogin) return <Relogin s={s} />
  if (!store.access().ok) return <Blocked s={s} />
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
  const [toastMsg, setToastMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const toastTimer = useRef(null)

  useEffect(() => { window.scrollTo(0, 0) }, [view])

  function toast(message) {
    setToastMsg(message)
    setToastOn(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastOn(false), 2600)
  }

  const debts = useMemo(() => store.debts(s.entries), [s.entries])
  const owing = useMemo(() => Object.values(debts).filter((d) => d > 0), [debts])
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
    const role = await askCode({ title: 'Mode gérant', text: 'Entrez votre code d\'accès, ou le code admin Ardoise241, pour modifier les noms, les prix et les paiements.', submitLabel: 'Entrer' })
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
    setModal(null)
    toast(res.owed > 0 ? fmt(res.owed) + ' mis en bon pour ' + (who?.name || '') : 'Encaissé : ' + fmt(res.total))
    return res
  }

  function openBilan(uid) {
    setCur(uid)
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
          <div className="grow">
            <h1>Lessy aimé Rodrigue</h1>
            <p>{s.account?.name || s.account?.phone}{days <= 15 ? ' · essai : ' + days + ' j restants' : ''}</p>
          </div>
          <SyncDot s={s} />
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
            <div className="tot"><small>Total</small><b>{fmt(total)}</b></div>
            <button className="btn line" type="button" onClick={() => setCounts({})}>Vider</button>
            {who
              ? <button className="btn" type="button" onClick={async () => {
                  try { await saveAsBon(who.uid, 0); setView('bilan') } catch (e) { toast(e.message) }
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
          <button className="back" type="button" onClick={() => setView('cahier')} aria-label="Retour">‹</button>
          <div className="grow"><h1>{person.name}</h1><p>Bilan</p></div>
          {lockBtn}
        </header>
        <div className="pad">
          <div className="actions">
            <button className="btn dark" type="button" onClick={() => openCalc(person.uid)}>Nouvelle session (images)</button>
            <button className="btn out" type="button" onClick={async () => { if (await needAdmin()) setModal({ type: 'pay' }) }}>Paiement</button>
            <button className="btn out" type="button" onClick={async () => {
              if (!list.length) return toast('Le bilan est déjà vide.')
              const ok = await askCode({ title: 'Effacer le bilan', text: 'Le bilan de ' + person.name + ' (' + fmt(debts[person.uid]) + ') sera effacé. Entrez votre code pour confirmer.', submitLabel: 'Effacer', danger: true })
              if (ok) { await store.eraseBilan(person.uid); toast('Bilan effacé.') }
            }}>Effacer le bilan</button>
          </div>
          <Bilan entries={list} />
          <div className="total"><span>Montant final =</span><b>{fmt(debts[person.uid])}</b></div>
        </div>
      </>
    )
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
      {modal?.type === 'editFood' && <EditFood food={s.foods.find((f) => f.uid === modal.uid)} img={s.images[modal.uid]?.url} onClose={() => setModal(null)} toast={toast} />}
      {modal?.type === 'changeCode' && <ChangeCode onClose={() => setModal(null)} toast={toast} />}
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
            <span className="num">{p.position}</span>
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

/** Bilan regroupé par jour : la date une fois, l'heure sur chaque ligne, les articles en retrait. */
function Bilan({ entries }) {
  if (!entries.length) return <div className="empty">Aucun montant pour l'instant.</div>
  const groups = []
  for (const e of entries) {
    const key = dayKey(e.at)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) { g = { key, label: dayLabel(e.at), rows: [] }; groups.push(g) }
    g.rows.push(e)
  }
  return (
    <div className="bil">
      {groups.map((g) => {
        const sum = g.rows.reduce((a, e) => a + (e.pay ? -e.amount : e.amount), 0)
        return (
          <section className="day" key={g.key}>
            <h4><span>{g.label}</span><small>{sum >= 0 ? '+ ' + fmt(sum) : '− ' + fmt(-sum)}</small></h4>
            {g.rows.map((e) => (
              <div className={e.pay ? 'ses pay' : 'ses'} key={e.uid}>
                <div className="sl">
                  <time>{hour(e.at)}</time>
                  <span className="lab">{e.pay ? (e.label || 'Paiement') : 'Session'}</span>
                  <b>{e.pay ? '− ' + fmt(e.amount) : fmt(e.amount)}</b>
                </div>
                {!e.pay && e.items?.length > 0 && (
                  <ul className="its">
                    {e.items.map((it, i) => (
                      <li key={i}><span>{it.n}</span><span className="q">×{it.q}</span><span className="p">{it.p ? fmt(it.p * it.q) : ''}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )
      })}
    </div>
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
          try { await store.setFoodImage(food.uid, file) } catch (err) { toast(err.message) }
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

function ChangeCode({ onClose, toast }) {
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
