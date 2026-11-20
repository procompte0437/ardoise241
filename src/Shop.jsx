// Espace commerçant : menu latéral, commandes des clients, suivi des clients et messages.
import { useEffect, useMemo, useState } from 'react'
import * as store from './store'
import { Sheet, fmt, when, hour, dayLabel, useBackClose } from './App.jsx'

// ------------------------------------------------------------------ menu latéral

/**
 * Menu latéral (tiroir) : glisse depuis la gauche par-dessus la page, icône et
 * libellé côte à côte. Il se referme dès qu'on choisit un élément, en touchant le
 * fond sombre ou avec le bouton retour du téléphone.
 */
export function SideNav({ title, subtitle, items, current, onPick, onHide, footer }) {
  useBackClose(onHide)
  return (
    <div className="sidenav-ov" onClick={(e) => { if (e.target === e.currentTarget) onHide() }}>
      <nav className="sidenav" aria-label="Menu">
        <div className="dh">
          <img className="dflag" src="/flag.png" alt="" />
          <div className="dt"><b>{title}</b><small>{subtitle}</small></div>
        </div>
        <ul>
          {items.map((it) => it.sep
            ? <li key={it.key} className="dsep">{it.label}</li>
            : (
              <li key={it.key}>
                <button type="button" className={current === it.key ? 'on' : ''} onClick={() => { onHide(); onPick(it.key) }}>
                  <span className="di">{it.icon}</span>
                  <span className="dl">{it.label}</span>
                  {it.badge > 0 && <span className="dbadge">{it.badge}</span>}
                </button>
              </li>
            ))}
        </ul>
        {footer && <div className="dfoot" onClick={onHide}>{footer}</div>}
      </nav>
    </div>
  )
}

/** Menu ouvert ou fermé : il est toujours fermé à l'ouverture de l'appli. */
// eslint-disable-next-line no-unused-vars
export function useNavOpen(key) {
  return useState(false)
}

export function MenuButton({ onClick, badge }) {
  return (
    <button className="menu" type="button" onClick={onClick} aria-label="Ouvrir le menu">
      <span /><span /><span />
      {badge > 0 && <i>{badge}</i>}
    </button>
  )
}

export function StatusPill({ status }) {
  return <span className={'pill st-' + status}>{store.ORDER_STATUS[status] || status}</span>
}

