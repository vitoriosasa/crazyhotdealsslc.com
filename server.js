'use strict'

const http = require('node:http')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const QRCode = require('qrcode')

const PORT = Number(process.env.PORT || 3000)
const ROOT = __dirname
const PUBLIC_DIR = path.join(ROOT, 'public')
// On Render (or any host with an ephemeral filesystem) point DATA_DIR at a
// persistent disk, e.g. DATA_DIR=/var/data — otherwise data lives in ./data.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
const SITE_FILE = path.join(DATA_DIR, 'site.json')
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json')
const LOG_FILE = path.join(DATA_DIR, 'stock-log.json')
const SECRET_FILE = path.join(DATA_DIR, '.secret')

// A sold item stays visible for 7 days, then drops off the public site by itself.
const SOLD_VISIBLE_DAYS = 7
const LOG_LIMIT = 200

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

// Defaults for the Crazy Hot Deals SLC brand (copper + warm sand palette),
// Sectional Couches / Bed Frames / Home Furniture, Salt Lake City area.
const DEFAULT_SITE = {
  brand: 'Crazy Hot Deals SLC',
  tagline: 'Sectional Couches · Bed Frames · Home Furniture',
  city: 'Salt Lake City area, UT',
  facebookUrl: '',
  messengerUrl: '',
  phone: '',
  email: '',
  publicUrl: 'https://crazyhotdealsslc.com',
  pickupNote:
    'Local pickup is our primary option. Local delivery may be available for an additional fee. Please message us with your ZIP code and any stairs or access details for a delivery quote. Pickup and delivery must be confirmed in advance.',
  address: '',
  gateNote: '',
  categories: ['Sectional Couches', 'Bed Frames', 'Home Furniture'],
  admin: null,
}

// ---------- storage helpers ----------

async function ensureDirs() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true })
}

// On a fresh persistent disk (e.g. first Render deploy) DATA_DIR starts empty.
// Copy the bundled seed/ snapshot in once so the live site has the real site
// info, products and images from day one. Never overwrites existing files, so
// later admin edits and re-deploys are safe.
async function seedIfEmpty() {
  const seedDir = path.join(ROOT, 'seed')
  if (!fs.existsSync(seedDir)) return
  for (const name of ['site.json', 'products.json', 'stock-log.json']) {
    const from = path.join(seedDir, name)
    const to = path.join(DATA_DIR, name)
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      await fsp.copyFile(from, to)
      console.log(`[seed] copied ${name}`)
    }
  }
  const seedUploads = path.join(seedDir, 'uploads')
  if (fs.existsSync(seedUploads)) {
    for (const f of await fsp.readdir(seedUploads)) {
      const dest = path.join(UPLOAD_DIR, f)
      if (!fs.existsSync(dest)) await fsp.copyFile(path.join(seedUploads, f), dest)
    }
  }
}

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return structuredClone(fallback)
  }
}

