# Break Room Kiosk - Changelog & Development History

This file tracks major deployments, features added/removed, and critical setup context to ensure project continuity across development sessions.

## [v5.0.0] - Architecture Modernization, User Accounts, RBAC, Tiered Lightning & Automated Testing Suite (September 2026)

### 🚀 Major Architectural & Security Highlights
- **User Accounts & Role-Based Access Control (RBAC):**
  - Native embedded SQLite database (`yardstik.db`) with WAL mode, foreign keys, and incremental `PRAGMA user_version` migrations.
  - Three-tier permissions: `admin` (management), `maintenance` (shop floor tech), and `viewer` (read-only public dashboard).
  - Single-use invite link generator (`/register.html?invite=<token>`) and secure session management.
  - Operations Audit Trail (`audit_logs`) with live search, action category filtering, ring-buffer auto-pruning, and RFC-4180 CSV export.
- **Tiered Real-Time Lightning Detection:**
  - **Free Blitzortung TOA Network (Default):** Real-time crowdsourced WebSocket strikes within 15 miles with zero API quota.
  - **Commercial Priority (`PAID_XWEATHER_API`):** Commercial SLA radar priority, burning free keys first if both exist.
  - **Backup Rotation (`FREE_XWEATHER_API`):** Multi-key trial rotation fallback when Blitzortung has no strikes or the kiosk is offline.
  - **Zero-Config All-Clear:** Clean HTTP 200 response when no keys are configured.
- **Modular Backend Architecture (IDEA-A01):**
  - Decomposed 1,490-line monolithic `control-panel/server.js` into isolated domain route modules (`routes/auth.js`, `routes/equipment.js`, `routes/tracks.js`, etc.) and middleware (`middleware/auth.js`).
  - Container health checks (`GET /api/health`) and Docker compose volume mounts.
- **Frontend & Presentation Modernization:**
  - **Offline-First Service Worker (`html/sw.js`, IDEA-F03):** Caches operational data with Network-First fallback for shop floor cellular dead zones.
  - **Decoupled Layout Engine (`html/js/modules/layout.js`, IDEA-Q01):** Observer-pattern handoff transitions breaking circular dependencies between `config.js` and `features.js`.
  - **CSS Class-Based Equipment Rendering (IDEA-Q03):** Eliminated 40+ inline styles in favor of semantic CSS utility classes in `styles-v2.css`.
  - **Diff-Before-Rebuild Hash Guard (IDEA-Q04):** Eliminates unnecessary SVG track map redraws and DOM churn.
  - **Unified HTTP Module (`html/js/modules/http.js`, IDEA-A03):** Standardized `fetchJson`, `fetchText`, and `cacheBustUrl` across all client modules.
  - **XSS & SVG Upload Hardening (IDEA-S03, IDEA-Q05):** Server-side SVG sanitization via `DOMPurify` + `JSDOM` and markdown reminder purification.
- **Enterprise Automated QA Suite:**
  - Expanded test coverage from 49 to **197 automated tests (100% pass rate)** spanning Python (Pytest), JavaScript (Jest + Supertest + AST), and Bash (Bats).
  - Static AST compliance tests enforcing zero regex lookbehinds and zero top-level `await`.
  - Self-healing container rebuilds via `.last_built_commit` in `kiosk-sync.sh`.
- **Cleaned Deprecated Deployment Scripts:**
  - Purged legacy `package.sh` and `deploy.sh` in favor of canonical `site-install.sh` and `kiosk-sync.sh`.

---

## [v4.2.0] - Interactive Yard Track Map, Shift Handoff Mode & Multi-Column Spreadsheet Ingestion

### 🚀 Features Added
- **Interactive Yard Track Map Engine:**
  - Dynamic vector SVG rendering engine with zoom, pan, and live railcar dash visualization.
  - Interactive track inspection cards displaying car counts, capacity, inbound dates, and conductor notes.
  - Automated car status styling (Empty, Active, Overcapacity, Bad Order / O.S.).
  - Multi-commodity color classification with customizable keyword rules and color pickers in Control Panel.
  - High-resolution generic 11-track starter SVG map (`track-map.svg`) and starter template (`example-track-check.xlsx`).
- **Shift Handoff Mode (`?mode=handoff`):**
  - Dedicated operational mode for shift turnover meetings and supervisor briefings.
  - Rotates all operational slides (Slide 1: Overview, Slide 2: Daily Safety & Milestones, Slide 3: Yard Track Map) seamlessly.
  - Full-width Equipment Status widget layout with centered title banner and smooth glow effects.
