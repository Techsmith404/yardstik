// Novara Safety Curriculum & Action Required Video Parser Module
import { siteConfig } from './config.js';

let safetyScrollPos = 0;
let safetyScrollDirection = 1;
let safetyScrollTimeout = null;
let safetyScrollRaf = null;

export function startSafetyScroll() {
    const list = document.getElementById('safety-list');
    if (!list) return;
    
    // Stop any existing animation
    if (safetyScrollRaf) cancelAnimationFrame(safetyScrollRaf);
    if (safetyScrollTimeout) clearTimeout(safetyScrollTimeout);
    
    // Restore scroll position immediately (handles returning to view)
    list.scrollTop = safetyScrollPos;
    
    // Only scroll if there's actually overflow
    if (list.scrollHeight <= list.clientHeight) return;
    
    // Wait 1.5s after panel slides in before starting the smooth scroll
    safetyScrollTimeout = setTimeout(() => {
        let lastTime = performance.now();
        
        function scrollLoop(time) {
            const dt = time - lastTime;
            lastTime = time;
            
            // Stop animation if the panel or view rotated away
            const pSaf = document.getElementById('panel-safety');
            const viewAnn = document.getElementById('view-announcements');
            if (list.offsetParent === null || !pSaf || pSaf.style.opacity === '0' || !viewAnn || !viewAnn.classList.contains('active')) {
                return; 
            }
            
            // Scroll by ~35px per second
            const delta = (35 * dt) / 1000;
            safetyScrollPos += delta * safetyScrollDirection;
            list.scrollTop = safetyScrollPos;
            
            // Did we hit the bottom?
            if (safetyScrollDirection === 1 && safetyScrollPos >= list.scrollHeight - list.clientHeight) {
                safetyScrollPos = list.scrollHeight - list.clientHeight;
                safetyScrollDirection = -1;
                safetyScrollTimeout = setTimeout(() => {
                    lastTime = performance.now();
                    safetyScrollRaf = requestAnimationFrame(scrollLoop);
                }, 1500);
                return;
            }
            
            // Did we hit the top?
            if (safetyScrollDirection === -1 && safetyScrollPos <= 0) {
                safetyScrollPos = 0;
                safetyScrollDirection = 1;
                safetyScrollTimeout = setTimeout(() => {
                    lastTime = performance.now();
                    safetyScrollRaf = requestAnimationFrame(scrollLoop);
                }, 1500);
                return;
            }
            
            safetyScrollRaf = requestAnimationFrame(scrollLoop);
        }
        
        safetyScrollRaf = requestAnimationFrame(scrollLoop);
    }, 1500);
}

export async function fetchSafetyVideos() {
    const list = document.getElementById('safety-list');
    const titleEl = document.getElementById('safety-title');
    if (!list) return;

    try {
        const apiBase = (siteConfig.vercel_api_url || '').replace(/\/+$/, '');
        const res = await fetch(`${apiBase}/api/novara?t=` + new Date().getTime());
        if (!res.ok) throw new Error("Novara API not available");
        const data = await res.json();
        
        if (!data.success || !data.response || data.response.length === 0) {
            list.innerHTML = '<li style="grid-column: 1 / -1; color: #4ade80; font-style: italic; padding: 15px; text-align: center;">All employees are 100% up to date! 🎉</li>';
            if (titleEl) titleEl.innerHTML = 'Action Required: Safety Videos <span style="opacity: 0.7; font-size: 0.85em; font-weight: 400; margin-left: 8px;">(0 This Month • 0 Total)</span>';
            return;
        }
        
        const totalThisMonth = typeof data.totalExpiring === 'number' ? data.totalExpiring : data.response.reduce((sum, e) => sum + (e.expiringCount || 0), 0);
        const totalOverall = typeof data.totalMissing === 'number' ? data.totalMissing : data.response.reduce((sum, e) => sum + (e.missingCount || 0), 0);

        let html = '';
        data.response.forEach(emp => {
            let badgesHtml = '';
            const expCount = emp.expiringCount || 0;
            const incompCount = emp.incompleteCount || 0;

            if (expCount > 0) {
                badgesHtml += `<span class="badge-safety-expiring" title="${expCount} Due This Month"><i class="fa-solid fa-clock"></i> ${expCount}</span>`;
            }
            if (incompCount > 0) {
                badgesHtml += `<span class="badge-safety-incomplete" title="${incompCount} Overdue"><i class="fa-solid fa-triangle-exclamation"></i> ${incompCount}</span>`;
            }
            if (!badgesHtml) {
                badgesHtml = `<span class="badge-safety-incomplete" title="${emp.missingCount} Due"><i class="fa-solid fa-triangle-exclamation"></i> ${emp.missingCount}</span>`;
            }

            html += `
                <li style="padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                        <img src="${emp.photoUrl}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 2px 5px rgba(0,0,0,0.5); flex-shrink: 0;">
                        <strong style="color: white; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emp.name}</strong>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;">
                        ${badgesHtml}
                    </div>
                </li>
            `;
        });
        
        list.innerHTML = html;
        if (titleEl) {
            titleEl.innerHTML = `Action Required: Safety Videos <span style="font-size: 0.8em; font-weight: 500; opacity: 0.85; margin-left: 8px; color: #fca5a5;">(${totalThisMonth} This Month • ${totalOverall} Total)</span>`;
        }
    } catch (err) {
        console.warn("Safety video API not available:", err);
        list.innerHTML = '<li style="grid-column: 1 / -1; color: #94a3b8; font-style: italic; padding: 15px; text-align: center;"><i class="fa-solid fa-circle-info"></i> All safety modules up to date.</li>';
        if (titleEl) titleEl.innerHTML = 'Action Required: Safety Videos <span style="opacity: 0.7; font-size: 0.85em; font-weight: 400; margin-left: 8px;">(0 This Month • 0 Total)</span>';
    }
}
