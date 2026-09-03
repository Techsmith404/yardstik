// YardStik Universal Interactive Track Map & Track Check Module
import { cachedFeatures } from "./features.js";
import { isDesktopMode } from "./config.js";

export let cachedTracks = [];
export let trackStats = {
    totalCars: 0,
    badOrderCars: 0,
    blendCars: 0,
    clearTracksCount: 0,
    dwellWarningCount: 0
};

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
    let total = 0, bo = 0, blend = 0, clear = 0, dwell = 0;
    cachedTracks.forEach(t => {
        total += (t.cars || 0);
        if (t.is_bad_order) bo += (t.cars || 0);
        if (t.is_blend) blend += (t.cars || 0);
        if (t.is_clear) clear++;
        if (t.dwell_warning) dwell++;
    });
    trackStats = {
        totalCars: total,
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
        statsEl.innerHTML = `
            <span class="track-stat-pill pill-total">🚂 <strong>${trackStats.totalCars}</strong> Cars</span>
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

    // Check if feature is enabled
    const isEnabled = cachedFeatures?.features?.track_map !== false;
    const widget = document.getElementById("widget-trackmap");
    if (widget) {
        widget.style.display = isEnabled ? "flex" : "none";
    }
    if (!isEnabled) return;

    // Make widget clickable to expand on desktop
    container.classList.add("clickable-trackmap");
    container.onclick = (e) => {
        // If clicking background or map, expand full screen
        if (!e.target.closest("g[data-track]")) {
            openExpandedTrackMap();
        }
    };

    try {
        if (!svgTemplateCache) {
            const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
            if (res.ok) {
                svgTemplateCache = await res.text();
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

    const trackMap = {};
    cachedTracks.forEach(t => {
        trackMap[t.id.toUpperCase()] = t;
    });

    const badgeGroups = svg.querySelectorAll("g[data-track], g[transform]");
    badgeGroups.forEach(g => {
        let trackId = g.getAttribute("data-track");
        if (!trackId) {
            const txt = g.querySelector("text");
            if (txt) trackId = txt.textContent.trim().toUpperCase();
        }
        if (!trackId) return;

        const data = trackMap[trackId.toUpperCase()];
        if (data) {
            if (data.is_clear) {
                g.classList.add("badge-clear");
            } else if (data.is_bad_order) {
                g.classList.add("badge-bad-order");
            } else if (data.is_blend) {
                g.classList.add("badge-blend");
            } else if (data.dwell_warning) {
                g.classList.add("badge-dwell");
            }

            const textEl = g.querySelector("text");
            if (textEl && data.cars > 0) {
                textEl.textContent = `${trackId} (${data.cars})`;
                const rect = g.querySelector("rect");
                if (rect) {
                    rect.setAttribute("width", "36");
                    rect.setAttribute("x", "-18");
                }
            }

            g.onclick = (e) => {
                e.stopPropagation();
                showTrackModal(data);
            };

            g.onmouseenter = (e) => {
                showTrackHoverTooltip(e, data);
            };
            g.onmouseleave = () => {
                hideTrackHoverTooltip();
            };
        }
    });
}

function renderFallbackCardGrid(container) {
    if (!cachedTracks.length) {
        container.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">No track data available.</div>`;
        return;
    }

    let html = `<div class="track-card-grid">`;
    cachedTracks.forEach(t => {
        const badgeClass = t.is_clear ? "badge-clear" : (t.is_bad_order ? "badge-bo" : (t.is_blend ? "badge-blend" : (t.dwell_warning ? "badge-dwell" : "badge-occ")));
        html += `
            <div class="track-card ${badgeClass}" onclick="window.showTrackModalById('${t.id}')">
                <div class="track-card-header">
                    <span class="track-card-id">${t.name}</span>
                    <span class="track-card-cars">${t.is_clear ? "CLEAR" : t.cars + " 🚂"}</span>
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
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Contents / Commodity:</span>
                    <span class="modal-detail-val">${track.commodity || "None"}</span>
                </div>
                ${track.notes && track.notes !== track.commodity ? `
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Shift Conductor Notes:</span>
                    <span class="modal-detail-val" style="color: var(--text-secondary); font-style: italic;">${track.notes}</span>
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
    if (!hoverTooltipEl) {
        hoverTooltipEl = document.createElement("div");
        hoverTooltipEl.className = "track-hover-tooltip";
        document.body.appendChild(hoverTooltipEl);
    }
    hoverTooltipEl.innerHTML = `
        <strong>${track.name}</strong>: ${track.is_clear ? "CLEAR" : track.cars + " Cars"}<br>
        <span style="color: #94a3b8; font-size: 0.8rem;">${track.commodity || "Empty"}</span>
        ${track.dwell_warning ? `<br><span style="color: #f59e0b; font-size: 0.75rem;">⚠️ ${track.dwell_days}d Dwell</span>` : ""}
    `;
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
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let showBuildings = true;

export async function openExpandedTrackMap() {
    let theater = document.getElementById("trackmap-theater-modal");
    if (!theater) {
        theater = document.createElement("div");
        theater.id = "trackmap-theater-modal";
        theater.className = "track-theater-backdrop";
        document.body.appendChild(theater);

        // Global Esc key to close
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isTheaterOpen) {
                closeExpandedTrackMap();
            }
        });
    }

    if (!svgTemplateCache) {
        try {
            const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
            if (res.ok) svgTemplateCache = await res.text();
        } catch (e) {
            console.warn("Could not load SVG for theater mode:", e);
        }
    }

    theater.innerHTML = `
        <div class="track-theater-container">
            <div class="track-theater-header">
                <div class="theater-title-group">
                    <i class="fa-solid fa-train-subway" style="color: #38bdf8; font-size: 1.3rem;"></i>
                    <h2 style="margin: 0; font-size: 1.25rem; color: #fff;">Yard Track Map & Dispatch Console</h2>
                    <span class="track-stat-pill pill-total">🚂 <strong>${trackStats.totalCars}</strong> Cars</span>
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
                    <span><i class="fa-solid fa-computer-mouse"></i> Scroll to Zoom | Drag to Pan | Click Track for Details</span>
                </div>
            </div>
        </div>
    `;

    theater.style.display = "flex";
    isTheaterOpen = true;
    theaterZoom = 1;
    theaterPanX = 0;
    theaterPanY = 0;

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

    // Pan & Zoom Event Listeners
    if (viewport && svgWrapper) {
        viewport.onwheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 0.85;
            theaterZoom = Math.min(Math.max(0.6, theaterZoom * delta), 5);
            applyTheaterTransform();
        };

        viewport.onmousedown = (e) => {
            if (e.target.closest("g[data-track]") || e.target.closest("button")) return;
            isPanning = true;
            startPanX = e.clientX - theaterPanX;
            startPanY = e.clientY - theaterPanY;
            viewport.style.cursor = "grabbing";
        };

        window.onmousemove = (e) => {
            if (!isPanning) return;
            theaterPanX = e.clientX - startPanX;
            theaterPanY = e.clientY - startPanY;
            applyTheaterTransform();
        };

        window.onmouseup = () => {
            isPanning = false;
            if (viewport) viewport.style.cursor = "grab";
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
    applyTheaterTransform();
}

function applyBuildingVisibility() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (!svgWrapper) return;
    const buildings = svgWrapper.querySelectorAll("rect.yard-building, circle.yard-building, g.yard-building, [style*='fill:']");
    buildings.forEach(b => {
        if (!b.closest("g[data-track]") && !b.classList.contains("badge-rect")) {
            b.style.display = showBuildings ? "" : "none";
        }
    });
}

export function closeExpandedTrackMap() {
    const theater = document.getElementById("trackmap-theater-modal");
    if (theater) {
        theater.style.display = "none";
    }
    isTheaterOpen = false;
}
