// Equipment Status, Scales, Weekly Audit & Autoscroll Module
import { getHolidayEquipmentIcon } from './theme.js';
import { cachedFeatures } from './features.js';
import { fetchJson, cacheBustUrl } from './http.js';
import { isAuditResetCurrent } from './audit-utils.js';

export { isAuditResetCurrent };
export let cachedEquipment = { categories: [] };
let equipScrollInterval = null;

export async function fetchEquipmentStatus() {
    try {
        const data = await fetchJson(cacheBustUrl('assets/data/equipment.json'));
        
        // Prevent unnecessary DOM rebuilds if data hasn't changed (deep comparison)
        if (JSON.stringify(data) !== JSON.stringify(cachedEquipment)) {
            cachedEquipment = data;
            renderEquipmentDashboard();
        }
    } catch (e) {
        console.error("Failed to fetch equipment.json", e);
    }
}

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
        
        // Category Title
        const title = document.createElement('h4');
        title.className = 'equipment-category-title';
        title.innerHTML = `${holidayIcon}${cat.name.toUpperCase()}`;
        block.appendChild(title);
        
        // Equipment Pills Grid
        const grid = document.createElement('div');
        grid.className = 'equipment-grid';
        
        const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';

        cat.items.forEach(item => {
            const rawStatus = (item.status || '').toUpperCase();
            let statusKey = 'unknown';
            if (rawStatus === 'OK') statusKey = 'ok';
            else if (rawStatus === 'OS') statusKey = 'os';
            else if (rawStatus === 'PM') statusKey = 'pm';

            const pill = document.createElement('div');
            pill.className = `equipment-pill status-${statusKey}`;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'equipment-name';
            nameSpan.innerText = item.name;
            
            // Container for badges on the right side
            const badgesContainer = document.createElement('div');
            badgesContainer.className = 'equipment-badges';

            // Mobile Cranes Specific Badges (Scale & Blend Audit)
            if (isMobileCranes && item.scale && item.scale !== 'NO' && item.scale !== 'NONE') {
                if (item.scale === 'OK') {
                    const scaleBadge = document.createElement('span');
                    scaleBadge.className = 'badge-scale badge-scale-ok';
                    scaleBadge.innerText = 'SCALE OK';
                    badgesContainer.appendChild(scaleBadge);

                    if (cachedFeatures.features?.scale_audit_badges !== false) {
                        const isAudited = auditIsCurrent && !!item.blend_audit;
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
            statusBadge.className = 'equipment-status-badge';
            
            if (statusKey === 'ok') {
                statusBadge.innerText = 'OK';
            } else if (statusKey === 'os') {
                statusBadge.innerText = item.reason ? `OS: ${item.reason.toUpperCase()}` : 'OUT OF SERVICE';
            } else if (statusKey === 'pm') {
                statusBadge.innerText = item.reason ? `ISSUE: ${item.reason.toUpperCase()}` : 'ISSUE';
            } else {
                statusBadge.innerText = item.status || 'UNKNOWN';
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
