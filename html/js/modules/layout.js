// Layout Engine, Mode Evaluation & Panel Synchronization Module

const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const viewParam = (urlParams.get('view') || '').toLowerCase();

// Mode Evaluation
export const isExplicitHandoff = viewParam === 'handoff' || urlParams.get('handoff') === 'true' || urlParams.has('handoff') || urlParams.get('mode') === 'handoff' || urlParams.get('mock') === 'handoff';
export const isExplicitKiosk = viewParam === 'kiosk';
export const isExplicitDesktop = viewParam === 'desktop' || (typeof window !== 'undefined' && window.location.pathname.endsWith('desktop.html'));
export const isLocalhostKiosk = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !isExplicitDesktop && !isExplicitHandoff;

export const isKioskMode = isExplicitKiosk || isLocalhostKiosk || (!isExplicitDesktop && !(typeof window !== 'undefined' && window.location.pathname.endsWith('desktop.html')));
export const isDesktopMode = isExplicitDesktop || (typeof window !== 'undefined' && window.location.pathname.endsWith('desktop.html'));
export let isHandoffActive = isExplicitHandoff;

if (isExplicitHandoff && typeof document !== 'undefined' && document.body) {
    document.body.classList.add('handoff-mode');
}

// Registered layout transition listeners (e.g. features.js, reminders.js)
const layoutTransitionListeners = new Set();

export function onLayoutTransition(listener) {
    if (typeof listener === 'function') {
        layoutTransitionListeners.add(listener);
    }
    return () => layoutTransitionListeners.delete(listener);
}

export function syncKioskPanels(activeView) {
    if (isDesktopMode) return;

    const rotWrapper = document.getElementById('rotating-panels-wrapper');
    if (!rotWrapper) return;

    if (isHandoffActive) {
        // In Handoff Mode, rotating panels permanently belong to Slide 2 (#view-safety)
        const safetySideStats = document.querySelector('#view-safety .side-stats');
        if (safetySideStats && rotWrapper.parentElement !== safetySideStats) {
            safetySideStats.appendChild(rotWrapper);
        }
        return;
    }

    // In normal kiosk mode, rotating panels only belong to Slide 2 (view-safety) or Slide 3 (view-announcements), NEVER Slide 1 (view-production)
    if (activeView && (activeView.id === 'view-announcements' || activeView.id === 'view-safety')) {
        const sideStats = activeView.querySelector('.side-stats');
        if (sideStats && rotWrapper.parentElement !== sideStats) {
            sideStats.appendChild(rotWrapper);
        }
        return;
    }

    // Fallback placement when activeView is view-production or initializing:
    const isTrackMapOn = typeof document !== 'undefined' && document.body && (document.body.classList.contains('feature-track-map') || document.body.dataset.featuresTrackMap === 'true');
    const targetSelector = isTrackMapOn ? '#view-announcements .side-stats' : '#view-safety .side-stats';
    const targetSideStats = document.querySelector(targetSelector) || document.querySelector('#view-safety .side-stats') || document.querySelector('#view-announcements .side-stats');
    if (targetSideStats && rotWrapper.parentElement !== targetSideStats) {
        targetSideStats.appendChild(rotWrapper);
    }
}

export let prevHandoffActive = null;

export function setupHandoffLayout(active = isHandoffActive) {
    if (isDesktopMode) return; // Desktop view is never modified by handoff mode
    const effectiveActive = isExplicitHandoff ? true : Boolean(active);
    const hasChanged = prevHandoffActive !== null && prevHandoffActive !== effectiveActive;
    isHandoffActive = effectiveActive;
    prevHandoffActive = effectiveActive;

    const viewSafety = document.getElementById('view-safety');
    const viewAnnouncements = document.getElementById('view-announcements');

    if (effectiveActive) {
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.add('handoff-mode');
        }
        if (viewSafety) viewSafety.removeAttribute('data-disabled');
        const hOsha = document.getElementById('header-osha');
        const hBlend = document.getElementById('header-blend');
        const hTitle = document.getElementById('header-title-container');
        if (hOsha) hOsha.style.display = 'flex';
        if (hBlend) hBlend.style.display = 'flex';
        if (hTitle) hTitle.style.display = 'flex';

        // Check if weather alerts are active
        const alertsContainer = document.getElementById('dynamic-alerts-container');
        if (alertsContainer && alertsContainer.children.length > 0) {
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.add('weather-alert-active');
            }
        } else {
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.remove('weather-alert-active');
            }
        }
        if (hasChanged) {
            // Notify registered listeners cleanly without requiring circular module imports
            layoutTransitionListeners.forEach(listener => {
                try { listener(effectiveActive); } catch (e) { console.error('Layout transition listener error:', e); }
            });
            // Legacy / global hook support
            if (typeof window !== 'undefined' && typeof window.applyFeatureFlags === 'function') {
                window.applyFeatureFlags();
            }
        }
        syncKioskPanels();
    } else if (!isExplicitHandoff) {
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.remove('handoff-mode', 'weather-alert-active');
        }
        const hOsha = document.getElementById('header-osha');
        const hBlend = document.getElementById('header-blend');
        const hTitle = document.getElementById('header-title-container');
        if (hOsha) hOsha.style.display = 'none';
        if (hBlend) hBlend.style.display = 'none';
        if (hTitle) hTitle.style.display = 'flex';

        if (hasChanged) {
            // Notify registered listeners cleanly without requiring circular module imports
            layoutTransitionListeners.forEach(listener => {
                try { listener(effectiveActive); } catch (e) { console.error('Layout transition listener error:', e); }
            });
            // Legacy / global hook support
            if (typeof window !== 'undefined' && typeof window.applyFeatureFlags === 'function') {
                window.applyFeatureFlags();
            }
            if (typeof window !== 'undefined' && typeof window.advanceReminderSlide === 'function') {
                window.advanceReminderSlide();
            }
        }
        syncKioskPanels();
    }
}

export function setupDesktopLayout() {
    // Retained for backward compatibility
}
