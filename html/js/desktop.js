import { fetchSiteConfig, checkVersion, initDeviceRouting } from './modules/config.js';
import { fetchShifts, startClockLoop } from './modules/clock.js';
import { updateTrackers } from './modules/trackers.js';
import { getWeather } from './modules/weather.js';
import { checkLightning, updateLightningWidget } from './modules/lightning.js';
import { fetchEquipmentStatus } from './modules/equipment.js';
import { fetchSafetyVideos } from './modules/safety.js';
import { getAnniversaries } from './modules/anniversaries.js';
import { initSeasonalTheme } from './modules/theme.js';
import { fetchFeatures } from './modules/features.js';
import { fetchTracks } from './modules/trackmap.js';
import { updateSafetySlide } from './modules/slideshow.js';

// 1. Device Routing (Redirects phones to mobile.html)
if (initDeviceRouting()) {
    // Redirect triggered, stop further initialization
} else {
    // 2. Initialize Themes & Features
    fetchFeatures().then(() => {
        initSeasonalTheme();
    });

    // 3. Start Synchronized Clock & Lightning
    startClockLoop([updateLightningWidget]);
}

// 3. Operational Data Feeds
fetchSiteConfig(() => {
    fetchSafetyVideos();
    getAnniversaries();
});

fetchShifts();
setInterval(fetchShifts, 600000); // 10 mins

updateTrackers();
setInterval(updateTrackers, 600000); // 10 mins

getWeather();
setInterval(getWeather, 600000); // 10 mins

fetchTracks();
setInterval(fetchTracks, 60000); // 1 min

updateSafetySlide();
setInterval(updateSafetySlide, 60000); // 1 min (rolls over at 11 PM)

fetchEquipmentStatus();
setInterval(fetchEquipmentStatus, 60000); // 1 min

checkLightning();
setInterval(checkLightning, 120000); // 2 mins
setTimeout(checkLightning, 2000);

setInterval(fetchSafetyVideos, 3600000); // 1 hr
setInterval(getAnniversaries, 3600000); // 1 hr
setInterval(checkVersion, 5000); // 5s live reload check

