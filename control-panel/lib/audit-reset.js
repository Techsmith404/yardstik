// control-panel/lib/audit-reset.js - Shared Sunday 11:00 PM Scale Audit Reset Logic
// Encapsulates weekly shift reset epoch calculation (§9.4 SSoT compliant)

/**
 * Calculates the epoch millisecond timestamp of the most recent Sunday 11:00 PM shift reset.
 * @param {Date | number | string} [date=new Date()] 
 * @returns {number} Epoch timestamp in milliseconds
 */
function getLatestSunday11PMEpoch(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const hours = d.getHours();
    let daysToSubtract = day;
    if (day === 0 && hours < 23) daysToSubtract = 7;
    const sunday11pm = new Date(d);
    sunday11pm.setDate(d.getDate() - daysToSubtract);
    sunday11pm.setHours(23, 0, 0, 0);
    return sunday11pm.getTime();
}

/**
 * Evaluates whether a recorded audit reset timestamp is still valid for the current week.
 * @param {number | null | undefined} lastAuditResetEpoch 
 * @param {Date | number | string} [now=new Date()] 
 * @returns {boolean} True if audit timestamp was reset at or after the most recent Sunday 11:00 PM
 */
function isAuditResetCurrent(lastAuditResetEpoch, now = new Date()) {
    if (!lastAuditResetEpoch) return false;
    return Number(lastAuditResetEpoch) >= getLatestSunday11PMEpoch(now);
}

const fs = require('fs');
const path = require('path');

/**
 * Resets mobile crane blend audit flags if weekly boundary crossed.
 * @param {object} data Equipment JSON object
 * @returns {boolean} True if audit was reset
 */
function processWeeklyAuditReset(data) {
    if (!data || !data.categories) return false;
    const latestSundayReset = getLatestSunday11PMEpoch();

    if (!data.last_audit_reset || data.last_audit_reset < latestSundayReset) {
        let changed = false;
        data.categories.forEach(cat => {
            if ((cat.name || '').trim().toLowerCase() === 'mobile cranes' && Array.isArray(cat.items)) {
                cat.items.forEach(item => {
                    if (item.blend_audit === true) {
                        item.blend_audit = false;
                        changed = true;
                    }
                });
            }
        });
        data.last_audit_reset = latestSundayReset;
        return true;
    }
    return false;
}

/**
 * Daemon check to perform Sunday 11:00 PM audit reset on disk.
 */
function checkAndPerformAuditReset() {
    const dataDir = process.env.DATA_DIR || '/data';
    const equipmentPath = process.env.EQUIPMENT_PATH || path.join(dataDir, 'equipment.json');
    try {
        if (!fs.existsSync(equipmentPath)) return false;
        const raw = fs.readFileSync(equipmentPath, 'utf8');
        let data = JSON.parse(raw);
        if (processWeeklyAuditReset(data)) {
            console.log('[Audit Engine] Sunday 11:00 PM weekly audit reset executed.');
            fs.writeFileSync(equipmentPath, JSON.stringify(data, null, 2), 'utf8');
            try {
                fs.writeFileSync(path.join(dataDir, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
            } catch {}
            return true;
        }
    } catch (e) {
        console.error('[Audit Engine] Error checking weekly audit reset:', e);
    }
    return false;
}

module.exports = {
    getLatestSunday11PMEpoch,
    isAuditResetCurrent,
    processWeeklyAuditReset,
    checkAndPerformAuditReset
};

