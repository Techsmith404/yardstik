// Mode Detection & Site Configuration Module
import { fetchJson, fetchText, cacheBustUrl } from './http.js';

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

// 3. Desktop vs Kiosk vs Handoff Mode Evaluation & Layout Management (delegated to layout.js)
export {
    isExplicitHandoff,
    isExplicitKiosk,
    isExplicitDesktop,
    isLocalhostKiosk,
    isKioskMode,
    isDesktopMode,
    isHandoffActive,
    prevHandoffActive,
    syncKioskPanels,
    setupHandoffLayout,
    setupDesktopLayout,
    onLayoutTransition
} from './layout.js';


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
        const data = await fetchJson(cacheBustUrl('assets/data/config.json'));
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
    } catch (e) {
        console.warn('Using default site configuration:', e);
    } finally {
        // Dynamically generate QR code pointing to this site's mobile view
        const qrContainer = document.getElementById('mobile-qr-container');
        const qrImg = document.getElementById('mobile-qr-img');
        if (qrImg) {
            const baseUrl = (siteConfig.vercel_api_url || siteConfig.kiosk_url || siteConfig.local_url || window.location.origin).replace(/\/+$/, '');
            const siteId = siteConfig.site_id || '';
            const siteParam = siteId ? `?site=${encodeURIComponent(siteId)}` : '';
            const targetUrl = `${baseUrl}/mobile.html${siteParam}`;
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&ecc=L&margin=1&data=${encodeURIComponent(targetUrl)}`;
            if (qrContainer && typeof document !== 'undefined' && document.body && !document.body.classList.contains('feature-no-mobile-qr') && !document.body.classList.contains('desktop-mode')) {
                qrContainer.style.display = 'flex';
            }
        }

        if (typeof onLoaded === 'function') {
            onLoaded(siteConfig);
        }
    }
}

export async function checkVersion() {
    try {
        const version = await fetchText(cacheBustUrl('assets/data/version.txt'));
        if (currentVersion === null) {
            currentVersion = version;
        } else if (currentVersion !== version) {
            console.log("New version detected, refreshing kiosk...");
            location.reload();
        }
    } catch (e) {}
}
