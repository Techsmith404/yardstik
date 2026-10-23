const fs = require('fs');
const path = require('path');
const { logAction } = require('./audit');
const { bumpVersion } = require('./version');
const { syncToCloud } = require('./cloud');

function getDataDir() {
    return process.env.DATA_DIR || '/data';
}

function getEmergencyPath() {
    return path.join(getDataDir(), 'emergency.json');
}

function getSpecialPath() {
    return path.join(getDataDir(), 'special.json');
}

const sseClients = new Set();
let activeEmergency = null;
let pingInterval = null;

// Periodic heartbeat to keep SSE connections alive through reverse proxies & firewalls
if (!pingInterval && process.env.NODE_ENV !== 'test') {
    pingInterval = setInterval(() => {
        for (const res of sseClients) {
            try {
                res.write(': ping\n\n');
            } catch (err) {
                sseClients.delete(res);
            }
        }
    }, 20000);
    if (pingInterval.unref) pingInterval.unref();
}

/**
 * Register a client for Server-Sent Events stream
 */
function addSseClient(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    res.write(': connected\n\n');

    // If an emergency is currently active, deliver state immediately on connect
    const current = getCurrentEmergency();
    if (current && current.active) {
        res.write(`event: emergency\ndata: ${JSON.stringify(current)}\n\n`);
    }

    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
}

/**
 * Broadcast an SSE event to all connected clients
 */
function broadcastEvent(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(payload);
        } catch (err) {
            sseClients.delete(res);
        }
    }
}

/**
 * Get the current emergency state (with expiration auto-clearing)
 */
function getCurrentEmergency() {
    if (activeEmergency) {
        if (activeEmergency.endTime > 0 && Date.now() > activeEmergency.endTime) {
            clearEmergency();
            return { active: false };
        }
        return activeEmergency;
    }

    const emergencyPath = getEmergencyPath();
    if (fs.existsSync(emergencyPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(emergencyPath, 'utf8'));
            if (data && data.active) {
                if (data.endTime > 0 && Date.now() > data.endTime) {
                    clearEmergency();
                    return { active: false };
                }
                activeEmergency = data;
                return activeEmergency;
            }
        } catch (err) {
            console.warn('[Emergency] Error reading emergency.json:', err.message);
        }
    }

    return { active: false };
}

/**
 * Broadcast a new emergency screen takeover
 */
function broadcastEmergency({ title, message, severity, sound, duration, user, req }) {
    const dataDir = getDataDir();
    const durationSec = duration ? Math.max(5, Math.min(86400, parseInt(duration, 10) || 60)) : 0;
    const now = Date.now();

    activeEmergency = {
        active: true,
        title: (title || 'EMERGENCY ALERT').trim(),
        message: (message || '').trim(),
        severity: severity || 'critical', // 'critical', 'warning', 'evacuation'
        sound: sound !== false,
        duration: durationSec,
        startTime: now,
        endTime: durationSec > 0 ? now + (durationSec * 1000) : 0,
        broadcastBy: user ? user.username : 'system'
    };

    // 1. Write emergency.json atomically
    const emergencyPath = getEmergencyPath();
    try {
        fs.writeFileSync(emergencyPath, JSON.stringify(activeEmergency, null, 2), 'utf8');
    } catch (wErr) {
        console.error('[Emergency] Failed writing emergency.json:', wErr);
    }

    // 2. Also mirror to special.json for backward compatibility with existing kiosk view-special
    const specialPath = getSpecialPath();
    try {
        const specialPayload = {
            title: activeEmergency.title,
            description: activeEmergency.message,
            duration: activeEmergency.duration ? activeEmergency.duration.toString() : '60',
            endTime: activeEmergency.endTime > 0 ? new Date(activeEmergency.endTime).toISOString() : '',
            severity: activeEmergency.severity,
            sound: activeEmergency.sound,
            is_emergency: true
        };
        fs.writeFileSync(specialPath, JSON.stringify(specialPayload, null, 2), 'utf8');
    } catch (sErr) {
        console.error('[Emergency] Failed writing special.json mirror:', sErr);
    }

    // 3. Bump version to notify polling displays
    bumpVersion(dataDir);

    // 4. Send instant SSE event to TV screens and mobile clients
    broadcastEvent('emergency', activeEmergency);

    // 5. Audit log
    if (user && req) {
        logAction({
            req,
            user,
            action: 'emergency.broadcast',
            details: `Broadcast emergency: "${activeEmergency.title}" [${activeEmergency.severity}]`
        });
    }

    // 6. Push to cloud
    syncToCloud().catch(() => {});

    return activeEmergency;
}

/**
 * Clear the active emergency broadcast
 */
function clearEmergency({ user, req } = {}) {
    activeEmergency = null;
    const dataDir = getDataDir();

    // 1. Write inactive state to emergency.json
    const emergencyPath = getEmergencyPath();
    try {
        fs.writeFileSync(emergencyPath, JSON.stringify({ active: false, clearedAt: Date.now() }, null, 2), 'utf8');
    } catch (e) {}

    // 2. Clear emergency flag in special.json if it was an emergency
    const specialPath = getSpecialPath();
    try {
        if (fs.existsSync(specialPath)) {
            const current = JSON.parse(fs.readFileSync(specialPath, 'utf8'));
            if (current.is_emergency) {
                fs.unlinkSync(specialPath);
            }
        }
    } catch (e) {}

    // 3. Bump version
    bumpVersion(dataDir);

    // 4. Send instant SSE clear event
    broadcastEvent('emergency', { active: false });

    // 5. Audit log
    if (user && req) {
        logAction({
            req,
            user,
            action: 'emergency.clear',
            details: 'Emergency screen takeover cleared.'
        });
    }

    // 6. Push to cloud
    syncToCloud().catch(() => {});

    return { active: false };
}

function resetForTesting() {
    activeEmergency = null;
    sseClients.clear();
}

module.exports = {
    addSseClient,
    broadcastEvent,
    getCurrentEmergency,
    broadcastEmergency,
    clearEmergency,
    resetForTesting,
    getConnectedClientCount: () => sseClients.size
};
