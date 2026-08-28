// YardStik Operations Dashboard - Master Controller (ES Module)

import { initMobileRedirect, setupDesktopLayout, fetchSiteConfig, checkVersion, isDesktopMode } from './modules/config.js';
import { fetchShifts, startClockLoop } from './modules/clock.js';
import { updateTrackers } from './modules/trackers.js';
import { getWeather } from './modules/weather.js';
import { checkLightning, updateLightningWidget } from './modules/lightning.js';
import { fetchEquipmentStatus, startEquipmentAutoscroll } from './modules/equipment.js';
import { fetchSafetyVideos, startSafetyScroll } from './modules/safety.js';
import { getAnniversaries } from './modules/anniversaries.js';
import { fetchReminders, advanceReminderSlide } from './modules/reminders.js';
import { updateSafetySlide } from './modules/slideshow.js';
import { fetchSpecialEvent } from './modules/special.js';
import { initSeasonalTheme } from './modules/theme.js';

// 1. Initialize Device Modes, Themes & Layouts
initMobileRedirect();
initSeasonalTheme();
setupDesktopLayout();

// 2. Start Synchronized Digital Clock & Engine Loop
startClockLoop([updateLightningWidget]);

// 3. Initialize Operational Data Feeds & Site Config
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

updateSafetySlide();
setInterval(updateSafetySlide, 60000); // 1 min (rolls over at 11 PM)

fetchEquipmentStatus();
setInterval(fetchEquipmentStatus, 60000); // 1 min

fetchReminders();
setInterval(fetchReminders, 3600000); // 1 hr

fetchSpecialEvent();
setInterval(fetchSpecialEvent, 60000); // 1 min

setInterval(checkLightning, 120000); // 2 mins
setTimeout(checkLightning, 2000);

setInterval(fetchSafetyVideos, 3600000); // 1 hr
setInterval(getAnniversaries, 3600000); // 1 hr
setInterval(checkVersion, 5000); // 5s live reload check

// 4. Equipment Autoscroll on Kiosk TV Mode
if (!isDesktopMode) {
    startEquipmentAutoscroll();
}

// 5. View Swapper Loop Engine
const views = document.querySelectorAll('.kiosk-view');
let currentView = 0;
let panelRotationTimeout = null;
const isShort = new URLSearchParams(window.location.search).get('short') === 'true';

if (isDesktopMode) {
    // In Desktop Mode: all views are visible simultaneously in one unified scrollable page!
    views.forEach(v => {
        if (v.id !== 'view-special') {
            v.classList.add('active');
        }
    });
    // Ensure both anniversary and safety panels are visible in standard flow
    const pAnn = document.getElementById('panel-anniversaries');
    const pSaf = document.getElementById('panel-safety');
    if (pAnn) {
        pAnn.style.position = 'relative';
        pAnn.style.transform = 'none';
        pAnn.style.opacity = '1';
    }
    if (pSaf) {
        pSaf.style.position = 'relative';
        pSaf.style.transform = 'none';
        pSaf.style.opacity = '1';
    }
} else {
    // In Kiosk TV Mode: cycle views on timed slide loop
    function cycleViews() {
        const checkView = views[currentView];
        if (checkView.getAttribute('data-disabled') === 'true') {
            currentView = (currentView + 1) % views.length;
            setTimeout(cycleViews, 0);
            return;
        }

        views.forEach(v => {
            v.classList.remove('active');
            if (v.id === 'view-special') v.style.display = 'none';
        });
        checkView.classList.add('active');
        if (checkView.id === 'view-special') checkView.style.display = 'flex';
        
        let ms = parseInt(checkView.getAttribute('data-duration')) || 40000;
        
        if (checkView.id === 'view-announcements') {
            const overrideMs = advanceReminderSlide();
            if (overrideMs) ms = overrideMs;
            
            // Dynamic Sub-Panel Rotation (Anniversaries -> Safety Videos)
            const pAnn = document.getElementById('panel-anniversaries');
            const pSaf = document.getElementById('panel-safety');
            
            if (pAnn && pSaf) {
                if (panelRotationTimeout) clearTimeout(panelRotationTimeout);
                
                // Snap panels to starting positions immediately
                pAnn.style.transition = 'none';
                pSaf.style.transition = 'none';
                pAnn.style.transformOrigin = 'top left';
                pAnn.style.transform = 'translateY(0) translateX(0) rotate(0deg)';
                pAnn.style.opacity = '1';
                pSaf.style.transform = 'translateX(120%)';
                pSaf.style.opacity = '0';
                
                // Re-enable smooth transition on the next paint frame
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        pAnn.style.transition = 'transform 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55), opacity 0.8s ease';
                        pSaf.style.transition = 'transform 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55), opacity 0.8s ease';
                        
                        // Trigger the animation exactly halfway through the slide's duration
                        panelRotationTimeout = setTimeout(() => {
                            if (checkView.classList.contains('active')) {
                                pAnn.style.transform = 'translateY(120%) rotate(-12deg)';
                                pAnn.style.opacity = '0';
                                pSaf.style.transform = 'translateX(0)';
                                pSaf.style.opacity = '1';
                                
                                startSafetyScroll();
                            }
                        }, ms / 2);
                    });
                });
            }
        }
        
        if (isShort) ms = 10000;
        
        currentView = (currentView + 1) % views.length;
        setTimeout(cycleViews, ms);
    }
    
    // Start the loop dynamically based on the first view's requested duration
    if (views.length > 0) {
        let initialDelay = parseInt(views[0].getAttribute('data-duration')) || 40000;
        if (isShort) initialDelay = 10000;
        setTimeout(cycleViews, initialDelay);
    }
}
