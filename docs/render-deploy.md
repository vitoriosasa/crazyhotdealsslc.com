# Deploy to Render — Payment · Deploy · Domain, step by step

Goal: run this furniture site publicly on Render, bind `crazyhotdealsslc.com`, so phones and QR scans can open it.
The code is Render-ready: `render.yaml`, `/healthz` health check, data written to a persistent disk, and seed data auto-loaded on first boot.

---

## 0. Two things to understand first (important)

1. **Render's free tier cannot be used**: it ① sleeps after ~15 minutes without traffic (first visit then waits about a minute), and ② has an **ephemeral disk — every deploy/restart wipes items, images, and settings**. So you need the paid **Starter tier + persistent disk**.
2. **Persistent disk**: a 1 GB cloud disk attached to the service. All data (items / site / photos) is written there and survives restarts and redeploys. That's why we don't buy a separate database — for a single-operator furniture site, one disk is enough and simplest.

**Cost**: Starter instance **$7/month** + 1 GB persistent disk **$0.25/month** ≈ **$7.25/month** (HTTPS certificate free). Domain extra, ~$12/year.

---

## 1. How to pay (Render billing)

1. Create a Render account: https://render.com (GitHub / Google / email sign-in all work).
2. Go to **Billing** → **Add payment method**, add a credit card.
3. Render bills **monthly in arrears**: prorated from the day a paid service is created, one invoice per month. **Nothing is charged before you create a service**; delete the service and billing stops.
4. Recommended: set a **Budget alert** in Billing so overruns email you.

> PayPal works in some cases, but a credit card is the most reliable. Only paid tiers can attach a persistent disk — that's the key point.

---

## 2. How to deploy (code → GitHub → connect Render)

Render deploys by pulling from a **GitHub repository**. Two steps: push the code to GitHub, then create the service on Render.

### 2.1 Put the code on GitHub

The code lives locally in the `furniture-site/` folder and needs to be pushed to a GitHub repo:
- If you're not comfortable with Git: tell me — I can **initialize the repo and create the commit**; you just create an empty repo on github.com (Private is fine) and push.
- `.gitignore` is configured: `data/` (local live data) and `node_modules/` are not uploaded; `seed/` (first-deploy seed) is uploaded.

### 2.2 Create the service on Render (Blueprint — easiest)

1. Render dashboard → **New +** → **Blueprint**.
2. Pick the GitHub repo you just pushed and authorize Render.
3. Render reads `render.yaml` and fills in automatically: service name, Node runtime, build/start commands, **1 GB persistent disk (mounted at `/var/data`)**, `DATA_DIR=/var/data`, health check `/healthz`.
4. Click **Apply**. Render builds (`npm install`) and starts (`npm start`).
5. A few minutes later the service is live at `https://<service-name>.onrender.com` — if it opens, the deploy worked.

> You can also use **New + → Web Service** manually, but Blueprint with the ready-made `render.yaml` is less error-prone. Blueprint recommended.

### 2.3 First login to admin

1. Open `https://<service-name>.onrender.com/admin`.
2. The first visit asks you to **set the admin password** (set once, use it to log in).
3. The home page currently has 3 **DEMO** items — delete them in admin and add your real furniture.

---

## 3. Bind the domain crazyhotdealsslc.com

### 3.1 Buy the domain first
- Register `crazyhotdealsslc.com` at Namecheap / Cloudflare / Google Domains (~$12/year).

### 3.2 Add the custom domain in Render
1. Render → your service → **Settings → Custom Domains → Add Custom Domain**.
2. Enter `crazyhotdealsslc.com` (and `www.crazyhotdealsslc.com`).
3. Render shows the **DNS records** to add (usually an A record pointing at Render's IP, or a CNAME pointing at `xxx.onrender.com`) — enter them exactly as shown.

### 3.3 Add DNS at the registrar
- Log in where you bought the domain → DNS settings → add the records Render gave you → save.
- Propagation takes minutes to a few hours. Once live, Render **issues HTTPS automatically** and `https://crazyhotdealsslc.com` opens.

### 3.4 Confirm the site address (QR codes / share links use it)
- Go to `/admin → Site details` and confirm **Public website address = `https://crazyhotdealsslc.com`** (the seed already defaults to it).
- The card QR code and all item share links are based on it — **change it in this one place and the whole site follows**, QR codes regenerate automatically.

> ⚠️ Timing note: if you **deploy first while the domain isn't live yet**, the QR code points at `crazyhotdealsslc.com` and won't open when scanned. Two options: ① buy the domain and finish DNS before handing out cards; or ② temporarily set "Public website address" to `https://<service-name>.onrender.com` so the QR works, then switch back once the domain is live.

---

## 4. Daily maintenance

- **Update the site**: push code changes to GitHub → Render auto-redeploys; **persistent-disk data is untouched**.
- **Backup**: `/admin → Backup → Download backup (JSON)` regularly. If you ever delete and rebuild the service, use **Restore from backup** (the seed is only a first-boot snapshot).
- **Add items**: `/admin → + New item`, upload photos and set the price — identical to the local admin you already use.

---

## 5. At a glance

| Step | Where | Cost |
|---|---|---|
| Register Render + add card | render.com | — |
| Push code to GitHub | github.com | Free |
| Blueprint service | Render | $7/month |
| Persistent disk (already in render.yaml) | Render | $0.25/month |
| Buy domain | registrar | ~$12/year |
| Fill DNS + wait for HTTPS | registrar/Render | Free |

**Total ≈ $7.25/month + $12/year domain.**

---

## What you do / what I can help with

- **I can't do** (needs your account/card): register Render, add a card, create the GitHub repo, buy the domain, fill DNS at the registrar.
- **I can help with**: initializing the Git repo and creating the commit; reviewing `render.yaml`; walking through verification item by item after deploy; writing you a "what exactly to put in DNS" checklist (once you've bought the domain and Render shows the records).
