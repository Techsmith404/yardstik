// api/lib/redis.js - Shared Redis Connection Abstraction for Vercel Serverless Functions
// Centralizes connection pooling, lazy instantiation, timeout configuration, and connection guards.

let redis = null;

/**
 * Returns a singleton or lazy-connected IORedis instance using REDIS_URL, KV_URL, or UPSTASH_REDIS_REST_URL
 * @returns {import('ioredis').Redis | null}
 */
function getRedisClient() {
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL;
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

/**
 * Ensures the Redis client is connected before executing operations
 * @param {import('ioredis').Redis | null} client 
 * @returns {Promise<import('ioredis').Redis | null>}
 */
async function ensureRedis(client) {
    if (!client) return null;
    try {
        if (client.status === 'wait' || client.status === 'close') {
            await client.connect();
        }
        return client;
    } catch (e) {
        console.error('Failed to connect to Redis:', e);
        return null;
    }
}

/**
 * Clears the active Redis client instance (primarily for test harnesses and resets)
 */
function resetRedisClient() {
    if (redis) {
        try {
            redis.disconnect();
        } catch (e) {}
        redis = null;
    }
}

module.exports = {
    getRedisClient,
    ensureRedis,
    resetRedisClient
};
