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

### 2. Configurable Production Tracker (Blend Recipe / Heat # / Daily Target) ✅ (Completed)
- [x] Support facility-customizable tracker title (`production_tracker_label` in `trackers.json`, e.g. *Active Blend Recipe*, *Current Heat #*, *Active Production Grade*, *Daily Target*).
- [x] Support string and numerical values (`production_tracker_value`, e.g. `338`, `Grade-B`, `Batch 104`, `95%`).
- [x] Control Panel UI inputs for live updates from Trackers card.
- [x] Kiosk TV and Mobile dashboard dynamic rendering.

---

### 3. Seniority & Milestone Overrides Sync ✅ (Completed)
- [x] Decoupled employee names and hire dates from source code.
- [x] Smart fuzzy token matching in `api/novara.js` (handles initials, middle names, and name variations automatically).
- [x] Local `/opt/kiosk-data/data/seniority.json` management with Control Panel editor UI.
- [x] Automatic cloud sync to Upstash Redis for multi-site deployments.

---

### 4. Multi-Site Whitelabeling & Clean Repository ✅ (Completed)
- [x] Standalone **YardStik** repository under `TechSmith404/yardstik`.
- [x] Decoupled 365-day safety slide graphics into host `/opt/kiosk-data/safety-slides`.
- [x] Dynamic field office and site configuration via Control Panel.

---

### 3. Multi-Site Deployment & Mainline Merge ✅ (Completed)
- [x] Merged `multi-site` branch into `main`.
- [x] Standardized `config.template.json` and ephemeral `/opt/kiosk-data/` volume architecture.
- [x] One-and-done `site-install.sh` validated in VM.
- [x] Burns Harbor live kiosk migrated to persistent `/opt/kiosk-data/` and auto-sync crontab activated.

---

### 3. Vercel API Key Pooling
- Configure fallback key rotation (`XWEATHER_ID2`, `XWEATHER_SECRET2`, etc.) in Vercel environment variables for high-frequency lightning/radar polling.

---

### 4. Bottom Scrolling News Ticker & Live Trivia
- Rotating marquee reading from `ticker.txt` for plant news and safety reminders.
- Rotating daily trivia widget for break room engagement.

---

### 5. Holiday-Themed Stylesheets
- Dynamic seasonal CSS overlays (Halloween, Thanksgiving, Christmas, New Year's, 4th of July) injected automatically by date range.

---

### 6. Modular Frontend Architecture (`html/js/modules/`)
- **Goal:** Break up the 1,600-line monolithic `html/js/app.js` file into clean, isolated ES Modules in `html/js/modules/` for readability and easier maintenance.
- **Module Structure:**
  - `modules/clock.js` — Digital clock, 1s tick render loop, and Shift Tracker minute math.
  - `modules/weather.js` — Open-Meteo current/forecast API, NWS severe weather alerts, solar position & daylight/moon tracker.
  - `modules/lightning.js` — Xweather API client, 10-mile radius strike detection, and 30-minute all-clear countdown timer.
  - `modules/equipment.js` — Dynamic Masonry grid layout, status chips, and real-time refresh listener.
  - `modules/reminders.js` — Markdown parser, `#` header slide cycler, and Magic Words (`!LONG`, `!CENTER`, `!SPLIT`, `!QR`, `!COUNTDOWN`).
  - `modules/special.js` — High-priority third view and emergency override display.
  - `app.js` — Master controller (orchestrates module lifecycle, slot allocation, and version polling).
- **Zero Performance Impact:** Modules load instantly over local loopback (`http://localhost:8080`) with identical memory footprint and 60 FPS animation performance.
