// YardStik Universal Interactive Track Map & Track Check Module
import { cachedFeatures } from "./features.js";

export let cachedTracks = [];
export let trackStats = {
    totalCars: 0,
    totalCapacity: 0,
    badOrderCars: 0,
    blendCars: 0,
    clearTracksCount: 0,
    dwellWarningCount: 0
};

let hasDraggedMap = false;

function extractTrackIdFromElement(el) {
    if (!el) return null;
    const idAttr = el.getAttribute("id") || "";
    if (idAttr) {
        let clean = idAttr.trim();
        clean = clean.replace(/^[nsew]curve[-_]/i, "");
        clean = clean.replace(/^track[-_]/i, "");
        clean = clean.replace(/^label[-_]/i, "");
        clean = clean.replace(/[-_]\\d+$/, "");
        return clean.toUpperCase();
    }
    const dataTrack = el.getAttribute("data-track");
    if (dataTrack) return dataTrack.trim().toUpperCase();

    const txt = el.querySelector("text") || (el.tagName && el.tagName.toLowerCase() === "text" ? el : null);
    if (txt) {
        const raw = txt.textContent.trim().replace(/\\s*\\(.*\\)/, "").toUpperCase();
        return raw;
    }
    return null;
}

function formatSwitchTitle(idStr) {
    if (!idStr) return "Switch Turnout";
    let clean = idStr.replace(/^switch[-_]/i, "");
    let dir = "";
    if (/[-_][nsew]$/i.test(clean)) {
        const d = clean.slice(-1).toUpperCase();
        dir = d === "N" ? "North" : (d === "S" ? "South" : (d === "E" ? "East" : "West"));
        clean = clean.slice(0, -2);
    }
    const parts = clean.split(/[-_]/);
    if (parts.length >= 2) {
        return `Switch: Track ${parts[0]} ⇄ Track ${parts[1]}${dir ? " (" + dir + ")" : ""}`;
    }
    return `Switch: ${clean}${dir ? " (" + dir + ")" : ""}`;
}

export function getCarColor(cars, capacity, isBadOrder = false) {
    if (isBadOrder) return "#ef4444"; // Bad order is always red
    if (!capacity || capacity <= 0) capacity = 20;
    const pct = (cars / capacity) * 100;
    if (pct <= 25) return "#38bdf8";      // Blue
    if (pct <= 50) return "#22c55e";      // Green
    if (pct <= 75) return "#eab308";      // Yellow
    if (pct <= 90) return "#f97316";      // Orange
    return "#ef4444";                     // Red (>90%)
}

function getElementExactLength(el) {
    if (!el) return 500;
    try {
        if (typeof el.getTotalLength === "function") {
            const len = el.getTotalLength();
            if (len > 0) return len;
        }
    } catch (e) {}

    if (el.tagName && el.tagName.toLowerCase() === "polyline") {
        const pointsAttr = el.getAttribute("points") || "";
        const coords = pointsAttr.trim().split(/[\s,]+/).map(Number);
        let total = 0;
        for (let i = 0; i < coords.length - 3; i += 2) {
            const dx = coords[i+2] - coords[i];
            const dy = coords[i+3] - coords[i+1];
            total += Math.hypot(dx, dy);
        }
        if (total > 0) return total;
    }
    return 600;
}

export function getCarDasharray(el, cars, capacity) {
    if (!cars || cars <= 0) return "none";
    const totalLen = getElementExactLength(el);
    
    // Uniform physical railcar size across all tracks in the yard
    const CAR_LEN = 24.0;
    const GAP_LEN = 6.0;
    const totalTrainLen = (cars * CAR_LEN) + ((cars - 1) * GAP_LEN);

    // Center the train along the track length
    let startOffset = 10.0;
    if (totalLen > totalTrainLen) {
        startOffset = (totalLen - totalTrainLen) / 2.0;
    }

    const dashes = ["0", startOffset.toFixed(1)];
    for (let i = 0; i < cars - 1; i++) {
        dashes.push(CAR_LEN.toFixed(1), GAP_LEN.toFixed(1));
    }
    dashes.push(CAR_LEN.toFixed(1), (totalLen * 3).toFixed(1));
    return dashes.join(" ");
}

export async function fetchTracks() {
    try {
        const res = await fetch("assets/data/tracks.json?t=" + new Date().getTime());
        if (res.ok) {
            cachedTracks = await res.json();
            calculateTrackStats();
            renderTrackMap();
            if (isTheaterOpen) {
                updateTheaterMap();
            }
        }
    } catch (e) {
        console.warn("Could not load tracks.json:", e);
    }
}

