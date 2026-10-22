# Launch-Ready Version — Technical Plan · Running Costs · Launch Checklist

> Scope rule: **showcase + route to Messenger / Facebook Marketplace**. No cart, no online payment, no buyer accounts. Single admin.
> Visual rule: **sand / brown / copper, no green** (the palette has been switched back to copper from the printed card).

---

## 0. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | **Brand name** | Crazy Hot Deals SLC (domain `crazyhotdealsslc.com`) |
| 2 | **Hosting** | ✅ **Decided: Render Starter ($7/month)** |
| 3 | **Data + image storage** | ✅ **Decided: Render persistent disk (1 GB, $0.25/month)** — no separate cloud DB; simplest for a single-operator site, all data on the disk |

> Step-by-step payment/deploy/domain guide: **`docs/render-deploy.md`**. The code is Render-ready (`render.yaml`, `/healthz`, `DATA_DIR`, `seed/` first-boot data load) and verified locally with a simulated empty-disk boot.
> One final confirmation before go-live (see section 6).

---

## 1. Goal & scope

**Unchanged**
- Catalog home / item pages / digital card / Marketplace listing text / admin panel
- Sales still happen on Facebook Marketplace + Messenger; the site only showcases and routes
- Single admin; no payment / cart / buyer accounts

**Added in this round**
1. **Cloud data**: `data/*.json` on the Render persistent disk — survives crashes, restarts, and redeploys
2. **Cloud image storage**: `data/uploads/` on the same disk, served via `/media/`
3. **Server-side admin login**: existing scrypt + Cookie, kept and hardened
4. **Open Graph preview per item page**: share to WhatsApp/iMessage/Facebook shows item image + title + price
5. **Launchable**: public domain + HTTPS + env-var config + deploy artifacts

---

## 2. Architecture

```
Buyer browser / share crawler
      │  https://crazyhotdealsslc.com
      ▼
[ Host: long-running Node service ]  ── Render Starter
   · static pages + API + server-rendered OG meta
   · login session Cookie (HttpOnly)
      │
      ▼
[ Render persistent disk 1 GB ]   products / site / stock-log / uploads
```

- **Hosting**: one long-running service on `node server.js`. Render handles the runtime; HTTPS is automatic.
- **Data**: JSON files on the persistent disk at `DATA_DIR` (Render: `/var/data`). `seed/` in the repo loads on first boot when the disk is empty.
- **Login**: scrypt salted hash; HttpOnly Cookie session, 12 hours. **No buyer accounts.**
- **OG preview (key)**: `/p/<id>` now injects `og:title / og:description / og:image / og:url` + `twitter:card` server-side, so crawlers that don't run JavaScript get the item preview. Real users still get the full JS-rendered page. Home `/` and card `/card` have matching OG tags. `og:image` is always an absolute URL.
- **Config**: `PORT` (Render injects), `DATA_DIR`, `PUBLIC_URL` (falls back to the site's publicUrl).
- **Visual**: copper / sand / brown from the printed card — copper `#B06C3C`, sand `#E8DCC6`, paper `#FBF8F1`, brown `#3E2F24`, light brown border `#E5D9C1`.

---

## 3. Change list (mapped to existing files)

| File | Change |
|---|---|
| `server.js` | `DATA_DIR` env var; `/p/<id>` server-side OG meta injection; `/healthz`; first-boot seed load; security headers |
| `package.json` | Node engine pin; `npm start` entry |
| `public/*.html` + `style.css` | copper/sand/brown palette (green removed); OG placeholder meta on home and card |
| `render.yaml` (new) | Render Blueprint: service + 1 GB disk + `DATA_DIR=/var/data` + health check |
| `seed/` (new) | First-boot seed: site, 3 demo items, photos, empty log |
| `smoke-test.py` / `ui-test.js` | Kept; cover seed load, OG meta, stock linkage, 7-day hide |

---

## 4. Running costs (estimates; confirm current prices on the vendor site)

| Item | Recommended config | Monthly | Yearly |
|---|---|---|---|
| Domain | Namecheap/Cloudflare `.com` | — | ~$12 |
| Hosting | Render Starter (always on) | $7 | $84 |
| Data + images | Render persistent disk 1 GB | $0.25 | $3 |
| **Total (recommended)** | | **~$7.25** | **~$99** |

> Render's free tier is not usable: it sleeps without traffic and its disk is ephemeral (data loss on every deploy). Admin login and backups are $0.

---

## 5. Launch checklist (tick before go-live)

**Domain & DNS**
- [ ] Domain registered and ownership confirmed
- [ ] DNS: A record (or CNAME) pointing at the host; propagated (`dig`/`nslookup` verified)

**Data & storage**
- [ ] Persistent disk attached (1 GB), `DATA_DIR=/var/data` set
- [ ] Seed loaded on first boot; item/site counts verified
- [ ] One "export backup → restore" drill passed

**Deploy**
- [ ] Service always on (PaaS automatic), `/healthz` returns 200
- [ ] HTTPS live; http redirects to https

**Functional verification (real phone)**
- [ ] Home, item page, card `/card` all render; QR code points at the live domain and scans
- [ ] Admin login/logout; stock change flips to Sold; upload an image and confirm it shows on the item page
- [ ] Messenger button opens the right chat
- [ ] Phone / pickup address / pickup-gate note all visible

**OG link preview (focus)**
- [ ] Facebook Sharing Debugger on `/p/<id>` shows image + title + price
- [ ] Send to WhatsApp / iMessage; thumbnail and copy correct
- [ ] `og:image` is an absolute URL with sane dimensions

**Performance & security**
- [ ] Lighthouse mobile pass; home page loads thumbnails only
- [ ] Security headers present; `/admin` blocked in robots.txt
- [ ] `sitemap.xml` / `robots.txt` point at the live domain

**Visual**
- [ ] No green anywhere; copper/sand/brown throughout; copper brand mark
- [ ] No Chinese anywhere; site is English-only

---

## 6. Flow & confirmation points

1. **Now**: you confirm this document — hosting (Render) and costs are settled.
2. **I build**: verified locally (127.0.0.1), show you the result, still private.
3. **Final confirmation before go-live**: only after your go-ahead do I deploy + configure DNS and hand you links you can send to buyers.

> The domain must be registered by you (I can't register it); hosting uses your Render account. Registration and setup: hand me the keys/connection strings, or fill them into the environment yourself.
