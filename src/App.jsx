import { useEffect, useMemo, useRef, useState } from 'react'
import { api, media, setToken } from './api'

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR') + ' F'

function when(t) {
  const d = new Date(t)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

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
    try {
      await onSubmit(value)
    } catch (e) {
      setErr(e.message || 'Erreur')
      if (type !== 'text') setValue('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      <input
        ref={ref}
        className="field"
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') go() }}
      />
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className={danger ? 'btn danger' : 'btn dark'} type="button" disabled={busy} onClick={go}>{submitLabel}</button>
      </div>
    </Sheet>
  )
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [bootError, setBootError] = useState('')
  const [locked, setLocked] = useState(false)
  const [names, setNames] = useState([])
  const [foods, setFoods] = useState([])
  const [maxNames, setMaxNames] = useState(200)
  const [maxFoods, setMaxFoods] = useState(150)
  const [view, setView] = useState('names')
  const [admin, setAdmin] = useState(false)
  const [cur, setCur] = useState(null)
  const [person, setPerson] = useState(null)
  const [counts, setCounts] = useState({})
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const toastTimer = useRef(null)
  const installShown = useRef(false)
  const deferredInstall = useRef(null)

  function toast(message) {
    setToastMsg(message)
    setToastOn(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastOn(false), 2600)
  }

  function applyState(s) {
    setLocked(!!s.locked)
    setNames(s.names || [])
    setFoods(s.foods || [])
    setMaxNames(s.maxNames || 200)
    setMaxFoods(s.maxFoods || 150)
  }

  async function load() {
    const s = await api.state()
    applyState(s)
    return s
  }

  useEffect(() => {
    let cancel = false
    load().catch(() => {
      if (!cancel) setBootError('Impossible de joindre le back-office. Démarrez Laravel dans le dossier bo.')
    }).finally(() => { if (!cancel) setBooted(true) })
    return () => { cancel = true }
  }, [])

  useEffect(() => { window.scrollTo(0, 0) }, [view])

  useEffect(() => {
    function onPrompt(e) {
      e.preventDefault()
      deferredInstall.current = e
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  useEffect(() => {
    if (!booted || locked || view !== 'names' || installShown.current) return
    let standalone = false
    try {
      standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true
    } catch { /* ignore */ }
    if (standalone || localStorage.getItem('lessy_install_dismissed') === '1') return
    const t = setTimeout(() => {
      installShown.current = true
      setModal((current) => current || { type: 'install' })
    }, 1500)
    return () => clearTimeout(t)
  }, [booted, locked, view])

  const current = names.find((n) => n.id === cur) || null
  const sessionTotal = useMemo(
    () => foods.reduce((sum, food) => sum + (counts[String(food.id)] || 0) * Number(food.price || 0), 0),
    [foods, counts],
  )
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return names
    return names.filter((n) => n.name.toLowerCase().includes(query))
  }, [names, q])

  function becomeAdmin() {
    return new Promise((resolve) => {
      let settled = false
      const finish = (ok) => {
        if (!settled) {
          settled = true
          resolve(ok)
        }
      }
      setModal({
        type: 'code',
        title: 'Code admin',
        text: 'Entrez le code pour modifier les noms et les images.',
        placeholder: 'Code',
        maxLength: 8,
        submitLabel: 'Entrer',
        onCancel: () => { setModal(null); finish(false) },
        onSubmit: async (code) => {
          const data = await api.login(code)
          setToken(data.token)
          setAdmin(true)
          toast('Mode admin activé.')
          setModal(null)
          finish(true)
        },
      })
    })
  }

  async function needAdmin() {
    if (admin) return true
    return becomeAdmin()
  }

  async function toggleLock() {
    if (admin) {
      try { await api.logout() } catch { /* le jeton local suffit */ }
      setToken(null)
      setAdmin(false)
      if (view === 'adminfoods') setView('names')
      return
    }
    await becomeAdmin()
  }

  function openFoods(id) {
    setCur(id)
    setCounts({})
    setModal(null)
    setView('foods')
  }

  async function openPerson(id) {
    setCur(id)
    setModal(null)
    setView('person')
    try {
      setPerson(await api.person(id))
    } catch (e) {
      toast(e.message)
    }
  }

  function tap(id) {
    const key = String(id)
    setCounts((c) => ({ ...c, [key]: (c[key] || 0) + 1 }))
  }

  function untap(id) {
    const key = String(id)
    setCounts((c) => {
      const next = { ...c }
      if (next[key] > 0) next[key] -= 1
      if (!next[key]) delete next[key]
      return next
    })
  }

  function clearSession() {
    if (sessionTotal <= 0) return
    setCounts({})
  }

  function leaveFoods() {
    if (sessionTotal > 0) {
      setModal({
        type: 'confirm',
        message: "La session en cours n'a pas été validée. Quitter sans l'enregistrer ?",
        label: 'Quitter',
        onYes: () => { setCounts({}); setModal(null); setView('names') },
      })
      return
    }
    setView('names')
  }

  async function validate() {
    if (sessionTotal <= 0) {
      toast('Touchez des images pour ajouter des montants.')
      return
    }
    try {
      const data = await api.session(cur, counts)
      setCounts({})
      setPerson(data.person)
      setNames((list) => list.map((n) => (n.id === data.person.id ? { ...n, debt: data.person.debt } : n)))
      toast(fmt(data.amount) + ' ajoutés au bilan.')
      setView('person')
    } catch (e) {
      if (e.status === 423) setLocked(true)
      else toast(e.message)
    }
  }

  async function unlockApp(code) {
    await api.unlock(code)
    setModal(null)
    await load()
  }

  function closeModal() { setModal(null) }

  let body = null
  if (!booted) {
    body = <div className="pad"><div className="empty">Chargement…</div></div>
  } else if (bootError) {
    body = <div className="pad"><div className="empty">{bootError}</div></div>
  } else if (locked) {
    body = (
      <div className="lockscreen">
        <img className="flag" src="/flag.png" alt="Lessy" />
        <h1>Accès verrouillé</h1>
        <p>La période d'essai est terminée. Entrez le code utilisateur pour continuer.</p>
        <LockForm onSubmit={unlockApp} />
      </div>
    )
  } else if (view === 'names') {
    body = (
      <>
        <header className="top">
          <h1 className="grow">Lessy aimé Rodrigue</h1>
          <button className="lock" type="button" onClick={toggleLock} aria-label={admin ? 'Quitter le mode admin' : 'Mode admin'}>{admin ? '🔓' : '🔒'}</button>
        </header>
        {admin && (
          <div className="adminbar">
            <button className="chip" type="button" onClick={() => setModal({ type: 'addNames' })}>Ajouter des noms</button>
            <button className="chip" type="button" onClick={() => setView('adminfoods')}>Gérer les images</button>
            <button className="chip alt" type="button" onClick={() => setModal({ type: 'changeCode' })}>Changer le code</button>
          </div>
        )}
        <div className="pad">
          <input id="q" className="search" type="search" placeholder="Chercher un nom" value={q} onChange={(e) => setQ(e.target.value)} />
          <div id="list">
            {names.length === 0 && <div className="empty">{admin ? 'Aucun nom pour l\'instant. Touchez « Ajouter des noms ».' : 'Aucun nom pour l\'instant. L\'admin doit en ajouter.'}</div>}
            {names.length > 0 && visible.length === 0 && <div className="empty">Aucun nom ne correspond à « {q} ».</div>}
            {visible.map((n) => (
              <div className="item" role="button" tabIndex={0} key={n.id} onClick={() => setModal({ type: 'choose', person: n })} onKeyDown={(e) => { if (e.key === 'Enter') setModal({ type: 'choose', person: n }) }}>
                <span className="num">{n.num}</span>
                <span className="t">{n.name}</span>
                <button className="pen" type="button" aria-label="Modifier le nom" onClick={async (e) => { e.stopPropagation(); if (await needAdmin()) setModal({ type: 'rename', person: n }) }}>✎</button>
                <span className="chev">›</span>
              </div>
            ))}
          </div>
        </div>
      </>
    )
  } else if (view === 'foods') {
    const who = current
    body = (
      <>
        <header className="top">
          <button className="back" type="button" onClick={leaveFoods} aria-label="Retour">‹</button>
          <h1 className="grow">{who ? who.name : ''}</h1>
          <button className="ghost" type="button" onClick={() => openPerson(cur)}>Bilan</button>
          <button className="lock" type="button" onClick={toggleLock} aria-label={admin ? 'Quitter le mode admin' : 'Mode admin'}>{admin ? '🔓' : '🔒'}</button>
        </header>
        {admin && <div className="pad" style={{ paddingBottom: 0 }}><div className="empty" style={{ padding: 10, fontSize: 14 }}>Mode admin : touchez ✎ sous une image pour changer la photo, le nom et le montant.</div></div>}
        {foods.length === 0 ? <div className="pad"><div className="empty">Aucune image pour l'instant. L'admin doit les ajouter.</div></div> : (
          <>
            <div className="grid">
              {foods.map((food) => {
                const n = counts[String(food.id)] || 0
                return (
                  <div className={n ? 'tile on' : 'tile'} key={food.id} onClick={() => tap(food.id)}>
                    <div className="ph">
                      {food.img ? <img src={media(food.img)} alt="" /> : <span className="cam">📷</span>}
                      <i className="badge">×{n}</i>
                      <button className="minus" type="button" aria-label="Retirer un" onClick={(e) => { e.stopPropagation(); untap(food.id) }}>−</button>
                    </div>
                    <div className="cf">
                      <div className="ct">
                        {food.name}
                        {admin ? <small>{fmt(food.price)}</small> : null}
                      </div>
                      <button className="pen" type="button" aria-label={'Modifier ' + food.name} onClick={async (e) => { e.stopPropagation(); if (await needAdmin()) setModal({ type: 'editFood', food }) }}>✎</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="bar">
              <div className="in">
                <div className="tot"><small>Montant final de la session</small><b>{fmt(sessionTotal)}</b></div>
                <button className="btn line" type="button" onClick={clearSession}>Vider</button>
                <button className="btn" type="button" onClick={validate}>Valider</button>
              </div>
            </div>
          </>
        )}
      </>
    )
  } else if (view === 'person') {
    const who = person && person.id === cur ? person : null
    body = (
      <>
        <header className="top">
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <button className="back" type="button" onClick={() => setView('names')} aria-label="Retour">←</button>
            <div style={{ minWidth: 0 }}>
              <h1 className="grow">{who ? who.name : (current ? current.name : '')}</h1>
              <p>Bilan</p>
            </div>
          </div>
        </header>
        <div className="pad">
          {who && (
            <>
              <div className="actions">
                <button className="btn dark" type="button" onClick={() => openFoods(who.id)}>Nouvelle session (images)</button>
                <button className="btn out" type="button" onClick={() => setModal({ type: 'erase' })}>Effacer le bilan</button>
                {admin && <button className="btn out" type="button" onClick={() => setModal({ type: 'pay' })}>Enregistrer un paiement</button>}
              </div>
              {who.history.length === 0 ? <div className="empty">Aucun montant pour l'instant.</div> : (
                <div className="bil">
                  {who.history.map((entry, index) => (
                    <div className={entry.pay ? 'bl pay' : 'bl'} key={index}>
                      <b>{entry.pay ? '− ' + fmt(entry.amt) : fmt(entry.amt)}</b>
                      <small>
                        {entry.pay
                          ? (entry.label || 'Paiement') + ' · ' + when(entry.t)
                          : when(entry.t) + ' · ' + (entry.items || []).map((item) => item.n + ' ×' + item.q).join(', ')}
                      </small>
                    </div>
                  ))}
                </div>
              )}
              <div className="total"><span>Montant final =</span><b>{fmt(who.debt)}</b></div>
            </>
          )}
        </div>
      </>
    )
  } else if (view === 'adminfoods') {
    body = (
      <>
        <header className="top">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="back" type="button" onClick={() => setView('names')} aria-label="Retour">←</button>
            <div>
              <h1>Aliments</h1>
              <p>{foods.length} / {maxFoods}</p>
            </div>
          </div>
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
                  const data = await api.uploadPhotos(files)
                  setFoods(data.foods)
                  toast(data.message)
                } catch (err) { toast(err.message) }
              }} />
            </label>
            <button className="btn out" type="button" onClick={async () => {
              try {
                const data = await api.addFood()
                setFoods(data.foods)
              } catch (err) { toast(err.message) }
            }}>Ajouter sans photo</button>
          </div>
          <p style={{ fontWeight: 500, margin: '0 0 12px' }}>Touchez une photo pour la changer et saisissez le montant de chaque image (en F). « Ajouter des photos » remplit les places vides dans l'ordre : Image 1, Image 2, etc.</p>
          {foods.length === 0 && <div className="empty">Aucun aliment. Ajoutez vos photos pour commencer.</div>}
          {foods.map((food) => (
            <div className="frow" key={food.id}>
              <label className="thumb">
                {food.img ? <img src={media(food.img)} alt="" /> : <>Ajouter<br />photo</>}
                <input type="file" accept="image/*" hidden onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try {
                    const data = await api.uploadImage(food.id, file)
                    setFoods((list) => list.map((item) => item.id === food.id ? data.food : item))
                  } catch (err) { toast(err.message) }
                }} />
              </label>
              <div className="f">
                <input className="field" defaultValue={food.name} maxLength={30} placeholder="Nom" onBlur={async (e) => {
                  try { await api.updateFood(food.id, { name: e.target.value }) } catch (err) { toast(err.message) }
                }} />
                <input className="field" type="number" inputMode="numeric" min="0" defaultValue={food.price} placeholder="Montant FCFA" onBlur={async (e) => {
                  try {
                    const data = await api.updateFood(food.id, { price: e.target.value })
                    setFoods((list) => list.map((item) => item.id === food.id ? data.food : item))
                  } catch (err) { toast(err.message) }
                }} />
              </div>
              <button className="icon" style={{ height: 64 }} type="button" aria-label="Supprimer" onClick={() => setModal({
                type: 'confirm',
                message: 'Supprimer « ' + food.name + ' » ?',
                label: 'Supprimer',
                onYes: async () => {
                  setModal(null)
                  try {
                    const data = await api.deleteFood(food.id)
                    setFoods(data.foods)
                  } catch (err) { toast(err.message) }
                },
              })}>✕</button>
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      {body}
      {modal?.type === 'choose' && (
        <Sheet onClose={closeModal}>
          <h3>{modal.person.name}</h3>
          <p>Bilan actuel : <b>{fmt(modal.person.debt)}</b></p>
          <button className="btn dark" style={{ width: '100%', marginBottom: 10 }} type="button" onClick={() => openPerson(modal.person.id)}>Voir le bilan</button>
          <button className="btn out" style={{ width: '100%' }} type="button" onClick={() => openFoods(modal.person.id)}>Nouvelle session (images)</button>
        </Sheet>
      )}
      {modal?.type === 'confirm' && (
        <Sheet onClose={closeModal}>
          <h3>Confirmer</h3>
          <p>{modal.message}</p>
          <div className="btns">
            <button className="btn out" type="button" onClick={closeModal}>Annuler</button>
            <button className="btn danger" type="button" onClick={modal.onYes}>{modal.label || 'Confirmer'}</button>
          </div>
        </Sheet>
      )}
      {modal?.type === 'code' && (
        <FieldModal
          title={modal.title}
          text={modal.text}
          placeholder={modal.placeholder}
          maxLength={modal.maxLength}
          inputMode="numeric"
          submitLabel={modal.submitLabel}
          onClose={modal.onCancel || closeModal}
          onSubmit={modal.onSubmit}
        />
      )}
      {modal?.type === 'addNames' && <AddNames room={maxNames - names.length} onClose={closeModal} onDone={(data) => { setNames(data.names); setModal(null); toast(data.message) }} />}
      {modal?.type === 'rename' && (
        <FieldModal
          title="Modifier le nom"
          type="text"
          initial={modal.person.name}
          placeholder="Nom"
          maxLength={40}
          submitLabel="Enregistrer"
          onClose={closeModal}
          onSubmit={async (name) => {
            if (!name.trim()) throw new Error('Le nom ne peut pas être vide.')
            const data = await api.rename(modal.person.id, name)
            setNames(data.names)
            if (person?.id === modal.person.id) setPerson({ ...person, name: name.trim() })
            setModal(null)
          }}
        />
      )}
      {modal?.type === 'changeCode' && (
        <FieldModal
          title="Changer le code"
          text="Nouveau code (4 chiffres) :"
          placeholder="4 chiffres"
          maxLength={4}
          inputMode="numeric"
          submitLabel="Enregistrer"
          onClose={closeModal}
          onSubmit={async (code) => {
            const data = await api.changeCode(code)
            setModal(null)
            toast(data.message || 'Code modifié.')
          }}
        />
      )}
      {modal?.type === 'erase' && person && (
        <FieldModal
          title="Effacer le bilan"
          text={'Le bilan de ' + person.name + ' (' + fmt(person.debt) + ') sera effacé définitivement. Entrez le code pour confirmer, sinon il reste inchangé.'}
          placeholder="Code"
          maxLength={8}
          inputMode="numeric"
          submitLabel="Effacer"
          danger
          onClose={closeModal}
          onSubmit={async (code) => {
            const data = await api.erase(person.id, code)
            setPerson(data)
            setNames((list) => list.map((n) => n.id === data.id ? { ...n, debt: data.debt } : n))
            setModal(null)
            toast('Bilan effacé.')
          }}
        />
      )}
      {modal?.type === 'pay' && (
        <FieldModal
          title="Enregistrer un paiement"
          text="Montant payé en FCFA :"
          placeholder="Ex : 5000"
          type="number"
          inputMode="numeric"
          submitLabel="Enregistrer"
          onClose={closeModal}
          onSubmit={async (amount) => {
            const data = await api.pay(cur, amount)
            setPerson(data)
            setNames((list) => list.map((n) => n.id === data.id ? { ...n, debt: data.debt } : n))
            setModal(null)
          }}
        />
      )}
      {modal?.type === 'editFood' && (
        <EditFood
          food={foods.find((f) => f.id === modal.food.id) || modal.food}
          onClose={closeModal}
          onSaved={(food) => setFoods((list) => list.map((item) => item.id === food.id ? food : item))}
          toast={toast}
        />
      )}
      {modal?.type === 'install' && (
        <Sheet dialog onClose={closeModal}>
          <img className="flag" src="/flag.png" alt="Drapeau du Gabon" />
          <h3>Afficher le drapeau sur votre écran</h3>
          <p>Touchez <b>Installer</b>, puis confirmez : le drapeau de Lessy aimé Rodrigue s'ajoute sur l'écran de votre téléphone.</p>
          <div className="btns">
            <button className="btn dark" type="button" onClick={() => {
              setModal(null)
              const prompt = deferredInstall.current
              if (prompt) {
                deferredInstall.current = null
                prompt.prompt()
                return
              }
              const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
              setModal({ type: 'installHelp', ios })
            }}>Installer</button>
            <button className="btn out" type="button" onClick={closeModal}>Plus tard</button>
          </div>
        </Sheet>
      )}
      {modal?.type === 'installHelp' && (
        <Sheet dialog onClose={closeModal}>
          <img src="/icon192.png" alt="" />
          <h3>Installer Lessy aimé Rodrigue</h3>
          <p className="steps" dangerouslySetInnerHTML={{ __html: modal.ios
            ? '1. Touchez le bouton <b>Partager</b> en bas de Safari.<br>2. Touchez <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.'
            : '1. Touchez le menu <b>⋮</b> en haut à droite du navigateur.<br>2. Touchez <b>Installer l\'application</b> (ou <b>Ajouter à l\'écran d\'accueil</b>), puis confirmez.' }} />
          <div className="btns">
            <button className="btn dark" type="button" onClick={() => { localStorage.setItem('lessy_install_dismissed', '1'); closeModal() }}>Compris</button>
          </div>
        </Sheet>
      )}
      <div id="toast" className={toastOn ? 'on' : ''}>{toastMsg}</div>
    </>
  )
}

function LockForm({ onSubmit }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  async function go() {
    try {
      await onSubmit(code)
    } catch (e) {
      setErr(e.message || 'Code incorrect.')
      setCode('')
    }
  }
  return (
    <>
      <input ref={ref} className="field" type="password" inputMode="numeric" maxLength={6} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
      <div className="err">{err}</div>
      <button className="btn dark" type="button" onClick={go}>Déverrouiller</button>
    </>
  )
}

function AddNames({ room, onClose, onDone }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  return (
    <Sheet onClose={onClose}>
      <h3>Ajouter des noms</h3>
      <p>Un nom par ligne. Vous pouvez en coller plusieurs d'un coup ({room} places restantes).</p>
      <textarea className="field" placeholder={'Ex :\nMarie\nJean Paul\nAïcha'} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className="btn dark" type="button" onClick={async () => {
          try { onDone(await api.addNames(text)) } catch (e) { setErr(e.message) }
        }}>Ajouter</button>
      </div>
    </Sheet>
  )
}

function EditFood({ food, onClose, onSaved, toast }) {
  const [name, setName] = useState(food.name)
  const [price, setPrice] = useState(String(food.price))
  return (
    <Sheet onClose={onClose}>
      <h3>Modifier l'image</h3>
      <label className="btn dark" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
        Changer la photo
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            const data = await api.uploadImage(food.id, file)
            onSaved(data.food)
          } catch (err) { toast(err.message) }
        }} />
      </label>
      <p>Nom :</p>
      <input className="field" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 12 }} />
      <p>Montant de cette image (en F) :</p>
      <input className="field" type="number" inputMode="numeric" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className="btn dark" type="button" onClick={async () => {
          try {
            const data = await api.updateFood(food.id, { name, price })
            onSaved(data.food)
            onClose()
          } catch (err) { toast(err.message) }
        }}>Enregistrer</button>
      </div>
    </Sheet>
  )
}
