// Espace client : boutiques suivies, catalogue et commande (même hors ligne),
// suivi des commandes, bons et paiements, messages des boutiques.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as store from './store'
import { Sheet, fmt, when, Bilan, ChangeCode } from './App.jsx'
import { Drawer, MenuButton, StatusPill, Avatar, ago, OrderItems, Offline } from './Shop.jsx'

const STEPS = ['envoyee', 'acceptee', 'prete', 'livree']

export default function Customer({ s }) {
  const [view, setView] = useState('home') // home | shop | orders | bons | messages | account
  const [shopId, setShopId] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const [adding, setAdding] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const toastTimer = useRef(null)

  function toast(message) {
    setToastMsg(message)
    setToastOn(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastOn(false), 3000)
  }

  useEffect(() => { window.scrollTo(0, 0) }, [view, shopId])
  useEffect(() => {
    const t = setInterval(() => store.pollCommerce(), 20000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (s.notice) { toast(s.notice.text); store.clearNotice() }
  }, [s.notice])

  const c = s.commerce
  const shops = useMemo(() => (c?.shops || []).map((sh) => ({
    ...sh, owing: store.ledger(sh.entries || []).reduce((a, b) => a + b.remaining, 0),
  })), [c])
  const orders = store.customerOrders()
  const unread = (c?.messages || []).filter((m) => !m.read).length
  const active = orders.filter((o) => ['attente', 'envoyee', 'acceptee', 'prete'].includes(o.status)).length
  const totalOwing = shops.reduce((a, sh) => a + sh.owing, 0)
  const shop = shops.find((x) => x.id === shopId)
  const first = (s.account?.name || '').split(' ')[0]

  const items = [
    { key: 'home', icon: '🏪', label: 'Mes boutiques' },
    { key: 'orders', icon: '🛍️', label: 'Mes commandes', badge: active },
    { key: 'bons', icon: '📒', label: 'Mes bons' },
    { key: 'messages', icon: '💬', label: 'Messages', badge: unread },
    { key: 'sep', sep: true, label: 'Compte' },
    { key: 'account', icon: '👤', label: 'Mon compte' },
  ]

  const back = <button className="back" type="button" onClick={() => setView('home')} aria-label="Retour">‹</button>
  let body = null

  if (view === 'home') {
    body = (
      <>
        <header className="top">
          <MenuButton onClick={() => setDrawer(true)} badge={unread} />
          <div className="grow"><h1>Ardoise241</h1><p>Bonjour {first || s.account?.phone} 👋</p></div>
        </header>
        <Offline s={s} />
        <div className="pad">
          <div className="kpis">
            <button type="button" onClick={() => setView('orders')}><small>Commandes en cours</small><b>{active}</b></button>
            <button type="button" onClick={() => setView('bons')} className={totalOwing > 0 ? 'hl' : ''}><small>Je dois</small><b>{fmt(totalOwing)}</b></button>
            <button type="button" onClick={() => setView('messages')}><small>Messages</small><b>{unread ? unread + ' nouv.' : (c?.messages || []).length}</b></button>
          </div>
          <h3 className="sect">Mes boutiques</h3>
          {!c && <div className="empty">Connexion à internet nécessaire la première fois pour charger vos boutiques.</div>}
          {c && shops.length === 0 && (
            <div className="empty">Ajoutez la boutique où vous faites vos courses : vous verrez ses articles, vous pourrez commander et suivre vos bons.</div>
          )}
          <div className="shops">
            {shops.map((sh) => (
              <button className="shopcard card" type="button" key={sh.id} onClick={() => { setShopId(sh.id); setView('shop') }}>
                <span className="cover">{sh.catalog.slice(0, 3).map((f) => {
                  const url = store.imageUrl(sh.id, f)
                  return url ? <img key={f.uid} src={url} alt="" loading="lazy" /> : <span key={f.uid}>🛒</span>
                })}{sh.catalog.length === 0 && <span>🏪</span>}</span>
                <span className="sbody">
                  <b>{sh.name}</b>
                  <small>{sh.catalog.length} article(s) · {sh.status === 'client' ? 'Client' : 'Nouveau'}</small>
                  {sh.owing > 0 ? <span className="due">Je dois {fmt(sh.owing)}</span> : <span className="go">Commander ›</span>}
                </span>
              </button>
            ))}
          </div>
          <button className="addshop" type="button" onClick={() => setAdding(true)}>＋ Ajouter une boutique</button>
        </div>
      </>
    )
  } else if (view === 'shop' && shop) {
    body = <ShopCatalog s={s} shop={shop} back={() => setView('home')} toast={toast} openBons={() => setView('bons')} afterOrder={() => setView('orders')} />
  } else if (view === 'orders') {
    body = (
      <>
        <header className="top">{back}<div className="grow"><h1>Mes commandes</h1><p>{active} en cours</p></div></header>
        <Offline s={s} />
        <div className="pad">
          {orders.length === 0 && <div className="empty">Aucune commande. Ouvrez une boutique pour commander.</div>}
          {orders.map((o) => <CustomerOrder key={o.uid} o={o} toast={toast} />)}
        </div>
      </>
    )
  } else if (view === 'bons') {
    body = <MyBons shops={shops} back={back} />
  } else if (view === 'messages') {
    body = <MyMessages s={s} back={back} />
  } else if (view === 'account') {
    body = <Account s={s} back={back} toast={toast} />
  } else {
    body = null
    setTimeout(() => setView('home'))
  }

  return (
    <>
      {body}
      {drawer && (
        <Drawer title="Ardoise241" subtitle={(s.account?.name || '') + ' · espace client'} items={items} current={view}
          onPick={setView} onClose={() => setDrawer(false)}
          footer={<button type="button" className="dadd" onClick={() => { setDrawer(false); setAdding(true) }}>＋ Ajouter une boutique</button>} />
      )}
      {adding && <AddShop onClose={() => setAdding(false)} toast={toast} onOpen={(id) => { setAdding(false); setShopId(id); setView('shop') }} />}
      <div id="toast" className={toastOn ? 'on' : ''}>{toastMsg}</div>
    </>
  )
}

function AddShop({ onClose, toast, onOpen }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    let live = true
    const t = setTimeout(async () => {
      try {
        const res = await store.searchShops(q)
        if (live) { setList(res); setErr('') }
      } catch (e) { if (live) setErr(e.status === 0 ? 'Il faut internet pour chercher une boutique.' : e.message) }
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  return (
    <Sheet onClose={onClose}>
      <h3>Ajouter une boutique</h3>
      <input className="search" type="search" placeholder="Nom de la boutique" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="err">{err}</div>
      {list && list.length === 0 && <div className="empty">Aucune boutique ne s'appelle « {q} ».</div>}
      <div className="clist">
        {(list || []).map((sh) => (
          <div className="crow card" key={sh.id}>
            <Avatar name={sh.name} />
            <span className="grow"><b>{sh.name}</b><small>{sh.articles} article(s) · tél. {sh.hint}</small></span>
            {sh.followed
              ? <button className="btn out sm" type="button" onClick={() => onOpen(sh.id)}>Ouvrir</button>
              : <button className="btn dark sm" type="button" disabled={busy === sh.id} onClick={async () => {
                  setBusy(sh.id)
                  try { await store.followShop(sh); toast(sh.name + ' ajoutée à vos boutiques.'); onOpen(sh.id) } catch (e) { setErr(e.message) } finally { setBusy(null) }
                }}>Ajouter</button>}
          </div>
        ))}
      </div>
    </Sheet>
  )
}

function ShopCatalog({ s, shop, back, toast, openBons, afterOrder }) {
  const [counts, setCounts] = useState({})
  const [confirm, setConfirm] = useState(false)
  const [menu, setMenu] = useState(false)
  const [q, setQ] = useState('')
  const total = shop.catalog.reduce((a, f) => a + (counts[f.uid] || 0) * f.price, 0)
  const n = Object.values(counts).reduce((a, b) => a + b, 0)
  const query = q.trim().toLowerCase()
  const list = query ? shop.catalog.filter((f) => f.name.toLowerCase().includes(query)) : shop.catalog
  const add = (uid, d) => setCounts((c) => {
    const next = { ...c, [uid]: Math.max(0, (c[uid] || 0) + d) }
    if (!next[uid]) delete next[uid]
    return next
  })
  return (
    <>
      <header className="top">
        <button className="back" type="button" onClick={back} aria-label="Retour">‹</button>
        <div className="grow"><h1>{shop.name}</h1><p>{shop.owing > 0 ? 'Je dois ' + fmt(shop.owing) : shop.catalog.length + ' article(s)'}</p></div>
        <button className="ghost" type="button" onClick={() => setMenu(true)}>•••</button>
      </header>
      <Offline s={s} />
      {shop.catalog.length > 6 && <div className="pad" style={{ paddingBottom: 0 }}><input className="search" type="search" placeholder="Chercher un article" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      {shop.catalog.length === 0 && <div className="pad"><div className="empty">Cette boutique n'a pas encore mis ses articles en ligne.</div></div>}
      <div className="grid">
        {list.map((f) => {
          const k = counts[f.uid] || 0
          const url = store.imageUrl(shop.id, f)
          return (
            <div className={k ? 'tile on' : 'tile'} key={f.uid} onClick={() => add(f.uid, 1)}>
              <div className="ph">
                {url ? <img src={url} alt="" loading="lazy" /> : <span className="cam">🛒</span>}
                <i className="badge">×{k}</i>
                <button className="minus" type="button" aria-label="Retirer un" onClick={(e) => { e.stopPropagation(); add(f.uid, -1) }}>−</button>
              </div>
              <div className="cf"><div className="ct">{f.name}<small>{fmt(f.price)}</small></div></div>
            </div>
          )
        })}
      </div>
      <div className="bar">
        <div className="in">
          <div className="tot"><small>{n} article(s)</small><b>{fmt(total)}</b></div>
          <button className="btn line" type="button" onClick={() => setCounts({})}>Effacer</button>
          <button className="btn" type="button" onClick={() => (n ? setConfirm(true) : toast('Touchez les articles à commander.'))}>Commander</button>
        </div>
      </div>
      {confirm && (
        <ConfirmOrder shop={shop} counts={counts} total={total} onClose={() => setConfirm(false)}
          onDone={(offline) => { setCounts({}); setConfirm(false); toast(offline ? 'Commande enregistrée : elle partira dès que vous serez connecté.' : 'Commande envoyée à ' + shop.name + ' !'); afterOrder() }} />
      )}
      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <h3>{shop.name}</h3>
          {shop.phone && <a className="btn out wide" href={'tel:' + shop.phone} style={{ marginBottom: 10 }}>📞 Appeler la boutique</a>}
          <button className="btn out wide" type="button" style={{ marginBottom: 10 }} onClick={() => { setMenu(false); openBons() }}>📒 Mes bons dans cette boutique</button>
          <button className="btn danger wide" type="button" onClick={async () => {
            try { await store.unfollowShop(shop.id); setMenu(false); toast('Boutique retirée.'); back() } catch (e) { toast(e.status === 0 ? 'Il faut internet pour retirer une boutique.' : e.message) }
          }}>Retirer de mes boutiques</button>
        </Sheet>
      )}
    </>
  )
}

function ConfirmOrder({ shop, counts, total, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const lines = shop.catalog.filter((f) => counts[f.uid] > 0).map((f) => ({ n: f.name, q: counts[f.uid], p: f.price }))
  return (
    <Sheet onClose={onClose}>
      <h3>Ma commande · {shop.name}</h3>
      <div className="ses"><OrderItems items={lines} /></div>
      <div className="total"><span>Total =</span><b>{fmt(total)}</b></div>
      <label className="lbl">Note pour la boutique (facultatif)</label>
      <textarea className="field" rows={2} maxLength={300} placeholder="Ex : je passe à 18 h, sans piment…" value={note} onChange={(e) => setNote(e.target.value)} />
      {!navigator.onLine && <p className="hint">📴 Hors ligne : la commande est gardée sur le téléphone et partira toute seule dès la connexion.</p>}
      <div className="err">{err}</div>
      <div className="btns">
        <button className="btn out" type="button" onClick={onClose}>Modifier</button>
        <button className="btn dark" type="button" onClick={async () => {
          try { const res = await store.placeOrder(shop, counts, note); onDone(!res.sent) } catch (e) { setErr(e.message) }
        }}>Envoyer la commande</button>
      </div>
    </Sheet>
  )
}

function CustomerOrder({ o, toast }) {
  const step = STEPS.indexOf(o.status)
  const closed = ['refusee', 'annulee'].includes(o.status)
  return (
    <article className={'order card st-' + o.status}>
      <div className="oh">
        <Avatar name={o.shop?.name} />
        <div className="grow"><b>{o.shop?.name}</b><small>{o.status === 'attente' ? '⏱ pas encore envoyée' : ago(o.at)}</small></div>
        <StatusPill status={o.status} />
      </div>
      {!closed && o.status !== 'attente' && (
        <ol className="track">
          {STEPS.map((st, i) => <li key={st} className={i <= step ? 'on' : ''}><i />{store.ORDER_STATUS[st]}</li>)}
        </ol>
      )}
      <OrderItems items={o.items} />
      {o.note && <p className="onote">« {o.note} »</p>}
      <div className="otot"><span>Total</span><b>{fmt(o.total)}</b></div>
      {o.status === 'livree' && <p className="ometa">{o.mode === 'bon' ? 'Mise dans mes bons' : 'Payée'}{o.statusAt ? ' · ' + when(o.statusAt) : ''}</p>}
      {(o.status === 'attente' || o.status === 'envoyee') && (
        <div className="oact">
          <button className="btn out sm" type="button" onClick={async () => { try { await store.cancelOrder(o.uid); toast('Commande annulée.') } catch (e) { toast(e.message) } }}>Annuler la commande</button>
        </div>
      )}
    </article>
  )
}

function MyBons({ shops, back }) {
  const withBons = shops.filter((sh) => (sh.entries || []).some((e) => !e.pay))
  const [pick, setPick] = useState(null)
  const cur = withBons.find((sh) => sh.id === pick) || withBons[0]
  return (
    <>
      <header className="top">{back}<div className="grow"><h1>Mes bons</h1><p>Je dois {fmt(shops.reduce((a, sh) => a + sh.owing, 0))} au total</p></div></header>
      <div className="pad">
        {withBons.length === 0 && <div className="empty">Aucun bon : vous ne devez rien. 🎉</div>}
        {withBons.length > 1 && (
          <div className="periods" role="tablist">
            {withBons.map((sh) => <button key={sh.id} type="button" className={cur?.id === sh.id ? 'on' : ''} onClick={() => setPick(sh.id)}>{sh.name}{sh.owing > 0 ? ' · ' + fmt(sh.owing) : ''}</button>)}
          </div>
        )}
        {cur && <>
          <div className="chero">
            <Avatar name={cur.name} tone={cur.owing > 0 ? 'due' : ''} />
            <div className="grow"><small>{cur.name} · reste à payer</small><b>{fmt(cur.owing)}</b></div>
          </div>
          <Bilan entries={cur.entries} />
          <p className="hint">Les paiements sont enregistrés par la boutique. Ils apparaissent ici avec leur date et leur heure.</p>
        </>}
      </div>
    </>
  )
}

function MyMessages({ s, back }) {
  const messages = s.commerce?.messages || []
  const unread = messages.filter((m) => !m.read).map((m) => m.id)
  const [fresh] = useState(() => new Set(unread)) // restent en évidence pendant cette visite
  useEffect(() => { if (unread.length) store.markMessagesRead(unread) }, [unread.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <header className="top">{back}<div className="grow"><h1>Messages</h1><p>Promotions et annonces de vos boutiques</p></div></header>
      <div className="pad">
        {messages.length === 0 && <div className="empty">Aucun message. Vos boutiques vous écriront ici (promotions, annonces).</div>}
        {messages.map((m) => (
          <article className={'msg card ' + m.kind + (fresh.has(m.id) ? ' new' : '')} key={m.id}>
            <div className="mh">
              <Avatar name={m.shop?.name} />
              <span className="grow"><b>{m.shop?.name}</b><small>{ago(m.at)}</small></span>
              {m.kind === 'promo' ? <span className="pill st-promo">Promo</span> : <span className="pill st-info">Info</span>}
            </div>
            <b className="mt">{m.title}</b>
            {m.body && <p>{m.body}</p>}
          </article>
        ))}
      </div>
    </>
  )
}

function Account({ s, back, toast }) {
  const [code, setCode] = useState(false)
  const [out, setOut] = useState(false)
  return (
    <>
      <header className="top">{back}<div className="grow"><h1>Mon compte</h1><p>Espace client</p></div></header>
      <div className="pad">
        <div className="chero">
          <Avatar name={s.account?.name} />
          <div className="grow"><small>{s.account?.phone}</small><b>{s.account?.name}</b></div>
        </div>
        <button className="btn out wide" type="button" style={{ marginBottom: 10 }} onClick={() => setCode(true)}>Changer mon code</button>
        <button className="btn danger wide" type="button" onClick={() => setOut(true)}>Se déconnecter</button>
        <p className="hint">Vos commandes et vos bons sont gardés en ligne : reconnectez-vous avec votre numéro et votre code pour tout retrouver.</p>
      </div>
      {code && <ChangeCode onClose={() => setCode(false)} toast={toast} />}
      {out && (
        <Sheet onClose={() => setOut(false)}>
          <h3>Se déconnecter ?</h3>
          <p>{s.outbox.length ? s.outbox.length + ' envoi(s) ne sont pas encore partis et seront perdus. ' : ''}Vous pourrez vous reconnecter avec votre numéro et votre code.</p>
          <div className="btns">
            <button className="btn out" type="button" onClick={() => setOut(false)}>Annuler</button>
            <button className="btn danger" type="button" onClick={() => store.logout()}>Se déconnecter</button>
          </div>
        </Sheet>
      )}
    </>
  )
}
