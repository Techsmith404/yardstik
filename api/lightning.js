let redis = null;

function getRedisClient() {
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    if (!redisUrl) return null;
    
    if (!redis) {
        try {
            const Redis = require('ioredis');
            redis = new Redis(redisUrl, {
                connectTimeout: 4000,
                maxRetriesPerRequest: 1,
                enableReadyCheck: false,
                lazyConnect: true
            });
        } catch (e) {
            console.error('Failed to initialize Redis client:', e);
            return null;
        }
    }
    return redis;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. Build array of all configured key pairs in priority order
    const keyPairs = [];
    if (process.env.XWEATHER_ID && process.env.XWEATHER_SECRET) {
        keyPairs.push({ id: process.env.XWEATHER_ID.trim(), secret: process.env.XWEATHER_SECRET.trim() });
    }
    if (process.env.XWEATHER_ID2 && process.env.XWEATHER_SECRET2) {
        keyPairs.push({ id: process.env.XWEATHER_ID2.trim(), secret: process.env.XWEATHER_SECRET2.trim() });
    }
    if (process.env.XWEATHER_ID3 && process.env.XWEATHER_SECRET3) {
        keyPairs.push({ id: process.env.XWEATHER_ID3.trim(), secret: process.env.XWEATHER_SECRET3.trim() });
    }
    if (process.env.XWEATHER_ID4 && process.env.XWEATHER_SECRET4) {
        keyPairs.push({ id: process.env.XWEATHER_ID4.trim(), secret: process.env.XWEATHER_SECRET4.trim() });
    }
    if (process.env.XWEATHER_ID5 && process.env.XWEATHER_SECRET5) {
        keyPairs.push({ id: process.env.XWEATHER_ID5.trim(), secret: process.env.XWEATHER_SECRET5.trim() });
    }
    if (process.env.XWEATHER_KEYS) {
        const extraPairs = process.env.XWEATHER_KEYS.split(',').map(pair => {
            const [id, secret] = pair.trim().split(':');
            return id && secret ? { id: id.trim(), secret: secret.trim() } : null;
        }).filter(Boolean);
        keyPairs.push(...extraPairs);
    }

    if (keyPairs.length === 0) {
        return res.status(500).json({ error: "No Xweather API Keys configured in Vercel Environment variables." });
    }

    // Normalize coordinates to 3 decimals to maximize global cache hit rate across all clients
    const lat = parseFloat(req.query.lat || '41.6045').toFixed(3);
    const lon = parseFloat(req.query.lon || '-87.1311').toFixed(3);
    const radius = req.query.radius || '10mi';
    const cacheKey = `xweather:cache:${lat}:${lon}:${radius}`;

    const client = getRedisClient();

    if (req.query.inspect === 'keys' || req.query.inspect === 'status') {
        const keyStatuses = [];
        for (let i = 0; i < keyPairs.length; i++) {
            const k = keyPairs[i];
            const exhaustedKey = `xweather:exhausted:${k.id}`;
            let isExhausted = false;
            if (client) {
                try {
                    isExhausted = !!(await client.get(exhaustedKey));
                } catch (e) {}
            }
            keyStatuses.push({
                index: i + 1,
                idMasked: `${k.id.substring(0, 4)}...${k.id.substring(Math.max(0, k.id.length - 2))}`,
                status: isExhausted ? 'exhausted_blacklisted' : 'active'
            });
        }
        return res.status(200).json({
            success: true,
            totalKeysConfigured: keyPairs.length,
            redisConnected: !!client,
            keyStatuses
        });
    }

    // 2. Check Server-Side Redis Cache (2 minute TTL)
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

    let lastError = null;

    // 3. Try each non-exhausted key pair in sequence
    for (let i = 0; i < keyPairs.length; i++) {
        const key = keyPairs[i];
        const exhaustedKey = `xweather:exhausted:${key.id}`;

        // Check if key is blacklisted in Redis
        if (client) {
            try {
                const isExhausted = await client.get(exhaustedKey);
                if (isExhausted) {
                    console.log(`Skipping exhausted Xweather key #${i + 1} (${key.id.substring(0, 4)}***)`);
                    continue;
                }
            } catch (e) {}
        }

        try {
            const url = `https://data.api.xweather.com/lightning/closest?p=${lat},${lon}&radius=${radius}&client_id=${key.id}&client_secret=${key.secret}`;
            const fetchRes = await fetch(url);
            const data = await fetchRes.json();

            // If this key hit its quota, mark as exhausted for 10 days in Redis and failover
            if (data.error && (data.error.code === 'maxhits' || data.error.code === 'access_denied' || data.error.code === 'limit_exceeded')) {
                console.warn(`Xweather Key #${i + 1} (${key.id.substring(0, 4)}***) hit limit: ${data.error.code}. Blacklisting for 10 days in Redis.`);
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

            return res.status(200).json(data);
        } catch (e) {
            console.error(`Error querying with key #${i + 1}:`, e.message);
            lastError = { description: e.message };
        }
    }

    // 4. If all keys were exhausted or failed, cache failure in Redis for 10 minutes to prevent rapid retry storms
    const fallbackResponse = {
        success: false,
        error: lastError || { code: "all_exhausted", description: "All configured Xweather keys exhausted." },
        response: []
    };

    if (client) {
        try {
            await client.setex(cacheKey, 600, JSON.stringify(fallbackResponse));
        } catch (e) {}
    }

    res.status(200).json(fallbackResponse);
};
