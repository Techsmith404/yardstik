// YardStik Universal Interactive Track Map & Track Check Module
import { cachedFeatures } from "./features.js";

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
        `;
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

    try {
        if (!svgTemplateCache) {
            const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
            if (res.ok) {
                svgTemplateCache = await res.text();
            }
        }

        if (svgTemplateCache) {
            container.innerHTML = svgTemplateCache;
            bindSvgInteractivity(container);
        } else {
            renderFallbackCardGrid(container);
        }
    } catch (e) {
        console.warn("SVG Track Map load error, falling back to card grid:", e);
        renderFallbackCardGrid(container);
    }
}

function bindSvgInteractivity(container) {
    const svg = container.querySelector("svg");
    if (!svg) return;

    // Make SVG scale responsively inside widget
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.maxHeight = "100%";
    svg.style.display = "block";

    // Build lookup map
    const trackMap = {};
    cachedTracks.forEach(t => {
        trackMap[t.id.toUpperCase()] = t;
    });

    // Find all badge groups
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
            // Apply dynamic status classes
            if (data.is_clear) {
                g.classList.add("badge-clear");
            } else if (data.is_bad_order) {
                g.classList.add("badge-bad-order");
            } else if (data.is_blend) {
                g.classList.add("badge-blend");
            } else if (data.dwell_warning) {
                g.classList.add("badge-dwell");
            }

            // Append car count text if occupied
            const textEl = g.querySelector("text");
            if (textEl && data.cars > 0) {
                // If there is space or tooltip
                textEl.textContent = `${trackId} (${data.cars})`;
                const rect = g.querySelector("rect");
                if (rect) {
                    rect.setAttribute("width", "36");
                    rect.setAttribute("x", "-18");
                }
            }

            // Interactive Tooltip / Modal Click
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
