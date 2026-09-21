const redisModule = require('./lib/redis');

/**
 * Extracts and categorizes free and paid Xweather key pairs.
 * Free keys: FREE_XWEATHER_API, FREE_XWEATHER_KEYS, FREE_XWEATHER_ID/SECRET,
 *            plus legacy XWEATHER_ID*, XWEATHER_KEYS.
 * Paid keys: PAID_XWEATHER_API, PAID_XWEATHER_KEYS, PAID_XWEATHER_ID/SECRET,
 *            XWEATHER_PAID_ID/SECRET.
 */
function parseKeyPairs() {
    const freeKeys = [];
    const paidKeys = [];

    const addPair = (list, id, secret, label) => {
        if (id && secret && typeof id === 'string' && typeof secret === 'string') {
            const cleanId = id.trim();
            const cleanSecret = secret.trim();
            if (cleanId && cleanSecret) {
                list.push({ id: cleanId, secret: cleanSecret, type: label });
            }
        }
    };

    const parseCombinedString = (list, str, label) => {
        if (!str || typeof str !== 'string') return;
        str.split(',').forEach(pair => {
            const [id, secret] = pair.trim().split(':');
            addPair(list, id, secret, label);
        });
    };

    // 1. Paid Keys
    parseCombinedString(paidKeys, process.env.PAID_XWEATHER_API, 'paid');
    parseCombinedString(paidKeys, process.env.PAID_XWEATHER_KEYS, 'paid');
    addPair(paidKeys, process.env.PAID_XWEATHER_ID, process.env.PAID_XWEATHER_SECRET, 'paid');
    addPair(paidKeys, process.env.XWEATHER_PAID_ID, process.env.XWEATHER_PAID_SECRET, 'paid');

    // 2. Free Keys
    parseCombinedString(freeKeys, process.env.FREE_XWEATHER_API, 'free');
    parseCombinedString(freeKeys, process.env.FREE_XWEATHER_KEYS, 'free');
    addPair(freeKeys, process.env.FREE_XWEATHER_ID, process.env.FREE_XWEATHER_SECRET, 'free');
    addPair(freeKeys, process.env.FREE_XWEATHER_ID2, process.env.FREE_XWEATHER_SECRET2, 'free');

    // Legacy XWEATHER_ID, XWEATHER_ID2..5 and XWEATHER_KEYS treated as free
    addPair(freeKeys, process.env.XWEATHER_ID, process.env.XWEATHER_SECRET, 'free');
    addPair(freeKeys, process.env.XWEATHER_ID2, process.env.XWEATHER_SECRET2, 'free');
    addPair(freeKeys, process.env.XWEATHER_ID3, process.env.XWEATHER_SECRET3, 'free');
    addPair(freeKeys, process.env.XWEATHER_ID4, process.env.XWEATHER_SECRET4, 'free');
    addPair(freeKeys, process.env.XWEATHER_ID5, process.env.XWEATHER_SECRET5, 'free');
    parseCombinedString(freeKeys, process.env.XWEATHER_KEYS, 'free');

    // Deduplicate keys by id
    const uniqueFree = [];
    const seenFree = new Set();
    for (const k of freeKeys) {
        if (!seenFree.has(k.id)) {
            seenFree.add(k.id);
            uniqueFree.push(k);
        }
    }

    const uniquePaid = [];
    const seenPaid = new Set();
    for (const k of paidKeys) {
        if (!seenPaid.has(k.id)) {
            seenPaid.add(k.id);
            uniquePaid.push(k);
        }
    }

    return { freeKeys: uniqueFree, paidKeys: uniquePaid };
}

/**
 * Checks Upstash Redis for live Blitzortung community lightning data
 * synced by the on-premise kiosk within the 35-minute OSHA cooldown window.
 */
