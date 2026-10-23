# Crazy Hot Deals SLC — Page Structure · Admin Plan · Costs

First-version scope: **showcase + route to Messenger**. No cart, no online payment, no automatic shipping, no buyer accounts.

Brand from the printed card: Crazy Hot Deals SLC / crazyhotdealsslc.com / Salt Lake City area.
Warehouse: 46 Orange Street, Salt Lake City, UT 84116 · Phone 916-716-1212 · Pickup gate: the four white roll-up doors.

---

## 1. Page structure

| Page | Path | Content | Status |
|---|---|---|---|
| Catalog home | `/` | Brand, one-line positioning, trust strip, **search**, category filter, **price sort**, in-stock grid (cover / title / price / status badge / **quantity** / **New badge** / item code), pickup note | Done |
| Item page | `/p/<id>` | Multi-image + **click-to-zoom lightbox**, price, dimensions, color, condition, **what's included**, **what's NOT included**, **quantity in stock**, three contact buttons, mobile sticky action bar | Done |
| Digital card | `/card` | Matches the printed card layout (mark / CRAZY HOT DEALS / SLC / categories / in-stock count / **QR panel** / three selling points / phone / pickup address / pickup gate), printable | Done |
| **Listing text** | `/listing/<id>` | One-click Marketplace title / price / description, **per-photo download**, missing-field hints, link backfill after posting | Done (this round) |
| Admin | `/admin` | Password login → stats block → **take-down reminders** → item list (**stock −/+**, status, hide, edit), **stock log**, edit form (included/not-included parts, Marketplace link), **backup export/restore**, site info, change password | Done |

Navigation logic: home → item page → Messenger; card → home → item page. Every page can reach Messenger in one tap.

### Button copy

- `Ask About This Item` — opens Messenger prefilled with "item name + item code + item link"
- `Contact Us on Facebook` — your Facebook page
- `Request a Delivery Quote` — prefilled template asking for ZIP / stairs details
- `Copy item link` — copies the item link (uses `publicUrl`, so local dev also shows the live domain)

### Pickup / delivery note

> Local pickup is our primary option at our warehouse: 46 Orange Street, Salt Lake City, UT 84116. Local delivery may be available for an additional fee — message us with your ZIP code and any stairs or access details for a quote. Pickup and delivery must be confirmed in advance.

**No fixed shipping fee is promised** — every delivery is quoted individually after the address is known.

---

## 2. Operating capabilities added this round

| Capability | Why it's needed |
|---|---|
| **Quantity `quantity`** | "3 in stock" vs "only 1 left" are different products to a buyer. Showing the count cuts pointless questions. |
| **Stock change log** | When running solo, the biggest fear is "did this actually sell?". Every −/+ records time, amount, and reason. |
| **Automatic status linkage** | Quantity to 0 → auto **Sold**; quantity back → auto **Available**. No manual double-editing, no contradictions. |
| **Sold items visible 7 days** | Buyers who saved a link still see "sold + browse others" for 7 days; then auto-hidden so the catalog isn't flooded with old stock. |
| **Marketplace listing page** | Description, price, and photos generated together — copy-paste ready. The tool never posts for you (avoids account risk flags). |
| **Take-down tracking reminders** | Sold here but still listed on Marketplace is the #1 source of "is this still available?" messages. Admin reminds you until you confirm removal. |
| **Missing-field hints** | Missing dimensions / condition / included / not-included are called out by name on the list and listing pages. |
| **Backup export / restore** | Single-file JSON, savable offline; restore never overwrites the admin password. |

---

## 3. Admin plan

- **Auth**: single admin password (scrypt salted hash, server-side), HttpOnly Cookie session, 12 hours.
- **Item fields**: title, code, category, price, price note, status, **quantity**, dimensions, color, condition, included parts, **not-included parts**, description, images (up to 12), hidden, **Marketplace link & posted status**, **delisted time**.
- **Images**: browser-side compression (1600px main + 640px thumb), stored in `data/uploads/`. Home page loads thumbnails only.
- **Persistence**: `data/products.json` + `data/site.json` + `data/stock-log.json` + `data/uploads/` (on the Render persistent disk in production).
- **Security baseline**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `robots.txt` blocks `/admin`, upload type whitelist, all output escaped via `App.esc`.

### Business card (standalone file)

The business card is **not part of the website** — it is a single self-contained HTML file
(`Crazy Hot Deals SLC - Business Card.html`) with all CSS, the flame mark and a pre-rendered
QR SVG inlined. It works offline (double-click to open), prints cleanly (Ctrl+P), and its QR
code points at **`https://crazyhotdealsslc.com`** — the website home page, where buyers see
the live catalog. The server no longer generates QR codes or serves a card page.

> To reprint with updated contact details: edit the values in `data/site.json`, run
> `node build-card.js "output.html"` (the build script reads site.json and bakes in a fresh QR),
> then print the new file.

---

## 4. Costs

| Item | Current (local) | When buyers' phones must open it |
|---|---|---|
| Server / hosting | $0 (runs on your computer) | Render Starter $7/month + 1 GB disk $0.25/month |
| Database | $0 (JSON files) | Same — JSON on the persistent disk |
| Image storage | $0 (local disk) | Same — `uploads/` on the disk |
| Admin login | $0 (built-in password) | Same |
| Domain | Not needed | ~$12/year, you register `crazyhotdealsslc.com` |
| Daily upkeep | ~2 minutes per new item | Same |

Render's free tier is not usable (sleeps without traffic; ephemeral disk wipes data). Details in `docs/render-deploy.md`.

---

## 5. Current boundaries (know these)

1. Only the machine running `npm start` can reach the site — phones and other computers can't, until public deployment.
2. Data lives in `data/` — **delete it and it's gone**. One-click backup exists, but still save a copy to cloud storage or email regularly.
3. Single-operator only; no simultaneous editing by two people.
4. Marketplace text is generated only — **publishing is still done by you** on Facebook.
5. The site is English-only.

---

## 6. Next steps

1. In admin, confirm "Public website address" = `https://crazyhotdealsslc.com`.
2. Send real furniture photos + price / dimensions / condition / included & not-included parts → I batch-enter the first 3–5 items for style calibration.
3. Confirm public launch; after your OK I deploy and hand you links you can send straight to buyers.
