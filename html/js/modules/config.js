// Mode Detection & Site Configuration Module
const urlParams = new URLSearchParams(window.location.search);
const viewParam = (urlParams.get('view') || '').toLowerCase();

// 1. Device Routing (Mobile, Desktop Portal, Kiosk TV)
export const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

export function initDeviceRouting() {
    if (viewParam === 'mobile' || (!viewParam && isMobileDevice && !window.location.pathname.endsWith('desktop.html'))) {
        if (!window.location.pathname.endsWith('mobile.html')) {
            const targetUrl = new URL('mobile.html', window.location.href);
            urlParams.forEach((val, key) => {
                if (key !== 'view') targetUrl.searchParams.set(key, val);
            });
            window.location.href = targetUrl.href;
            return true;
        }
    } else if (viewParam === 'desktop') {
        if (!window.location.pathname.endsWith('desktop.html')) {
            const targetUrl = new URL('desktop.html', window.location.href);
            urlParams.forEach((val, key) => {
                if (key !== 'view') targetUrl.searchParams.set(key, val);
            });
            window.location.href = targetUrl.href;
            return true;
        }
    }
    return false;
}
export const initMobileRedirect = initDeviceRouting;

// 2. Desktop vs Kiosk vs Handoff Mode Evaluation
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

    if (activeView) {
        const sideStats = activeView.querySelector('.side-stats');
        if (sideStats && rotWrapper.parentElement !== sideStats) {
            sideStats.appendChild(rotWrapper);
        }
        return;
    }

    const currentActiveView = document.querySelector('.kiosk-view.active');
    const targetSideStats = currentActiveView ? currentActiveView.querySelector('.side-stats') : (document.querySelector('#view-safety .side-stats') || document.querySelector('#view-announcements .side-stats'));
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
            const baseUrl = (siteConfig.vercel_api_url || window.location.origin).replace(/\/+$/, '');
            const targetUrl = `${baseUrl}/mobile.html`;
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
