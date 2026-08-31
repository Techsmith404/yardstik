# 🚀 YardStik — Industrial Operations Dashboard & Break Room Kiosk System

[![Version](https://img.shields.io/badge/version-v4.1.0-blue.svg)](https://github.com/TechSmith404/yardstik/releases)
[![Docker](https://img.shields.io/badge/docker-containerized-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![Ubuntu Frame](https://img.shields.io/badge/wayland-Ubuntu%20Frame-E95420.svg?logo=ubuntu&logoColor=white)](https://mir-server.io/ubuntu-frame)
[![Node.js](https://img.shields.io/badge/node.js-v20-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Upstash Redis](https://img.shields.io/badge/redis-Upstash%20KV-FF4438.svg?logo=redis&logoColor=white)](https://upstash.com/)
[![Vercel Edge](https://img.shields.io/badge/cloud-Vercel%20Edge-000000.svg?logo=vercel&logoColor=white)](https://vercel.com/)
[![Status](https://img.shields.io/badge/deployment-production--ready-success.svg)]()

A robust, enterprise-grade industrial operations dashboard and unattended break room kiosk engineered specifically for manufacturing, steel processing, and heavy industrial facilities. 

Built from the ground up for **24/7 hardware-accelerated continuous operation**, YardStik bridges the gap between supervisory management and shop floor operators.

---

## 📸 Screenshots & Visual Showcase

### 📺 View 1: Live Operations & Production Tracking (TV Kiosk Slide)
> *Auto-rotating 40s TV view showcasing multi-category equipment status, mobile crane scale audits, active blend recipes, daylight/moon progression, shift handoff countdowns, and dynamic emergency weather slots.*

<p align="center">
  <img src="docs/images/tv-kiosk-operations.png" alt="TV Kiosk Operations View" width="95%" />
</p>

---

### 📢 View 2: Daily Toolbox Talks & Safety Records (TV Kiosk Slide)
> *Auto-rotating 40s TV view featuring high-visibility Daily Toolbox Talks, dynamic Markdown reminder cards, upcoming employee milestones/anniversaries, and OSHA safety video completion trackers.*

<p align="center">
  <img src="docs/images/tv-kiosk-announcements.png" alt="TV Kiosk Announcements View" width="95%" />
</p>

---

### 🖥️ Desktop Unified Supervisor Dashboard (`?view=desktop`)
> *Single-page scrollable operations center for office PCs and plant supervisors. Displays all operational widgets, equipment rosters, and employee records simultaneously with a glassmorphism sticky navigation bar.*

<p align="center">
  <img src="docs/images/desktop-portal.png" alt="Desktop Unified Dashboard" width="95%" />
</p>

---

### 📱 Mobile Floor Portal (`mobile.html`)
> *Lightweight, mobile-responsive web portal accessible by scanning the break room TV\'s on-screen QR code. Enables shop floor personnel to inspect equipment status, blend recipes, and training notices on the go.*

<p align="center">
  <img src="docs/images/mobile-portal.png" alt="Mobile Floor Portal" width="45%" />
</p>

---

### 🎛️ Bespoke Node.js Control Panel (`:1337`)
> *Centralized dark-mode administrative suite featuring real-time equipment status toggling, EasyMDE Markdown reminder editing, script runner terminal with live SSE streaming, and visual theme styling.*

<p align="center">
  <img src="docs/images/control-panel.png" alt="Control Panel Suite" width="95%" />
</p>

---

## 🌟 Key Capabilities & Architectural Highlights

### 1. 🖥️ Multi-Display Presentation Architecture
* **Kiosk TV Mode (`localhost:8080/?view=kiosk`):** Designed for unattended plant TVs. Automatically cycles between **View 1 (Operations)** and **View 2 (Announcements & Safety)** every 40 seconds with smooth hardware-accelerated transitions and zero screen burn-in risk.
* **Desktop Unified Mode (`localhost:8080/?view=desktop`):** Auto-detected on LAN office computers. Eliminates slide rotation, rendering all plant data in a single unified, scrollable dashboard with sticky section anchors.
* **Mobile QR Portal (`localhost:8080/mobile.html`):** Instantly accessible by scanning the dynamic on-screen QR code. Includes multi-tier offline caching and touch-friendly controls.

### 2. ⚖️ Equipment Status & Weekly Audit Protocol
* **Categorized Equipment Roster:** Engines, Cat Trucks, Overhead Cranes, Mobile Cranes, and Mobile Equipment with instant status badges (**`OK`**, **`OS` / Out of Service**, **`PM` / Maintenance Scheduled**) and custom issue notes.
* **Mobile Crane Scale & Blend Audit Tracking:** Live scale health tracking (**`SCALE OK`** / **`SCALE OS`**) paired with weekly blend compliance checkboxes (**`Audit: ✅/❌`**).
* **Automated Sunday 11:00 PM Reset Engine:** A failproof, three-tier automated audit reset system running server-side background daemons, cloud self-healing, and client timestamp verification to guarantee audit resets every Sunday at 11:00 PM without manual overhead.

### 3. 🌦️ Dynamic Weather Engine & Emergency Protocol
* **NWS Emergency Slot Allocation:** National Weather Service severe weather warnings (Tornado, Severe Thunderstorm, Flash Flood, Winter Storm, High Wind) dynamically commandeer base widget slots with pulsing emergency indicators.
* **Xweather Real-Time Lightning Protocol:** Tracks lightning strikes within a 10-mile radius, automatically activating safety warnings and initiating a live second-by-second countdown to the 30-minute OSHA "All-Clear".
* **Upstash Redis Serverless Edge Cache:** High-performance caching layer (120s TTL) with automated key-exhaustion rotation across backup API credentials to guarantee zero quota outages.
* **Daylight & Moon Astronomy Tracker:** Accurately visualizes real-time sun arc elevation during the day, smoothly converting into a nocturnal blue moon with a sunrise countdown after dusk.
* **Hardware-Accelerated Canvas FX:** Realistic particle simulations for rain, heavy snowfall, drifting fog banks, and lightning flashes that dynamically activate based on live weather conditions.

### 4. 🎂 Employee Recognition & Safety Compliance Tracking
* **Automated Seniority & Milestone Engine:** Calculates upcoming work anniversaries with support for historical legacy hire dates and relative countdown badges (`Today!`, `Tomorrow`, `in X days`).
* **Action Required: Safety Videos:** Scans Novara/LMS training rosters to identify overdue or expiring monthly safety training modules, highlighting missing certifications by employee name.

### 5. 📝 Dynamic Markdown Reminders & Magic Words Engine
* **EasyMDE Web Editor:** Live in-browser Markdown authoring tool parsing `#` H1 slide delimiters.
* **Markdown Magic Words:** Injects dynamic layouts and behaviors directly from simple markup tags:

| Magic Word | Function & Visual Behavior | Example |
| :--- | :--- | :--- |
| `!CRITICAL` | Displays a glowing crimson border and a pulsing `[CRITICAL]` badge. | `!CRITICAL` |
| `!HIGH` | Displays a high-contrast amber border and an `[IMPORTANT]` header badge. | `!HIGH` |
| `!SPLIT` | Automatically splits bulleted (`-`) or numbered (`1.`) lists into 2 balanced columns. | `!SPLIT` |
| `!LARGE` | Enlarges body typography to 1.5rem for maximum legibility across large break rooms. | `!LARGE` |
| `!CENTER` | Centers text horizontally and vertically within the card container. | `!CENTER` |
| `!LONG` | Triples slide display duration from standard 40s to 120s (2 minutes). | `!LONG` |
| `!ONLY` | Emergency broadcast override: suppresses other reminder slides to display only this notice. | `!ONLY` |
| `!COUNTDOWN YYYY-MM-DD-HH` | Renders a live ticking countdown clock to a target plant event or deadline. | `!COUNTDOWN 2026-10-31-17` |
| `!EXPIRE YYYY-MM-DD-HH` | Automatically purges and unpublishes the slide after the specified hour passes. | `!EXPIRE 2026-09-01-08` |
| `!QR <url>` | Generates an embedded high-contrast QR code for instant employee scanning. | `!QR https://plant-portal.com` |

### 6. 🎨 Themes, Shifts & Visual Customization
* **Per-Shift Dedication:** Automatically switches accent themes and dedication badges based on active shift schedules (A, B, C, or D shift).
* **Seasonal Auto-Overlays:** Optional automatic holiday themes (Winter snowfall, Halloween, Independence Day, New Year).
* **Industrial Pattern Styles:** Switchable background textures including *Cross-hatch Machined*, *Industrial Carbon*, *Micro Dots*, and *Clean Dark Minimal*.

---

## 🏗️ System Architecture

```
                                    ┌────────────────────────────────────────┐
                                    │           Upstash Redis (KV)           │
                                    │    Multi-Site Cloud Sync (<50ms)       │
               ┌────────────────────┴────────────────────┐                   │
               │             Vercel Edge Cloud           │                   │
               │  - /api/lightning (120s TTL cache)      │                   │
               │  - /api/novara    (Safety & Milestones) │                   │
               │  - /api/sync      (Cloud Data Mirror)   │                   │
               └────────────────────┬────────────────────┘                   │
                                    │                                        │
                                    ▼                                        │
                         ┌─────────────────────┐                             │
                         │  Mobile QR Portal   │                             │
                         │   (Port 8080)       │                             │
                         └──────────┬──────────┘                             │
                                    │                                        │
     ┌──────────────────────────────┼──────────────────────────────┐         │
     │ LOCAL DOCKER ENGINE          │                              │         ▼
     │                              ▼                              │  ┌──────────────┐
     │                   ┌─────────────────────┐                   │  │ Node.js Host │
     │                   │      Nginx Web      │                   │  │ Control Panel│
     │                   │     (Port 8080)     │                   │  │ (Port 1337)  │
     │                   └──────────┬──────────┘                   │  └──────┬───────┘
     │                              │                              │         │
     │                              │                              │         │ (Read/Write JSON & MD)
     │                              │                              ▼         ▼
     │                              │                  ┌─────────────────────┐
     │                              │                  │ Persistent Volume   │
     │                              │                  │ /opt/kiosk-data/    │
     │                              │                  │ - equipment.json    │
     │                              │                  │ - reminders.md      │
     │                              │                  │ - config.json       │
     │                              │                  │ - trackers.json     │
     │                              │                  │ - shifts.json       │
     │                              │                  └──────────┬──────────┘
     │                              │                             │
     └──────────────────────────────┼─────────────────────────────┼───────────────────┘
                                    │                             │
                                    ┌─────────────────────────────┴─────────────────────────────┐
                                    ▼                                                           ▼
                         ┌─────────────────────┐                                     ┌─────────────────────┐
                         │ Kiosk TV Slide Mode │                                     │ Desktop Scroll Mode │
                         │ (Wayland / Ubuntu   │                                     │  (?view=desktop)    │
                         │  Frame + Chromium)  │                                     └─────────────────────┘
                         └─────────────────────┘
```

---

## 🚀 Installation & Deployment Guide

### Prerequisites
* **Operating System:** Linux PC (Ubuntu 22.04 / 24.04 LTS recommended) connected to the TV display.
* **Container Runtime:** Docker Engine & Docker Compose (`docker compose` v2).
* **Display Server (for Unattended TV Kiosks):** Ubuntu Frame & Chromium:
  ```bash
  sudo snap install ubuntu-frame
  sudo snap install chromium
  ```

---

### 💻 Local Development Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/TechSmith404/yardstik.git
   cd yardstik
   git checkout main
   ```

2. **Launch Docker Stack:**
   ```bash
   # Run the unified development startup script
   ./scripts/test-local.sh
   
   # Or launch directly with Docker Compose
   docker compose up -d --build
   ```

3. **Access Services:**
   * **TV Slide Kiosk Display:** [`http://localhost:8080/?view=kiosk`](http://localhost:8080/?view=kiosk)
   * **Desktop Supervisor View:** [`http://localhost:8080/?view=desktop`](http://localhost:8080/?view=desktop)
   * **Mobile QR Portal:** [`http://localhost:8080/mobile.html`](http://localhost:8080/mobile.html)
   * **Administrative Control Panel:** [`http://localhost:1337`](http://localhost:1337) *(Default: `admin` / `MasterPassword123`)*

---

### 🏭 Production Kiosk Deployment

1. **Package Deployment Artifact (on Workstation):**
   ```bash
   ./scripts/package.sh
   ```
   *Creates a clean, production-ready `kiosk-deployment.zip` payload.*

2. **Transfer to Target Kiosk Machine:**
   ```bash
   scp kiosk-deployment.zip user@kiosk-ip:~/tmp/
   ```

3. **Execute Remote Deployment:**
   ```bash
   ssh user@kiosk-ip
   cd ~/kiosk-app
   ./scripts/deploy.sh
   ```
   *The deployment script automatically backs up persistent configuration, unpacks updated assets, rebuilds Docker containers, and executes live service reloads.*

---

## 📁 Repository Structure

```
yardstik/
├── control-panel/              # Node.js Express Administrative Suite
│   ├── public/                 # Control Panel Frontend (HTML, CSS, JS)
│   ├── runners/                # JSON definitions for executable tasks
│   ├── scripts/                # Shell scripts executed via child_process
│   └── server.js               # Express API backend & SSE terminal server
├── html/                       # Core Dashboard & Display Frontend
│   ├── assets/data/            # Default JSON schemas & fallback data
│   ├── css/                    # Modular stylesheets (styles-v2.css)
│   ├── js/                     # Vanilla ES6 client modules
│   │   ├── modules/            # Weather, Trackers, Milestones, etc.
│   │   └── app.js              # View controller & lifecycle loop
│   ├── index.html              # Main Kiosk & Desktop entrypoint
│   └── mobile.html             # Mobile QR companion webapp
├── scripts/                    # Deployment, packaging & testing scripts
├── docker-compose.yml          # Container stack configuration
├── Dockerfile                  # Nginx web server build specification
└── nginx.conf                  # Nginx reverse proxy configuration
```

---

## 🔒 Security & Data Integrity

* **Network Isolation:** Administrative runner scripts run inside containerized environments with strict input validation and command white-listing.
* **No Database Dependency:** Operates on lightweight, persistent atomic JSON and Markdown flat-files, ensuring lightning-fast boot times, instantaneous backups, and immunity from SQL corruption.

---

## 📄 Licensing & Commercial Usage

**Copyright © 2026 Cody Smith (TechSmith404). All Rights Reserved.**

This software, source code, architecture, and associated assets are the proprietary intellectual property of **Cody Smith**.

* **Authorized Pilot Evaluation:** Authorized solely for single-facility operational deployment and internal evaluation at the designated pilot facility.
* **Commercial Deployment & Enterprise Licensing:** Multi-plant installations, redistribution, white-labeling, or enterprise rollouts require an executed software licensing agreement or commercial services contract.

For commercial licensing, enterprise multi-plant deployments, or custom software development, contact: **TechSmith404**.
