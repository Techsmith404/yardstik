/**
 * Lightweight, zero-dependency in-memory rate limiter middleware.
 * Designed for industrial kiosks to protect auth endpoints against brute-force attacks.
 */

function createRateLimiter(options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
    const max = options.max || 20; // 20 attempts default
    const message = options.message || { error: 'Too many login attempts. Try again in 15 minutes.' };

    const hits = new Map();

    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, timestamps] of hits.entries()) {
            const valid = timestamps.filter(t => now - t < windowMs);
            if (valid.length === 0) {
                hits.delete(ip);
            } else {
                hits.set(ip, valid);
            }
        }
    }, Math.min(windowMs, 60000));

    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    const limiter = function (req, res, next) {
        const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
        const now = Date.now();

        const timestamps = (hits.get(ip) || []).filter(t => now - t < windowMs);

        if (timestamps.length >= max) {
            const oldest = timestamps[0];
            const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
            res.setHeader('Retry-After', retryAfterSec);
            res.setHeader('RateLimit-Limit', max);
            res.setHeader('RateLimit-Remaining', 0);
            res.setHeader('RateLimit-Reset', Math.ceil((oldest + windowMs) / 1000));
            return res.status(429).json(message);
        }

        timestamps.push(now);
        hits.set(ip, timestamps);

        res.setHeader('RateLimit-Limit', max);
        res.setHeader('RateLimit-Remaining', Math.max(0, max - timestamps.length));
        res.setHeader('RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

        next();
    };

    limiter.reset = function () {
        hits.clear();
    };

    return limiter;
}

module.exports = { createRateLimiter };
