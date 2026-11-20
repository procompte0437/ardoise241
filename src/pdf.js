// Export PDF des fiches (cahier bon, bilan d'un client, commandes, inventaire,
// clients…). Tout est calculé sur le téléphone : marche aussi hors ligne.
// Sur Android le PDF est proposé au partage (WhatsApp, Drive, Fichiers…),
// dans un navigateur il est téléchargé.
import * as store from './store'

const DARK = [27, 23, 18]
const GOLD = [237, 190, 46]
const SOFT = [255, 243, 208]
const MUTED = [110, 100, 85]

// Les polices du PDF n'ont pas les espaces fines d'Intl : on formate nous-mêmes.
export function money(n) {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'
}

function clean(t) {
  return String(t ?? '').replace(/[  ]/g, ' ').replace(/[’]/g, "'").replace(/[«»]/g, '"')
    .replace(/[^\n\x20-\x7E -ÿŒœ€]/g, '').trim()
}

const pad = (n) => String(n).padStart(2, '0')
export function dateTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
export function dateOnly(t) {
  if (!t) return ''
  const d = new Date(t)
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear()
}
const stamp = () => { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) }
const slug = (t) => clean(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'fiche'

const itemsText = (items) => (items || []).map((it) => it.q + ' x ' + clean(it.n) + (it.p ? ' (' + money(it.p) + ')' : '')).join('\n')

// ------------------------------------------------------------------ document

async function newDoc(title, subtitle) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const s = store.getState()
  const W = doc.internal.pageSize.getWidth()
  const ctx = { doc, autoTable, W, y: 0, title }

  doc.setFillColor(...DARK)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(clean(s.account?.name || 'Ardoise241'), 14, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(clean((store.isCustomer() ? 'Espace client' : 'Commerçant') + ' · ' + (s.account?.phone || '')), 14, 19.5)
  doc.text('Édité le ' + dateTime(Date.now()), 14, 24.5)
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Ardoise241', W - 14, 13, { align: 'right' })

  doc.setTextColor(...DARK)
  doc.setFontSize(16)
  doc.text(clean(title), 14, 42)
  ctx.y = 42
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(clean(subtitle), 14, 48)
    ctx.y = 48
  }
  ctx.y += 6
  return ctx
}

function ensure(ctx, h) {
  const H = ctx.doc.internal.pageSize.getHeight()
  if (ctx.y + h > H - 18) { ctx.doc.addPage(); ctx.y = 18 }
}

function heading(ctx, text, extra) {
  ensure(ctx, 16)
  const { doc } = ctx
  ctx.y += 3
  doc.setFillColor(...GOLD)
  doc.rect(14, ctx.y - 4.5, 2, 6, 'F')
  doc.setTextColor(...DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.text(clean(text), 19, ctx.y)
  if (extra) {
    doc.setFontSize(11)
    doc.text(clean(extra), ctx.W - 14, ctx.y, { align: 'right' })
  }
  ctx.y += 4
}

/** Cartes de chiffres clés : [[libellé, valeur], …] */
function kpis(ctx, list) {
  const { doc, W } = ctx
  ensure(ctx, 22)
  const gap = 3
  const w = (W - 28 - gap * (list.length - 1)) / list.length
  list.forEach(([label, value], i) => {
    const x = 14 + i * (w + gap)
    const main = i === 0
    doc.setFillColor(...(main ? DARK : SOFT))
    doc.setDrawColor(...DARK)
    doc.roundedRect(x, ctx.y, w, 17, 2.5, 2.5, main ? 'F' : 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...(main ? GOLD : MUTED))
    doc.text(clean(label), x + 3, ctx.y + 5.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...(main ? GOLD : DARK))
    doc.text(clean(value), x + 3, ctx.y + 13)
  })
  ctx.y += 22
}

function note(ctx, text) {
  const { doc } = ctx
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  const lines = doc.splitTextToSize(clean(text), ctx.W - 28)
  ensure(ctx, lines.length * 4.5 + 2)
  doc.text(lines, 14, ctx.y + 3)
  ctx.y += lines.length * 4.5 + 3
}

/** Tableau : colonnes [{ h, w?, align? }], lignes de textes, total facultatif. */
function table(ctx, cols, rows, foot) {
  ctx.autoTable(ctx.doc, {
    startY: ctx.y,
    head: [cols.map((c) => clean(c.h))],
    body: rows.map((r) => r.map((v) => clean(v))),
    foot: foot ? [foot.map((v) => clean(v))] : undefined,
    showFoot: 'lastPage',
    margin: { left: 14, right: 14, top: 18, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: DARK, lineColor: [225, 215, 195], lineWidth: 0.2, valign: 'top' },
    headStyles: { fillColor: DARK, textColor: GOLD, fontStyle: 'bold' },
    footStyles: { fillColor: SOFT, textColor: DARK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 248, 238] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: c.w || 'auto', halign: c.align || 'left' }])),
  })
  ctx.y = ctx.doc.lastAutoTable.finalY + 7
}

