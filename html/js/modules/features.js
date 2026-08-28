// Dashboard Features & Layout Adaptation Module

export let cachedFeatures = {
    theme_mode: "auto",
    dedicated_theme: "default",
    shift_theme_dedication: false,
    shift_themes: { "1": "default", "2": "obsidian", "3": "cyberpunk" },
    features: {
        weather_fx: true,
        lightning_radar: true,
        osha_counter: true,
        production_tracker: true,
        equipment_status: true,
        scale_audit_badges: true,
        shift_tracker: true,
        toolbox_talk: true,
        reminders: true,
        anniversaries: true,
        safety_videos: true,
        mobile_qr: true
    }
};

export async function fetchFeatures() {
    try {
        const res = await fetch('assets/data/features.json?t=' + Date.now());
        if (res.ok) {
            const data = await res.json();
            cachedFeatures = data;
        }
    } catch (e) {
        console.warn('Could not load features.json, using defaults:', e);
    }
    applyFeatureFlags();
    return cachedFeatures;
}

export function applyFeatureFlags() {
    const f = cachedFeatures.features || {};

    // 1. Weather FX
    const weatherCanvas = document.getElementById('weather-canvas');
    if (weatherCanvas) {
        weatherCanvas.style.display = (f.weather_fx !== false) ? 'block' : 'none';
    }

    // 2. OSHA Safe Days Counter
    const oshaWidget = document.getElementById('osha-widget-container');
    const headerOsha = document.getElementById('header-osha');
    if (oshaWidget) oshaWidget.style.display = (f.osha_counter !== false) ? 'flex' : 'none';
    if (headerOsha) headerOsha.style.display = (f.osha_counter !== false) ? 'flex' : 'none';

    // 3. Production / Blend Tracker
    const blendWidget = document.getElementById('blend-widget-container');
    const headerBlend = document.getElementById('header-blend');
    if (blendWidget) blendWidget.style.display = (f.production_tracker !== false) ? 'flex' : 'none';
    if (headerBlend) headerBlend.style.display = (f.production_tracker !== false) ? 'flex' : 'none';

    // 4. Equipment Status Grid
    const equipGrid = document.getElementById('equipment-masonry');
    if (equipGrid) equipGrid.style.display = (f.equipment_status !== false) ? 'block' : 'none';

    // 5. Shift Tracker
    const shiftWidget = document.getElementById('shift-widget');
    if (shiftWidget) shiftWidget.style.display = (f.shift_tracker !== false) ? 'flex' : 'none';

    // 6. 365-Day Daily Toolbox Talk
    const toolboxImg = document.getElementById('slow-slide-img');
    if (toolboxImg) toolboxImg.style.display = (f.toolbox_talk !== false) ? 'block' : 'none';

    // 7. Reminders & Announcements
    const remindersWidget = document.getElementById('reminders-widget-container');
    if (remindersWidget) remindersWidget.style.display = (f.reminders !== false) ? 'flex' : 'none';

    // 8. Rotating Panels (Anniversaries & Safety Videos)
    const rotatingPanels = document.getElementById('rotating-panels-wrapper');
    const hasPanels = (f.anniversaries !== false) || (f.safety_videos !== false);
    if (rotatingPanels) rotatingPanels.style.display = hasPanels ? 'flex' : 'none';

    // 9. Mobile QR Code
    const mobileQr = document.getElementById('mobile-qr-img');
    if (mobileQr) mobileQr.style.display = (f.mobile_qr !== false) ? 'block' : 'none';

    // --- Adaptive Mosaic Classes ---
    const body = document.body;
    const viewAnnouncements = document.getElementById('view-announcements');
    const viewProduction = document.getElementById('view-production');

    // Check if View 1 Sidebar is completely empty
    const noSidebar = (f.osha_counter === false) && (f.production_tracker === false) && (f.shift_tracker === false);
    if (noSidebar) {
        body.classList.add('feature-no-sidebar');
    } else {
        body.classList.remove('feature-no-sidebar');
    }

    // Check View 2 Layout Adaptations
    const noToolbox = (f.toolbox_talk === false);
    if (noToolbox) {
        body.classList.add('feature-no-toolbox');
    } else {
        body.classList.remove('feature-no-toolbox');
    }

    const onlyReminders = noToolbox && !hasPanels && (f.reminders !== false);
    if (onlyReminders) {
        body.classList.add('feature-only-reminders');
    } else {
        body.classList.remove('feature-only-reminders');
    }

    // Check if View 2 has NO active content at all -> skip it in slideshow
    const view2Empty = noToolbox && !hasPanels && (f.reminders === false);
    if (viewAnnouncements) {
        if (view2Empty) {
            viewAnnouncements.setAttribute('data-disabled', 'true');
        } else {
            viewAnnouncements.removeAttribute('data-disabled');
        }
    }
}
