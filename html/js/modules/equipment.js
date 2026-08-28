// Equipment Status, Scales, Weekly Audit & Autoscroll Module

export let cachedEquipment = { categories: [] };
let equipScrollInterval = null;

export function isAuditResetCurrent(lastAuditResetEpoch) {
    const d = new Date();
    const day = d.getDay();
    const hours = d.getHours();
    let daysToSubtract = day;
    if (day === 0 && hours < 23) daysToSubtract = 7;
    const sunday11pm = new Date(d);
    sunday11pm.setDate(d.getDate() - daysToSubtract);
    sunday11pm.setHours(23, 0, 0, 0);
    return !!(lastAuditResetEpoch && lastAuditResetEpoch >= sunday11pm.getTime());
}

export async function fetchEquipmentStatus() {
    try {
        const res = await fetch('assets/data/equipment.json?t=' + new Date().getTime());
        const data = await res.json();
        
        // Prevent unnecessary DOM rebuilds if data hasn't changed (deep comparison)
        if (JSON.stringify(data) !== JSON.stringify(cachedEquipment)) {
            cachedEquipment = data;
            renderEquipmentDashboard();
        }
    } catch (e) {
        console.error("Failed to fetch equipment.json", e);
    }
}

import { getHolidayEquipmentIcon } from './theme.js';
import { cachedFeatures } from './features.js';

export function renderEquipmentDashboard() {
    const container = document.getElementById('equipment-masonry');
    if (!container) return;
    
    container.innerHTML = '';
    const auditIsCurrent = isAuditResetCurrent(cachedEquipment.last_audit_reset);
    const holidayIcon = getHolidayEquipmentIcon();
    
    cachedEquipment.categories.forEach(cat => {
        if (!cat.items || cat.items.length === 0) return;
        
        // Create Category Block
        const block = document.createElement('div');
        block.className = 'equipment-category';
        block.style.background = 'rgba(0,0,0,0.2)';
        block.style.borderRadius = '12px';
        block.style.padding = '15px';
        block.style.border = '1px solid rgba(255,255,255,0.05)';
        block.style.breakInside = 'avoid';
        block.style.marginBottom = '20px';
        
        // Category Title
        const title = document.createElement('h4');
        title.innerHTML = `${holidayIcon}${cat.name.toUpperCase()}`;
        title.style.margin = '0 0 12px 0';
        title.style.fontSize = '1.1rem';
        title.style.letterSpacing = '0.05em';
        title.style.color = 'var(--text-secondary)';
        title.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        title.style.paddingBottom = '5px';
        block.appendChild(title);
        
        // Equipment Pills Grid
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr';
        grid.style.gap = '8px';
        
        const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';

        cat.items.forEach(item => {
            const pill = document.createElement('div');
            pill.style.display = 'flex';
            pill.style.justifyContent = 'space-between';
            pill.style.alignItems = 'center';
            pill.style.padding = '8px 12px';
            pill.style.borderRadius = '6px';
            pill.style.fontSize = '1rem';
            pill.style.fontWeight = '500';
            pill.style.background = 'rgba(255,255,255,0.03)';
            pill.style.borderLeft = '4px solid transparent';
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = item.name;
            nameSpan.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
            
            // Container for badges on the right side
            const badgesContainer = document.createElement('div');
            badgesContainer.style.display = 'flex';
            badgesContainer.style.alignItems = 'center';
            badgesContainer.style.gap = '8px';

            // Mobile Cranes Specific Badges (Scale & Blend Audit)
            if (isMobileCranes && item.scale && item.scale !== 'NO' && item.scale !== 'NONE') {
                if (item.scale === 'OK') {
                    const scaleBadge = document.createElement('span');
                    scaleBadge.className = 'badge-scale badge-scale-ok';
                    scaleBadge.innerText = 'SCALE OK';
                    badgesContainer.appendChild(scaleBadge);

                    if (cachedFeatures.features?.scale_audit_badges !== false) {
                        const isAudited = !!item.blend_audit;
                        const auditBadge = document.createElement('span');
                        auditBadge.className = `badge-audit ${isAudited ? 'badge-audit-yes' : 'badge-audit-no'}`;
                        auditBadge.innerHTML = `Audit: <i class="fa-solid ${isAudited ? 'fa-check' : 'fa-xmark'}"></i>`;
                        badgesContainer.appendChild(auditBadge);
                    }
                } else if (item.scale === 'OS') {
                    const scaleBadge = document.createElement('span');
                    scaleBadge.className = 'badge-scale badge-scale-os';
                    scaleBadge.innerText = 'SCALE OS';
                    badgesContainer.appendChild(scaleBadge);
                }
            }

            const statusBadge = document.createElement('span');
            statusBadge.style.padding = '2px 8px';
            statusBadge.style.borderRadius = '4px';
            statusBadge.style.fontSize = '0.85rem';
            statusBadge.style.fontWeight = 'bold';
            statusBadge.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
            statusBadge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            
            if (item.status === 'OK') {
                statusBadge.innerText = 'OK';
                statusBadge.style.background = 'var(--success, #10b981)';
                pill.style.borderLeftColor = 'var(--success, #10b981)';
            } else if (item.status === 'OS') {
                statusBadge.innerText = item.reason ? `OS: ${item.reason.toUpperCase()}` : 'OUT OF SERVICE';
                statusBadge.style.background = 'var(--danger, #ef4444)';
                pill.style.borderLeftColor = 'var(--danger, #ef4444)';
                pill.style.background = 'rgba(239, 68, 68, 0.1)'; // Slight red tint for broken stuff
            } else if (item.status === 'PM') {
                statusBadge.innerText = item.reason ? `ISSUE: ${item.reason.toUpperCase()}` : 'ISSUE';
                statusBadge.style.background = 'var(--warning, #f59e0b)';
                pill.style.borderLeftColor = 'var(--warning, #f59e0b)';
                statusBadge.style.color = '#fff';
            } else {
                statusBadge.innerText = item.status;
                statusBadge.style.background = '#6b7280';
                pill.style.borderLeftColor = '#6b7280';
            }
            
            badgesContainer.appendChild(statusBadge);
            pill.appendChild(nameSpan);
            pill.appendChild(badgesContainer);
            grid.appendChild(pill);
        });
        
        block.appendChild(grid);
        container.appendChild(block);
    });
}

export function startEquipmentAutoscroll() {
    if (equipScrollInterval) clearInterval(equipScrollInterval);
    equipScrollInterval = setInterval(() => {
        const container = document.getElementById('equipment-scroll-wrapper');
        if (!container) return;
        
        // If the container doesn't overflow, do nothing
        if (container.scrollHeight <= container.clientHeight) return;
        
        // Check if we are at the bottom (with a small 10px threshold)
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
            // Smoothly scroll back to top
            container.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // Scroll down by 85% of the visible height so there's visual overlap
            container.scrollBy({ top: container.clientHeight * 0.85, left: 0, behavior: 'smooth' });
        }
    }, 10000); // Scroll every 10 seconds
}
