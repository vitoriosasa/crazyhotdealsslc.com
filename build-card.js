// Builds the standalone business card: one self-contained HTML file with all
// CSS, the flame mark and a pre-rendered QR SVG inlined — no server, no
// network requests, works by double-clicking and prints cleanly.
//
// Usage:  node build-card.js "output.html"
// The QR always points at publicUrl from data/site.json (the website home page).
// Re-run this after changing phone / address / hours / categories so the
// printed card stays in sync with the site.

const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const ROOT = __dirname
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'))
const OUT = process.argv[2] || path.join(ROOT, 'card-standalone.html')

const SITE_URL = (SITE.publicUrl || 'https://crazyhotdealsslc.com').replace(/\/+$/, '')
const FLAME_PATH =
  'M32 5 C43 19 45 26 45 34 A13 13 0 1 1 19 34 C19 26 21 19 32 5 Z ' +
  'M32 24 C36.5 30 38.5 33.5 38.5 36.5 A6.5 6.5 0 1 1 25.5 36.5 C25.5 33.5 27.5 30 32 24 Z'

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const CSS = `
:root {
  --bg: #f4ecdd; --surface: #fbf8f1; --surface-2: #f5f0e4;
  --ink: #38352a; --ink-soft: #5f564a; --muted: #8b8178;
  --line: #e5d9c1; --line-strong: #d6c6a6;
  --accent: #b06c3c; --accent-dark: #96592c; --accent-soft: #f7e8da;
  --radius: 14px; --radius-sm: 9px;
  --shadow-sm: 0 1px 2px rgba(62,47,36,.06), 0 6px 18px rgba(62,47,36,.05);
  --shadow-md: 0 2px 6px rgba(62,47,36,.08), 0 18px 40px rgba(62,47,36,.09);
  --serif: "Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,"Times New Roman",serif;
  --sans: -apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--sans); font-size: 16px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
img, svg { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button { font: inherit; }
.small { font-size: 0.86rem; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 18px; border-radius: 999px; border: 1px solid transparent;
  background: var(--ink); color: #fff; font-size: 0.9rem; font-weight: 600;
  cursor: pointer; text-align: center;
  transition: transform .12s ease, background .15s ease, box-shadow .15s ease;
}
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.btn:active { transform: translateY(0); }
.btn-primary { background: var(--accent); }
.btn-primary:hover { background: var(--accent-dark); }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--line-strong); }
.btn-ghost:hover { background: #fff; }
.btn-light { background: #fff; color: var(--ink); border-color: var(--line); }
.btn-block { width: 100%; }
.cardpage {
  min-height: 100dvh; display: grid; place-items: center; padding: 26px 18px 40px;
  background: radial-gradient(120% 80% at 50% 0%, #fbfaf3 0%, var(--bg) 60%);
}
.bizcard {
  width: 100%; max-width: 400px; background: var(--surface);
  border: 1px solid var(--line); border-radius: 22px; padding: 30px 26px 24px;
  box-shadow: var(--shadow-md); text-align: center;
}
.bizcard .mark { width: 74px; height: 74px; margin: 0 auto 16px; display: block; color: var(--accent); }
.bizcard .mono {
  font-family: var(--serif); font-size: 1.3rem; letter-spacing: .08em;
  text-transform: uppercase; line-height: 1.3; margin: 0;
}
.bizcard .sub { font-size: .8rem; color: var(--muted); margin-top: 8px; letter-spacing: .03em; }
.bizcard .cats {
  font-size: .78rem; color: var(--ink-soft); margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--line); letter-spacing: .02em;
}
.bizcard .domain-line { margin-top: 12px; font-size: .8rem; color: var(--muted); }
.bizcard .domain-line strong { color: var(--ink); font-weight: 600; letter-spacing: .02em; }
.bizcard .stockline { color: var(--accent); font-weight: 700; font-size: .9rem; margin-top: 10px; }
.bizcard .rule { height: 1px; background: var(--line); margin: 20px 0; }
.bizcard .actions { gap: 9px; margin: 0; display: grid; }
.qr-panel {
  margin-top: 20px; padding: 18px 16px 16px; border: 2px solid var(--accent);
  border-radius: 16px; background: var(--surface);
}
.qr-panel .qr-title {
  font-size: .78rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink); margin-bottom: 12px;
}
.qr-box { display: grid; place-items: center; gap: 8px; }
.qr-box svg { width: 168px; height: 168px; border-radius: 6px; }
.qr-box .small { font-size: .72rem; color: var(--muted); word-break: break-all; }
.card-points { list-style: none; padding: 0; margin: 18px 0 0; text-align: left; display: grid; gap: 9px; }
.card-points li { display: flex; gap: 9px; align-items: flex-start; font-size: .83rem; color: var(--ink-soft); line-height: 1.45; }
.card-points li::before {
  content: ""; flex: 0 0 auto; width: 7px; height: 7px; margin-top: 7px;
  border-radius: 50%; background: var(--accent);
}
.card-foot {
  margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line);
  font-size: .78rem; color: var(--muted); line-height: 1.5; text-align: left;
}
.card-foot strong { color: var(--ink); display: block; }
.card-contact { margin-top: 10px; display: grid; gap: 4px; }
.card-contact .cc-tel { color: var(--accent); font-weight: 700; letter-spacing: .02em; }
.card-contact .cc-addr { color: var(--ink-soft); }
.card-contact .cc-gate { color: var(--ink); font-weight: 600; }
.card-contact .cc-hours { color: var(--muted); }
@media print {
  .cardpage { min-height: auto; padding: 0; background: #fff; }
  .bizcard { box-shadow: none; border-color: #ddd; max-width: 100%; page-break-inside: avoid; }
  .qr-panel { border-color: var(--accent); }
  .no-print { display: none !important; }
}
`

