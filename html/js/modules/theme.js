// Dynamic Seasonal Holiday Stylesheets & Vector Icon Manager Module
import { setHolidayAtmosphereTheme, startWeatherAnimation } from './fx.js';
import { renderEquipmentDashboard } from './equipment.js';
import { cachedFeatures } from './features.js';
import { globalActiveShiftName, getCurrentDate } from './clock.js';
import { isDaylightNow } from './weather.js';

const themeIcons = {
    solar: {
        left: '<i class="fa-solid fa-sun" style="color: #f59e0b; font-size: 1.25rem; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.5));"></i>',
        right: '<i class="fa-solid fa-cloud-sun" style="color: #0284c7; font-size: 1.25rem; filter: drop-shadow(0 0 10px rgba(2, 132, 199, 0.5));"></i>'
    },
    halloween: {
        left: '<i class="fa-solid fa-ghost" style="color: #c084fc; font-size: 1.25rem; filter: drop-shadow(0 0 10px #c084fc); animation: spooky-float 3s infinite alternate ease-in-out;"></i>',
        right: '<i class="fa-solid fa-skull" style="color: #f97316; font-size: 1.25rem; filter: drop-shadow(0 0 10px #f97316); animation: spooky-float 3s infinite alternate-reverse ease-in-out;"></i>'
    },
    christmas: {
        left: '<i class="fa-solid fa-candy-cane" style="color: #ef4444; font-size: 1.25rem; filter: drop-shadow(0 0 10px #ef4444); transform: rotate(-15deg);"></i>',
        right: '<i class="fa-solid fa-snowflake" style="color: #67e8f9; font-size: 1.25rem; filter: drop-shadow(0 0 10px #67e8f9); animation: festive-sparkle 3s infinite alternate;"></i>'
    },
    thanksgiving: {
        left: '<i class="fa-solid fa-wheat-awn" style="color: #eab308; font-size: 1.25rem; filter: drop-shadow(0 0 10px #eab308);"></i>',
        right: '<i class="fa-solid fa-leaf" style="color: #ea580c; font-size: 1.25rem; filter: drop-shadow(0 0 10px #ea580c); transform: rotate(20deg);"></i>'
    },
    newyear: {
        left: '<i class="fa-solid fa-champagne-glasses" style="color: #fbbf24; font-size: 1.25rem; filter: drop-shadow(0 0 12px #fbbf24);"></i>',
        right: '<i class="fa-solid fa-star" style="color: #38bdf8; font-size: 1.25rem; filter: drop-shadow(0 0 12px #38bdf8); animation: gold-sparkle 2s infinite alternate;"></i>'
    },
    stpatricks: {
        left: '<i class="fa-solid fa-clover" style="color: #22c55e; font-size: 1.25rem; filter: drop-shadow(0 0 12px #22c55e);"></i>',
        right: '<i class="fa-solid fa-coins" style="color: #eab308; font-size: 1.25rem; filter: drop-shadow(0 0 12px #eab308);"></i>'
    },
    july4: {
        left: '<i class="fa-solid fa-star" style="color: #ef4444; font-size: 1.25rem; filter: drop-shadow(0 0 10px #ef4444);"></i>',
        right: '<i class="fa-solid fa-flag-usa" style="color: #3b82f6; font-size: 1.25rem; filter: drop-shadow(0 0 10px #3b82f6);"></i>'
    }
};

const holidayEquipmentIcons = {
    solar: '<i class="fa-solid fa-sun" style="margin-right: 8px; color: #f59e0b; font-size: 0.9em;"></i>',
    halloween: '<i class="fa-solid fa-spider" style="margin-right: 8px; color: #f97316; font-size: 0.9em;"></i>',
    christmas: '<i class="fa-solid fa-gift" style="margin-right: 8px; color: #ef4444; font-size: 0.9em;"></i>',
    thanksgiving: '<i class="fa-solid fa-wheat-awn" style="margin-right: 8px; color: #eab308; font-size: 0.9em;"></i>',
    newyear: '<i class="fa-solid fa-star" style="margin-right: 8px; color: #fbbf24; font-size: 0.9em;"></i>',
    stpatricks: '<i class="fa-solid fa-clover" style="margin-right: 8px; color: #22c55e; font-size: 0.9em;"></i>',
    july4: '<i class="fa-solid fa-flag" style="margin-right: 8px; color: #3b82f6; font-size: 0.9em;"></i>'
};