// 4. Desktop Reminders Renderer
export async function renderDesktopReminders() {
    const listContainer = document.getElementById('desktop-reminders-list');
    if (!listContainer) return;

    try {
        const res = await fetch('assets/data/reminders.md?t=' + new Date().getTime());
        if (!res.ok) throw new Error('Not found');
        const rawText = await res.text();

        const sections = rawText.split(/^# /m).filter(s => s.trim().length > 0);
        let parsedReminders = [];

        for (let section of sections) {
            const lines = section.split('\n');
            let title = lines[0].trim();
            let body = lines.slice(1).join('\n');

            let priority = 'normal';
            let splitList = false;
            let isLarge = false;
            let isCenter = false;
            let isOnly = false;

            if (body.match(/<!--\s*priority:\s*high\s*-->/i) || body.match(/!HIGH/i)) priority = 'high';
            if (body.match(/<!--\s*priority:\s*critical\s*-->/i) || body.match(/!CRITICAL/i)) priority = 'critical';
            if (body.match(/<!--\s*format:\s*split\s*-->/i) || body.match(/!SPLIT/i)) splitList = true;
            if (body.match(/!LARGE/i)) isLarge = true;
            if (body.match(/!CENTER/i)) isCenter = true;
            if (body.match(/!ONLY/i)) isOnly = true;

            // Check expiration
            const expireMatch = body.match(/!EXPIRE\s+([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
            if (expireMatch) {
                const parts = expireMatch[1].split('-');
                const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), parseInt(parts[3]), 0, 0, 0);
                if (Date.now() > expDate.getTime()) continue;
                body = body.replace(expireMatch[0], '');
            }

            // Clean magic words
            body = body.replace(/<!--\s*(priority|format):\s*(high|critical|split)\s*-->/ig, '');
            body = body.replace(/!(HIGH|CRITICAL|SPLIT|LARGE|CENTER|LONG|ONLY)/ig, '');

            parsedReminders.push({ title, body, priority, splitList, isLarge, isCenter, isOnly });
        }

        const onlyReminders = parsedReminders.filter(r => r.isOnly);
        if (onlyReminders.length > 0) parsedReminders = onlyReminders;

        if (parsedReminders.length === 0) {
            listContainer.innerHTML = `
                <div class="widget desktop-reminder-card">
                    <h3 style="margin-bottom: 12px; font-size: 1.25rem;">Reminders</h3>
                    <div style="color: var(--text-muted); font-style: italic; font-size: 0.95rem;">No active reminders.</div>
                </div>
            `;
            return;
        }

        let cardsHtml = '';
        parsedReminders.forEach(r => {
            const parsedBody = typeof marked !== 'undefined' ? marked.parse(r.body.trim()) : r.body;
            let priorityBadge = '';
            let widgetBorder = '1px solid rgba(255, 255, 255, 0.12)';
            let widgetShadow = '0 10px 30px rgba(0,0,0,0.5)';
            let quoteBorderColor = 'rgba(128, 138, 148, 0.6)';

            if (r.priority === 'critical') {
                priorityBadge = '<span class="reminder-badge badge-critical">Critical</span>';
                widgetBorder = '1px solid #ff0033';
                widgetShadow = '0 0 20px rgba(255, 0, 51, 0.6)';
                quoteBorderColor = '#ff0033';
            } else if (r.priority === 'high') {
                priorityBadge = '<span class="reminder-badge badge-important">Important</span>';
                widgetBorder = '1px solid var(--neon-amber)';
                widgetShadow = '0 0 15px rgba(255, 170, 0, 0.4)';
                quoteBorderColor = 'var(--neon-amber)';
            }

            cardsHtml += `
                <div class="widget desktop-reminder-card" style="border: ${widgetBorder}; box-shadow: ${widgetShadow}; --quote-border-color: ${quoteBorderColor};">
                    <h3 style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; font-size: 1.25rem;">
                        <span>${r.title}</span>
                        ${priorityBadge}
                    </h3>
                    <div class="desktop-reminder-body ${r.splitList ? 'split-list' : ''} ${r.isLarge ? 'large-text' : ''} ${r.isCenter ? 'center-text' : ''}" style="color: var(--text-primary); font-size: 0.95rem;">
                        ${parsedBody}
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = cardsHtml;
    } catch (err) {
        listContainer.innerHTML = `
            <div class="widget desktop-reminder-card">
                <h3 style="margin-bottom: 12px; font-size: 1.25rem;">Reminders</h3>
                <div style="color: var(--text-muted); font-style: italic; font-size: 0.95rem;">No active reminders.</div>
            </div>
        `;
    }
}

renderDesktopReminders();
setInterval(renderDesktopReminders, 60000); // 1 min check

// What's New Modal Logic
const btnChangelog = document.getElementById('btn-desktop-changelog');
const modalChangelog = document.getElementById('modal-changelog');
const btnCloseChangelog = document.getElementById('btn-close-changelog');
const btnDismissChangelog = document.getElementById('btn-dismiss-changelog');

function openChangelogModal() {
    if (modalChangelog) modalChangelog.style.display = 'flex';
}
function closeChangelogModal() {
    if (modalChangelog) modalChangelog.style.display = 'none';
}

if (btnChangelog) btnChangelog.addEventListener('click', openChangelogModal);
if (btnCloseChangelog) btnCloseChangelog.addEventListener('click', closeChangelogModal);
if (btnDismissChangelog) btnDismissChangelog.addEventListener('click', closeChangelogModal);
if (modalChangelog) {
    modalChangelog.addEventListener('click', (e) => {
        if (e.target === modalChangelog) closeChangelogModal();
    });
}
