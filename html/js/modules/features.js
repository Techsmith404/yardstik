// Dashboard Features & Layout Adaptation Module
import { allocateSlots, activeAlertCount } from './weather.js';
import { startWeatherAnimation } from './fx.js';
import { updateLightningWidget } from './lightning.js';
import { syncKioskPanels } from './config.js';

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
        track_map: false,
        mobile_qr: true
    }
};

export function isTrackMapActive() {
    return cachedFeatures.features?.track_map === true;
}

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
    const body = document.body;

    // 1. Weather FX & Lightning Widget Teardown
    if (f.weather_fx === false) {
        startWeatherAnimation('none');
    }
    if (f.lightning_radar === false) {
        updateLightningWidget();
    }

    // 2. Equipment Status Grid
    const equipGrid = document.getElementById('equipment-masonry');
    if (equipGrid) equipGrid.style.display = (f.equipment_status !== false) ? 'block' : 'none';

    // 3. Track Map vs Daily Toolbox Talk Widget
    const isDesktop = body.classList.contains('desktop-mode');
    const isTrackMapOn = f.track_map === true;
    body.dataset.featuresTrackMap = isTrackMapOn ? 'true' : 'false';
    body.classList.toggle('feature-track-map', isTrackMapOn);
    const trackMapWidget = document.getElementById('widget-trackmap');
    const toolboxWidget = document.getElementById('toolbox-widget-container') || document.querySelector('.announcement-slide');

    if (trackMapWidget) {
        trackMapWidget.style.display = isTrackMapOn ? 'flex' : 'none';
    }
    if (toolboxWidget) {
        if (isDesktop) {
            toolboxWidget.style.display = (!isTrackMapOn && f.toolbox_talk !== false) ? 'flex' : 'none';
        } else {
            toolboxWidget.style.display = (f.toolbox_talk !== false) ? 'flex' : 'none';
        }
    }

    // Dynamic Desktop Nav Link Title
    const navTrackMapLink = document.getElementById('desktop-nav-trackmap');
    if (navTrackMapLink) {
        if (isTrackMapOn) {
            navTrackMapLink.innerHTML = '<i class="fa-solid fa-train"></i> Track Map & Reminders';
        } else {
            navTrackMapLink.innerHTML = '<i class="fa-solid fa-bullhorn"></i> Toolbox Talk & Reminders';
        }
    }

    // 4. Reminders & Announcements
    const remindersWidget = document.getElementById('reminders-widget-container');
    if (remindersWidget) remindersWidget.style.display = (f.reminders !== false) ? 'flex' : 'none';

    // 5. Rotating Panels (Anniversaries & Safety Videos)
    const rotatingPanels = document.getElementById('rotating-panels-wrapper');
    const hasPanels = (f.anniversaries !== false) || (f.safety_videos !== false);
    if (rotatingPanels) rotatingPanels.style.display = hasPanels ? 'flex' : 'none';

    // 6. Mobile QR Code
    if (f.mobile_qr === false) {
        body.classList.add('feature-no-mobile-qr');
    } else {
        body.classList.remove('feature-no-mobile-qr');
    }
    const mobileQr = document.getElementById('mobile-qr-img');
    if (mobileQr) mobileQr.style.display = (f.mobile_qr !== false) ? 'block' : 'none';

    // 7. Recalculate OSHA, Blend & Shift slot allocations in weather sidebar & header
    allocateSlots(activeAlertCount);

    // 8. Background Texture Style
    const urlParams = new URLSearchParams(window.location.search);
    const bgOverride = urlParams.get('bg');
    const activeBg = (bgOverride || cachedFeatures.bg_style || 'dots').toLowerCase().trim();
    ['bg-dots', 'bg-hex', 'bg-diagonal', 'bg-aurora', 'bg-minimal', 'bg-grid'].forEach(cls => body.classList.remove(cls));
    body.classList.add(`bg-${activeBg}`);

    // --- Adaptive Mosaic Classes & Slide Toggles ---
    const viewSafety = document.getElementById('view-safety');
    const viewAnnouncements = document.getElementById('view-announcements');
    const isHandoffActive = body.classList.contains('handoff-mode');

    // Check if View 1 Sidebar is completely empty
    const noSidebar = (f.osha_counter === false) && (f.production_tracker === false) && (f.shift_tracker === false);
    if (noSidebar) {
        body.classList.add('feature-no-sidebar');
    } else {
        body.classList.remove('feature-no-sidebar');
    }

    // Check View 2 (Safety & Milestones) Active Status
    const noToolbox = (f.toolbox_talk === false);
    const viewSafetyEmpty = noToolbox && !hasPanels;
    if (viewSafety) {
        if (isHandoffActive) {
            viewSafety.removeAttribute('data-disabled');
        } else if (!isTrackMapOn && !viewSafetyEmpty) {
            // When track map is OFF in normal mode, display Daily Toolbox Talk & Milestones
            viewSafety.removeAttribute('data-disabled');
        } else {
            viewSafety.setAttribute('data-disabled', 'true');
        }
    }

    // Check View 3 (Track Map & Reminders) Active Status
    if (viewAnnouncements) {
        if (!isTrackMapOn) {
            // When track map is OFF, skip Track Map slide
            viewAnnouncements.setAttribute('data-disabled', 'true');
        } else {
            viewAnnouncements.removeAttribute('data-disabled');
        }
    }

    // Ensure rotating milestone/safety panels are attached to appropriate slide (never slide 1)
    syncKioskPanels();
}
