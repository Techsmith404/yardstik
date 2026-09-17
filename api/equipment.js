// api/equipment.js - Vercel Serverless Function for Cloud Equipment Management (Issue #14)
// Allows authenticated maintenance technicians and admins to update equipment status directly over cellular / Vercel cloud.

const {
    getRedisClient,
    getAuthToken,
    getSession,
    logAudit
} = require('./lib/cloud-auth');
const { getLatestSunday11PMEpoch, isAuditResetCurrent } = require('./lib/audit-reset');

let memoryEquipment = null;

function processWeeklyAuditReset(data) {
    if (!data || !data.categories) return false;
    const latestSundayReset = getLatestSunday11PMEpoch();
    if (!data.last_audit_reset || data.last_audit_reset < latestSundayReset) {
        data.categories.forEach(cat => {
            if ((cat.name || '').trim().toLowerCase() === 'mobile cranes' && Array.isArray(cat.items)) {
                cat.items.forEach(item => {
                    item.blend_audit = false;
                });
            }
        });
        data.last_audit_reset = latestSundayReset;
        return true;
    }
    return false;
}

module.exports = async function handler(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || (req.headers.origin || 'null');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const client = getRedisClient();
    const siteId = req.query.site || (req.body && req.body.site_id) || process.env.DEFAULT_SITE_ID || 'default-site';

    // ── GET: Read Equipment Data from Cloud ──────────────────────────────────
    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=15');
        if (client) {
            try {
                if (client.status === 'wait' || client.status === 'close') await client.connect();
                const raw = await client.get(`kiosk:${siteId}:equipment.json`);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (processWeeklyAuditReset(data)) {
                        client.set(`kiosk:${siteId}:equipment.json`, JSON.stringify(data)).catch(() => {});
                    }
                    return res.status(200).json(data);
                }
            } catch (e) {
                console.warn('Redis read failed for equipment:', e.message);
            }
        }
        if (memoryEquipment) return res.status(200).json(memoryEquipment);
        return res.redirect('/assets/data/equipment.json');
    }

    // ── POST: Update Equipment Data (Requires maintenance or admin role) ────
    if (req.method === 'POST') {
        const token = getAuthToken(req);
        const secretHeader = req.headers['x-sync-secret'];
        const isSecretAuth = process.env.SYNC_SECRET && secretHeader === process.env.SYNC_SECRET;

        let sessionUser = null;
        if (!isSecretAuth) {
            if (!token) {
                return res.status(401).json({ error: 'Authentication required to modify equipment.' });
            }
            sessionUser = await getSession(siteId, token);
            if (!sessionUser) {
                return res.status(401).json({ error: 'Invalid or expired session.' });
            }
            if (sessionUser.role !== 'admin' && sessionUser.role !== 'maintenance') {
                return res.status(403).json({ error: 'Maintenance or Admin permissions required.' });
            }
        }

        try {
            let payload = req.body;
            if (typeof payload === 'string') {
                payload = JSON.parse(payload);
            }

            if (!payload || !payload.categories || !Array.isArray(payload.categories)) {
                return res.status(400).json({ error: 'Invalid equipment payload structure.' });
            }

            if (!payload.last_audit_reset) {
                payload.last_audit_reset = getLatestSunday11PMEpoch();
            }

            const jsonStr = JSON.stringify(payload);
            const nowEpoch = Math.floor(Date.now() / 1000).toString();

            if (client) {
                if (client.status === 'wait' || client.status === 'close') await client.connect();
                const pipe = client.pipeline();
                pipe.set(`kiosk:${siteId}:equipment.json`, jsonStr);
                pipe.set(`kiosk:${siteId}:version.txt`, nowEpoch);
                await pipe.exec();
            } else {
                memoryEquipment = payload;
            }

            await logAudit(siteId, {
                req,
                user: sessionUser || { username: 'sync_daemon', userId: 'daemon' },
                action: 'equipment.update',
                details: `Updated equipment state (${payload.categories.length} categories) via cloud.`
            });

            return res.status(200).json({
                success: true,
                message: 'Equipment saved successfully.',
                version: nowEpoch
            });
        } catch (err) {
            console.error('Cloud equipment update error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
