// Employee Milestones & Anniversaries Engine Module
import { siteConfig, isDesktopMode } from './config.js';

export let rawAnniversariesData = null;
export let isAnniversariesExpanded = false;

export function renderEmployeeAnniversaryItem(e) {
    const yearStr = e.years === 1 ? 'Year' : 'Years';
    const isToday = e.days_until === 0;
    const daysUntilStr = isToday ? "Today!" : (e.days_until === 1 ? "Tomorrow" : `in ${e.days_until} days`);
    const badgeStyle = isToday 
        ? 'background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; font-weight: 800;' 
        : '';

    return `<li>
        <div style="display: flex; align-items: center; gap: 12px;">
            <strong>${e.name}</strong> 
            <span style="background: ${isToday ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${isToday ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)'}; padding: 4px 12px; border-radius: 20px; color: ${isToday ? '#fde68a' : 'var(--text-secondary)'}; font-size: 0.85em; font-weight: ${isToday ? '700' : '400'};">${e.date}</span>
            <span style="color: ${isToday ? 'var(--neon-amber)' : 'var(--text-muted)'}; font-size: 0.85em; font-style: italic; opacity: ${isToday ? '1' : '0.7'}; font-weight: ${isToday ? '700' : '400'};">${daysUntilStr}</span>
        </div>
        <span class="years-badge" style="${badgeStyle}">${e.years} ${yearStr}${isToday ? '!' : ''}</span>
    </li>`;
}

export function renderAllAnniversaries(employees) {
    const list = document.getElementById('anniversaries-list');
    if (!list) return;
    list.innerHTML = '';
    
    employees.forEach(e => {
        list.innerHTML += renderEmployeeAnniversaryItem(e);
    });

    // Add collapse toggle button at the bottom (Desktop only)
    if (isDesktopMode) {
        let collapseBtn = document.createElement('li');
        collapseBtn.style = "grid-column: 1 / -1; justify-content: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-weight: 600; font-size: 0.85rem; margin-top: 5px; cursor: pointer; padding: 6px 12px; border-radius: 6px; text-align: center;";
        collapseBtn.innerHTML = `<span><i class="fa-solid fa-chevron-up"></i> Show Less</span>`;
        collapseBtn.onclick = () => {
            isAnniversariesExpanded = false;
            getAnniversaries();
        };
        list.appendChild(collapseBtn);
    }
}

export async function getAnniversaries() {
    try {
        const apiBase = (siteConfig.vercel_api_url || '').replace(/\/+$/, '');
        let data = null;

        try {
            const res = await fetch(`${apiBase}/api/novara?type=anniversaries&t=` + new Date().getTime());
            if (res.ok) {
                data = await res.json();
            }
        } catch (apiErr) {
            console.warn('Novara API offline, checking local anniversaries.json fallback:', apiErr);
        }

        if (!data || !data.employees) {
            const localRes = await fetch('assets/data/anniversaries.json?t=' + new Date().getTime());
            if (localRes.ok) data = await localRes.json();
        }

        rawAnniversariesData = data;

        const list = document.getElementById('anniversaries-list');
        const title = document.getElementById('anniversary-title');
        if (!list || !title || !data) return;
        list.innerHTML = '';
        
        if (data.employees && data.employees.length > 0) {
            if (isAnniversariesExpanded) {
                renderAllAnniversaries(data.employees);
                return;
            }

            const hasTodayCelebration = data.employees.some(e => e.days_until === 0);
            if (hasTodayCelebration) {
                title.innerText = "🎉 Milestones & Anniversaries 🎉";
                title.style.color = "var(--neon-amber)";
            } else {
                title.innerText = "Upcoming Anniversaries";
                title.style.color = "var(--text-primary)";
            }

            data.employees.forEach(e => {
                list.innerHTML += renderEmployeeAnniversaryItem(e);
            });
            
            // Dynamic Truncation for Overflowing Lists on TV Kiosk
            setTimeout(() => {
                if (isDesktopMode) return; // Desktop uses scrollable container

                const panelEl = document.getElementById('panel-anniversaries');
                const titleEl = document.getElementById('anniversary-title');
                const titleH = titleEl ? titleEl.offsetHeight : 50;
                const maxH = panelEl ? (panelEl.clientHeight - titleH - 30) : 390;

                let items = Array.from(list.children);
                let hiddenCount = 0;
                let loops = 0;

                while (list.scrollHeight > maxH && items.length > 2 && loops < 50) {
                    list.removeChild(items.pop());
                    hiddenCount++;
                    loops++;
                }

                if (hiddenCount > 0) {
                    let badge = document.createElement('li');
                    badge.style = "grid-column: 1 / -1; justify-content: center; background: transparent; border: none; color: var(--text-muted); font-style: italic; margin-top: 2px; padding: 4px; text-align: center;";
                    badge.innerText = `+${hiddenCount} more this month`;
                    list.appendChild(badge);
                    
                    // Check if adding the badge pushed it back into overflow
                    while (list.scrollHeight > maxH && items.length > 2 && loops < 50) {
                        list.removeChild(items.pop());
                        hiddenCount++;
                        badge.innerText = `+${hiddenCount} more this month`;
                        loops++;
                    }
                }
            }, 100);
            
        } else {
            title.innerText = "Upcoming Anniversaries";
            title.style.color = "var(--text-primary)";
            list.innerHTML = `<li style="color: var(--text-muted);">No upcoming milestones found.</li>`;
        }
    } catch (e) {}
}