function calculateTrackStats() {
    let total = 0, bo = 0, blend = 0, clear = 0, dwell = 0, cap = 0;
    cachedTracks.forEach(t => {
        total += (t.cars || 0);
        cap += (t.capacity || 0);
        if (t.is_bad_order) bo += (t.cars || 0);
        if (t.is_blend) blend += (t.cars || 0);
        if (t.is_clear) clear++;
        if (t.dwell_warning) dwell++;
    });
    trackStats = {
        totalCars: total,
        totalCapacity: cap,
        badOrderCars: bo,
        blendCars: blend,
        clearTracksCount: clear,
        dwellWarningCount: dwell
    };
    updateHeaderStats();
}

function updateHeaderStats() {
    const statsEl = document.getElementById("trackmap-stats-summary");
    if (statsEl) {
        const capText = trackStats.totalCapacity > 0 ? ` / ${trackStats.totalCapacity}` : "";
        statsEl.innerHTML = `
            <span class="track-stat-pill pill-total">🚂 <strong>${trackStats.totalCars}${capText}</strong> Cars</span>
            <span class="track-stat-pill pill-clear">🟢 <strong>${trackStats.clearTracksCount}</strong> Clear</span>
            ${trackStats.badOrderCars > 0 ? `<span class="track-stat-pill pill-bo">🔴 <strong>${trackStats.badOrderCars}</strong> B.O.</span>` : ""}
            ${trackStats.dwellWarningCount > 0 ? `<span class="track-stat-pill pill-dwell">⚠️ <strong>${trackStats.dwellWarningCount}</strong> Dwell</span>` : ""}
            <button id="btn-trackmap-expand" class="trackmap-expand-btn" title="Expand Full Screen">
                <i class="fa-solid fa-expand"></i> Expand
            </button>
        `;
        const expBtn = document.getElementById("btn-trackmap-expand");
        if (expBtn) {
            expBtn.onclick = (e) => {
                e.stopPropagation();
                openExpandedTrackMap();
            };
        }
    }
}

let svgTemplateCache = null;

export async function renderTrackMap() {
    const container = document.getElementById("trackmap-viewport");
    if (!container) return;

    const isEnabled = cachedFeatures?.features?.track_map !== false;
    const widget = document.getElementById("widget-trackmap");
    if (widget) {
        widget.style.display = isEnabled ? "flex" : "none";
    }
    if (!isEnabled) return;

    container.classList.add("clickable-trackmap");
    container.onclick = (e) => {
        if (!e.target.closest("[id*='track'], [id*='label'], [id*='curve'], .train-car-overlay")) {
            openExpandedTrackMap();
        }
    };

    try {
        if (!svgTemplateCache) {
            try {
                const resData = await fetch("assets/data/track-map.svg?t=" + new Date().getTime());
                if (resData.ok) {
                    svgTemplateCache = await resData.text();
                }
            } catch {}

            if (!svgTemplateCache) {
                const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
                if (res.ok) {
                    svgTemplateCache = await res.text();
                }
            }
        }

        if (svgTemplateCache) {
            container.innerHTML = svgTemplateCache;
            bindSvgInteractivity(container, false);
        } else {
            renderFallbackCardGrid(container);
        }
    } catch (e) {
        console.warn("SVG Track Map load error, falling back to card grid:", e);
        renderFallbackCardGrid(container);
    }
}