let writeQueue = Promise.resolve()
function writeJson(file, value) {
  writeQueue = writeQueue.then(async () => {
    const tmp = `${file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await fsp.rename(tmp, file)
  })
  return writeQueue
}

let SECRET = ''
async function loadSecret() {
  try {
    SECRET = (await fsp.readFile(SECRET_FILE, 'utf8')).trim()
  } catch {
    SECRET = crypto.randomBytes(32).toString('hex')
    await fsp.writeFile(SECRET_FILE, SECRET, 'utf8')
  }
}

async function getSite() {
  const site = { ...DEFAULT_SITE, ...(await readJson(SITE_FILE, DEFAULT_SITE)) }
  if (!Array.isArray(site.categories) || site.categories.length === 0) {
    site.categories = [...DEFAULT_SITE.categories]
  }
  return site
}

const getProducts = () => readJson(PRODUCTS_FILE, [])

// ---------- auth ----------

const COOKIE = 'fs_admin'
const SESSION_TTL = 1000 * 60 * 60 * 12

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
}

function makeToken() {
  const exp = String(Date.now() + SESSION_TTL)
  return `${exp}.${sign(exp)}`
}

function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie
  if (!raw) return out
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function isAdmin(req) {
  const token = parseCookies(req)[COOKIE]
  if (!token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig) return false
  if (Number(exp) < Date.now()) return false
  const expected = sign(exp)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, admin) {
  if (!admin || !admin.salt || !admin.hash) return false
  const { hash } = hashPassword(password, admin.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(admin.hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---------- http helpers ----------

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(payload)
}

async function readBody(req, limit = 24 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('BAD_JSON')
  }
}

function setCookie(res, value, maxAgeSec) {
  res.setHeader(
    'set-cookie',
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`,
  )
}

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function slugId() {
  return 'p_' + crypto.randomBytes(6).toString('hex')
}

// An explicitly supplied value always wins — including null, false and '' — so the
// admin panel can actually clear a field. Only a genuinely absent key falls back
// to what is already stored.
function pickField(input, existing, key, fallback) {
  if (input && Object.prototype.hasOwnProperty.call(input, key)) return input[key]
  return existing[key] ?? fallback
}

function normalizeProduct(input, existing = {}) {
  const status = ['available', 'pending', 'sold'].includes(input.status) ? input.status : 'available'
  const price = Number(input.price)
  const images = Array.isArray(input.images)
    ? input.images
        .filter((img) => img && typeof img.full === 'string' && img.full.startsWith('/media/'))
        .slice(0, 12)
        .map((img) => ({ full: str(img.full, 300), thumb: str(img.thumb, 300) || str(img.full, 300) }))
    : existing.images || []

  const qtyRaw = Number(input.quantity)
  const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 0 ? Math.floor(qtyRaw) : existing.quantity ?? 1

  const soldAtRaw = pickField(input, existing, 'soldAt', null)
  const delistedAtRaw = pickField(input, existing, 'delistedAt', null)

  return {
    id: existing.id || slugId(),
    code: str(input.code, 40) || existing.code || '',
    title: str(input.title, 120) || 'Untitled item',
    category: str(input.category, 60) || 'Furniture',
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    priceNote: str(input.priceNote, 40),
    status,
    quantity,
    hidden: Boolean(input.hidden),
    dimensions: str(input.dimensions, 160),
    color: str(input.color, 80),
    condition: str(input.condition, 80),
    includes: str(input.includes, 300),
    notIncluded: str(input.notIncluded, 300),
    description: str(input.description, 4000),
    images,
    listedOnMarketplace: Boolean(pickField(input, existing, 'listedOnMarketplace', false)),
    marketplaceUrl: str(pickField(input, existing, 'marketplaceUrl', ''), 400),
    soldAt: soldAtRaw ? new Date(soldAtRaw).toISOString() : null,
    delistedAt: delistedAtRaw ? new Date(delistedAtRaw).toISOString() : null,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ---------- stock log ----------

const getLog = () => readJson(LOG_FILE, [])

async function addLog(entries) {
  const log = await getLog()
  const at = new Date().toISOString()
  for (const entry of entries) log.unshift({ at, ...entry })
  await writeJson(LOG_FILE, log.slice(0, LOG_LIMIT))
}

// Sold items stay listed for 7 days so buyers who bookmarked a link still see it.
function isPublic(product) {
  if (product.hidden) return false
  if (product.status !== 'sold') return true
  if (!product.soldAt) return true
  return Date.now() - Date.parse(product.soldAt) < SOLD_VISIBLE_DAYS * 86400000
}

function isNewArrival(product) {
  if (product.status !== 'available') return false
  const created = Date.parse(product.createdAt)
  return Number.isFinite(created) && Date.now() - created < SOLD_VISIBLE_DAYS * 86400000
}

// ---------- routes ----------

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const filePath = path.join(PUBLIC_DIR, rel)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    const stat = await fsp.stat(filePath)
    if (!stat.isFile()) throw new Error('not a file')
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': rel.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache',
    })
    fs.createReadStream(filePath).pipe(res)
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<h1 style="font-family:system-ui;padding:40px">404 — page not found</h1>')
  }
}

async function serveMedia(req, res, pathname) {
  const name = path.basename(pathname)
  const filePath = path.join(UPLOAD_DIR, name)
  try {
    const stat = await fsp.stat(filePath)
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'public, max-age=86400',
    })
    fs.createReadStream(filePath).pipe(res)
  } catch {
    res.writeHead(404).end('Not found')
  }
}

