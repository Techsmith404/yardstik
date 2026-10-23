// 🏛️ YardStik: Emergency Screen Takeover & SSE Dispatcher
// SSoT §9.1: Zero regex lookbehinds, zero top-level await

import { fetchJson, cacheBustUrl } from './http.js';
import { startAlarm, stopAlarm } from './audio-alarm.js';

let isEmergencyActive = false;
let emergencyTimerInterval = null;
let sseConnection = null;
let changeCallback = null;

export function getIsEmergencyActive() {
    return isEmergencyActive;
}

export function applyEmergencyState(state) {
    const overlay = document.getElementById('emergency-takeover-overlay');
    const titleEl = document.getElementById('emergency-title');
    const msgEl = document.getElementById('emergency-message');
    const badgeText = document.getElementById('emergency-badge-text');
    const timerEl = document.getElementById('emergency-timer');

    if (state && state.active) {
        isEmergencyActive = true;

        if (overlay) {
            overlay.style.display = 'flex';
        }
        if (titleEl) {
            titleEl.textContent = state.title || 'EMERGENCY BROADCAST';
        }
        if (msgEl) {
            msgEl.textContent = state.message || '';
        }
        if (badgeText) {
            const sev = (state.severity || 'CRITICAL').toUpperCase();
            badgeText.textContent = `${sev} PLANT ALERT`;
        }

        // Trigger synthesized alarm klaxon through TV speakers
        if (state.sound !== false) {
            startAlarm();
        } else {
            stopAlarm();
        }

        // Live countdown to auto-clear
        if (emergencyTimerInterval) {
            clearInterval(emergencyTimerInterval);
            emergencyTimerInterval = null;
        }

        if (state.endTime && state.endTime > 0 && timerEl) {
            const updateTimer = () => {
                const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
                timerEl.textContent = remaining > 0 ? `Auto-clearing in ${remaining}s` : 'Expiring...';
                if (remaining <= 0) {
                    clearInterval(emergencyTimerInterval);
                    emergencyTimerInterval = null;
                    applyEmergencyState({ active: false });
                }
            };
            updateTimer();
            emergencyTimerInterval = setInterval(updateTimer, 1000);
        } else if (timerEl) {
            timerEl.textContent = 'Active until supervisor clear';
        }

        if (typeof changeCallback === 'function') {
            changeCallback(true, state);
        }
    } else {
        if (!isEmergencyActive) return;
        isEmergencyActive = false;

        if (emergencyTimerInterval) {
            clearInterval(emergencyTimerInterval);
            emergencyTimerInterval = null;
        }

        stopAlarm();

        if (overlay) {
            overlay.style.display = 'none';
        }

        if (typeof changeCallback === 'function') {
            changeCallback(false, null);
        }
    }
}

export function getMockEmergencyState() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return null;
    const urlParams = new URLSearchParams(window.location.search);
    const emParam = urlParams.get('emergency') || urlParams.get('mockEmergency');
    const mockParam = urlParams.get('mock');

    let target = null;
    if (emParam && emParam !== 'false' && emParam !== '0' && emParam !== 'off') {
        target = emParam.toLowerCase();
    } else if (mockParam === 'emergency') {
        target = 'facility';
    }

    if (!target) return null;

    if (target === 'chemical' || target === 'ammonia') {
        return {
            active: true,
            type: 'chemical',
            title: 'AMMONIA LEAK DETECTED',
            message: 'Hazardous vapor release detected in Process Building B. Evacuate area immediately and report to Upwind Assembly Point #2.',
            severity: 'critical',
            actionRequired: 'EVACUATE IMMEDIATELY — UPWIND',
            sound: true,
            endTime: Date.now() + 15 * 60 * 1000
        };
    }
    if (target === 'weather' || target === 'tornado' || target === 'storm') {
        return {
            active: true,
            type: 'weather',
            title: 'TORNADO WARNING — TAKE SHELTER',
            message: 'Severe tornadic rotation confirmed within 3 miles. All plant personnel report immediately to reinforced storm shelters.',
            severity: 'critical',
            actionRequired: 'REPORT TO SHELTER IMMEDIATELY',
            sound: true,
            endTime: Date.now() + 15 * 60 * 1000
        };
    }
    if (target === 'fire') {
        return {
            active: true,
            type: 'fire',
            title: 'FACILITY FIRE ALARM — EVACUATE',
            message: 'Active fire alarm reported in main warehouse. Cease equipment operations and evacuate to designated assembly points.',
            severity: 'critical',
            actionRequired: 'EVACUATE BUILDING IMMEDIATELY',
            sound: true,
            endTime: Date.now() + 15 * 60 * 1000
        };
    }
    if (target === 'active_shooter' || target === 'shooter' || target === 'lockdown') {
        return {
            active: true,
            type: 'active_shooter',
            title: 'SECURITY LOCKDOWN — ACTIVE THREAT',
            message: 'Active hostile threat reported on plant property. Run, Hide, Fight. Lock down all interior doors and silence phones.',
            severity: 'critical',
            actionRequired: 'LOCK DOWN IMMEDIATELY',
            sound: true,
            endTime: Date.now() + 15 * 60 * 1000
        };
    }
    return {
        active: true,
        type: 'facility',
        title: 'EMERGENCY EVACUATION ORDER',
        message: 'Plant-wide emergency condition declared by safety management. All personnel cease operations and evacuate immediately.',
        severity: 'critical',
        actionRequired: 'EVACUATE IMMEDIATELY',
        sound: true,
        endTime: Date.now() + 15 * 60 * 1000
    };
}

