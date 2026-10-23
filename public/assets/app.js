const App = (() => {
  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      ...options,
    })
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`)
      err.status = res.status
      throw err
    }
    return data
  }

  const money = (n) => {
    const v = Number(n) || 0
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  const STATUS = {
    available: { label: 'Available', cls: 'is-available' },
    pending: { label: 'Pending pickup', cls: 'is-pending' },
    sold: { label: 'Sold', cls: 'is-sold' },
    draft: { label: 'Draft', cls: 'is-draft' },
  }

  // Google Maps deep link for the pickup address — opens the native app on phones.
  function mapsHref(address) {
    const q = String(address || '').trim()
    if (!q) return ''
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)
  }

  // The flame mark ("hot deals"), inlined so it needs no image request.
  // One path, evenodd: outer flame minus an inner teardrop cutout.
  const FLAME_PATH =
    'M32 5 C43 19 45 26 45 34 A13 13 0 1 1 19 34 C19 26 21 19 32 5 Z ' +
    'M32 24 C36.5 30 38.5 33.5 38.5 36.5 A6.5 6.5 0 1 1 25.5 36.5 C25.5 33.5 27.5 30 32 24 Z'

  const FLAME_MARK =
    '<svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
    `<path fill="currentColor" fill-rule="evenodd" d="${FLAME_PATH}"/>` +
    '</svg>'

  const FLAME_MARK_LARGE =
    '<svg class="mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
    `<path fill="#b06c3c" fill-rule="evenodd" d="${FLAME_PATH}"/>` +
    '</svg>'

  // Brand lockup split: keep an ampersand tail intact ("Sofa & Bed Co"
  // -> "Sofa" / "Bed Co"), keep a trailing short all-caps token (city/state
  // code) as the sub line ("Crazy Hot Deals SLC" -> "Crazy Hot Deals" /
  // "SLC"), otherwise split a two-word name on its first space.
  function splitBrand(brand) {
    const fallback = { head: 'Crazy Hot Deals', tail: 'SLC' }
    if (!brand) return fallback
    const b = String(brand).trim()
    const m = b.match(/^(.*?)\s*&\s*(.+)$/)
    if (m) return { head: m[1].trim(), tail: m[2].trim() }
    const sp = b.split(/\s+/)
    if (sp.length >= 2 && /^[A-Z]{2,4}$/.test(sp[sp.length - 1])) {
      return { head: sp.slice(0, -1).join(' '), tail: sp[sp.length - 1] }
    }
    if (sp.length >= 2) return { head: sp[0], tail: sp.slice(1).join(' ') }
    return { head: b, tail: '' }
  }

  function brandLockup(site, asClass) {
    const { head, tail } = splitBrand(site.brand)
    return (
      `<span class="brand-lockup${asClass ? ' ' + asClass : ''}">${FLAME_MARK}` +
      `<span class="brand-text"><span class="brand-name">${esc(head)}</span>` +
      `<span class="brand-sub">${esc(tail)}</span></span></span>`
    )
  }

  function messengerHref(site, text) {
    const base = (site.messengerUrl || '').trim() || (site.facebookUrl || '').trim()
    if (!base) return ''
    const q = text ? `?text=${encodeURIComponent(text)}` : ''
    if (base.includes('?')) return base + (text ? '&text=' + encodeURIComponent(text) : '')
    return base + q
  }

  // Prefer the public domain configured in admin so shared links work outside localhost.
  function productLink(id, site) {
    const base = site && site.publicUrl ? String(site.publicUrl).replace(/\/+$/, '') : ''
    return `${base || location.origin}/p/${encodeURIComponent(id)}`
  }

  function askText(product, site) {
    const bits = [`Hi! I'm interested in ${product.title}`]
    if (product.code) bits.push(`(item code ${product.code})`)
    bits.push(`— ${productLink(product.id, site)}`)
    return bits.join(' ')
  }

  function renderHeader(site, active) {
    const host = document.getElementById('site-header')
    if (!host) return
    const nav = [['/card', 'Card', 'card']]
    host.className = 'site-header'
    host.innerHTML = `
      <div class="wrap header-inner">
        <a href="/" aria-label="${esc(site.brand || 'Home')}">${brandLockup(site)}</a>
        <nav class="header-nav">
          ${nav
            .map(
              ([href, label, key]) =>
                `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`,
            )
            .join('')}
        </nav>
        ${
          site.facebookUrl
            ? `<a class="btn btn-sm btn-ghost" href="${esc(site.facebookUrl)}" target="_blank" rel="noopener">Contact us</a>`
            : ''
        }
      </div>`
  }

  function renderFooter(site) {
    const host = document.getElementById('site-footer')
    if (!host) return
    host.className = 'site-footer'
    host.innerHTML = `
      <div class="wrap footer-grid">
        <div>
          <div class="footer-brand">${esc(site.brand || '')}</div>
          <div style="margin-top:6px">${esc(site.tagline || '')}</div>
          ${site.city ? `<div style="margin-top:4px">${esc(site.city)}</div>` : ''}
        </div>
        <div class="footer-links">
          ${site.facebookUrl ? `<a href="${esc(site.facebookUrl)}" target="_blank" rel="noopener">Facebook</a>` : ''}
          ${site.phone ? `<a href="tel:${esc(site.phone)}">${esc(site.phone)}</a>` : ''}
          ${site.email ? `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>` : ''}
          <a href="/card">Digital card</a>
        </div>
      </div>
      <div class="wrap" style="margin-top:18px;font-size:.78rem;line-height:1.5">
        Local pickup is our primary option. Local delivery may be available for an additional fee — message us with your ZIP code for a quote.
      </div>`
  }

  // ---------- lightbox ----------
  function ensureLightbox() {
    let el = document.getElementById('lightbox')
    if (el) return el
    el = document.createElement('div')
    el.id = 'lightbox'
    el.className = 'lightbox'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-label', 'Photo viewer')
    el.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close">×</button><img alt="">'
    el.addEventListener('click', () => el.classList.remove('open'))
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') el.classList.remove('open')
    })
    document.body.appendChild(el)
    return el
  }

  function openLightbox(src, alt) {
    const el = ensureLightbox()
    const img = el.querySelector('img')
    img.src = src
    img.alt = alt || ''
    el.classList.add('open')
  }

  function toast(message, isError) {
    let el = document.querySelector('.toast')
    if (!el) {
      el = document.createElement('div')
      el.className = 'toast'
      document.body.appendChild(el)
    }
    el.textContent = message
    el.classList.toggle('err', Boolean(isError))
    el.classList.add('show')
    clearTimeout(el._t)
    el._t = setTimeout(() => el.classList.remove('show'), 2600)
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text)
      toast(label || 'Copied')
      return true
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      document.body.removeChild(ta)
      toast(ok ? label || 'Copied' : text, !ok)
      return ok
    }
  }

  // ---------- Marketplace listing text ----------
  // Reused by both the admin listing page and the admin item row.
  function listingTitle(product) {
    const bits = [product.title]
    if (product.condition) bits.push(product.condition)
    return bits.join(' — ')
  }

  function listingDescription(product, site, withLink) {
    const lines = []
    if (product.description) lines.push(product.description, '')
    if (product.condition) lines.push(`Condition: ${product.condition}`)
    if (product.color) lines.push(`Color: ${product.color}`)
    if (product.dimensions) lines.push(`Size: ${product.dimensions}`)
    if (product.includes) lines.push(`Included: ${product.includes}`)
    if (product.notIncluded) lines.push(`NOT included: ${product.notIncluded}`)
    const q = Number(product.quantity)
    if (q > 1) lines.push(`Quantity available: ${q}`)
    lines.push('', `Item code ${product.code || '—'}`)
    if (withLink) lines.push('', `Photos & full details: ${productLink(product.id, site)}`)
    lines.push(
      '',
      'Local pickup is our primary option. Local delivery may be available for an additional fee — message us with your ZIP code and any stairs or access details for a quote. Pickup and delivery must be confirmed in advance.',
    )
    return lines.join('\n')
  }

  // Fields a buyer will ask about if they are missing — surfaced in admin.
  function missingFields(product) {
    const miss = []
    if (!product.price) miss.push('price')
    if (!product.images || !product.images.length) miss.push('photos')
    if (!product.dimensions) miss.push('size')
    if (!product.condition) miss.push('condition')
    if (!product.includes) miss.push('what is included')
    if (!product.notIncluded) miss.push('what is NOT included')
    return miss
  }

  return {
    api, money, esc, STATUS, FLAME_MARK, FLAME_MARK_LARGE, brandLockup, splitBrand,
    messengerHref, productLink, askText, mapsHref,
    renderHeader, renderFooter, openLightbox, toast, copy,
    listingTitle, listingDescription, missingFields,
  }
})()