async function handleApi(req, res, url) {
  const { pathname } = url
  const method = req.method || 'GET'

  // ---- public ----
  if (pathname === '/api/site' && method === 'GET') {
    const site = await getSite()
    return json(res, 200, {
      brand: site.brand,
      tagline: site.tagline,
      city: site.city,
      facebookUrl: site.facebookUrl,
      messengerUrl: site.messengerUrl,
      phone: site.phone,
      email: site.email,
      publicUrl: site.publicUrl,
      pickupNote: site.pickupNote,
      address: site.address,
      gateNote: site.gateNote,
      categories: site.categories,
    })
  }

  if (pathname === '/api/products' && method === 'GET') {
    const all = url.searchParams.get('all') === '1' && isAdmin(req)
    const products = (await getProducts()).filter((p) => all || isPublic(p))
    products.sort((a, b) => (a.status === 'sold') - (b.status === 'sold') || b.createdAt.localeCompare(a.createdAt))
    return json(res, 200, {
      products: products.map((p) => ({ ...p, isNew: all ? false : isNewArrival(p) })),
    })
  }

  const productMatch = pathname.match(/^\/api\/products\/([\w-]+)$/)
  if (productMatch && method === 'GET') {
    const products = await getProducts()
    const product = products.find((p) => p.id === productMatch[1])
    if (!product) return json(res, 404, { error: 'Not found' })
    if (!isPublic(product) && !isAdmin(req)) return json(res, 404, { error: 'Not found' })
    return json(res, 200, { product })
  }

  if (pathname === '/api/qr' && method === 'GET') {
    const text = url.searchParams.get('text') || ''
    if (!text || text.length > 500) return json(res, 400, { error: 'Bad text' })
    try {
      const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=600' })
      return res.end(svg)
    } catch {
      return json(res, 400, { error: 'QR failed' })
    }
  }

  // ---- admin session ----
  if (pathname === '/api/admin/state' && method === 'GET') {
    const site = await getSite()
    return json(res, 200, { needsSetup: !site.admin, signedIn: isAdmin(req) })
  }

  if (pathname === '/api/admin/setup' && method === 'POST') {
    const site = await getSite()
    if (site.admin) return json(res, 409, { error: 'Admin password already set' })
    const body = await readBody(req)
    const password = str(body.password, 200)
    if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' })
    site.admin = hashPassword(password)
    await writeJson(SITE_FILE, site)
    setCookie(res, makeToken(), SESSION_TTL / 1000)
    return json(res, 200, { ok: true })
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    const site = await getSite()
    const body = await readBody(req)
    if (!verifyPassword(str(body.password, 200), site.admin)) {
      return json(res, 401, { error: 'Wrong password' })
    }
    setCookie(res, makeToken(), SESSION_TTL / 1000)
    return json(res, 200, { ok: true })
  }

  if (pathname === '/api/admin/logout' && method === 'POST') {
    setCookie(res, '', 0)
    return json(res, 200, { ok: true })
  }

  // ---- admin: everything below requires a session ----
  if (pathname.startsWith('/api/admin/') && !isAdmin(req)) {
    return json(res, 401, { error: 'Sign in required' })
  }

  if (pathname === '/api/admin/site' && method === 'GET') {
    return json(res, 200, await getSite())
  }

  if (pathname === '/api/admin/site' && method === 'PUT') {
    const body = await readBody(req)
    const site = await getSite()
    for (const key of ['brand', 'tagline', 'city', 'facebookUrl', 'messengerUrl', 'phone', 'email', 'publicUrl', 'pickupNote', 'address', 'gateNote']) {
      if (typeof body[key] === 'string') site[key] = str(body[key], 1200)
    }
    if (Array.isArray(body.categories)) {
      const seen = new Set()
      site.categories = body.categories
        .map((c) => str(c, 60).trim())
        .filter((c) => {
          if (!c) return false
          const k = c.toLowerCase()
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .slice(0, 40)
    }
    await writeJson(SITE_FILE, site)
    return json(res, 200, { ok: true })
  }

  // Rename a category across the site; optionally re-tag every item that uses it.
  if (pathname === '/api/admin/categories/rename' && method === 'POST') {
    const body = await readBody(req)
    const from = str(body.from, 60).trim()
    const to = str(body.to, 60).trim()
    const updateItems = body.updateItems === true
    if (!from || !to) return json(res, 400, { error: 'Category name is required' })
    if (from.toLowerCase() === to.toLowerCase()) return json(res, 400, { error: 'New name is the same as the old one' })
    const site = await getSite()
    const cats = site.categories || []
    if (!cats.some((c) => c.toLowerCase() === from.toLowerCase())) {
      return json(res, 400, { error: 'Category not found' })
    }
    if (cats.some((c) => c.toLowerCase() === to.toLowerCase())) {
      return json(res, 400, { error: 'A category with that name already exists' })
    }
    site.categories = cats.map((c) => (c.toLowerCase() === from.toLowerCase() ? to : c))
    let updated = 0
    if (updateItems) {
      const products = await getProducts()
      for (const p of products) {
        if (p.category && p.category.toLowerCase() === from.toLowerCase()) {
          p.category = to
          updated++
        }
      }
      if (updated) await writeJson(PRODUCTS_FILE, products)
    }
    await writeJson(SITE_FILE, site)
    return json(res, 200, { ok: true, updated })
  }

  if (pathname === '/api/admin/password' && method === 'POST') {
    const body = await readBody(req)
    const site = await getSite()
    if (!verifyPassword(str(body.current, 200), site.admin)) {
      return json(res, 400, { error: 'Current password is wrong' })
    }
    const next = str(body.next, 200)
    if (next.length < 6) return json(res, 400, { error: 'New password must be at least 6 characters' })
    site.admin = hashPassword(next)
    await writeJson(SITE_FILE, site)
    return json(res, 200, { ok: true })
  }

  if (pathname === '/api/admin/upload' && method === 'POST') {
    const body = await readBody(req)
    const save = async (dataUrl, suffix) => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null
      const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
      if (!match) return null
      const buf = Buffer.from(match[2], 'base64')
      if (buf.length > 12 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE')
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
      const name = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}${suffix}.${ext}`
      await fsp.writeFile(path.join(UPLOAD_DIR, name), buf)
      return `/media/${name}`
    }
    try {
      const full = await save(body.full, '')
      if (!full) return json(res, 400, { error: 'Unsupported image' })
      const thumb = (await save(body.thumb, '-t')) || full
      return json(res, 200, { full, thumb })
    } catch (err) {
      return json(res, 400, { error: err.message })
    }
  }

  if (pathname === '/api/admin/products' && method === 'POST') {
    const body = await readBody(req)
    const products = await getProducts()
    const product = normalizeProduct(body)
    if (product.status === 'sold' && !product.soldAt) product.soldAt = new Date().toISOString()
    products.push(product)
    await writeJson(PRODUCTS_FILE, products)
    await addLog([
      {
        id: product.id,
        title: product.title,
        change: product.quantity,
        left: product.quantity,
        reason: 'item created',
      },
    ])
    return json(res, 200, { product })
  }

  // Stock change endpoint — keeps quantity and status consistent, and records the reason.
  const stockMatch = pathname.match(/^\/api\/admin\/products\/([\w-]+)\/stock$/)
  if (stockMatch && method === 'POST') {
    const body = await readBody(req)
    const products = await getProducts()
    const index = products.findIndex((p) => p.id === stockMatch[1])
    if (index < 0) return json(res, 404, { error: 'Not found' })

    const target = products[index]
    const before = Number.isFinite(Number(target.quantity)) ? Number(target.quantity) : 0
    const delta = Number(body.delta)
    if (!Number.isFinite(delta) || delta === 0) return json(res, 400, { error: 'Delta must be a non-zero number' })

    const next = Math.max(0, before + Math.trunc(delta))
    const change = next - before
    const reason = str(body.reason, 80) || (change < 0 ? 'sold / removed' : 'restock')

    const updated = { ...target, quantity: next, updatedAt: new Date().toISOString() }
    if (next === 0 && updated.status !== 'sold') {
      updated.status = 'sold'
      updated.soldAt = new Date().toISOString()
    } else if (next > 0 && updated.status === 'sold') {
      updated.status = 'available'
      updated.soldAt = null
    }

    products[index] = updated
    await writeJson(PRODUCTS_FILE, products)
    await addLog([{ id: updated.id, title: updated.title, change, left: next, reason }])
    return json(res, 200, { product: updated })
  }

  const adminProduct = pathname.match(/^\/api\/admin\/products\/([\w-]+)$/)
  if (adminProduct) {
    const id = adminProduct[1]
    const products = await getProducts()
    const index = products.findIndex((p) => p.id === id)
    if (index < 0) return json(res, 404, { error: 'Not found' })

    if (method === 'PUT') {
      const body = await readBody(req)
      const previous = products[index]
      const updated = normalizeProduct({ ...previous, ...body }, previous)

      const stockDelta = Number(updated.quantity) - (Number(previous.quantity) || 0)
      if (updated.status === 'sold' && !updated.soldAt) updated.soldAt = new Date().toISOString()
      if (updated.status !== 'sold') updated.soldAt = null

      products[index] = updated
      await writeJson(PRODUCTS_FILE, products)
      if (stockDelta !== 0) {
        await addLog([
          {
            id: updated.id,
            title: updated.title,
            change: stockDelta,
            left: updated.quantity,
            reason: 'edited in admin',
          },
        ])
      }
      return json(res, 200, { product: updated })
    }
    if (method === 'DELETE') {
      const [removed] = products.splice(index, 1)
      await writeJson(PRODUCTS_FILE, products)
      for (const img of removed.images || []) {
        for (const url of new Set([img.full, img.thumb])) {
          if (!url) continue
          fsp.unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {})
        }
      }
      return json(res, 200, { ok: true })
    }
  }

  // ---- admin: log, stats, backup ----

  if (pathname === '/api/admin/log' && method === 'GET') {
    return json(res, 200, { log: (await getLog()).slice(0, 60) })
  }

  if (pathname === '/api/admin/stats' && method === 'GET') {
    const products = await getProducts()
    const live = products.filter((p) => p.status !== 'sold')
    const units = live.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
    const askingValue = live.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 0), 0)
    const notPosted = products.filter((p) => p.status !== 'sold' && !p.listedOnMarketplace).length
    const needsDelisting = products.filter((p) => p.status === 'sold' && p.listedOnMarketplace && !p.delistedAt).length
    return json(res, 200, { listed: live.length, units, askingValue, notPosted, needsDelisting })
  }

  if (pathname === '/api/admin/backup' && method === 'GET') {
    const site = await getSite()
    const backup = {
      exportedAt: new Date().toISOString(),
      version: 2,
      // The admin password hash is deliberately left out of the export.
      site: { ...site, admin: null },
      products: await getProducts(),
      log: await getLog(),
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="beehive-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    })
    return res.end(JSON.stringify(backup, null, 2))
  }

  if (pathname === '/api/admin/backup' && method === 'POST') {
    const body = await readBody(req)
    if (!body || !Array.isArray(body.products)) return json(res, 400, { error: 'Not a valid backup file' })

    const current = await getSite()
    if (body.site && typeof body.site === 'object') {
      const merged = { ...body.site, admin: current.admin }
      for (const key of Object.keys(DEFAULT_SITE)) {
        if (typeof merged[key] === 'string') merged[key] = str(merged[key], 1200)
      }
      if (Array.isArray(merged.categories)) {
        merged.categories = merged.categories.map((c) => str(c, 60)).filter(Boolean).slice(0, 40)
      }
      await writeJson(SITE_FILE, merged)
    }
    await writeJson(PRODUCTS_FILE, body.products.map((p) => normalizeProduct(p, p)))
    if (Array.isArray(body.log)) await writeJson(LOG_FILE, body.log.slice(0, LOG_LIMIT))
    return json(res, 200, { ok: true, products: body.products.length })
  }

  return json(res, 404, { error: 'Unknown endpoint' })
}

async function serveSitemap(req, res) {
  const site = await getSite()
  const base = (site.publicUrl || '').replace(/\/+$/, '')
  if (!base) {
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-cache' })
    return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  }
  const products = (await getProducts()).filter(isPublic)
  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/card`, priority: '0.6' },
    ...products.map((p) => ({ loc: `${base}/p/${p.id}`, priority: p.status === 'sold' ? '0.2' : '0.8' })),
  ]
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</loc><priority>${u.priority}</priority></url>`,
      )
      .join('\n') +
    '\n</urlset>'
  res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' })
  res.end(xml)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const { pathname } = url

  // Baseline hardening for every response.
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')

  try {
    if (pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('ok')
    }
    if (pathname.startsWith('/api/')) return await handleApi(req, res, url)
    if (pathname.startsWith('/media/')) return await serveMedia(req, res, pathname)

    if (pathname === '/card') return await serveStatic(req, res, '/card.html')
    if (pathname === '/admin') return await serveStatic(req, res, '/admin.html')
    if (pathname === '/sitemap.xml') return await serveSitemap(req, res)
    if (pathname === '/robots.txt') {
      const site = await getSite()
      const base = (site.publicUrl || '').replace(/\/+$/, '')
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' })
      return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`)
    }
    const share = pathname.match(/^\/p\/([\w-]+)$/)
    if (share) return await serveStatic(req, res, '/product.html')
    const listing = pathname.match(/^\/listing\/([\w-]+)$/)
    if (listing) return await serveStatic(req, res, '/listing.html')

    return await serveStatic(req, res, pathname)
  } catch (err) {
    if (err && err.message === 'PAYLOAD_TOO_LARGE') return json(res, 413, { error: 'File too large' })
    if (err && err.message === 'BAD_JSON') return json(res, 400, { error: 'Bad request body' })
    console.error('[error]', err && err.message)
    if (!res.headersSent) json(res, 500, { error: 'Server error' })
  }
})

async function main() {
  await ensureDirs()
  await seedIfEmpty()
  await loadSecret()
  if (!fs.existsSync(PRODUCTS_FILE)) await writeJson(PRODUCTS_FILE, [])
  if (!fs.existsSync(LOG_FILE)) await writeJson(LOG_FILE, [])
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Crazy Hot Deals SLC showroom running on http://localhost:${PORT}`)
    console.log(`Admin panel: http://localhost:${PORT}/admin`)
  })
}

main()
