// Mode Detection & Site Configuration Module
const urlParams = new URLSearchParams(window.location.search);
const viewParam = (urlParams.get('view') || '').toLowerCase();

// 1. Mobile Phone Redirect (if on smartphone or ?view=mobile)
export const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

export function initMobileRedirect() {
    if (viewParam === 'mobile' || (!viewParam && isMobileDevice)) {
        if (!window.location.pathname.endsWith('mobile.html')) {
            const targetUrl = new URL('mobile.html', window.location.href);
            urlParams.forEach((val, key) => {
                if (key !== 'view') targetUrl.searchParams.set(key, val);
            });
            window.location.href = targetUrl.href;
        }
    }
}

// 2. Desktop vs Kiosk Mode Evaluation
export const isExplicitKiosk = viewParam === 'kiosk';
export const isExplicitDesktop = viewParam === 'desktop';
export const isLocalhostKiosk = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !isExplicitDesktop;

export const isKioskMode = isExplicitKiosk || isLocalhostKiosk;
export const isDesktopMode = !isKioskMode;

export function setupDesktopLayout() {
    if (isDesktopMode) {
        document.body.classList.add('desktop-mode');
        const navBar = document.getElementById('desktop-nav-bar');
        if (navBar) navBar.style.display = 'flex';

        const setupDesktopColumns = () => {
            const annSlide = document.querySelector('.announcement-slide');
            const panelAnn = document.getElementById('panel-anniversaries');
            const viewAnn = document.getElementById('view-announcements');
            if (annSlide && panelAnn && viewAnn) {
                let leftCol = document.getElementById('announcements-col-left');
                if (!leftCol) {
                    leftCol = document.createElement('div');
                    leftCol.id = 'announcements-col-left';
                    viewAnn.insertBefore(leftCol, viewAnn.firstChild);
                }
                leftCol.appendChild(annSlide);
                leftCol.appendChild(panelAnn);
            }
        };
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', setupDesktopColumns);
        } else {
            setupDesktopColumns();
        }
    }
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
                const desktopTitle = document.getElementById('desktop-title');
                if (desktopTitle) desktopTitle.innerText = siteConfig.site_name;
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