async function getSyncedBlitzortung(client, site) {
    if (!client) return null;
    try {
        const syncedLightning = await client.get(`kiosk:${site}:lightning.json`);
        if (syncedLightning) {
            const parsed = JSON.parse(syncedLightning);
            if (parsed && parsed.response && parsed.response.length > 0) {
                const strikeTime = new Date(parsed.response[0].ob.dateTimeISO).getTime();
                // If strike occurred within the 35-minute OSHA cooldown window
                if (Date.now() - strikeTime < 35 * 60 * 1000) {
                    return { ...parsed, provider: 'blitzortung', _synced: true };
                }
            }
        }
    } catch (e) {
        console.error('Redis Blitzortung read error:', e);
    }
    return null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { freeKeys, paidKeys } = parseKeyPairs();
    const hasPaid = paidKeys.length > 0;

    // Normalize coordinates to 3 decimals to maximize global cache hit rate across all clients
    let latNum = parseFloat(req.query.lat);
    if (isNaN(latNum)) latNum = 41.6045;
    const lat = latNum.toFixed(3);
    
    let lonNum = parseFloat(req.query.lon);
    if (isNaN(lonNum)) lonNum = -87.1311;
    const lon = lonNum.toFixed(3);
    
    const radius = req.query.radius || '10mi';
    const site = req.query.site || 'default-site';
    const cacheKey = `xweather:cache:${lat}:${lon}:${radius}`;

    const client = await redisModule.ensureRedis(redisModule.getRedisClient());

    // 1. Check Server-Side Redis Cache for Xweather responses first (2 minute TTL)
    if (client) {
        try {
            const cached = await client.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                return res.status(200).json({ ...parsed, _cached: true });
            }
        } catch (e) {
            console.error('Redis cache read error:', e);
        }
    }

    // 2. If NO paid keys are configured, free Blitzortung community feed is PRIMARY
    if (!hasPaid) {
        const blitzData = await getSyncedBlitzortung(client, site);
        if (blitzData) {
            return res.status(200).json(blitzData);
        }
    }

    // 3. Determine candidate Xweather keys:
    // If paid keys exist: use free keys first until exhausted, then fail over to paid keys.
    // If only free keys exist: use free keys as backup since Blitzortung had no strikes.
    const candidateKeys = hasPaid ? [...freeKeys, ...paidKeys] : [...freeKeys];
    let lastError = null;

    if (candidateKeys.length > 0) {
        for (let i = 0; i < candidateKeys.length; i++) {
            const key = candidateKeys[i];
            const exhaustedKey = `xweather:exhausted:${key.id}`;

            // Check if key is blacklisted in Redis
            if (client) {
                try {
                    const isExhausted = await client.get(exhaustedKey);
                    if (isExhausted) {
                        console.log(`Skipping exhausted Xweather key #${i + 1} (${key.type}, ${key.id.substring(0, 4)}***)`);
                        continue;
                    }
                } catch (e) {}
            }

            try {
                const url = `https://data.api.xweather.com/lightning/closest?p=${lat},${lon}&radius=${radius}&client_id=${key.id}&client_secret=${key.secret}`;
                const fetchRes = await fetch(url);
                let data;
                try {
                    data = await fetchRes.json();
                } catch (e) {
                    throw new Error('Invalid JSON response from Xweather');
                }

                // If this key hit its quota, mark as exhausted for 10 days in Redis and failover
                if (data.error && (data.error.code === 'maxhits' || data.error.code === 'access_denied' || data.error.code === 'limit_exceeded')) {
                    console.warn(`Xweather Key #${i + 1} (${key.type}, ${key.id.substring(0, 4)}***) hit limit: ${data.error.code}. Blacklisting for 10 days in Redis.`);
                    if (client) {
                        try {
                            await client.setex(exhaustedKey, 10 * 86400, 'true');
                        } catch (e) {}
                    }
                    lastError = data.error;
                    continue;
                }

                // If valid response, cache in Redis for 120 seconds (2 mins)
                if (client) {
                    try {
                        await client.setex(cacheKey, 120, JSON.stringify(data));
                    } catch (e) {}
                }

                return res.status(200).json({ ...data, provider: `xweather-${key.type}` });
            } catch (e) {
                console.error(`Error querying with key #${i + 1} (${key.type}):`, e.message);
                lastError = { description: e.message };
            }
        }
    }

    // 4. Final Safety Net: If paid keys were configured and all Xweather attempts failed,
    // fallback to Blitzortung if available
    if (hasPaid) {
        const blitzData = await getSyncedBlitzortung(client, site);
        if (blitzData) {
            return res.status(200).json(blitzData);
        }
    }

    // 5. Clean All-Clear Response (HTTP 200 with 0 strikes, zero 500 errors)
    const cleanAllClear = {
        success: true,
        count: 0,
        response: [],
        provider: hasPaid ? 'xweather' : 'blitzortung'
    };

    // If candidate keys were tried and failed due to quota/network, cache failure briefly
    if (candidateKeys.length > 0 && lastError && client) {
        try {
            await client.setex(cacheKey, 300, JSON.stringify({ ...cleanAllClear, _fallbackError: lastError.code || lastError.description }));
        } catch (e) {}
    }

    return res.status(200).json(cleanAllClear);
};
