/**
 * html/js/modules/audit-utils.js - Client-Side Sunday 11:00 PM Scale Audit Reset Utilities
 * Strictly upholds SSoT §9.1 and §9.4 (zero regex lookbehinds, zero top-level await).
 */

/**
 * Calculates the epoch millisecond timestamp of the most recent Sunday 11:00 PM shift reset.
 * @param {Date | number | string} [date=new Date()] 
 * @returns {number}
 */
export function getLatestSunday11PMEpoch(date = new Date()) {
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
 * @returns {boolean}
 */
export function isAuditResetCurrent(lastAuditResetEpoch, now = new Date()) {
    if (!lastAuditResetEpoch) return false;
    return Number(lastAuditResetEpoch) >= getLatestSunday11PMEpoch(now);
}
