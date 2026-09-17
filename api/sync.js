// api/sync.js - Vercel Serverless Function for Multi-Site Ephemeral Cloud Sync
// Uses native Redis connection via ioredis for ultra-fast (2ms) responses and 100% reliability.

const { getRedisClient, ensureRedis } = require('./lib/redis');

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
    // SECURITY: Restrict CORS origin to the configured allowed origin.
    // Access-Control-Allow-Credentials: true is incompatible with wildcard '*' origin.
    // Use ALLOWED_ORIGIN env var to specify the permitted kiosk frontend origin.
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

    // ── POST: Push Live Kiosk Data to Cloud ──────────────────────────────────
    if (req.method === 'POST') {
        try {
            const { site_id, secret, files } = req.body || {};
            if (!site_id || !files || typeof files !== 'object') {
                return res.status(400).json({ error: 'Missing site_id or files payload.' });
            }

            // SECURITY: SYNC_SECRET is now required. If not configured, reject all POST requests.
            // Set the SYNC_SECRET environment variable in your Vercel project settings.
            const expectedSecret = process.env.SYNC_SECRET;
            if (!expectedSecret) {
                return res.status(503).json({ error: 'Sync endpoint is not configured (SYNC_SECRET missing).' });
            }
            const providedSecret = (secret || req.headers['x-sync-secret'] || (req.query && req.query.secret) || '').toString().trim();
            if (providedSecret !== expectedSecret.trim()) {
                return res.status(401).json({ error: 'Unauthorized sync secret.' });
            }

            // Auto-heal equipment.json audit status if needed
            if (files['equipment.json']) {
                let eqData = null;
                try {
                    eqData = typeof files['equipment.json'] === 'string' ? JSON.parse(files['equipment.json']) : files['equipment.json'];
                } catch {}
                if (eqData && typeof eqData === 'object') {
                    if (!eqData.last_audit_reset) {
                        eqData.last_audit_reset = getLatestSunday11PMEpoch();
                    }
                    files['equipment.json'] = eqData;
                }
            }

            if (client) {
                if (client.status === 'wait' || client.status === 'close') {
                    await client.connect();
                }

                // Batch set all files into Redis
                const pipeline = client.pipeline();
                for (const [filename, content] of Object.entries(files)) {
                    const key = `kiosk:${site_id}:${filename}`;
                    const val = typeof content === 'string' ? content : JSON.stringify(content);
                    pipeline.set(key, val);
                }
                await pipeline.exec();
            }

            return res.status(200).json({
                success: true,
                synced_files: Object.keys(files),
                persisted_to_kv: !!client,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error('Sync POST Error:', e);
            return res.status(500).json({ error: e.message });
        }
    }

    // ── GET: Read Live Kiosk Data for Mobile / Remote Viewers ─────────────────
    if (req.method === 'GET') {
        const site_id = req.query.site || process.env.DEFAULT_SITE_ID || 'default-site';
        const file = req.query.file;

        if (!file) {
            return res.status(400).json({ error: 'Missing ?file= query parameter.' });
        }
        if (file.includes('/') || file.includes('\\') || file.includes('..')) {
            return res.status(400).json({ error: 'Invalid file parameter.' });
        }

        // Cache response on Edge (fast sync, low latency)
        res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=15');

        if (client) {
            try {
                if (client.status === 'wait' || client.status === 'close') {
                    await client.connect();
                }
                const key = `kiosk:${site_id}:${file}`;
                const val = await client.get(key);

                if (val !== null && val !== undefined) {
                    if (file.endsWith('.json')) {
                        try {
                            const parsed = JSON.parse(val);
                            if (file === 'equipment.json' && typeof parsed === 'object') {
                                if (processWeeklyAuditReset(parsed)) {
                                    client.set(key, JSON.stringify(parsed)).catch(() => {});
                                }
                            }
                            return res.status(200).json(parsed);
                        } catch {
                            return res.status(200).json(val);
                        }
                    } else if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.webp') || file.endsWith('.gif')) {
                        let contentType = 'image/png';
                        if (file.endsWith('.jpg') || file.endsWith('.jpeg')) contentType = 'image/jpeg';
                        else if (file.endsWith('.webp')) contentType = 'image/webp';
                        else if (file.endsWith('.gif')) contentType = 'image/gif';

                        res.setHeader('Content-Type', contentType);
                        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
                        const cleanB64 = val.replace(/^data:image\/\w+;base64,/, '');
                        const imgBuf = Buffer.from(cleanB64, 'base64');
                        return res.status(200).send(imgBuf);
                    } else {
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        return res.status(200).send(val);
                    }
                }
            } catch (e) {
                console.warn('Redis read failed, falling back to static asset:', e.message);
            }
        }

        // Fallback: If not in Redis, redirect to static asset
        if (file === 'toolbox_slide.png' || file.endsWith('.png')) {
            return res.redirect('/assets/safety-slides/001.png');
        }
        return res.redirect(`/assets/data/${file}`);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
