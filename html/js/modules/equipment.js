// Equipment Status, Scales, Weekly Audit & Autoscroll Module
import { getHolidayEquipmentIcon } from './theme.js';
import { cachedFeatures } from './features.js';
import { fetchJson, cacheBustUrl } from './http.js';
import { isAuditResetCurrent } from './audit-utils.js';
import { isHandoffActive, onLayoutTransition } from './layout.js';

export { isAuditResetCurrent };
export let cachedEquipment = { categories: [] };
let equipScrollInterval = null;

export function getItemStatusKey(item) {
    const rawStatus = (item && item.status ? item.status : '').toUpperCase();
    if (rawStatus === 'OK') return 'ok';
    if (rawStatus === 'OS') return 'os';
    if (rawStatus === 'PM') return 'pm';
    return 'unknown';
}

export function isItemException(item, catName, auditIsCurrent) {
    if (!item) return false;
    const statusKey = getItemStatusKey(item);
    if (statusKey === 'os' || statusKey === 'pm') return true;
    const isMobileCranes = (catName || '').trim().toLowerCase() === 'mobile cranes';
    if (isMobileCranes && item.scale === 'OS') return true;
    // Scale audit checkmark (blend_audit) is deliberately excluded from top turnover exceptions banner
    return false;
}

export function getItemPriority(item, catName, auditIsCurrent) {
    if (!item) return 99;
    const statusKey = getItemStatusKey(item);
    if (statusKey === 'os') return 1;
    if (statusKey === 'pm') return 2;
    const isMobileCranes = (catName || '').trim().toLowerCase() === 'mobile cranes';
    if (isMobileCranes) {
        if (item.scale === 'OS') return 3;
        if (item.scale === 'OK' && cachedFeatures?.features?.scale_audit_badges !== false && (!auditIsCurrent || !item.blend_audit)) {
            return 4;
        }
    }
    if (statusKey === 'ok') return 10;
    return 20;
}

export function createEquipmentPill(item, catName, auditIsCurrent, isExceptionCard = false) {
    const statusKey = getItemStatusKey(item);
    const isMobileCranes = (catName || '').trim().toLowerCase() === 'mobile cranes';

    const pill = document.createElement('div');
    pill.className = `equipment-pill status-${statusKey}${isExceptionCard ? ' is-turnover-exception' : ''}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'equipment-name';
    if (isExceptionCard) {
        const catTag = document.createElement('span');
        catTag.className = 'exception-cat-tag';
        catTag.textContent = (catName || '').toUpperCase();
        nameSpan.appendChild(catTag);
    }
    const nameText = document.createTextNode(item.name || 'Unknown Item');
    nameSpan.appendChild(nameText);
    
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
    return pill;
}

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
    const isHandoff = isHandoffActive || (typeof document !== 'undefined' && document.body && document.body.classList.contains('handoff-mode'));
    
    // Manage Turnover Exceptions Block above masonry in Handoff Mode
    const scrollWrapper = document.getElementById('equipment-scroll-wrapper') || container.parentElement;
    let exceptionsContainer = document.getElementById('equipment-handoff-exceptions');
    if (!exceptionsContainer && scrollWrapper) {
        exceptionsContainer = document.createElement('div');
        exceptionsContainer.id = 'equipment-handoff-exceptions';
        scrollWrapper.insertBefore(exceptionsContainer, container);
    }

    if (isHandoff) {
        const allExceptions = [];
        (cachedEquipment.categories || []).forEach(cat => {
            (cat.items || []).forEach(item => {
                if (isItemException(item, cat.name, auditIsCurrent)) {
                    allExceptions.push({
                        item,
                        catName: cat.name,
                        priority: getItemPriority(item, cat.name, auditIsCurrent)
                    });
                }
            });
        });
        allExceptions.sort((a, b) => a.priority - b.priority);

        if (exceptionsContainer) {
            exceptionsContainer.style.display = 'block';
            if (allExceptions.length > 0) {
                exceptionsContainer.innerHTML = `
                    <div class="handoff-exceptions-banner">
                        <div class="handoff-exceptions-title">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span>SHIFT TURNOVER EXCEPTIONS & DOWN EQUIPMENT (${allExceptions.length})</span>
                        </div>
                        <div class="handoff-exceptions-grid"></div>
                    </div>
                `;
                const gridEl = exceptionsContainer.querySelector('.handoff-exceptions-grid');
                allExceptions.forEach(ex => {
                    gridEl.appendChild(createEquipmentPill(ex.item, ex.catName, auditIsCurrent, true));
                });
            } else {
                exceptionsContainer.innerHTML = `
                    <div class="handoff-all-clear-banner">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>ALL EQUIPMENT OPERATIONAL — NO ACTIVE TURNOVER EXCEPTIONS</span>
                    </div>
                `;
            }
        }
    } else if (exceptionsContainer) {
        exceptionsContainer.innerHTML = '';
        exceptionsContainer.style.display = 'none';
    }

    // Determine category rendering order: in handoff mode, categories with exceptions appear first
    let categoriesToRender = (cachedEquipment.categories || []).slice();
    if (isHandoff) {
        categoriesToRender.sort((a, b) => {
            const aHas = (a.items || []).some(it => isItemException(it, a.name, auditIsCurrent));
            const bHas = (b.items || []).some(it => isItemException(it, b.name, auditIsCurrent));
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            return 0;
        });
    }

    categoriesToRender.forEach(cat => {
        if (!cat.items || cat.items.length === 0) return;

        // In handoff mode, omit items already displayed in the top exceptions banner to eliminate redundancy
        let itemsToRender = (cat.items || []).slice();
        if (isHandoff) {
            itemsToRender = itemsToRender.filter(item => !isItemException(item, cat.name, auditIsCurrent));
        }

        // If all items in this category were exceptions and hoisted to the top banner, skip empty category card
        if (itemsToRender.length === 0) return;
        
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
        
        // In handoff mode, sort remaining items within category
        if (isHandoff) {
            itemsToRender.sort((a, b) => {
                return getItemPriority(a, cat.name, auditIsCurrent) - getItemPriority(b, cat.name, auditIsCurrent);
            });
        }

        itemsToRender.forEach(item => {
            const pill = createEquipmentPill(item, cat.name, auditIsCurrent, false);
            grid.appendChild(pill);
        });
        
        block.appendChild(grid);
        container.appendChild(block);
    });
}

// React immediately to Shift Handoff Mode activations and expirations
onLayoutTransition(() => {
    renderEquipmentDashboard();
});

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