function bindSvgInteractivity(container, isTheater = false) {
    const svg = container.querySelector("svg");
    if (!svg) return;

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.maxHeight = "100%";
    svg.style.display = "block";

    // Clean up old overlay paths if re-binding
    svg.querySelectorAll(".train-car-overlay").forEach(o => o.remove());

    const trackMap = {};
    cachedTracks.forEach(t => {
        trackMap[t.id.toUpperCase()] = t;
    });

    // 1. Hook Track Lines & Curves (e.g. track-23, ncurve-25, scurve-27, etc.)
    const trackLineElements = svg.querySelectorAll("[id^='track-'], [id^='track_'], [id*='curve-'], [id*='curve_'], path.track, polyline.track, line.track");
    trackLineElements.forEach(el => {
        const rawId = extractTrackIdFromElement(el);
        if (!rawId) return;
        const data = trackMap[rawId];

        const capAttr = el.getAttribute("data-capacity") || el.dataset?.capacity;
        if (capAttr && data && !data.capacity) {
            data.capacity = parseInt(capAttr, 10);
        }

        if (data) {
            el.classList.add("yard-track-line");
            el.style.cursor = "pointer";

            // If track is occupied with cars, create overlay path with exact car count dashes
            const isMainTrack = (el.id && /^track[-_]/i.test(el.id)) || (!/curve/i.test(el.id || ""));
            if (isMainTrack && data.cars > 0 && !data.is_clear) {
                const overlay = el.cloneNode(true);
                overlay.removeAttribute("id");
                overlay.classList.remove("yard-track-line");
                overlay.classList.add("train-car-overlay");

                const cap = data.capacity || 20;
                const carColor = getCarColor(data.cars, cap, data.is_bad_order);
                const dashPattern = getCarDasharray(el, data.cars, cap);

                overlay.style.setProperty("stroke", carColor, "important");
                overlay.style.setProperty("stroke-width", "4.5px", "important");
                overlay.style.setProperty("stroke-dasharray", dashPattern, "important");
                overlay.style.setProperty("stroke-linecap", "butt", "important");
                overlay.style.setProperty("fill", "none", "important");
                overlay.style.pointerEvents = "auto";
                overlay.style.cursor = "pointer";
                overlay.style.filter = `drop-shadow(0 0 4px ${carColor})`;

                overlay.onclick = (e) => {
                    if (hasDraggedMap) return;
                    e.stopPropagation();
                    showTrackModal(data);
                };
                overlay.onmouseenter = (e) => showTrackHoverTooltip(e, data);
                overlay.onmouseleave = hideTrackHoverTooltip;

                el.parentNode.insertBefore(overlay, el.nextSibling);
            }

            el.onclick = (e) => {
                if (hasDraggedMap) return;
                e.stopPropagation();
                showTrackModal(data);
            };
            el.onmouseenter = (e) => showTrackHoverTooltip(e, data);
            el.onmouseleave = hideTrackHoverTooltip;
        }
    });

    // 2. Hook Labels / Badges (e.g. label-21, label-21-2, label-68, etc.)
    const labelElements = svg.querySelectorAll("[id^='label-'], [id^='label_'], g[data-track]");
    labelElements.forEach(el => {
        const rawId = extractTrackIdFromElement(el);
        if (!rawId) return;
        const data = trackMap[rawId];

        if (data) {
            const cap = data.capacity || 20;
            const badgeColor = data.is_clear ? "#10b981" : getCarColor(data.cars, cap, data.is_bad_order);

            if (data.is_clear) el.classList.add("badge-clear");
            else if (data.is_bad_order) el.classList.add("badge-bad-order");
            else if (data.is_blend) el.classList.add("badge-blend");
            else if (data.dwell_warning) el.classList.add("badge-dwell");
            else el.classList.add("badge-occ");

            const textEl = el.querySelector("text") || (el.tagName && el.tagName.toLowerCase() === "text" ? el : null);
            const rect = el.querySelector("rect");

            if (textEl && rect) {
                if (data.cars > 0) {
                    textEl.textContent = `${rawId} (${data.cars})`;
                } else {
                    textEl.textContent = `${rawId}`;
                }

                const origX = parseFloat(rect.getAttribute("data-orig-x") || rect.getAttribute("x"));
                const origW = parseFloat(rect.getAttribute("data-orig-w") || rect.getAttribute("width"));
                if (!rect.hasAttribute("data-orig-x")) {
                    rect.setAttribute("data-orig-x", origX);
                    rect.setAttribute("data-orig-w", origW);
                }
                const centerX = origX + (origW / 2);
                const newWidth = data.cars > 0 ? Math.max(origW, 36) : origW;
                rect.setAttribute("width", newWidth);
                rect.setAttribute("x", centerX - (newWidth / 2));

                if (!data.is_clear && !data.is_bad_order && !data.is_blend && !data.dwell_warning) {
                    rect.style.stroke = badgeColor;
                    rect.style.fill = `rgba(${hexToRgb(badgeColor)}, 0.25)`;
                    textEl.style.fill = badgeColor;
                }
            }

            el.style.cursor = "pointer";
            el.onclick = (e) => {
                if (hasDraggedMap) return;
                e.stopPropagation();
                showTrackModal(data);
            };
            el.onmouseenter = (e) => showTrackHoverTooltip(e, data);
            el.onmouseleave = hideTrackHoverTooltip;
        }
    });

    // 3. Hook Switch Points (e.g. switch-23-24-n, switch-2-90, etc.)
    const switchElements = svg.querySelectorAll("[id^='switch-'], [id^='switch_'], circle.switch-point");
    switchElements.forEach(sw => {
        const idAttr = sw.getAttribute("id") || "";
        sw.classList.add("yard-switch-point");
        const title = formatSwitchTitle(idAttr);
        sw.setAttribute("title", title);
        sw.onmouseenter = (e) => {
            showSimpleTooltip(e, `🔀 <strong>${title}</strong>`);
        };
        sw.onmouseleave = hideTrackHoverTooltip;
    });
}