export function getHolidayEquipmentIcon() {
    const currentTheme = getSeasonalTheme();
    return holidayEquipmentIcons[currentTheme] || '';
}

export function isHighGlareActive(date = getCurrentDate()) {
    if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        const glareParam = (urlParams.get('glare') || '').toLowerCase().trim();
        if (glareParam === 'high' || glareParam === 'on' || glareParam === 'true') return true;
        if (glareParam === 'off' || glareParam === 'false') return false;
        if (glareParam === 'auto') return isDaylightNow(date);

        const themeParam = (urlParams.get('theme') || '').toLowerCase().trim();
        if (themeParam === 'solar') return true;
    }

    if (cachedFeatures) {
        const mode = (cachedFeatures.high_glare_mode || cachedFeatures.high_glare || 'off').toLowerCase().trim();
        if (mode === 'on') return true;
        if (mode === 'auto') return isDaylightNow(date);
        if (cachedFeatures.dedicated_theme === 'solar' && cachedFeatures.theme_mode === 'dedicated') return true;
    }
    return false;
}

export function getSeasonalTheme(date = null) {
    if (!date) {
        date = getCurrentDate();
    }
    const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
    const glareParam = urlParams ? (urlParams.get('glare') || '').toLowerCase().trim() : '';
    let mockTheme = urlParams ? (urlParams.get('holiday') || urlParams.get('theme') || '').toLowerCase().trim() : '';
    const dateParam = urlParams ? (urlParams.get('date') || urlParams.get('mockDate') || '').toLowerCase().trim() : '';
    
    // Support ?date=halloween or other holiday name alias in ?date=
    const knownHolidayAliases = ['halloween', 'thanksgiving', 'christmas', 'newyear', 'stpatricks', 'july4', 'solar', 'default', 'cyberpunk', 'emerald', 'obsidian'];
    if (!mockTheme && dateParam && knownHolidayAliases.includes(dateParam)) {
        mockTheme = dateParam;
    }

    // 1. Explicit query parameter overrides
    if (glareParam === 'high' || glareParam === 'on' || glareParam === 'true') return 'solar';
    if (glareParam === 'off' || glareParam === 'false') {
        // Skip high glare and continue
    } else if (mockTheme) {
        if (mockTheme === 'none' || mockTheme === 'default' || mockTheme === 'false') return 'default';
        return mockTheme;
    }

    // 2. High-Glare / Solar Mode Check (Issue #10 / Task 4.1)
    if (isHighGlareActive(date)) {
        return 'solar';
    }

    // 3. Per-Shift Theme Dedication
    if (cachedFeatures && cachedFeatures.shift_theme_dedication) {
        const activeShiftName = globalActiveShiftName || (typeof window !== 'undefined' ? window.globalActiveShiftName : null);
        if (activeShiftName && cachedFeatures.shift_themes) {
            const lowerActive = activeShiftName.toLowerCase().trim();
            for (const [sName, themeVal] of Object.entries(cachedFeatures.shift_themes)) {
                if (sName.toLowerCase().trim() === lowerActive) {
                    return themeVal;
                }
            }
        }
    }

    // 4. Dedicated Theme Mode
    if (cachedFeatures && cachedFeatures.theme_mode === 'dedicated') {
        return cachedFeatures.dedicated_theme || 'default';
    }

    const month = date.getMonth(); // 0-indexed (0 = Jan, 9 = Oct, 10 = Nov, 11 = Dec)
    const day = date.getDate();

    // Halloween: Oct 15 - Oct 31
    if (month === 9 && day >= 15) {
        return 'halloween';
    }

    // Thanksgiving / Autumn Harvest: Nov 15 - Nov 30
    if (month === 10 && day >= 15 && day <= 30) {
        return 'thanksgiving';
    }

    // Christmas & Winter Holidays: Dec 1 - Dec 26
    if (month === 11 && day >= 1 && day <= 26) {
        return 'christmas';
    }

    // New Year's: Dec 27 - Jan 5
    if ((month === 11 && day >= 27) || (month === 0 && day <= 5)) {
        return 'newyear';
    }

    // St. Patrick's Day: Mar 14 - Mar 18
    if (month === 2 && day >= 14 && day <= 18) {
        return 'stpatricks';
    }

    // 4th of July / Independence Day: Jul 1 - Jul 7
    if (month === 6 && day >= 1 && day <= 7) {
        return 'july4';
    }

    return 'default';
}