/**
 * Initialize SSE connection with fallback polling for emergency broadcasts
 */
export function initEmergencyEngine(onChange) {
    if (typeof onChange === 'function') {
        changeCallback = onChange;
    }

    // Bind Silence button
    const silenceBtn = document.getElementById('emergency-silence-btn');
    if (silenceBtn) {
        silenceBtn.addEventListener('click', () => {
            stopAlarm();
            silenceBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Alarm Silenced';
            silenceBtn.style.opacity = '0.7';
        });
    }

    // Check for simulated emergency via URL query parameters
    const mockState = getMockEmergencyState();
    if (mockState) {
        applyEmergencyState(mockState);
        return; // When URL mock is active, skip server polling overrides
    }

    // 1. Establish SSE Connection
    if (typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
        try {
            connectSse();
        } catch (e) {
            console.warn('[Emergency] SSE init failed, relying on poll:', e);
        }
    }

    // 2. Fallback polling every 5 seconds (air-gap / network resilience)
    pollEmergencyState();
    setInterval(pollEmergencyState, 5000);
}

function connectSse() {
    if (sseConnection) {
        try { sseConnection.close(); } catch (e) {}
    }

    try {
        sseConnection = new EventSource('/api/events/stream');
        sseConnection.addEventListener('emergency', (event) => {
            try {
                const data = JSON.parse(event.data);
                applyEmergencyState(data);
            } catch (err) {
                console.warn('[Emergency] Error parsing SSE payload:', err);
            }
        });

        sseConnection.onerror = () => {
            if (sseConnection) {
                try { sseConnection.close(); } catch (e) {}
                sseConnection = null;
            }
            // Auto-reconnect after 10s
            setTimeout(connectSse, 10000);
        };
    } catch (e) {
        console.warn('[Emergency] SSE connection error:', e);
    }
}

async function pollEmergencyState() {
    // When URL mock is active, keep mock state intact
    const mockState = getMockEmergencyState();
    if (mockState) {
        applyEmergencyState(mockState);
        return;
    }

    try {
        const data = await fetchJson(cacheBustUrl('assets/data/emergency.json'));
        if (data && data.active) {
            // Validate expiration locally
            if (data.endTime > 0 && Date.now() > data.endTime) {
                applyEmergencyState({ active: false });
            } else {
                applyEmergencyState(data);
            }
        } else if (isEmergencyActive) {
            applyEmergencyState({ active: false });
        }
    } catch (e) {
        // Fallback to checking special.json
        try {
            const spec = await fetchJson(cacheBustUrl('assets/data/special.json'));
            if (spec && spec.is_emergency) {
                applyEmergencyState({
                    active: true,
                    title: spec.title || 'EMERGENCY ALERT',
                    message: spec.description || '',
                    severity: spec.severity || 'critical',
                    sound: spec.sound !== false,
                    endTime: spec.endTime ? new Date(spec.endTime).getTime() : 0
                });
            } else if (isEmergencyActive) {
                applyEmergencyState({ active: false });
            }
        } catch (sErr) {}
    }
}

if (typeof window !== 'undefined') {
    window.mockEmergency = function(type = 'chemical') {
        const state = (type && typeof type === 'object') ? type : (getMockEmergencyState() || {
            active: true,
            type: type,
            title: `${type.toUpperCase()} ALERT`,
            message: `Simulated plant emergency (${type}).`,
            severity: 'critical',
            sound: true,
            endTime: Date.now() + 15 * 60 * 1000
        });
        applyEmergencyState(state);
    };
    window.clearEmergency = function() {
        applyEmergencyState({ active: false });
    };
}

