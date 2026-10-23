'use strict'
// Front-end render check: loads each page in jsdom against the live server and
// asserts the DOM actually contains what the owner will see.

const { JSDOM, VirtualConsole } = require('jsdom')

const BASE = process.env.BASE || 'http://localhost:3312'
const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message))
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')))

function ok(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg)
  if (!cond) errors.push(msg)
}

async function load(path, waitMs = 1200) {
  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom does not implement fetch; hand the page the host's fetch so the
      // page scripts run exactly as they do in a real browser.
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? new URL(input, BASE).toString() : input
        return fetch(url, init)
      }
      // Clipboard API is also absent in jsdom; the copy helpers already fall
      // back to execCommand, this keeps that path quiet.
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: async () => {} },
        configurable: true,
      })
    },
  })
  await new Promise((r) => setTimeout(r, waitMs))
  return dom
}

async function runAll() {
  // ---------- home ----------
  {
    const dom = await load('/')
    const d = dom.window.document
    const html = d.body.innerHTML

    ok(d.querySelector('.brand-mark') !== null, 'home: brand mark rendered')
    ok(d.querySelector('.brand-name').textContent === 'Crazy Hot Deals', 'home: brand name = "Crazy Hot Deals"')
    ok(d.querySelector('.brand-sub').textContent === 'SLC', 'home: brand sub = "SLC"')
    ok(d.querySelector('a[href="/card"]') === null, 'home: digital card link removed from site')
    ok(d.querySelector('#search') !== null, 'home: search box present')
    ok(d.querySelector('#sort') !== null, 'home: sort dropdown present')
    ok(d.querySelectorAll('.chip').length >= 4, 'home: category chips = ' + d.querySelectorAll('.chip').length)
    ok(/Local pickup/.test(d.querySelector('#trust-strip').textContent), 'home: trust strip mentions pickup')
    ok(!/4\.9/.test(d.querySelector('#trust-strip').textContent), 'home: rating line removed from trust strip')
    ok(d.querySelectorAll('.card').length >= 2, 'home: ' + d.querySelectorAll('.card').length + ' cards rendered')
    ok(d.querySelector('.chip-n') !== null, 'home: category chips show item counts')

    const allCodes = [...d.querySelectorAll('.code')].map((n) => n.textContent)
    ok(allCodes.includes('#SF-1001'), 'home: item code #SF-1001 shown on a card')
    ok(!/in stock/.test(d.querySelector('#grid').textContent), 'home: buyers do NOT see unit counts on cards')
    ok(d.querySelector('.badge-new') !== null, 'home: New badge on fresh item')

    // search actually filters
    const search = d.querySelector('#search')
    search.value = 'sectional'
    search.dispatchEvent(new dom.window.Event('input'))
    const afterSearch = d.querySelectorAll('.card').length
    ok(afterSearch >= 1, 'home: search "sectional" keeps ' + afterSearch + ' card(s)')

    search.value = 'zzzznomatch'
    search.dispatchEvent(new dom.window.Event('input'))
    ok(d.querySelectorAll('.card').length === 0, 'home: nonsense search returns 0 cards')
    ok(/Nothing matches/.test(d.querySelector('#grid').textContent), 'home: empty state message shown')

    search.value = ''
    search.dispatchEvent(new dom.window.Event('input'))
    ok(d.querySelectorAll('.card').length >= 2, 'home: clearing search restores all cards')

    // sort by price
    const sort = d.querySelector('#sort')
    sort.value = 'hi'
    sort.dispatchEvent(new dom.window.Event('change'))
    const prices = [...d.querySelectorAll('.price')].map((n) => parseInt(n.textContent.replace(/[^0-9]/g, ''), 10))
    ok(prices.length >= 2 && prices[0] >= prices[1], 'home: price high-to-low sorted ' + prices.join(','))

    // XSS payload must not create an element
    ok(d.querySelectorAll('img[onerror]').length === 0, 'home: injected markup did not execute')
    const bodies = [...d.querySelectorAll('.card-title')].map((n) => n.textContent)
    ok(bodies.some((t) => t.includes('<img src=x')), 'home: XSS string shown as literal text')

    dom.window.close()
  }

  // ---------- product ----------
  {
    const listDom = await load('/')
    const listDoc = listDom.window.document
    const cards = [...listDoc.querySelectorAll('.card')]
    const target = cards.find((c) => /SF-1001/.test(c.textContent)) || cards[0]
    const href = target.getAttribute('href')

    const dom = await load(href)
    const d = dom.window.document
    const text = d.body.textContent
    ok(/Charcoal L-shaped sectional/.test(text), 'detail: title rendered')
    ok(/NOT included/.test(text), 'detail: NOT included row shown')
    ok(/Ottoman not included/.test(text), 'detail: notIncluded value shown')
    ok(!/in stock/.test(d.querySelector('.qty-line').textContent), 'detail: buyers do NOT see unit count')
    ok(d.querySelector('.sticky-actions') !== null, 'detail: mobile sticky action bar present')
    ok(d.querySelector('#copy-link') !== null, 'detail: copy link button present')
    ok(/Item code/.test(text), 'detail: item code row present')
    ok(/Ask About This Item/.test(text), 'detail: primary CTA present')
    ok(/Pickup hours:/.test(text), 'detail: pickup hours shown')
    ok(/google\.com\/maps/.test(d.body.innerHTML), 'detail: Open in Maps link present')
    ok(d.querySelector('img[src="/media/warehouse-gate.jpg"]') !== null, 'detail: pickup gate photo shown')
    const askHref = (d.querySelector('.actions .btn-primary') || {}).href || ''
    ok(/sectional/i.test(decodeURIComponent(askHref)), 'detail: Messenger CTA prefilled with item name')
    dom.window.close()
    listDom.window.close()
  }

  // ---------- listing generator ----------
  {
    const listDom = await load('/')
    const listDoc = listDom.window.document
    const cards = [...listDoc.querySelectorAll('.card')]
    const target = cards.find((c) => /SF-1001/.test(c.textContent)) || cards[0]
    const id = target.getAttribute('href').split('/p/')[1]

    const dom = await load('/listing/' + id)
    const d = dom.window.document
    const text = d.body.textContent
    ok(/Charcoal L-shaped sectional/.test(text), 'listing: item title shown')
    ok(/Size: 110in W x 68in D/.test(d.querySelector('#l-desc').value), 'listing: description includes size')
    ok(/NOT included: Ottoman/.test(d.querySelector('#l-desc').value), 'listing: description includes NOT included')
    ok(/Item code SF-1001/.test(d.querySelector('#l-desc').value), 'listing: description includes item code')
    ok(/crazyhotdealsslc\.com\/p\//.test(d.querySelector('#l-desc').value), 'listing: description links to real domain')
    ok(d.querySelector('#l-title').value.includes('Like new'), 'listing: title includes condition')
    ok(d.querySelector('#l-price').value === '480', 'listing: price prefilled')

    // toggling the link checkbox swaps the description text
    const toggle = d.querySelector('#l-link')
    toggle.checked = false
    toggle.dispatchEvent(new dom.window.Event('change'))
    ok(!/Photos & full details/.test(d.querySelector('#l-desc').value), 'listing: unchecking link removes the URL')
    dom.window.close()
    listDom.window.close()
  }

  // ---------- admin (logged in via cookie) ----------
  {
    // log in through the API so jsdom carries the session cookie
    const login = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'testpass123' }),
    })
    const cookie = login.headers.get('set-cookie').split(';')[0]

    // fetch the page with the session, then build the DOM from the HTML so the
    // admin scripts run fully logged-in (jsdom cannot attach cookies itself).
    const html = await (await fetch(BASE + '/admin', { headers: { cookie } })).text()
    const dom = new JSDOM(html, {
      url: BASE + '/admin',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(window) {
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? new URL(input, BASE).toString() : input
          const opts = init ? { ...init } : {}
          opts.headers = { ...(opts.headers || {}), cookie }
          return fetch(url, opts)
        }
        Object.defineProperty(window.navigator, 'clipboard', {
          value: { writeText: async () => {} },
          configurable: true,
        })
      },
    })
    await new Promise((r) => setTimeout(r, 1800))
    const d = dom.window.document

    ok(d.querySelector('#gate') !== null, 'admin: gate element present')
    ok(d.querySelector('#bulk-bar') !== null, 'admin: bulk action bar present')
    ok(d.querySelectorAll('.bulk-check').length >= 2, 'admin: every inventory row has a select checkbox')
    ok(d.querySelector('#snapshot-list') !== null, 'admin: server snapshot list present')
    ok(d.querySelector('#snapshot-now') !== null, 'admin: take-snapshot-now button present')
    ok(d.querySelector('#s-hours') !== null, 'admin: pickup hours field present')
    ok(d.querySelector('#s-hours').value.length > 0, 'admin: pickup hours prefilled from settings')
    ok(d.querySelector('#save-draft') !== null, 'admin: save-as-draft button present')
    ok(d.querySelectorAll('.stat-tile').length >= 9, 'admin: stats tiles + this-month row rendered')
    ok(/This month/.test(d.body.textContent), 'admin: this-month dashboard section shown')
    ok(/fastest category/i.test(d.body.textContent), 'admin: fastest-category tile shown')
    ok(/snapshot/i.test(d.body.textContent), 'admin: snapshot section copy shown')
    ok((await fetch(BASE + '/api/admin/stats', { headers: { cookie } })).ok, 'admin: stats reachable with session')
    dom.window.close()
  }

  console.log('\nFAILURES: ' + errors.length)
  return errors
}

runAll()
  .then((errs) => {
    process.exitCode = errs.length ? 1 : 0
    process.exit(process.exitCode)
  })
  .catch((e) => {
    console.error('TEST CRASH', e)
    process.exit(1)
  })