export function applyTheme(themeName) {
    let themeLink = document.getElementById('seasonal-theme-link');
    setHolidayAtmosphereTheme(themeName);
    
    const iconLeft = document.getElementById('theme-icon-left');
    const iconRight = document.getElementById('theme-icon-right');
    const dIconLeft = document.getElementById('theme-icon-desktop-left');
    const dIconRight = document.getElementById('theme-icon-desktop-right');
    const sIconLeft = document.getElementById('theme-icon-slide-left');
    const sIconRight = document.getElementById('theme-icon-slide-right');

    const iconSlots = [iconLeft, iconRight, dIconLeft, dIconRight, sIconLeft, sIconRight];

    // Toggle solar-mode and high-glare-mode classes on document body
    if (typeof document !== 'undefined' && document.body) {
        const isSolar = (themeName === 'solar');
        document.body.classList.toggle('solar-mode', isSolar);
        document.body.classList.toggle('high-glare-mode', isSolar);
    }

    if (!themeName || themeName === 'default' || themeName === 'none') {
        if (themeLink) themeLink.remove();
        iconSlots.forEach(el => { if (el) el.innerHTML = ''; });
        console.log('Active Theme: Default');
        startWeatherAnimation('none');
        renderEquipmentDashboard();
        return;
    }

    if (!themeLink) {
        themeLink = document.createElement('link');
        themeLink.id = 'seasonal-theme-link';
        themeLink.rel = 'stylesheet';
        document.head.appendChild(themeLink);
    }

    const themeHref = `css/themes/theme-${themeName}.css?v=4.2`;
    if (themeLink.getAttribute('href') !== themeHref) {
        themeLink.href = themeHref;
        console.log(`Active Seasonal Theme: ${themeName}`);
    }

    if (themeIcons[themeName]) {
        if (iconLeft) iconLeft.innerHTML = themeIcons[themeName].left;
        if (iconRight) iconRight.innerHTML = themeIcons[themeName].right;
        if (dIconLeft) dIconLeft.innerHTML = themeIcons[themeName].left;
        if (dIconRight) dIconRight.innerHTML = themeIcons[themeName].right;
        if (sIconLeft) sIconLeft.innerHTML = themeIcons[themeName].left;
        if (sIconRight) sIconRight.innerHTML = themeIcons[themeName].right;
    } else {
        iconSlots.forEach(el => { if (el) el.innerHTML = ''; });
    }

    startWeatherAnimation('none');
    renderEquipmentDashboard();
    if (typeof window !== 'undefined' && typeof window.renderTrackMap === 'function') {
        window.renderTrackMap(true);
    }
}

export function checkThemeUpdate() {
    const theme = getSeasonalTheme();
    applyTheme(theme);
}

export function initSeasonalTheme() {
    checkThemeUpdate();

    // Re-check every 60 seconds for seamless sunrise/sunset and midnight date rollover
    setInterval(checkThemeUpdate, 60000);
}

if (typeof window !== 'undefined') {
    window.checkThemeUpdate = checkThemeUpdate;
}

