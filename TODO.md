# 🚀 YardStik — Roadmap & Feature Queue

## 🛠️ High-Priority Features

### 1. Mobile Equipment Status Editor (Shop Floor Maintenance QR Portal)
- **Concept:** Provide a scannable QR code on the plant floor, maintenance shop, and equipment dashboards that lets mechanics and operators quickly report machine statuses from their mobile phones.
- **Workflow:**
  1. Mechanic scans QR code with phone camera.
  2. Mobile-optimized web app opens (large touch targets, high contrast, dark mode, zero desktop clutter).
  3. Mechanic selects equipment unit from category list (or direct link via per-machine QR code).
  4. Mechanic taps status:
     - 🟢 **OK / Ready**
     - 🔴 **Down / Out of Service**
     - 🟡 **Issue / PM / Service**
  5. Mechanic enters maintenance notes (supports voice-to-text on phone keyboard).
  6. Submits update in < 10 seconds — break room TV and supervisor monitors refresh immediately.

---

### 2. Vercel API Key Pooling & Health Inspector ✅ (Completed)
- [x] Multi-account fallback key rotation (`XWEATHER_ID`, `XWEATHER_SECRET`, `XWEATHER_ID2`, `XWEATHER_SECRET2`, etc.) in Vercel environment variables.
- [x] CSV list support via `XWEATHER_KEYS="id1:secret1,id2:secret2"`.
- [x] Automated Redis 10-day key quota exhaustion blacklisting and failover.
- [x] 120-second coordinate caching in Redis.
- [x] Live health check & masked key inspection endpoint (`/api/lightning?inspect=keys`).

---

### 3. Bottom Scrolling News Ticker & Live Trivia
- [ ] Rotating marquee reading from `ticker.txt` for plant news and safety reminders.
- [ ] Rotating daily trivia widget for break room engagement.
- [ ] Control Panel Ticker Editor UI.

---

### 4. Holiday-Themed Stylesheets ✅ (Completed)
- [x] Dynamic seasonal CSS overlays injected automatically by calendar date range:
  - 🎃 **Halloween:** Oct 15 - Oct 31 (`theme-halloween.css`)
  - 🦃 **Thanksgiving / Autumn Harvest:** Nov 15 - Nov 30 (`theme-thanksgiving.css`)
  - 🎄 **Christmas & Winter Holidays:** Dec 1 - Dec 26 (`theme-christmas.css`)
  - 🍾 **New Year's:** Dec 27 - Jan 5 (`theme-newyear.css`)
  - ☘️ **St. Patrick's Day:** Mar 14 - Mar 18 (`theme-stpatricks.css`)
  - 🎆 **4th of July / Independence Day:** Jul 1 - Jul 7 (`theme-july4.css`)
- [x] Developer manual testing override via URL parameter (e.g. `?theme=halloween`, `?theme=christmas`, `?theme=default`).
- [x] Hourly automatic rollover listener in `modules/theme.js`.

---

### 5. Modular Frontend Architecture (`html/js/modules/`) ✅ (Completed)
- [x] Broken up monolithic `html/js/app.js` into clean, isolated ES Modules:
  - `modules/config.js` — Mode detection (Desktop/Kiosk), site configuration, and live reload engine.
  - `modules/clock.js` — Digital clock, 1s tick render loop, and Shift Tracker minute math.
  - `modules/trackers.js` — OSHA Days Safe counter and Configurable Production Tracker.
  - `modules/weather.js` — Open-Meteo current/forecast API, NWS severe weather alerts, solar position & daylight/moon tracker.
  - `modules/lightning.js` — Xweather API client, 10-mile radius strike detection, and 30-minute all-clear countdown timer.
  - `modules/equipment.js` — Dynamic Masonry grid layout, status chips, and weekly blend audit engine.
  - `modules/safety.js` — Novara safety curriculum parser and vertical smooth scroll loop.
  - `modules/anniversaries.js` — Employee milestone calculation and celebration highlights.
  - `modules/reminders.js` — Markdown parser, `#` header slide cycler, and Magic Words (`!LONG`, `!CENTER`, `!SPLIT`, `!QR`, `!COUNTDOWN`).
  - `modules/slideshow.js` — Daily 365-day Toolbox Talk rotation with daily override support.
  - `modules/special.js` — High-priority third view and emergency override display.
  - `modules/fx.js` — Canvas 2D particle simulations (Rain, Snow, Lightning, Fog, Vignettes).
  - `app.js` — Master controller (orchestrates module lifecycle, slot allocation, and version polling).

---

## 📦 Completed Milestones
- **Configurable Production Tracker** (Custom labels, string & numeric values, auto-# prefixing).
- **Novara Monthly Safety Curriculum Engine** (Real-time window evaluation, multilingual equivalency).
- **Seniority & Milestone Overrides Sync** (Decoupled names/dates, fuzzy token matching).
- **Multi-Site Whitelabeling & Clean Repository** (Standalone YardStik, `/opt/kiosk-data/` isolation).
- **Multi-Site Ephemeral Cloud Sync** (Push-on-edit architecture with Upstash Redis KV pipeline).