function empty(ctx, text) { note(ctx, text) }

async function finish(ctx, name) {
  const { doc } = ctx
  const n = doc.getNumberOfPages()
  const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(clean(ctx.title) + ' · Ardoise241', 14, H - 8)
    doc.text('Page ' + i + ' / ' + n, ctx.W - 14, H - 8, { align: 'right' })
  }
  const file = slug(name) + '_' + stamp() + '.pdf'
  if (window.Capacitor?.isNativePlatform?.()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const data = doc.output('datauristring').split(',')[1]
    const saved = await Filesystem.writeFile({ path: file, data, directory: Directory.Cache })
    try {
      await Share.share({ title: file, text: clean(ctx.title), files: [saved.uri], dialogTitle: 'Enregistrer ou envoyer le PDF' })
    } catch (e) {
      if (!/cancel/i.test(String(e?.message || e))) throw e
    }
  } else {
    doc.save(file)
  }
  return file
}

// ------------------------------------------------------------------ sections

function sectionCahier(ctx, s) {
  const debts = store.debts(s.entries)
  const rows = s.people
    .map((p) => ({ p, due: debts[p.uid] || 0, last: s.entries.filter((e) => e.person === p.uid && !e.pay).reduce((m, e) => Math.max(m, e.at), 0) }))
    .filter((r) => r.due > 0)
    .sort((a, b) => b.due - a.due)
  const total = rows.reduce((a, r) => a + r.due, 0)
  kpis(ctx, [['Total dû', money(total)], ['Clients avec un bon', String(rows.length)], ['Noms dans le cahier', String(s.people.length)]])
  heading(ctx, 'Clients qui doivent', money(total))
  if (!rows.length) return empty(ctx, 'Personne ne doit rien : tous les bons sont soldés.')
  table(ctx, [{ h: 'N°', w: 14, align: 'center' }, { h: 'Client' }, { h: 'Dernier bon', w: 34 }, { h: 'Reste à payer', w: 34, align: 'right' }],
    rows.map((r) => [r.p.position >= 100000 ? '*' : String(r.p.position), r.p.name, dateOnly(r.last), money(r.due)]),
    ['', 'Total', '', money(total)])
}

function sectionBilan(ctx, entries, name) {
  const bons = store.ledger(entries)
  const owed = bons.reduce((a, b) => a + b.remaining, 0)
  const sum = bons.reduce((a, b) => a + b.entry.amount, 0)
  const paid = bons.reduce((a, b) => a + b.paid, 0)
  kpis(ctx, [['Reste à payer', money(owed)], ['Total des bons', money(sum)], ['Déjà payé', money(paid)]])
  heading(ctx, 'Bons' + (name ? ' · ' + name : ''), bons.length + ' bon(s)')
  if (!bons.length) return empty(ctx, 'Aucun bon.')
  const label = { paid: 'Soldé', partial: 'Avance', open: 'Non payé' }
  table(ctx, [{ h: 'Date', w: 27 }, { h: 'Articles' }, { h: 'Montant', w: 24, align: 'right' }, { h: 'Payé', w: 22, align: 'right' }, { h: 'Reste', w: 22, align: 'right' }, { h: 'État', w: 18 }],
    bons.map((b) => [dateTime(b.entry.at), itemsText(b.entry.items) || clean(b.entry.label || 'Bon'), money(b.entry.amount), money(b.paid), money(b.remaining), label[b.status]]),
    ['', 'Total', money(sum), money(paid), money(owed), ''])
  const pays = entries.filter((e) => e.pay).sort((a, b) => a.at - b.at)
  if (pays.length) {
    heading(ctx, 'Paiements reçus', money(pays.reduce((a, e) => a + e.amount, 0)))
    table(ctx, [{ h: 'Date', w: 34 }, { h: 'Libellé' }, { h: 'Montant', w: 30, align: 'right' }],
      pays.map((e) => [dateTime(e.at), e.label || 'Paiement', money(e.amount)]))
  }
}