function hexToRgb(hex) {
    const c = hex.replace("#", "");
    const bigint = parseInt(c, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}

function renderFallbackCardGrid(container) {
    if (!cachedTracks.length) {
        container.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">No track data available.</div>`;
        return;
    }

    let html = `<div class="track-card-grid">`;
    cachedTracks.forEach(t => {
        const badgeClass = t.is_clear ? "badge-clear" : (t.is_bad_order ? "badge-bo" : (t.is_blend ? "badge-blend" : (t.dwell_warning ? "badge-dwell" : "badge-occ")));
        const capText = t.capacity ? ` / ${t.capacity} cap` : "";
        html += `
            <div class="track-card ${badgeClass}" onclick="window.showTrackModalById('${t.id}')">
                <div class="track-card-header">
                    <span class="track-card-id">${t.name}</span>
                    <span class="track-card-cars">${t.is_clear ? "CLEAR" : t.cars + capText + " 🚂"}</span>
                </div>
                <div class="track-card-commodity">${t.commodity || "Empty"}</div>
                ${t.dwell_warning ? `<div class="track-card-dwell">⚠️ ${t.dwell_days} Days Dwell</div>` : ""}
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

window.showTrackModalById = (id) => {
    const t = cachedTracks.find(x => x.id === id);
    if (t) showTrackModal(t);
};

export function showTrackModal(track) {
    let modal = document.getElementById("track-detail-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "track-detail-modal";
        modal.className = "track-modal-backdrop";
        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = "none";
        };
        document.body.appendChild(modal);
    }

    const statusBadge = track.is_clear 
        ? `<span class="modal-status-badge status-clear">🟢 CLEAR / EMPTY</span>`
        : (track.is_bad_order 
            ? `<span class="modal-status-badge status-bo">🔴 BAD ORDER (B.O.)</span>`
            : (track.is_blend 
                ? `<span class="modal-status-badge status-blend">🔵 ACTIVE BLEND</span>`
                : (track.dwell_warning 
                    ? `<span class="modal-status-badge status-dwell">⚠️ DWELL WARNING (${track.dwell_days} DAYS)</span>`
                    : `<span class="modal-status-badge status-occ">⚪ OCCUPIED</span>`)));

    let capacityInfo = "";
    if (track.capacity) {
        const pct = Math.round((track.cars / track.capacity) * 100);
        const barColor = getCarColor(track.cars, track.capacity, track.is_bad_order);
        capacityInfo = `
            <div class="modal-detail-row" style="flex-direction: column; align-items: stretch; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                    <span class="modal-detail-label">Track Capacity Utilization:</span>
                    <span style="font-weight: bold; color: ${barColor};">${track.cars} / ${track.capacity} Cars (${pct}%)</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div style="background: ${barColor}; width: ${Math.min(pct, 100)}%; height: 100%; border-radius: 4px; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="track-modal-card">
            <div class="track-modal-header">
                <h3>${track.name}</h3>
                <button class="track-modal-close" onclick="document.getElementById('track-detail-modal').style.display='none'">&times;</button>
            </div>
            <div class="track-modal-body">
                <div style="margin-bottom: 15px;">${statusBadge}</div>
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Car Count:</span>
                    <span class="modal-detail-val" style="font-size: 1.3rem; font-weight: bold; color: #38bdf8;">${track.cars} Cars</span>
                </div>
                ${capacityInfo}
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Contents / Commodity:</span>
                    <span class="modal-detail-val">${track.commodity || "None"}</span>
                </div>
                ${track.notes && track.notes !== track.commodity ? `
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Shift Conductor Notes:</span>
                    <span class="modal-detail-val" style="color: #38bdf8; font-weight: 600;">📝 ${track.notes}</span>
                </div>` : ""}
                ${track.oldest_inbound_date ? `
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Oldest Inbound:</span>
                    <span class="modal-detail-val" style="color: #f59e0b;">${track.oldest_inbound_date} (${track.dwell_days} Days Dwell)</span>
                </div>` : ""}
            </div>
        </div>
    `;
    modal.style.display = "flex";
}

let hoverTooltipEl = null;

function showTrackHoverTooltip(e, track) {
    if (hasDraggedMap) return;
    if (!hoverTooltipEl) {
        hoverTooltipEl = document.createElement("div");
        hoverTooltipEl.className = "track-hover-tooltip";
        document.body.appendChild(hoverTooltipEl);
    }
    
    let capText = "";
    if (track.capacity) {
        const pct = Math.round((track.cars / track.capacity) * 100);
        const col = getCarColor(track.cars, track.capacity, track.is_bad_order);
        capText = `<br><span style="color: ${col}; font-size: 0.75rem;">Cap: ${track.cars}/${track.capacity} (${pct}%)</span>`;
    }

    hoverTooltipEl.innerHTML = `
        <strong>${track.name}</strong>: ${track.is_clear ? "CLEAR" : track.cars + " Cars"}<br>
        <span style="color: #94a3b8; font-size: 0.8rem;">${track.commodity || "Empty"}</span>
        ${capText}
        ${track.dwell_warning ? `<br><span style="color: #f59e0b; font-size: 0.75rem;">⚠️ ${track.dwell_days}d Dwell</span>` : ""}
    `;
    hoverTooltipEl.style.left = (e.pageX + 12) + "px";
    hoverTooltipEl.style.top = (e.pageY + 12) + "px";
    hoverTooltipEl.style.display = "block";
}

function showSimpleTooltip(e, html) {
    if (hasDraggedMap) return;
    if (!hoverTooltipEl) {
        hoverTooltipEl = document.createElement("div");
        hoverTooltipEl.className = "track-hover-tooltip";
        document.body.appendChild(hoverTooltipEl);
    }
    hoverTooltipEl.innerHTML = html;
    hoverTooltipEl.style.left = (e.pageX + 12) + "px";
    hoverTooltipEl.style.top = (e.pageY + 12) + "px";
    hoverTooltipEl.style.display = "block";
}

function hideTrackHoverTooltip() {
    if (hoverTooltipEl) {
        hoverTooltipEl.style.display = "none";
    }
}

// ── Fullscreen Theater Mode Engine ──────────────────────────────────────────
let isTheaterOpen = false;
let theaterZoom = 1;
let theaterPanX = 0;
let theaterPanY = 0;
let showBuildings = true;

export async function openExpandedTrackMap() {
    let theater = document.getElementById("trackmap-theater-modal");
    if (!theater) {
        theater = document.createElement("div");
        theater.id = "trackmap-theater-modal";
        theater.className = "track-theater-backdrop";
        document.body.appendChild(theater);

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isTheaterOpen) {
                closeExpandedTrackMap();
            }
        });
    }

    if (!svgTemplateCache) {
        try {
            const resData = await fetch("assets/data/track-map.svg?t=" + new Date().getTime());
            if (resData.ok) svgTemplateCache = await resData.text();
        } catch {}
        if (!svgTemplateCache) {
            try {
                const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
                if (res.ok) svgTemplateCache = await res.text();
            } catch (e) {
                console.warn("Could not load SVG for theater mode:", e);
            }
        }
    }

    const capText = trackStats.totalCapacity > 0 ? ` / ${trackStats.totalCapacity}` : "";

    theater.innerHTML = `
        <div class="track-theater-container">
            <div class="track-theater-header">
                <div class="theater-title-group">
                    <i class="fa-solid fa-train-subway" style="color: #38bdf8; font-size: 1.3rem;"></i>
                    <h2 style="margin: 0; font-size: 1.25rem; color: #fff;">YARD TRACK MAP</h2>
                    <span class="track-stat-pill pill-total">🚂 <strong>${trackStats.totalCars}${capText}</strong> Cars</span>
                    <span class="track-stat-pill pill-clear">🟢 <strong>${trackStats.clearTracksCount}</strong> Clear</span>
                    ${trackStats.badOrderCars > 0 ? `<span class="track-stat-pill pill-bo">🔴 <strong>${trackStats.badOrderCars}</strong> B.O.</span>` : ""}
                    ${trackStats.dwellWarningCount > 0 ? `<span class="track-stat-pill pill-dwell">⚠️ <strong>${trackStats.dwellWarningCount}</strong> Dwell</span>` : ""}
                </div>
                <div class="theater-controls-group">
                    <button id="btn-toggle-bld" class="theater-btn ${showBuildings ? "active" : ""}" title="Toggle Building Outlines">
                        <i class="fa-solid fa-building"></i> Buildings
                    </button>
                    <button id="btn-reset-zoom" class="theater-btn" title="Reset Zoom & Pan">
                        <i class="fa-solid fa-arrows-to-dot"></i> Reset
                    </button>
                    <button id="btn-close-theater" class="theater-btn theater-btn-close" title="Close Fullscreen (Esc)">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="track-theater-viewport" id="theater-viewport">
                <div id="theater-svg-wrapper" class="theater-svg-wrapper">
                    ${svgTemplateCache || "<div style='color:#fff;padding:40px;'>No vector track map available.</div>"}
                </div>
                <div class="theater-hint-bar">
                    <span><i class="fa-solid fa-computer-mouse"></i> Scroll to Zoom | Drag anywhere to Pan | Click Track for Details</span>
                </div>
            </div>
        </div>
    `;

    theater.style.display = "flex";
    isTheaterOpen = true;
    theaterZoom = 1;
    theaterPanX = 0;
    theaterPanY = 0;
    hasDraggedMap = false;

    const viewport = document.getElementById("theater-viewport");
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    const btnClose = document.getElementById("btn-close-theater");
    const btnReset = document.getElementById("btn-reset-zoom");
    const btnToggleBld = document.getElementById("btn-toggle-bld");

    if (btnClose) btnClose.onclick = closeExpandedTrackMap;
    if (btnReset) btnReset.onclick = resetTheaterTransform;
    if (btnToggleBld) {
        btnToggleBld.onclick = () => {
            showBuildings = !showBuildings;
            btnToggleBld.classList.toggle("active", showBuildings);
            applyBuildingVisibility();
        };
    }

    if (svgWrapper) {
        bindSvgInteractivity(svgWrapper, true);
        applyBuildingVisibility();
    }

    if (viewport && svgWrapper) {
        viewport.onwheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 0.85;
            theaterZoom = Math.min(Math.max(0.6, theaterZoom * delta), 5);
            applyTheaterTransform();
        };

        let isMouseDown = false;
        let startX = 0;
        let startY = 0;
        let initialPanX = 0;
        let initialPanY = 0;

        viewport.onmousedown = (e) => {
            if (e.target.closest("button, .theater-btn")) return;
            isMouseDown = true;
            hasDraggedMap = false;
            startX = e.clientX;
            startY = e.clientY;
            initialPanX = theaterPanX;
            initialPanY = theaterPanY;
            svgWrapper.style.transition = "none";
        };

        window.onmousemove = (e) => {
            if (!isMouseDown) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                hasDraggedMap = true;
                viewport.style.cursor = "grabbing";
                hideTrackHoverTooltip();
            }

            theaterPanX = initialPanX + dx;
            theaterPanY = initialPanY + dy;
            applyTheaterTransform();
        };

        window.onmouseup = (e) => {
            if (isMouseDown) {
                isMouseDown = false;
                if (viewport) viewport.style.cursor = "grab";
                if (svgWrapper) svgWrapper.style.transition = "transform 0.05s ease-out";
                setTimeout(() => { hasDraggedMap = false; }, 50);
            }
        };
    }
}

function updateTheaterMap() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (svgWrapper && svgTemplateCache) {
        svgWrapper.innerHTML = svgTemplateCache;
        bindSvgInteractivity(svgWrapper, true);
        applyBuildingVisibility();
        applyTheaterTransform();
    }
}

function applyTheaterTransform() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (svgWrapper) {
        svgWrapper.style.transform = `translate(${theaterPanX}px, ${theaterPanY}px) scale(${theaterZoom})`;
    }
}

function resetTheaterTransform() {
    theaterZoom = 1;
    theaterPanX = 0;
    theaterPanY = 0;
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (svgWrapper) svgWrapper.style.transition = "transform 0.25s ease";
    applyTheaterTransform();
}

function applyBuildingVisibility() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (!svgWrapper) return;
    const buildings = svgWrapper.querySelectorAll(".building, .tank, [id*='building'], [class*='building']");
    buildings.forEach(b => {
        b.style.display = showBuildings ? "" : "none";
    });
}

export function closeExpandedTrackMap() {
    const theater = document.getElementById("trackmap-theater-modal");
    if (theater) {
        theater.style.display = "none";
    }
    isTheaterOpen = false;
}