const mapsHref = (address) =>
  'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(address || '').trim())

const cats = (SITE.categories || []).filter(Boolean)
const phone = (SITE.phone || '').trim()
const address = (SITE.address || '').trim()
const gate = (SITE.gateNote || '').trim()
const hours = (SITE.pickupHours || '').trim()

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(SITE.brand || 'Crazy Hot Deals SLC')} — Business Card</title>
<meta name="description" content="${esc(SITE.tagline || '')} — local pickup in the Salt Lake City area.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#b06c3c" fill-rule="evenodd" d="${FLAME_PATH}"/></svg>`,
)}">
<style>${CSS}</style>
</head>
<body>
<main class="cardpage">
  <div class="bizcard">
    <svg class="mark" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path fill="#b06c3c" fill-rule="evenodd" d="${FLAME_PATH}"/></svg>
    <h1 class="mono">Crazy Hot Deals</h1>
    <div class="sub">SLC</div>
    <div class="cats">${esc(cats.length ? cats.join(' · ') : SITE.tagline || '')}</div>
    <div class="stockline">Fresh pieces in stock — scan or visit to see them all</div>

    <div class="rule"></div>

    <div class="actions no-print">
      <a class="btn btn-primary btn-block" href="${esc(SITE_URL)}" target="_blank" rel="noopener">Browse Available Furniture</a>
      ${phone ? `<a class="btn btn-ghost btn-block" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">Call or text ${esc(phone)}</a>` : ''}
      <button class="btn btn-light btn-block" id="copy-site" type="button">Copy website link</button>
    </div>
    <div class="domain-line no-print">Or visit <strong>${esc(SITE_URL.replace(/^https?:\/\//, ''))}</strong> in your browser</div>

    <ul class="card-points">
      <li>Real photos of every piece</li>
      <li>Local pickup in the Salt Lake City area</li>
      <li>Delivery available for an extra fee</li>
    </ul>

    <div class="rule"></div>

    <div class="qr-panel">
      <div class="qr-title">Scan to see what's in stock</div>
      <div class="qr-box">
        __QR_SVG__
        <div class="small">${esc(SITE_URL.replace(/^https?:\/\//, ''))}</div>
      </div>
    </div>

    <div class="card-foot">
      <strong>Find us on Facebook Marketplace</strong>
      <div class="card-contact">
        ${phone ? `<a class="cc-tel" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">Call or text ${esc(phone)}</a>` : ''}
        ${address ? `<div class="cc-addr">Pickup at: ${esc(address)}${mapsHref(address) ? ` — <a href="${esc(mapsHref(address))}" target="_blank" rel="noopener">Open in Maps</a>` : ''}</div>` : ''}
        ${gate ? `<div class="cc-gate">${esc(gate)}</div>` : ''}
        ${hours ? `<div class="cc-hours">Pickup hours: ${esc(hours)}</div>` : ''}
      </div>
      <div style="margin-top:10px">${esc(SITE.pickupNote || '')}</div>
    </div>
  </div>
</main>

<script>
document.getElementById('copy-site').addEventListener('click', async function () {
  var btn = this
  var done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy website link' }, 1600) }
  try {
    await navigator.clipboard.writeText(${JSON.stringify(SITE_URL)})
    done()
  } catch (e) {
    var ta = document.createElement('textarea')
    ta.value = ${JSON.stringify(SITE_URL)}
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); done() } catch (e2) {}
    document.body.removeChild(ta)
  }
})
</script>
</body>
</html>
`

QRCode.toString(SITE_URL, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => {
  // Give the standalone SVG explicit sizing so it renders without CSS help.
  const sized = svg.replace('<svg ', '<svg width="168" height="168" ')
  const out = html.replace('__QR_SVG__', sized)
  fs.writeFileSync(OUT, out, 'utf8')
  console.log('written:', OUT, '(' + Math.round(out.length / 1024) + ' KB, QR -> ' + SITE_URL + ')')
})
