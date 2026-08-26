# Break Room Kiosk - Changelog & Development History

This file tracks major deployments, features added/removed, and critical setup context to ensure project continuity across development sessions.

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
