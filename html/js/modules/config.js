// Mode Detection & Site Configuration Module
const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const viewParam = (urlParams.get('view') || '').toLowerCase();

// 1. Mobile & Device Detection
export function checkIsMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || (typeof window !== 'undefined' && window.opera) || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
    const isTouch = (typeof window !== 'undefined' && ('ontouchstart' in window)) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    const isSmallScreen = typeof window !== 'undefined' && (window.innerWidth < 768 || (window.screen && window.screen.width < 768));
    return isMobileUA || (isTouch && isSmallScreen);
}

export const isMobileDevice = checkIsMobileDevice();

// 2. Intelligent Device Routing (Mobile, Desktop Portal, Localhost Kiosk TV)
export function initDeviceRouting() {
    if (typeof window === 'undefined' || typeof location === 'undefined') return false;

    const currentPath = window.location.pathname;
    const isDesktopPage = currentPath.endsWith('desktop.html');
    const isMobilePage = currentPath.endsWith('mobile.html');
    const isIndexPage = !isDesktopPage && !isMobilePage;

    const currentHost = (window.location.hostname || '').toLowerCase();
    const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
    const isMobile = checkIsMobileDevice();

    function redirectTo(targetPage) {
        if (currentPath.endsWith(targetPage)) return false;
        const targetUrl = new URL(targetPage, window.location.href);
        urlParams.forEach((val, key) => {
            if (key !== 'view') targetUrl.searchParams.set(key, val);
        });
        window.location.replace(targetUrl.href);
        return true;
    }

    // A. Explicit ?view= query parameter overrides
    if (viewParam === 'mobile') {
        return redirectTo('mobile.html');
    }
    if (viewParam === 'desktop') {
        return redirectTo('desktop.html');
    }
    if (viewParam === 'kiosk' || viewParam === 'handoff' || urlParams.get('handoff') === 'true' || urlParams.has('handoff')) {
        return redirectTo('index.html');
    }

    // B. Mobile devices redirect to mobile.html (unless explicitly in another mode)
    if (isMobile) {
        return redirectTo('mobile.html');
    }

    // C. Non-localhost desktop network requests to root / or index.html route to desktop.html (e.g. hostname.local or LAN IP)
    if (isIndexPage && !isLocalhost) {
        return redirectTo('desktop.html');
    }

    // D. Localhost on root/index.html stays on Kiosk TV view
    return false;
}
export const initMobileRedirect = initDeviceRouting;

// 3. Desktop vs Kiosk vs Handoff Mode Evaluation
export const isExplicitHandoff = viewParam === 'handoff' || urlParams.get('handoff') === 'true' || urlParams.has('handoff') || urlParams.get('mode') === 'handoff' || urlParams.get('mock') === 'handoff';
export const isExplicitKiosk = viewParam === 'kiosk';
export const isExplicitDesktop = viewParam === 'desktop' || (typeof window !== 'undefined' && window.location.pathname.endsWith('desktop.html'));
export const isLocalhostKiosk = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !isExplicitDesktop && !isExplicitHandoff;

export const isKioskMode = isExplicitKiosk || isLocalhostKiosk || (!isExplicitDesktop && !window.location.pathname.endsWith('desktop.html'));
export const isDesktopMode = isExplicitDesktop || (typeof window !== 'undefined' && window.location.pathname.endsWith('desktop.html'));
export let isHandoffActive = isExplicitHandoff;

if (isExplicitHandoff && typeof document !== 'undefined' && document.body) {
    document.body.classList.add('handoff-mode');
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

export function setupHandoffLayout(active = isHandoffActive) {
    if (isDesktopMode) return; // Desktop view is never modified by handoff mode
    isHandoffActive = active;
    const viewSafety = document.getElementById('view-safety');
    const viewAnnouncements = document.getElementById('view-announcements');

    if (active) {
        document.body.classList.add('handoff-mode');
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
            document.body.classList.add('weather-alert-active');
        } else {
            document.body.classList.remove('weather-alert-active');
        }
        syncKioskPanels();
    } else if (!isExplicitHandoff) {
        document.body.classList.remove('handoff-mode', 'weather-alert-active');
        const hOsha = document.getElementById('header-osha');
        const hBlend = document.getElementById('header-blend');
        const hTitle = document.getElementById('header-title-container');
        if (hOsha) hOsha.style.display = 'none';
        if (hBlend) hBlend.style.display = 'none';
        if (hTitle) hTitle.style.display = 'flex';
        syncKioskPanels();
    }
}

export function setupDesktopLayout() {
    // Retained for backward compatibility
}

// 3. Site Configuration & Live Reload Engine
export let siteConfig = {
    site_name: "Operations Dashboard",
    site_id: "default-site",
    latitude: 41.600,
    longitude: -87.100,
    timezone: "America/Chicago",
    vercel_api_url: ""
};

let currentVersion = null;

export async function fetchSiteConfig(onLoaded) {
    try {
        const res = await fetch('assets/data/config.json?t=' + new Date().getTime());
        if (res.ok) {
            const data = await res.json();
            Object.assign(siteConfig, data);
            if (siteConfig.vercel_api_url) {
                siteConfig.vercel_api_url = siteConfig.vercel_api_url.replace(/\/+$/, '');
            }
            if (siteConfig.site_name) {
                document.title = siteConfig.site_name;
                const desktopText = document.getElementById('desktop-title-text');
                if (desktopText) {
                    desktopText.innerText = siteConfig.site_name;
                } else {
                    const desktopTitle = document.getElementById('desktop-title');
                    if (desktopTitle) desktopTitle.innerText = siteConfig.site_name;
                }
                const headerTitle = document.getElementById('header-dashboard-title');
                if (headerTitle) headerTitle.innerText = siteConfig.site_name;
            }
        }
    } catch (e) {
        console.warn('Using default site configuration:', e);
    } finally {
        // Dynamically generate QR code pointing to this site's mobile view
        const qrImg = document.getElementById('mobile-qr-img');
        if (qrImg) {
            const baseUrl = (siteConfig.vercel_api_url || siteConfig.kiosk_url || siteConfig.local_url || window.location.origin).replace(/\/+$/, '');
            const siteId = siteConfig.site_id || '';
            const siteParam = siteId ? `?site=${encodeURIComponent(siteId)}` : '';
            const targetUrl = `${baseUrl}/mobile.html${siteParam}`;
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(targetUrl)}`;
        }

        if (typeof onLoaded === 'function') {
            onLoaded(siteConfig);
        }
    }
}

export async function checkVersion() {
    try {
        const res = await fetch('assets/data/version.txt?t=' + new Date().getTime());
        const version = await res.text();
        if (currentVersion === null) {
            currentVersion = version;
        } else if (currentVersion !== version) {
            console.log("New version detected, refreshing kiosk...");
            location.reload();
        }
    } catch (e) {}
}
