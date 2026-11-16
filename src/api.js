let token = null

export function setToken(value) {
  token = value || null
}

async function req(url, opts = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers['X-Admin-Token'] = token
  let body
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (opts.body) {
    body = opts.body
  }

  let res
  try {
    res = await fetch(url, { method: opts.method || 'GET', headers, body })
  } catch {
    const err = new Error('Serveur injoignable.')
    err.status = 0
    throw err
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || 'Une erreur est survenue.')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  state: () => req('/api/state'),
  unlock: (code) => req('/api/unlock', { method: 'POST', json: { code } }),
  login: (code) => req('/api/admin/login', { method: 'POST', json: { code } }),
  logout: () => req('/api/admin/logout', { method: 'POST' }),
  person: (id) => req('/api/people/' + id),
  session: (id, counts) => req('/api/people/' + id + '/sessions', { method: 'POST', json: { counts } }),
  pay: (id, amount) => req('/api/people/' + id + '/payments', { method: 'POST', json: { amount } }),
  erase: (id, code) => req('/api/people/' + id + '/erase', { method: 'POST', json: { code } }),
  addNames: (text) => req('/api/names', { method: 'POST', json: { text } }),
  rename: (id, name) => req('/api/names/' + id, { method: 'PATCH', json: { name } }),
  addFood: () => req('/api/foods', { method: 'POST' }),
  updateFood: (id, data) => req('/api/foods/' + id, { method: 'PATCH', json: data }),
  deleteFood: (id) => req('/api/foods/' + id, { method: 'DELETE' }),
  uploadImage: (id, file) => {
    const body = new FormData()
    body.append('photo', file)
    return req('/api/foods/' + id + '/image', { method: 'POST', body })
  },
  uploadPhotos: (files) => {
    const body = new FormData()
    for (const file of files) body.append('photos[]', file)
    return req('/api/foods/photos', { method: 'POST', body })
  },
  changeCode: (code) => req('/api/settings/code', { method: 'POST', json: { code } }),
}