/** « depuis aujourd'hui », « depuis hier », « depuis le 3 oct. 2026 ». */
function since(t) {
  if (!t) return ''
  const l = dayLabel(t)
  if (l === "Aujourd'hui") return "depuis aujourd'hui"
  if (l === 'Hier') return 'depuis hier'
  return 'depuis le ' + new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export function Avatar({ name, tone }) {
  return <span className={'avatar ' + (tone || '')}>{initials(name)}</span>
}

/** « il y a 5 min », « hier à 14:02 »… */
export function ago(t) {
  const d = Date.now() - t
  if (d < 60000) return "à l'instant"
  if (d < 3600000) return 'il y a ' + Math.floor(d / 60000) + ' min'
  if (d < 6 * 3600000) return 'il y a ' + Math.floor(d / 3600000) + ' h'
  return when(t)
}

export function OrderItems({ items }) {
  return (
    <ul className="its">
      {items.map((it, i) => (
        <li key={i}><span>{it.n}</span><span className="q">×{it.q}</span><span className="u">{'à ' + fmt(it.p)}</span><span className="p">{fmt(it.p * it.q)}</span></li>
      ))}
    </ul>
  )
}

export function Offline({ s }) {
  if (s.sync.online && !s.outbox.length) return null
  return (
    <div className="offline">
      {s.sync.online
        ? <>⏳ {s.outbox.length} envoi(s) en cours…</>
        : <>📴 Hors ligne{s.outbox.length ? ' · ' + s.outbox.length + ' envoi(s) partiront à la connexion' : ' · vos données restent consultables'}</>}
    </div>
  )
}

// ------------------------------------------------------------------ commandes

const ORDER_TABS = [
  { key: 'new', label: 'Nouvelles', match: (o) => o.status === 'envoyee' },
  { key: 'doing', label: 'En cours', match: (o) => o.status === 'acceptee' || o.status === 'prete' },
  { key: 'done', label: 'Terminées', match: (o) => ['livree', 'refusee', 'annulee'].includes(o.status) },
]

export function OrdersView({ s, back, toast }) {
  const orders = s.commerce?.orders || []
  const [tab, setTab] = useState(() => (orders.some((o) => o.status === 'envoyee') ? 'new' : orders.some((o) => o.status === 'acceptee' || o.status === 'prete') ? 'doing' : 'new'))
  const [deliver, setDeliver] = useState(null)
  const [refuse, setRefuse] = useState(null)
  const shown = orders.filter(ORDER_TABS.find((t) => t.key === tab).match)

  async function act(order, status, message) {
    try { await store.setOrderStatus(order, status); toast(message) } catch (e) { toast(e.message) }
  }

  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>Commandes</h1><p>{orders.filter((o) => o.status === 'envoyee').length} nouvelle(s) · {orders.filter((o) => o.status === 'acceptee' || o.status === 'prete').length} en cours</p></div>
      </header>
      <Offline s={s} />
      <div className="pad">
        <div className="periods" role="tablist">
          {ORDER_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label} ({orders.filter(t.match).length})
            </button>
          ))}
        </div>
        {!s.commerce && <div className="empty">Connectez-vous à internet une première fois pour recevoir les commandes.</div>}
        {s.commerce && shown.length === 0 && (
          <div className="empty">{tab === 'new' ? 'Aucune nouvelle commande. Elles arrivent ici dès qu\'un client commande.' : tab === 'doing' ? 'Aucune commande en préparation.' : 'Aucune commande terminée.'}</div>
        )}
        {shown.map((o) => (
          <article className={'order card st-' + o.status} key={o.id}>
            <div className="oh">
              <Avatar name={o.customer?.name} />
              <div className="grow">
                <b>{o.customer?.name}</b>
                <small>{ago(o.at)}{o.customer?.phone ? ' · ' + o.customer.phone : ''}</small>
              </div>
              <StatusPill status={o.status} />
            </div>
            <OrderItems items={o.items} />
            {o.note && <p className="onote">« {o.note} »</p>}
            <div className="otot"><span>Total</span><b>{fmt(o.total)}</b></div>
            {o.status === 'livree' && <p className="ometa">{o.mode === 'bon' ? 'Mise en bon au nom du client' : 'Encaissée'} · {when(o.statusAt)}</p>}
            <div className="oact">
              {o.customer?.phone && <a className="btn out sm" href={'tel:' + o.customer.phone}>Appeler</a>}
              {o.status === 'envoyee' && <>
                <button className="btn out sm" type="button" onClick={() => setRefuse(o)}>Refuser</button>
                <button className="btn dark sm" type="button" onClick={() => act(o, 'acceptee', 'Commande acceptée : le client est prévenu.')}>Accepter</button>
              </>}
              {o.status === 'acceptee' && <button className="btn out sm" type="button" onClick={() => act(o, 'prete', 'Commande prête : le client est prévenu.')}>Prête</button>}
              {(o.status === 'acceptee' || o.status === 'prete') && <button className="btn dark sm" type="button" onClick={() => setDeliver(o)}>Livrer</button>}
            </div>
          </article>
        ))}
      </div>
      {deliver && <DeliverSheet order={deliver} onClose={() => setDeliver(null)} toast={toast} />}
      {refuse && (
        <Sheet onClose={() => setRefuse(null)}>
          <h3>Refuser la commande ?</h3>
          <p>{refuse.customer?.name} sera prévenu que sa commande de {fmt(refuse.total)} est refusée.</p>
          <div className="btns">
            <button className="btn out" type="button" onClick={() => setRefuse(null)}>Annuler</button>
            <button className="btn danger" type="button" onClick={async () => { await act(refuse, 'refusee', 'Commande refusée.'); setRefuse(null) }}>Refuser</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Livraison : le client paie tout (encaissé) ou la commande va dans son bon, avec une avance possible. */
function DeliverSheet({ order, onClose, toast }) {
  const [mode, setMode] = useState('cash')
  const [paid, setPaid] = useState('')
  const [busy, setBusy] = useState(false)
  const cash = Math.min(order.total, Math.max(0, Number(paid) || 0))
  return (
    <Sheet onClose={onClose}>
      <h3>Livrer à {order.customer?.name}</h3>
      <div className="ses"><OrderItems items={order.items} /></div>
      <div className="total"><span>Total =</span><b>{fmt(order.total)}</b></div>
      <div className="seg" role="radiogroup">
        <button type="button" role="radio" aria-checked={mode === 'cash'} className={mode === 'cash' ? 'on' : ''} onClick={() => setMode('cash')}>💵 Payé · encaissé</button>
        <button type="button" role="radio" aria-checked={mode === 'bon'} className={mode === 'bon' ? 'on' : ''} onClick={() => setMode('bon')}>📒 Mettre en bon</button>
      </div>
      {mode === 'bon' && <>
        <label className="lbl">Payé à la livraison (facultatif)</label>
        <input className="field" type="number" inputMode="numeric" min="0" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
        <p className="hint">Reste en bon : <b>{fmt(order.total - cash)}</b>, au nom de {order.customer?.name}.</p>
      </>}
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className="btn dark" type="button" disabled={busy} onClick={async () => {
          setBusy(true)
          try {
            await store.deliverOrder(order, mode, paid)
            onClose()
            toast(mode === 'bon' ? fmt(order.total - cash) + ' mis en bon pour ' + order.customer?.name : 'Encaissé : ' + fmt(order.total))
          } catch (e) { toast(e.message) } finally { setBusy(false) }
        }}>Confirmer la livraison</button>
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ clients

function useCustomers(s) {
  const debts = useMemo(() => store.debts(s.entries), [s.entries])
  return useMemo(() => {
    const list = s.commerce?.customers || []
    const orders = s.commerce?.orders || []
    return list.map((c) => {
      const mine = s.entries.filter((e) => e.person === c.person)
      const lastEntry = mine.filter((e) => !e.pay).reduce((m, e) => Math.max(m, e.at), 0)
      const lastOrder = orders.filter((o) => o.customer?.id === c.id && o.status === 'livree').reduce((m, o) => Math.max(m, o.at), 0)
      return { ...c, owing: debts[c.person] || 0, last: Math.max(lastEntry, lastOrder) || null }
    }).sort((a, b) => (b.owing - a.owing) || ((b.last || b.since || 0) - (a.last || a.since || 0)))
  }, [s.commerce, s.entries, debts])
}

const CLIENT_TABS = [
  { key: 'all', label: 'Tous', match: () => true },
  { key: 'owe', label: 'Doivent', match: (c) => c.owing > 0 },
  { key: 'ok', label: 'À jour', match: (c) => c.status === 'client' && c.owing <= 0 },
  { key: 'prospect', label: 'Prospects', match: (c) => c.status === 'prospect' },
]

export function ClientsView({ s, back, open }) {
  const customers = useCustomers(s)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = customers.filter(CLIENT_TABS.find((t) => t.key === tab).match)
    .filter((c) => !query || (c.name || '').toLowerCase().includes(query) || (c.phone || '').includes(query.replace(/\s/g, '')))
  const clients = customers.filter((c) => c.status === 'client')
  const due = customers.reduce((a, c) => a + c.owing, 0)
  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>Mes clients</h1><p>{clients.length} client(s) · {customers.length - clients.length} prospect(s)</p></div>
      </header>
      <Offline s={s} />
      <div className="pad">
        <div className="kpis">
          <div><small>Clients</small><b>{clients.length}</b></div>
          <div><small>Prospects</small><b>{customers.length - clients.length}</b></div>
          <div className="hl"><small>Total dû</small><b>{fmt(due)}</b></div>
        </div>
        <p className="hint">Un prospect a choisi votre boutique dans son application ; il devient client à son premier achat.</p>
        <input className="search" type="search" placeholder="Chercher un nom ou un numéro" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="periods" role="tablist">
          {CLIENT_TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label} ({customers.filter(t.match).length})</button>
          ))}
        </div>
        {!s.commerce && <div className="empty">Connectez-vous à internet une première fois pour voir vos clients.</div>}
        {s.commerce && customers.length === 0 && <div className="empty">Aucun client pour l'instant. Dites à vos clients d'installer Ardoise241 et de chercher « {s.account?.name || 'votre boutique'} ».</div>}
        {s.commerce && customers.length > 0 && shown.length === 0 && <div className="empty">Personne dans cette liste.</div>}
        <div className="clist">
          {shown.map((c) => (
            <button className="crow card" type="button" key={c.id} onClick={() => open(c.id)}>
              <Avatar name={c.name} tone={c.status === 'prospect' ? 'pro' : c.owing > 0 ? 'due' : ''} />
              <span className="grow">
                <b>{c.name}</b>
                <small>{c.status === 'prospect' ? 'Prospect ' + since(c.since) : c.last ? 'Dernier achat : ' + when(c.last) : 'Client'}</small>
              </span>
              {c.owing > 0 ? <span className="due">{fmt(c.owing)}</span> : <span className={'pill ' + (c.status === 'prospect' ? 'st-prospect' : 'st-livree')}>{c.status === 'prospect' ? 'Prospect' : 'À jour'}</span>}
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

const SCALES = [
  { key: 'day', label: 'Jour' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
  { key: 'all', label: 'Tout' },
]

function rangeOf(scale, ref) {
  const d = new Date(ref)
  if (scale === 'day') { const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return [a.getTime(), new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()] }
  if (scale === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()]
  if (scale === 'year') return [new Date(d.getFullYear(), 0, 1).getTime(), new Date(d.getFullYear() + 1, 0, 1).getTime()]
  return [0, Number.MAX_SAFE_INTEGER]
}

function shift(scale, ref, dir) {
  const d = new Date(ref)
  if (scale === 'day') d.setDate(d.getDate() + dir)
  if (scale === 'month') d.setMonth(d.getMonth() + dir)
  if (scale === 'year') d.setFullYear(d.getFullYear() + dir)
  return d.getTime()
}

function rangeLabel(scale, ref) {
  const d = new Date(ref)
  if (scale === 'day') return dayLabel(ref)
  if (scale === 'month') return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase())
  if (scale === 'year') return String(d.getFullYear())
  return 'Depuis le début'
}

/** Fiche d'un client : ce qu'il doit, et son historique par jour, mois ou année. */
export function ClientView({ s, id, back, openBons }) {
  const customers = useCustomers(s)
  const c = customers.find((x) => x.id === id)
  const [scale, setScale] = useState('month')
  const [ref, setRef] = useState(Date.now())
  const events = useMemo(() => {
    if (!c) return []
    const list = s.entries.filter((e) => e.person === c.person).map((e) => ({
      key: e.uid, at: e.at, kind: e.pay ? 'pay' : 'buy', amount: e.amount, label: e.pay ? (e.label || 'Paiement') : (e.label === 'Commande' ? 'Commande en bon' : 'Achat en bon'), items: e.items,
    }))
    for (const o of s.commerce?.orders || []) {
      if (o.customer?.id !== c.id) continue
      if (o.status === 'livree' && o.mode === 'bon') continue // déjà dans ses bons
      list.push({ key: 'o' + o.id, at: o.at, kind: o.status === 'livree' ? 'cash' : 'order', amount: o.total, label: o.status === 'livree' ? 'Commande payée' : 'Commande · ' + store.ORDER_STATUS[o.status].toLowerCase(), items: o.items })
    }
    return list.sort((a, b) => b.at - a.at)
  }, [c, s.entries, s.commerce])

  if (!c) return <><header className="top"><button className="back" type="button" onClick={back} aria-label="Retour">‹</button><div className="grow"><h1>Client</h1></div></header><div className="pad"><div className="empty">Client introuvable.</div></div></>

  const [from, to] = rangeOf(scale, ref)
  const inRange = events.filter((e) => e.at >= from && e.at < to)
  const bought = inRange.filter((e) => e.kind === 'buy' || e.kind === 'cash').reduce((a, e) => a + e.amount, 0)
  const paid = inRange.filter((e) => e.kind === 'pay' || e.kind === 'cash').reduce((a, e) => a + e.amount, 0)
  const allBought = events.filter((e) => e.kind === 'buy' || e.kind === 'cash').reduce((a, e) => a + e.amount, 0)
  const groups = []
  for (const e of inRange) {
    const key = new Date(e.at).toDateString()
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) { g = { key, label: dayLabel(e.at), rows: [] }; groups.push(g) }
    g.rows.push(e)
  }

  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>{c.name}</h1><p>{c.status === 'prospect' ? 'Prospect' : 'Client'} · {since(c.since)}</p></div>
      </header>
      <div className="pad">
        <div className="chero">
          <Avatar name={c.name} tone={c.status === 'prospect' ? 'pro' : c.owing > 0 ? 'due' : ''} />
          <div className="grow">
            <small>{c.owing > 0 ? 'Doit encore' : c.status === 'prospect' ? 'Pas encore d\'achat' : 'À jour'}</small>
            <b>{fmt(c.owing)}</b>
          </div>
          {c.phone && <a className="btn out sm" href={'tel:' + c.phone}>Appeler</a>}
        </div>
        <div className="kpis">
          <div><small>Total acheté</small><b>{fmt(allBought)}</b></div>
          <div><small>Achats</small><b>{events.filter((e) => e.kind === 'buy' || e.kind === 'cash').length}</b></div>
          <div><small>Commandes</small><b>{(s.commerce?.orders || []).filter((o) => o.customer?.id === c.id).length}</b></div>
        </div>
        {s.people.some((p) => p.uid === c.person) && (
          <button className="btn dark wide" type="button" style={{ marginBottom: 14 }} onClick={() => openBons(c.person)}>Voir et payer ses bons</button>
        )}

        <h3 className="sect">Historique</h3>
        <div className="periods" role="tablist">
          {SCALES.map((x) => <button key={x.key} type="button" role="tab" aria-selected={scale === x.key} className={scale === x.key ? 'on' : ''} onClick={() => { setScale(x.key); setRef(Date.now()) }}>{x.label}</button>)}
        </div>
        {scale !== 'all' && (
          <div className="stepper">
            <button type="button" onClick={() => setRef(shift(scale, ref, -1))} aria-label="Période précédente">‹</button>
            <b>{rangeLabel(scale, ref)}</b>
            <button type="button" disabled={to > Date.now()} onClick={() => setRef(shift(scale, ref, 1))} aria-label="Période suivante">›</button>
          </div>
        )}
        <div className="kpis">
          <div><small>Acheté</small><b>{fmt(bought)}</b></div>
          <div><small>Payé</small><b>{fmt(paid)}</b></div>
          <div><small>Opérations</small><b>{inRange.length}</b></div>
        </div>
        {groups.length === 0 && <div className="empty">Rien sur cette période.</div>}
        {groups.map((g) => (
          <section className="day" key={g.key}>
            <h4><span>{g.label}</span></h4>
            {g.rows.map((e) => (
              <div className={'ev ' + e.kind} key={e.key}>
                <time>{hour(e.at)}</time>
                <span className="grow">
                  <b>{e.label}</b>
                  {e.items?.length > 0 && <small>{e.items.map((i) => i.q + ' × ' + i.n).join(', ')}</small>}
                </span>
                <b className="amt">{e.kind === 'pay' ? '− ' : ''}{fmt(e.amount)}</b>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ messages

export function MessagesView({ s, back, toast }) {
  const [compose, setCompose] = useState(false)
  const messages = s.commerce?.messages || []
  const clients = (s.commerce?.customers || []).filter((c) => c.status === 'client')
  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>Messages</h1><p>Promotions et annonces à vos clients</p></div>
      </header>
      <Offline s={s} />
      <div className="pad">
        <button className="newmsg" type="button" onClick={() => (clients.length ? setCompose(true) : toast('Vous n\'avez pas encore de client : un prospect devient client à son premier achat.'))}>
          <span>📣</span><b>Nouveau message</b><small>{clients.length} client(s) peuvent le recevoir</small>
        </button>
        {messages.length === 0 && <div className="empty">Aucun message envoyé.</div>}
        {messages.map((m) => (
          <article className={'msg card ' + m.kind} key={m.id}>
            <div className="mh">
              {m.kind === 'promo' ? <span className="pill st-promo">Promo</span> : <span className="pill st-info">Info</span>}
              <small>{m.pending ? '⏱ en attente d\'envoi' : ago(m.at)}</small>
            </div>
            <b>{m.title}</b>
            {m.body && <p>{m.body}</p>}
            <small className="mstat">Envoyé à {m.sent} client(s){m.pending ? '' : ' · lu par ' + m.read}</small>
          </article>
        ))}
      </div>
      {compose && <Compose clients={clients} prospects={(s.commerce?.customers || []).length - clients.length} onClose={() => setCompose(false)} toast={toast} />}
    </>
  )
}

function Compose({ clients, prospects, onClose, toast }) {
  const [kind, setKind] = useState('promo')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [off, setOff] = useState(() => new Set()) // clients décochés
  const [err, setErr] = useState('')
  const to = clients.filter((c) => !off.has(c.id)).map((c) => c.id)
  function toggle(id) {
    setOff((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  return (
    <Sheet onClose={onClose}>
      <h3>Nouveau message</h3>
      <div className="seg" role="radiogroup">
        <button type="button" role="radio" aria-checked={kind === 'promo'} className={kind === 'promo' ? 'on' : ''} onClick={() => setKind('promo')}>🏷️ Promotion</button>
        <button type="button" role="radio" aria-checked={kind === 'info'} className={kind === 'info' ? 'on' : ''} onClick={() => setKind('info')}>📢 Information</button>
      </div>
      <label className="lbl">Titre</label>
      <input className="field" maxLength={80} placeholder={kind === 'promo' ? 'Ex : -10 % sur le poulet ce soir' : 'Ex : Fermé dimanche'} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="lbl">Message</label>
      <textarea className="field" rows={3} maxLength={2000} placeholder="Votre message…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="rcp-h">
        <b>Destinataires · {to.length}/{clients.length}</b>
        <button type="button" onClick={() => setOff(off.size ? new Set() : new Set(clients.map((c) => c.id)))}>{off.size ? 'Tout cocher' : 'Tout décocher'}</button>
      </div>
      <div className="rcp">
        {clients.map((c) => (
          <label key={c.id} className={off.has(c.id) ? 'off' : ''}>
            <input type="checkbox" checked={!off.has(c.id)} onChange={() => toggle(c.id)} />
            <Avatar name={c.name} />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
      {prospects > 0 && <p className="hint">{prospects} prospect(s) ne reçoivent pas les messages : seuls vos clients les voient.</p>}
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Annuler</button>
        <button className="btn dark" type="button" onClick={async () => {
          setErr('')
          try {
            const sent = await store.sendShopMessage({ kind, title, body, to })
            onClose()
            toast(sent ? 'Message envoyé à ' + to.length + ' client(s).' : 'Message prêt : il partira dès la connexion.')
          } catch (e) { setErr(e.message) }
        }}>Envoyer</button>
      </div>
    </Sheet>
  )
}
