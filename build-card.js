// Builds the standalone business card: one self-contained HTML file with all
// CSS, the flame mark, the warehouse gate photo and a pre-rendered Messenger
// QR SVG inlined — no server, no network requests, works by double-clicking
// and prints cleanly.
//
// Usage:  node build-card.js "output.html"
// Reads data/site.json for brand / categories / phone / address / gate note /
// hours / Messenger link. The QR code points at the Messenger chat link so a
// scan opens the conversation directly. Re-run after editing site.json.

const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const ROOT = __dirname
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'))
const OUT = process.argv[2] || path.join(ROOT, 'card-standalone.html')

const SITE_URL = (SITE.publicUrl || 'https://crazyhotdealsslc.com').replace(/\/+$/, '')
const MESSENGER = (SITE.messengerUrl || '').trim() || 'https://m.me/fengqin.xiao.7'
const FLAME_PATH =
  'M32 5 C43 19 45 26 45 34 A13 13 0 1 1 19 34 C19 26 21 19 32 5 Z ' +
  'M32 24 C36.5 30 38.5 33.5 38.5 36.5 A6.5 6.5 0 1 1 25.5 36.5 C25.5 33.5 27.5 30 32 24 Z'

// The annotated pickup-gate photo, embedded so the file stays self-contained.
const GATE_IMAGE = path.join(ROOT, 'data/uploads/warehouse-gate.jpg')
const GATE_DATA_URI = fs.existsSync(GATE_IMAGE)
  ? 'data:image/jpeg;base64,' + fs.readFileSync(GATE_IMAGE).toString('base64')
  : ''

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const CSS = `
:root {
  --bg: #f4ecdd; --surface: #fbf8f1;
  --ink: #38352a; --ink-soft: #5f564a; --muted: #8b8178;
  --line: #e5d9c1; --line-strong: #d6c6a6;
  --accent: #b06c3c; --accent-dark: #96592c;
  --serif: "Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,"Times New Roman",serif;
  --sans: -apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--sans); font-size: 17px; line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
img, svg { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button { font: inherit; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 18px; border-radius: 999px; border: 1px solid transparent;
  background: var(--ink); color: #fff; font-size: 1rem; font-weight: 600;
  cursor: pointer; text-align: center;
}
.btn-primary { background: var(--accent); }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--line-strong); }
.btn-light { background: #fff; color: var(--ink); border-color: var(--line); }
.btn-block { width: 100%; }
.cardpage {
  min-height: 100dvh; display: grid; place-items: center; padding: 26px 16px 40px;
  background: radial-gradient(120% 80% at 50% 0%, #fbfaf3 0%, var(--bg) 60%);
}
.bizcard {
  width: 100%; max-width: 430px; background: var(--surface);
  border: 1px solid var(--line); border-radius: 22px; padding: 30px 26px 24px;
  box-shadow: 0 2px 6px rgba(62,47,36,.08), 0 18px 40px rgba(62,47,36,.09);
}
.bizcard .mark { width: 76px; height: 76px; margin: 0 auto 14px; display: block; color: var(--accent); }
.bizcard .mono {
  font-family: var(--serif); font-size: 1.62rem; letter-spacing: .07em;
  text-transform: uppercase; line-height: 1.25; margin: 0; text-align: center;
}
.bizcard .sub { font-size: 1rem; color: var(--muted); margin-top: 6px; letter-spacing: .04em; text-align: center; }
.bizcard .cats {
  font-size: .95rem; color: var(--ink-soft); margin-top: 14px; padding-top: 14px;
  border-top: 1px solid var(--line); text-align: center;
}
.bizcard .rule { height: 1px; background: var(--line); margin: 20px 0; }
.bizcard .actions { gap: 10px; display: grid; }
/* website line */
.site-line { text-align: center; margin-top: 4px; }
.site-line .lbl { font-size: .82rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.site-line .url {
  font-family: var(--serif); font-size: 1.42rem; font-weight: 600; color: var(--ink);
  letter-spacing: .01em; margin-top: 4px; word-break: break-all;
}
/* messenger QR */
.qr-panel {
  margin-top: 20px; padding: 20px 16px 18px; border: 2px solid var(--accent);
  border-radius: 16px; background: var(--surface); text-align: center;
}
.qr-panel .qr-title {
  font-size: .92rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink); margin-bottom: 14px;
}
.qr-box { display: grid; place-items: center; gap: 10px; }
.qr-box svg { width: 200px; height: 200px; }
.qr-box .small { font-size: .88rem; color: var(--muted); word-break: break-all; font-weight: 600; }
/* warehouse block (bottom of the card) */
.warehouse { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); text-align: left; }
.warehouse .wh-title {
  font-size: .82rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  color: var(--accent-dark); margin-bottom: 12px;
}
.warehouse img.gate {
  width: 100%; border-radius: 12px; border: 1px solid var(--line);
  aspect-ratio: 4 / 3; object-fit: cover; margin-bottom: 12px;
}
.warehouse .row { display: grid; gap: 6px; font-size: .95rem; color: var(--ink-soft); line-height: 1.5; }
.warehouse .row .addr { color: var(--ink); font-weight: 600; }
.warehouse .row .gate-note { color: var(--ink); font-weight: 600; }
.warehouse .row .hours { color: var(--muted); }
.warehouse .row a { color: var(--accent); font-weight: 700; text-decoration: underline; }
.warehouse .tel { margin-top: 10px; font-size: 1.05rem; font-weight: 700; color: var(--accent); }
@media print {
  .cardpage { min-height: auto; padding: 0; background: #fff; }
  .bizcard { box-shadow: none; border-color: #ddd; max-width: 100%; page-break-inside: avoid; }
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
<meta name="description" content="${esc(SITE.tagline || '')} — local pickup in the Salt Lake City area. Message us on Messenger.">
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

    <div class="rule"></div>

    <div class="site-line">
      <div class="lbl">Browse all furniture at</div>
      <div class="url">${esc(SITE_URL.replace(/^https?:\/\//, ''))}</div>
    </div>

    <div class="rule"></div>

    <div class="qr-panel">
      <div class="qr-title">Scan to message us</div>
      <div class="qr-box">
        __QR_SVG__
        <div class="small">${esc(MESSENGER.replace(/^https?:\/\//, ''))}</div>
      </div>
    </div>

    <div class="actions no-print" style="margin-top:16px">
      <a class="btn btn-primary btn-block" href="${esc(SITE_URL)}" target="_blank" rel="noopener">Browse Available Furniture</a>
      <a class="btn btn-ghost btn-block" href="${esc(MESSENGER)}" target="_blank" rel="noopener">Message Us on Messenger</a>
      ${phone ? `<a class="btn btn-light btn-block" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">Call or text ${esc(phone)}</a>` : ''}
    </div>

    <div class="warehouse">
      <div class="wh-title">Pickup Warehouse</div>
      ${GATE_DATA_URI ? `<img class="gate" src="${GATE_DATA_URI}" alt="Pickup gate — the four white roll-up doors on the building">` : ''}
      <div class="row">
        ${address ? `<div class="addr">Pickup at: ${esc(address)}${mapsHref(address) ? ` — <a href="${esc(mapsHref(address))}" target="_blank" rel="noopener">Open in Maps</a>` : ''}</div>` : ''}
        ${gate ? `<div class="gate-note">${esc(gate)}</div>` : ''}
        ${hours ? `<div class="hours">Pickup hours: ${esc(hours)}</div>` : ''}
      </div>
      ${phone ? `<a class="tel" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">Call or text ${esc(phone)}</a>` : ''}
    </div>
  </div>
</main>
</body>
</html>
`

QRCode.toString(MESSENGER, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => {
  // Explicit sizing so the QR renders without CSS help.
  const sized = svg.replace('<svg ', '<svg width="200" height="200" ')
  const out = html.replace('__QR_SVG__', sized)
  fs.writeFileSync(OUT, out, 'utf8')
  console.log('written:', OUT, '(' + Math.round(out.length / 1024) + ' KB, QR -> ' + MESSENGER + ')')
})