function sectionInventory(ctx, s, from, to, label) {
  const inv = store.inventory(from, to, s.entries)
  kpis(ctx, [['Total encaissé', money(inv.received)], ['Ventes encaissées', money(inv.cash)], ['Mis en bon', money(inv.credit)], ['Paiements de bons', money(inv.payments)]])
  note(ctx, 'Période : ' + label + ' · ' + inv.cashCount + ' vente(s) encaissée(s), ' + inv.creditCount + ' bon(s), ' + inv.paymentCount + ' paiement(s) de bons.')
  heading(ctx, 'Articles vendus', money(inv.cash + inv.credit))
  if (!inv.articles.length) empty(ctx, 'Aucun article sur cette période.')
  else {
    table(ctx, [{ h: 'Article' }, { h: 'Encaissés', w: 22, align: 'center' }, { h: 'En bon', w: 20, align: 'center' }, { h: 'Qté', w: 16, align: 'center' }, { h: 'Montant', w: 30, align: 'right' }],
      inv.articles.map((a) => [a.n, String(a.cash || ''), String(a.credit || ''), String(a.q), money(a.amount)]),
      ['Total', '', '', String(inv.articles.reduce((x, a) => x + a.q, 0)), money(inv.cash + inv.credit)])
  }
  heading(ctx, 'Encaissements', money(inv.cash))
  if (!inv.sales.length) empty(ctx, 'Aucun encaissement sur cette période.')
  else {
    table(ctx, [{ h: 'Date', w: 30 }, { h: 'Articles' }, { h: 'Montant', w: 30, align: 'right' }],
      inv.sales.map((e) => [dateTime(e.at), itemsText(e.items), money(e.amount)]),
      ['', 'Total', money(inv.cash)])
  }
}

function sectionOrders(ctx, orders, side) {
  const ok = orders.filter((o) => o.status === 'livree')
  kpis(ctx, [['Commandes livrées', money(ok.reduce((a, o) => a + o.total, 0))], ['Commandes', String(orders.length)],
    ['En attente', String(orders.filter((o) => ['attente', 'envoyee', 'acceptee', 'prete'].includes(o.status)).length)]])
  heading(ctx, 'Liste des commandes', orders.length + ' commande(s)')
  if (!orders.length) return empty(ctx, 'Aucune commande.')
  table(ctx, [{ h: 'Date', w: 27 }, { h: side === 'customer' ? 'Boutique' : 'Client', w: 34 }, { h: 'Articles' }, { h: 'Total', w: 24, align: 'right' }, { h: 'État', w: 20 }],
    orders.map((o) => [dateTime(o.at), side === 'customer' ? (o.shop?.name || '') : (o.customer?.name || ''), itemsText(o.items) + (o.note ? '\nNote : ' + o.note : ''), money(o.total), store.ORDER_STATUS[o.status] || o.status]))
}

function customersRows(s) {
  const debts = store.debts(s.entries)
  return (s.commerce?.customers || []).map((c) => ({ ...c, owing: debts[c.person] || 0 }))
    .sort((a, b) => b.owing - a.owing || (a.name || '').localeCompare(b.name || ''))
}

function sectionClients(ctx, s) {
  const list = customersRows(s)
  const clients = list.filter((c) => c.status === 'client')
  kpis(ctx, [['Total dû', money(list.reduce((a, c) => a + c.owing, 0))], ['Clients', String(clients.length)], ['Prospects', String(list.length - clients.length)]])
  heading(ctx, 'Clients de la boutique en ligne', list.length + ' personne(s)')
  if (!list.length) return empty(ctx, 'Aucun client inscrit pour l\'instant.')
  table(ctx, [{ h: 'Nom' }, { h: 'Téléphone', w: 30 }, { h: 'Statut', w: 22 }, { h: 'Inscrit le', w: 24 }, { h: 'Reste à payer', w: 30, align: 'right' }],
    list.map((c) => [c.name || '', c.phone || '', c.status === 'client' ? (c.owing > 0 ? 'Doit' : 'À jour') : 'Prospect', dateOnly(c.since), money(c.owing)]))
}

