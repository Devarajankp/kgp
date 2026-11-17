# Kerala Gold Price (KGP) — Progressive Web App & Public Gold Rate API

An installable, offline-capable **Progressive Web App (PWA)** and **API-ready backend** for tracking live 22K Kerala gold prices (`1 Gram` & `1 Pavan / 8g`), browsing complete daily/monthly/yearly historical archives back to **1925**, estimating jewellery bills, and building **Apple iPhone Shortcuts** or external web integrations.

---

## Core App Features

- **History Tab (Left)**: Browse Daily Archives (`Nov 2009 – Present`), Monthly benchmarks, and Yearly history (`1925 – Present`) with instant search, interactive X/Y-axis SVG chart, and auto-pruning IndexedDB offline cache.
- **Gold Price Tab (Center — Default)**:
  - Live Kerala 22K **1 Pavan (8g)** & **1 Gram** rates (`24K` & `18K` comparison) with brushed metallic gold Fraunces typography and shimmer highlight.
  - **Simultaneously Pinned Header & Native Mobile Bottom Navigation**: Header and bottom tab bar stay visible together without hiding each other.
  - **Day / Night Themes & Bilingual View (`English / മലയാളം`)**.
  - **Theme-Matched Share Card (`Web Share API` + `PNG`)**: Generates a Day/Night theme-matched brushed gold rate card including the **last 5 recent rate updates** so buyers immediately see multi-day momentum before sharing or saving PNG.
  - **Dual-Unit Price Alerts (Master ON/OFF)**: Toggleable instant rate-change alerts (`🟢 ▲` rise / `🔴 ▼` drop for both 1 Pavan & 1 Gram), daily summaries, and custom target thresholds (`≤` or `≥`) across Browser Push, iOS Home-Screen PWA Push, In-App banners, and Apple iPhone Shortcuts.
  - **Live Global Spot & Buy-vs-Wait Outlook**: Compares live raw `XAU/INR` & `USD/INR` market feeds (`LivePriceOfGold.com`) against Kerala AKGSMA retail rates for urgent vs. flexible buyer context (no fabricated price guarantees).
  - **8-Source Live Fallback Chain**: Automatically switches across verified providers if any single source is slow or down.
- **Calculator Tab (Right)**: Auto-syncs live rates; supports `22K / 24K / 18K`, `Pavan / Gram`, `% / ₹ per gram / Flat` making charges, `GST`, `BIS HUID` hallmarking (`₹45`), stone charges, old-gold exchange, and reverse budget weight estimation.

---

## Public API & Apple iPhone Shortcuts Support

All endpoints support **CORS (`*`)**, per-IP rate limiting (`120 req/min`), strict input validation, and short-TTL caching. Interactive schema discovery is available at `GET /api/openapi.json`.

### Live Node Server Endpoints (`/api/*`)

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Server health, API version, and active provider list |
| `/api/openapi.json` | `GET` | Full **OpenAPI 3.1.0** specification for web apps & SDK generators |
| `/api/gold/shortcut` | `GET` | Flat zero-nesting JSON (or `?format=text&lang=en\|ml` plain text) built for **Apple iPhone Shortcuts**, Scriptable & KWGT widgets |
| `/api/gold/latest` | `GET` | Full Kerala 22K/24K/18K rates, intraday logs, high/low & optional `?source=&probe=true&refresh=true` |
| `/api/gold/stream` | `GET` | **Server-Sent Events (SSE)** real-time stream pushing `gold-update` whenever any provider updates |
| `/api/push/public-key` | `GET` | Returns the server's **VAPID Public Key** for browser & PWA background Web Push |
| `/api/push/subscribe` | `POST` | Subscribes device + alert preferences for closed-app Web Push notifications |
| `/api/gold/history` | `GET` | `?mode=daily\|monthly\|yearly&year=2026&month=november` historical archive |
| `/api/gold/spot` | `GET` | Live international `XAU/INR`, `USD/INR`, 24h change %, and day high/low |
| `/api/gold/sources` | `GET` | Live status & latency probe across all 8 Kerala providers |
| `/api/gold/calculate` | `GET` / `POST` | Live jewellery bill & reverse budget estimator (`?weight=2&unit=pavan&purity=22k&makingMode=percent&makingValue=10&gst=3&hallmark=true`) |
| `/api/gold/alert-check` | `GET` | Daily, rate-change & optional target alert check (`?target=98000&unit=pavan&direction=below&prevPavan=100920&format=text&lang=en\|ml`) with dual 1 Pavan & 1 Gram color-coded symbols |

### Static GitHub Pages JSON Endpoints (No Node Server Needed)
When deployed to **GitHub Pages**, `.github/workflows/deploy-pages.yml` automatically refreshes these static JSON files across Kerala's morning & afternoon bullion update windows (**09:15 AM – 06:00 PM IST**):
- `https://<username>.github.io/<repo>/api/shortcut.json`
- `https://<username>.github.io/<repo>/api/latest.json`
- `https://<username>.github.io/<repo>/api/spot.json`
- `https://<username>.github.io/<repo>/data/kerala-gold-snapshot.json`

### Step-by-Step: Build an Apple iPhone Shortcut

1. Open the **Shortcuts** app on iPhone and tap **+** (New Shortcut).
2. Add **Get Contents of URL** and set the URL to:
   - Live server: `https://<your-server>/api/gold/shortcut`
   - Or GitHub Pages: `https://<your-username>.github.io/<repo>/api/shortcut.json`
3. Read values easily with **Get Dictionary Value**:
   - `summaryText` (or `summaryMalayalam`) → pass to **Show Notification** or **Speak Text**.
   - `pavan22kFormatted`, `gram22kFormatted`, `changePavan`, `outlookNote` → build lock-screen widgets or custom alerts.