- **Advanced Excel & CSV Ingestion Engine (`parse_track_check.py`):**
  - Native multi-column grid spreadsheet parser capable of reading complex multi-track sheets.
  - Metadata parsing extracting UTC modification timestamps with native browser timezone localization.
  - Dynamic column boundary calculation and `{ID}` token validation.
- **Control Panel Track & Commodity Management Suite:**
  - Drag-and-drop upload for daily `.xlsx` / `.csv` track checks and `.svg` vector layouts.
  - Live editable track table with instant search and add/delete capabilities.
  - Live keyword rule matcher / tester for commodity classification.
  - One-click starter Excel template download (`/api/tracks/template-excel`) and CSV template download.
  - "What's New (v4.2)" modal and setup walkthrough.
- **Graceful Fallbacks & Deployment Resiliency:**
  - Feature toggle `track_map` is disabled by default (`track_map: false`) to guarantee zero disruption upon updating existing deployed kiosks.
  - When disabled, normal Kiosk mode automatically rotates Slide 1 and Slide 2 (Toolbox Talk & Safety Milestones).
  - Clean starter assets with zero proprietary branding or PII.

---

## [v4.1.0] - Configurable Production Tracker & Monthly Window Training Engine

### 🚀 Features Added
- **Configurable Production Tracker:**
  - Full facility customization for production metrics (`production_tracker_label` and `production_tracker_value` in `trackers.json`).
  - Supports string and numerical formats (e.g. *Active Blend Recipe*, *Current Heat #*, *Production Target*, *Active Grade*).
  - Smart `#` prefixing: when `#` is in the label configuration, it is automatically stripped from the displayed title and affixed to the value (e.g. `Active Blend Recipe:` with `#338`).
  - Safe Python 3 JSON script runner in Control Panel (`update_blend.sh` & `update_blend.json`).
- **Novara Monthly Window & Expiring Safety Engine:**
  - Automated detection of active monthly window training modules (`scheduleType: "window"`) by current calendar month and day.
  - Multi-language module equivalency mapping via `includedTrainings_id` (English / Spanish).
  - Clean indicator badges: Amber Clock (`🕒 X`) for due-this-month/expiring and Red Warning (`⚠️ Y`) for overdue/incomplete.
  - Dynamic panel summary header: `Action Required: Safety Videos (X This Month • Y Total)`.

---

## [v4.0.0] - Unified Desktop Kiosk, Cloud Sync & Equipment Audit Engine

### 🚀 Features Added
- **Unified Desktop Scrollable View (`?view=desktop`):**
  - Auto-detects desktop LAN browsers vs. Kiosk TV PCs.
  - Sticky glassmorphism top navigation bar with quick jump anchors and TV mode switcher.
  - Non-rotating, single-page scrollable operations dashboard showing operations, reminders, and employee records simultaneously.
  - Native manual scrollbars on desktop with continuous auto-scroll preserved on Kiosk TV.
  - Full-length expansion for Milestones & Anniversaries and Action Required: Safety Videos cards.
- **Mobile Cranes Scale & Weekly Blend Audit Engine:**
  - Dynamic scale status dropdown (`OK`, `OS`, `NO`) and interactive weekly audit toggle (`Audit: ✅/❌`) in Control Panel.
  - Compact 6-column grid alignment with glowing visual audit badges on TV, Desktop, and Mobile.
  - Automated weekly Sunday 11:00 PM audit reset engine with server-side 60s cron, cloud self-healing, and client verification.
- **Novara Anniversary & Milestone Engine:**
  - Automated upcoming anniversary calculations with legacy hire date seniority overrides.
  - Individual day-by-day countdowns (`Today!`, `Tomorrow`, `in X days`) with celebratory amber glowing badges.
- **Lightning API Quota Protection & Upstash Redis Caching:**
  - Serverless Upstash Redis cache (120s TTL) for Xweather lightning strikes.
  - Automated 10-day key exhaustion blacklisting to handle staggered monthly reset quotas across multiple backup accounts.
  - Client-side storm condition gating to prevent excessive API polling.
- **Multi-Site Ephemeral Cloud Sync (<50ms):**
  - Push-on-edit architecture with Upstash Redis KV pipeline and Edge caching.

---

## [v3.0.0] - Custom Control Panel Engine (Historical Context)

### 🚀 Features Added
- **Dynamic Slot Allocation Engine:** Implemented a highly flexible 4-slot widget allocation system in `app.js`. When NWS weather alerts are active, base widgets gracefully hide to make room for critical alerts.
- **Lightning Strike Protocol (Xweather):** Added a 15-mile / 30-minute lightning detection engine using the AerisWeather API. Integrates directly into the slot allocator and runs perfectly in sync with the digital clock to provide a second-by-second "All-Clear" countdown.
- **Minutes-of-the-Week Shift Tracker:** Re-engineered the shift tracker math to flawlessly handle multi-day shifts (`days2`, `start2`), midnight crossovers, and weekend boundary crossovers.
- **Smooth Animation Clock Sync:** Shift tracker math and progress bar were moved inside the 1-second clock loop for butter-smooth visual updates.
- **Weather API Offline Mode:** The dashboard now gracefully handles network disconnections. It injects a sleek 'OFFLINE' UI element, clears stale alerts, re-allocates base widgets, and silently retries every 30 seconds.
- **Mock Overrides:** Added `?mock=clear` (Sunny day) and `?mock=lightning` (which auto-triggers a Severe Thunderstorm) to easily test the UI without needing live storms.
- **Markdown Reminders:** Hooked the `reminders.md` file up to a rotating slide engine based on H1 (`#`) headers, syncing with the safety-announcements loop.
- **Config Separation:** Created `js/config.js` to store API keys securely, separating them from the main logic loop.

### 🗑️ Removals & Deprecations
- **OliveTin:** Completely removed OliveTin from the codebase and deployment scripts. The project has fully transitioned to **Script Server**.

### 🛠️ Infrastructure Updates
- Rebuilt `package.sh` and `deploy.sh`. 
- `package.sh` now correctly bundles `script-server/` and `nginx.conf` directly into the ZIP payload.
- `deploy.sh` intelligently copies payload from `~/tmp` to the permanent `~/kiosk-app` directory and retains the midnight `~/tmp` cronjob wipe.

---

## [v1.0.0] - Initial Deployment (Historical Context)

### 🚀 Base Features
- **Ubuntu Frame & Chromium Kiosk:** System boots directly into Wayland via systemd for a pure, desktop-free kiosk experience.
- **Dockerized Architecture:** Nginx webserver and backend tools containerized via `docker-compose`.
- **Base Widgets:** NWS Weather integration, OSHA Days Without Incident tracker, Production Blend recipe tracker, Daylight (Sunrise/Sunset) canvas tracker, and rotating MTD safety slides.
- **Emergency Override:** System scans `/assets/safety-override/` for priority slides (e.g. Toolbox Talks) and hijacks the display automatically.
- **11 PM Rollover Engine:** Safety slides use a +1 hour logic offset so "Tomorrow's" slides kick in exactly at 11 PM to align with the night shift crossover.

### 📝 Core Dependencies & Workflows
- **API Endpoints:** Open-Meteo, NWS Weather API, Xweather (Lightning).
- **Deployment Strategy:** `kiosk-deployment.zip` is transferred to the kiosk `~/tmp` dir, unzipped, and applied via `./scripts/deploy.sh` which moves files to `~/kiosk-app` and restarts docker containers.
- **Dynamic Widget Titles:** The Reminders widget now parses the H1 tag of the markdown file and automatically replaces the widget title, leaving only the body content for the slide.
- **New Magic Words:**
  - `!LONG`: Pauses the kiosk rotation engine for 120 seconds (2 minutes) to allow more reading time.
  - `!LARGE`: Increases text size to 1.5rem.
  - `!CENTER`: Centers the text block vertically and horizontally.
  - `!COUNTDOWN YYYY-MM-DD`: Automatically injects a live-ticking countdown clock to the specified date.
  - `!QR <url>`: Generates an interactive QR code using the qrserver API.
- **Architectural Overhaul:** Ripped out the third-party `script-server` container completely and replaced it with a bespoke Node.js Express application (`control-panel/`).
- **Premium UI:** The new Control Panel features a sleek dark mode, glassmorphism elements, dynamic sidebar, and an integrated real-time terminal output stream.
- **Backwards Compatibility:** The Node.js engine parses the existing JSON configurations in `conf/runners` to automatically generate its dynamic forms, meaning all legacy bash scripts plug and play with zero modification.