// ------------------------------------------------------------------ exports

export async function cahier() {
  const s = store.getState()
  const ctx = await newDoc('Cahier Bon', 'Les clients qui doivent, du plus gros montant au plus petit')
  sectionCahier(ctx, s)
  return finish(ctx, 'Cahier_Bon')
}

export async function bilan(person) {
  const s = store.getState()
  const ctx = await newDoc('Fiche client · ' + person.name, 'Bilan des bons et des paiements')
  sectionBilan(ctx, s.entries.filter((e) => e.person === person.uid))
  return finish(ctx, 'Fiche_' + person.name)
}

export async function inventory(from, to, label) {
  const s = store.getState()
  const ctx = await newDoc("Fiche d'inventaire", 'Période : ' + label)
  sectionInventory(ctx, s, from, to, label)
  return finish(ctx, 'Inventaire_' + label)
}

export async function orders() {
  const s = store.getState()
  const side = store.isCustomer() ? 'customer' : 'merchant'
  const list = side === 'customer' ? store.customerOrders() : (s.commerce?.orders || [])
  const ctx = await newDoc(side === 'customer' ? 'Mes commandes' : 'Commandes', 'Toutes les commandes, de la plus récente à la plus ancienne')
  sectionOrders(ctx, list, side)
  return finish(ctx, side === 'customer' ? 'Mes_commandes' : 'Commandes')
}

export async function clients() {
  const s = store.getState()
  const ctx = await newDoc('Mes clients', 'Clients et prospects inscrits sur Ardoise241')
  sectionClients(ctx, s)
  return finish(ctx, 'Mes_clients')
}

/** Client : ses bons dans chaque boutique. */
export async function myBons(shops) {
  const ctx = await newDoc('Mes bons', 'Ce que j\'ai payé et ce qu\'il reste à payer, boutique par boutique')
  const withBons = shops.filter((sh) => (sh.entries || []).some((e) => !e.pay))
  kpis(ctx, [['Je dois au total', money(shops.reduce((a, sh) => a + sh.owing, 0))], ['Boutiques', String(withBons.length)]])
  if (!withBons.length) empty(ctx, 'Aucun bon : vous ne devez rien.')
  for (const sh of withBons) {
    heading(ctx, sh.name, 'Reste ' + money(sh.owing))
    sectionBilan(ctx, sh.entries)
  }
  return finish(ctx, 'Mes_bons')
}

/** Commerçant : tout le cahier dans un seul PDF. */
export async function everything() {
  const s = store.getState()
  const ctx = await newDoc('Export complet', 'Cahier Bon, fiches clients, inventaire, commandes et clients')
  const { doc } = ctx

  heading(ctx, '1. Cahier Bon')
  sectionCahier(ctx, s)

  const debts = store.debts(s.entries)
  const people = s.people.filter((p) => s.entries.some((e) => e.person === p.uid)).sort((a, b) => (debts[b.uid] || 0) - (debts[a.uid] || 0))
  doc.addPage(); ctx.y = 20
  heading(ctx, '2. Fiches clients', people.length + ' fiche(s)')
  if (!people.length) empty(ctx, 'Aucun bon enregistré.')
  for (const p of people) {
    ensure(ctx, 60)
    sectionBilan(ctx, s.entries.filter((e) => e.person === p.uid), p.name)
  }

  doc.addPage(); ctx.y = 20
  heading(ctx, "3. Fiche d'inventaire · aujourd'hui")
  const day = new Date(); day.setHours(0, 0, 0, 0)
  sectionInventory(ctx, s, day.getTime(), day.getTime() + 86400000, "aujourd'hui")
  doc.addPage(); ctx.y = 20
  heading(ctx, "4. Fiche d'inventaire · depuis le début")
  sectionInventory(ctx, s, 0, Number.MAX_SAFE_INTEGER, 'depuis le début')

  if (s.commerce) {
    doc.addPage(); ctx.y = 20
    heading(ctx, '5. Commandes')
    sectionOrders(ctx, s.commerce.orders || [], 'merchant')
    doc.addPage(); ctx.y = 20
    heading(ctx, '6. Mes clients')
    sectionClients(ctx, s)
  }
  return finish(ctx, 'Export_complet')
}
