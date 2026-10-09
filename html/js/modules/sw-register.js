// Service Worker Registration Helper Module
// SSoT §9.1: Zero regex lookbehinds, zero top-level await

export function registerServiceWorker() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    // Service Workers strictly require a secure context (HTTPS or localhost / 127.0.0.1)
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isSecure = window.location.protocol === 'https:' || isLocalhost;

    if ('serviceWorker' in navigator && isSecure) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((reg) => {
                    reg.onupdatefound = () => {
                        const installingWorker = reg.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('[SW] New version available.');
                                }
                            };
                        }
                    };
                })
                .catch((err) => {
                    console.warn('[SW] Registration ignored or failed:', err);
                });
        });
    }
}

export function notifyServiceWorkerSkipWaiting() {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
    }
}