4. **Daily & Price-Change Alert Automation**:
   - In **Automation → Time of Day (9:45 AM & 4:00 PM IST)** → **Get Contents of URL** `https://<your-server>/api/gold/alert-check?format=text` (or add `?target=98000&unit=pavan`) → **Show Notification** with the returned dual-unit color-coded summary (`🟢 ▲` / `🔴 ▼`).

---

## Verified Data Sources & Fallback Scope

- **Primary Rate & Archive Source**: [KeralaGold.com](https://www.keralagold.com/daily-gold-prices.htm) (`daily`, `monthly`, `yearly` since 1925)
- **Live Fallback Providers**:
  - [LiveGoldKerala.com](https://www.livegoldkerala.com/) & [Gold Rate History](https://www.livegoldkerala.com/gold-rate-history)
  - [GoodReturns.in](https://www.goodreturns.in/gold-rates/kerala.html)
  - [Groww.in](https://groww.in/gold-rates/gold-rate-today-in-kerala)
  - [BankBazaar.com](https://www.bankbazaar.com/gold-rate-kerala.html)
  - [Jos Alukkas](https://www.josalukkasonline.com/gold-rate-today/kerala)
  - [Kalyan Jewellers](https://store.kalyanjewellers.net/gold-rate/kerala/en)
  - [Times of India](https://timesofindia.indiatimes.com/business/gold-rates-today/gold-price-in-kerala)
- **Live International Spot Feed**: [LivePriceOfGold.com](https://www.livepriceofgold.com/india-gold-price.html) (`XAU/INR` & `USD/INR`)
- **Excluded Sources**: `malabargoldanddiamonds.com`, `tanishq.co.in`, `bhimagold.com`, and `vaibhavjewellers.com` were excluded due to bot-protection challenges or client-only empty HTML tables.

---

## Privacy, Security & Copyright Notes

- **Zero Tracking**: No analytics, no cookies, no user accounts, and no personal data leave your device. See [SECURITY.md](./SECURITY.md).
- **Device-Only Cache**: History and active snapshots stay inside local `IndexedDB` (`kgp-device-cache`) with automatic pruning of unused history older than 14 days.
- **Anti-Spam Protection**: Short server TTL caching (`45s–5m`) and per-IP rate limiting prevent excessive upstream scraping.
- **Attribution**: Application source code is MIT licensed ([LICENSE](./LICENSE)). Fetched market prices remain the informational property of their respective source publishers listed above.

---

## Step-by-Step GitHub & Hosting Deployment Guide

### Option A: Free Hosting on GitHub Pages (Static PWA + Daily Auto-Synced Shortcut JSON)

1. **Create a new repository on GitHub** (e.g., `kerala-gold-price`). Do not initialize with a conflicting README if pushing an existing project.
2. **Push your code from your computer** (run inside the project folder):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Kerala Gold Price PWA & API"
   git branch -M main
   git remote add origin https://github.com/<your-username>/kerala-gold-price.git
   git push -u origin main
   ```
3. **Turn on GitHub Pages**:
   - Open your GitHub repository → **Settings** → **Pages** (left sidebar).
   - Under **Build and deployment → Source**, choose **GitHub Actions**.
4. **Wait ~1–2 minutes**:
   - Go to the **Actions** tab to watch `Deploy Kerala Gold Price PWA to GitHub Pages` complete.
   - Your PWA goes live at `https://<your-username>.github.io/kerala-gold-price/` and refreshes static gold JSON daily at `09:45 AM IST`.

### Option B: Full-Stack Node Hosting (Live On-Demand `/api/gold/*` + Calculator + Alerts)

Deploy this same GitHub repo on **Render**, **Railway**, **Fly.io**, or **Google Cloud Run**:
- **Runtime**: Node.js `22+`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start` (runs `node server.ts` on `PORT=3000` or platform `PORT`)
- **Live API Base**: `https://<your-app-domain>/api/openapi.json`

---

## Credits & Acknowledgements

- **Rate & History Publishers**: [KeralaGold.com](https://www.keralagold.com/daily-gold-prices.htm), [LiveGoldKerala.com](https://www.livegoldkerala.com/), [GoodReturns.in](https://www.goodreturns.in/gold-rates/kerala.html), [Groww.in](https://groww.in/gold-rates/gold-rate-today-in-kerala), [BankBazaar.com](https://www.bankbazaar.com/gold-rate-kerala.html), [Jos Alukkas](https://www.josalukkasonline.com/gold-rate-today/kerala), [Kalyan Jewellers](https://store.kalyanjewellers.net/gold-rate/kerala/en), [Times of India](https://timesofindia.indiatimes.com/business/gold-rates-today/gold-price-in-kerala), and [LivePriceOfGold.com](https://www.livepriceofgold.com/india-gold-price.html).
- **UI, Liquid Glass & Design Inspiration**: [LiveGoldKerala.com](https://www.livegoldkerala.com/), [0kzh/glisse](https://github.com/0kzh/glisse), and [ybouane/liquidglass](https://github.com/ybouane/liquidglass).
- **Site Analysis & Reverse Engineering**: [morluto/rea](https://github.com/morluto/rea).
- **PWA, Packaging & Open-Source Stack**: [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/), [vite-plugin-pwa](https://vite-pwa-org.netlify.app/), [Express](https://expressjs.com/), [Cheerio](https://cheerio.js.org/), [Lucide Icons](https://lucide.dev/), [Motion](https://motion.dev/), [PWABuilder](https://github.com/pwa-builder/PWABuilder), [Tauri](https://github.com/tauri-apps/tauri), and [Ionic](https://github.com/ionic-team/ionic-framework).

## License

Licensed under the [MIT License](./LICENSE).
