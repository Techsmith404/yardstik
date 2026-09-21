const syncHandler = require('../../api/sync');
const lightningHandler = require('../../api/lightning');
const authHandler = require('../../api/auth');
const equipmentHandler = require('../../api/equipment');
const novaraHandler = require('../../api/novara');

// Mock request / response helper
function createMockReqRes(options = {}) {
    const req = {
        method: options.method || 'GET',
        url: options.url || '/',
        headers: options.headers || {},
        query: options.query || {},
        body: options.body || {}
    };

    const res = {
        statusCode: 200,
        headers: {},
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(key, val) {
            this.headers[key.toLowerCase()] = val;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        },
        send(payload) {
            this.data = payload;
            return this;
        },
        redirect(url) {
            this.statusCode = 302;
            this.redirectUrl = url;
            return this;
        },
        end() {
            return this;
        }
    };

    return { req, res };
}

describe('Serverless Cloud Sync API (api/sync.js)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('Responds with 200 on OPTIONS preflight', async () => {
        const { req, res } = createMockReqRes({ method: 'OPTIONS' });
        await syncHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['access-control-allow-methods']).toContain('GET,OPTIONS,POST');
    });

    test('Rejects POST if SYNC_SECRET is not configured on server (503)', async () => {
        delete process.env.SYNC_SECRET;
        const { req, res } = createMockReqRes({
            method: 'POST',
            body: { site_id: 'site-1', secret: 'abc', files: { 'equipment.json': {} } }
        });
        await syncHandler(req, res);
        expect(res.statusCode).toBe(503);
        expect(res.data.error).toContain('SYNC_SECRET missing');
    });

    test('Rejects POST with invalid sync secret (401)', async () => {
        process.env.SYNC_SECRET = 'correct_secret_key';
        const { req, res } = createMockReqRes({
            method: 'POST',
            body: { site_id: 'site-1', secret: 'wrong_secret', files: { 'equipment.json': {} } }
        });
        await syncHandler(req, res);
        expect(res.statusCode).toBe(401);
        expect(res.data.error).toContain('Unauthorized sync secret');
    });

    test('Rejects POST if missing site_id or files payload (400)', async () => {
        process.env.SYNC_SECRET = 'secret';
        const { req, res } = createMockReqRes({
            method: 'POST',
            body: { secret: 'secret' }
        });
        await syncHandler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.data.error).toContain('Missing site_id or files');
    });

    test('Redirects GET for toolbox_slide.png to fallback 001.png when no Redis entry exists', async () => {
        const { req, res } = createMockReqRes({
            method: 'GET',
            query: { file: 'toolbox_slide.png', site: 'test-site' }
        });
        await syncHandler(req, res);
        expect(res.statusCode).toBe(302);
        expect(res.redirectUrl).toBe('/assets/safety-slides/001.png');
    });

    test('Accepts POST containing single active toolbox_slide.png base64 payload', async () => {
        process.env.SYNC_SECRET = 'secret123';
        const fakePngBase64 = Buffer.from('fake-png-bytes').toString('base64');
        const { req, res } = createMockReqRes({
            method: 'POST',
            body: {
                site_id: 'test-site',
                secret: 'secret123',
                files: {
                    'toolbox_slide.png': fakePngBase64,
                    'toolbox_slide_meta.json': { slide_number: '257', filename: '257.png' }
                }
            }
        });
        await syncHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.synced_files).toContain('toolbox_slide.png');
    });
});

describe('Serverless Lightning Radar API (api/lightning.js)', () => {
    test('Responds with 200 on OPTIONS preflight', async () => {
        const { req, res } = createMockReqRes({ method: 'OPTIONS' });
        await lightningHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBeDefined();
    });

    test('Returns 200 all-clear when no Xweather keys are configured and no strikes present', async () => {
        const originalEnv = { ...process.env };
        delete process.env.XWEATHER_ID;
        delete process.env.XWEATHER_SECRET;
        delete process.env.XWEATHER_KEYS;
        delete process.env.XWEATHER_ID2;
        delete process.env.XWEATHER_SECRET2;
        delete process.env.XWEATHER_ID3;
        delete process.env.XWEATHER_SECRET3;
        delete process.env.XWEATHER_ID4;
        delete process.env.XWEATHER_SECRET4;
        delete process.env.XWEATHER_ID5;
        delete process.env.XWEATHER_SECRET5;
        delete process.env.FREE_XWEATHER_API;
        delete process.env.FREE_XWEATHER_KEYS;
        delete process.env.FREE_XWEATHER_ID;
        delete process.env.FREE_XWEATHER_SECRET;
        delete process.env.PAID_XWEATHER_API;
        delete process.env.PAID_XWEATHER_KEYS;
        delete process.env.PAID_XWEATHER_ID;
        delete process.env.PAID_XWEATHER_SECRET;

        const { req, res } = createMockReqRes({
            method: 'GET',
            query: { lat: '41.604', lon: '-87.131' }
        });
        await lightningHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.count).toBe(0);
        expect(res.data.response).toEqual([]);
        expect(res.data.provider).toBe('blitzortung');

        process.env = originalEnv;
    });

    test('Queries free Xweather key first when both free and paid are configured', async () => {
        const originalEnv = { ...process.env };
        process.env.FREE_XWEATHER_API = 'free_id:free_secret';
        process.env.PAID_XWEATHER_API = 'paid_id:paid_secret';

        const originalFetch = global.fetch;
        const queriedUrls = [];
        global.fetch = jest.fn().mockImplementation(async (url) => {
            queriedUrls.push(url);
            return {
                json: async () => ({
                    success: true,
                    count: 1,
                    response: [{ ob: { dateTimeISO: new Date().toISOString() }, loc: { lat: 41.6, long: -87.1 } }]
                })
            };
        });

        const { req, res } = createMockReqRes({
            method: 'GET',
            query: { lat: '41.604', lon: '-87.131' }
        });
        await lightningHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.provider).toBe('xweather-free');
        expect(queriedUrls.length).toBe(1);
        expect(queriedUrls[0]).toContain('client_id=free_id');

        global.fetch = originalFetch;
        process.env = originalEnv;
    });

    test('Fails over to paid key when free keys are exhausted', async () => {
        const originalEnv = { ...process.env };
        process.env.FREE_XWEATHER_API = 'free_id:free_secret';
        process.env.PAID_XWEATHER_API = 'paid_id:paid_secret';

        const originalFetch = global.fetch;
        const queriedUrls = [];
        global.fetch = jest.fn().mockImplementation(async (url) => {
            queriedUrls.push(url);
            if (url.includes('client_id=free_id')) {
                return {
                    json: async () => ({ error: { code: 'maxhits', description: 'Quota exceeded' } })
                };
            }
            return {
                json: async () => ({
                    success: true,
                    count: 1,
                    response: [{ ob: { dateTimeISO: new Date().toISOString() }, loc: { lat: 41.6, long: -87.1 } }]
                })
            };
        });

        const { req, res } = createMockReqRes({
            method: 'GET',
            query: { lat: '41.604', lon: '-87.131' }
        });
        await lightningHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.provider).toBe('xweather-paid');
        expect(queriedUrls.length).toBe(2);
        expect(queriedUrls[0]).toContain('client_id=free_id');
        expect(queriedUrls[1]).toContain('client_id=paid_id');

        global.fetch = originalFetch;
        process.env = originalEnv;
    });

    test('Serves synced Blitzortung community lightning data from Redis when present (IDEA-F04)', async () => {
        const fakeRedis = {
            status: 'ready',
            get: jest.fn().mockImplementation(async (key) => {
                if (key === 'kiosk:default-site:lightning.json') {
                    return JSON.stringify({
                        success: true,
                        count: 1,
                        response: [
                            {
                                ob: { dateTimeISO: new Date(Date.now() - 60000).toISOString(), timestamp: Math.floor(Date.now() / 1000) },
                                loc: { lat: 41.62, long: -87.12 },
                                relativeTo: { distanceMI: 3.5, distanceKM: 5.6, bearing: 45, bearingENG: 'NE' },
                                provider: 'blitzortung'
                            }
                        ]
                    });
                }
                return null;
            })
        };
        const redisLib = require('../../api/lib/redis');
        jest.spyOn(redisLib, 'getRedisClient').mockReturnValue(fakeRedis);
        jest.spyOn(redisLib, 'ensureRedis').mockResolvedValue(fakeRedis);

        const { req, res } = createMockReqRes({
            method: 'GET',
            query: { lat: '41.604', lon: '-87.131', site: 'default-site' }
        });
        const freshLightningHandler = require('../../api/lightning');
        await freshLightningHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.provider).toBe('blitzortung');
        expect(res.data.response.length).toBe(1);
        expect(res.data.response[0].relativeTo.distanceMI).toBe(3.5);

        redisLib.getRedisClient.mockRestore();
        redisLib.ensureRedis.mockRestore();
    });
});

describe('Serverless Cloud Auth API (api/auth.js)', () => {
    let adminToken = '';
    let inviteToken = '';
    let maintToken = '';

    test('GET /api/auth/me returns unauthenticated when no token is provided', async () => {
        const { req, res } = createMockReqRes({ method: 'GET', url: '/api/auth/me' });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.authenticated).toBe(false);
    });

    test('POST /api/auth/login auto-seeds default admin and logs in', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/auth/login',
            body: { username: 'admin', password: 'admin' }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.user.username).toBe('admin');
        expect(res.data.user.role).toBe('admin');
        expect(res.data.token).toBeDefined();
        adminToken = res.data.token;
    });

    test('GET /api/auth/me with admin token returns authenticated admin', async () => {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/auth/me',
            headers: { authorization: `Bearer ${adminToken}` }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.authenticated).toBe(true);
        expect(res.data.user.role).toBe('admin');
    });

    test('POST /api/auth/invite generates valid invitation token for maintenance role', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/auth/invite',
            headers: { authorization: `Bearer ${adminToken}` },
            body: { role: 'maintenance' }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.invite.token).toMatch(/^inv_/);
        expect(res.data.invite.role).toBe('maintenance');
        inviteToken = res.data.invite.token;
    });

    test('GET /api/auth/verify-invite verifies valid invite token', async () => {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: `/api/auth/verify-invite?token=${inviteToken}`,
            query: { token: inviteToken }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.valid).toBe(true);
        expect(res.data.invite.role).toBe('maintenance');
    });

    test('POST /api/auth/register creates user account and creates session', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/auth/register',
            body: {
                token: inviteToken,
                username: 'bob_maintenance',
                password: 'password123',
                displayName: 'Bob The Builder'
            }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.user.username).toBe('bob_maintenance');
        expect(res.data.user.role).toBe('maintenance');
        expect(res.data.token).toBeDefined();
        maintToken = res.data.token;
    });

    test('GET /api/auth/verify-invite rejects already redeemed token', async () => {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: `/api/auth/verify-invite?token=${inviteToken}`,
            query: { token: inviteToken }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(404);
        expect(res.data.valid).toBe(false);
    });

    test('GET /api/auth/users lists registered accounts for admin', async () => {
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/auth/users',
            headers: { authorization: `Bearer ${adminToken}` }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
        expect(res.data.some(u => u.username === 'bob_maintenance')).toBe(true);
    });

    test('POST /api/auth.js?action=login processes rewritten Vercel requests', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/auth.js?action=login',
            query: { action: 'login' },
            body: { username: 'admin', password: 'admin' }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.user.role).toBe('admin');
    });

    test('DELETE /api/auth/invites/:token revokes pending invite', async () => {
        // Create an invite
        const createRes = createMockReqRes({
            method: 'POST',
            url: '/api/auth/invite',
            headers: { authorization: `Bearer ${adminToken}` },
            body: { role: 'viewer' }
        });
        await authHandler(createRes.req, createRes.res);
        const tempTok = createRes.res.data.invite.token;

        // Revoke it
        const { req, res } = createMockReqRes({
            method: 'DELETE',
            url: `/api/auth/invites/${tempTok}`,
            headers: { authorization: `Bearer ${adminToken}` }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
    });

    test('PATCH /api/users/:id/role updates user role', async () => {
        // Get Bob's ID
        const usersRes = createMockReqRes({
            method: 'GET',
            url: '/api/auth/users',
            headers: { authorization: `Bearer ${adminToken}` }
        });
        await authHandler(usersRes.req, usersRes.res);
        const bob = usersRes.res.data.find(u => u.username === 'bob_maintenance');
        expect(bob).toBeDefined();

        // Promote Bob to admin
        const { req, res } = createMockReqRes({
            method: 'PATCH',
            url: `/api/users/${bob.id}/role`,
            headers: { authorization: `Bearer ${adminToken}` },
            body: { role: 'admin' }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.user.role).toBe('admin');
    });

    test('POST /api/auth/logout logs user out', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/auth/logout',
            headers: { authorization: `Bearer ${maintToken}` }
        });
        await authHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
    });
});

describe('Serverless Cloud Equipment API (api/equipment.js)', () => {
    let adminToken = '';
    let viewerToken = '';

    beforeAll(async () => {
        // Log in admin
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/auth/login',
            body: { username: 'admin', password: 'admin' }
        });
        await authHandler(req, res);
        adminToken = res.data.token;

        // Create viewer invite & register viewer
        const inviteRes = createMockReqRes({
            method: 'POST',
            url: '/api/auth/invite',
            headers: { authorization: `Bearer ${adminToken}` },
            body: { role: 'viewer' }
        });
        await authHandler(inviteRes.req, inviteRes.res);
        const vToken = inviteRes.res.data.invite.token;

        const regRes = createMockReqRes({
            method: 'POST',
            url: '/api/auth/register',
            body: { token: vToken, username: 'viewer_jane', password: 'password123', displayName: 'Jane' }
        });
        await authHandler(regRes.req, regRes.res);
        viewerToken = regRes.res.data.token;
    });

    test('POST /api/equipment rejects unauthenticated requests with 401', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/equipment',
            body: { categories: [] }
        });
        await equipmentHandler(req, res);
        expect(res.statusCode).toBe(401);
    });

    test('POST /api/equipment rejects viewer role with 403', async () => {
        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/equipment',
            headers: { authorization: `Bearer ${viewerToken}` },
            body: { categories: [] }
        });
        await equipmentHandler(req, res);
        expect(res.statusCode).toBe(403);
    });

    test('POST /api/equipment allows admin or maintenance role to update status', async () => {
        const mockEquipment = {
            categories: [
                {
                    name: 'Mobile Cranes',
                    items: [
                        { name: 'Crane #1', status: 'OK', scale: 'OK', blend_audit: true }
                    ]
                }
            ]
        };

        const { req, res } = createMockReqRes({
            method: 'POST',
            url: '/api/equipment',
            headers: { authorization: `Bearer ${adminToken}` },
            body: mockEquipment
        });
        await equipmentHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.version).toBeDefined();
    });
});

describe('Serverless Cloud Novara LMS API (api/novara.js) - IDEA-S04', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('Responds with 200 on OPTIONS preflight', async () => {
        const { req, res } = createMockReqRes({ method: 'OPTIONS' });
        await novaraHandler(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('x-sync-secret');
    });

    test('Rejects unauthenticated request without x-sync-secret or session with 401', async () => {
        process.env.SYNC_SECRET = 'valid_sync_secret';
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/novara'
        });
        await novaraHandler(req, res);
        expect(res.statusCode).toBe(401);
        expect(res.data.error).toContain('Unauthorized');
    });

    test('Rejects request with invalid x-sync-secret with 401', async () => {
        process.env.SYNC_SECRET = 'valid_sync_secret';
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/novara',
            headers: { 'x-sync-secret': 'wrong_secret' }
        });
        await novaraHandler(req, res);
        expect(res.statusCode).toBe(401);
        expect(res.data.error).toContain('Unauthorized');
    });

    test('Passes authentication with valid x-sync-secret (returns 500 when NOVARA_API_KEY missing)', async () => {
        process.env.SYNC_SECRET = 'valid_sync_secret';
        delete process.env.NOVARA_API_KEY;
        delete process.env.NOVARA_API_TOKEN;
        const { req, res } = createMockReqRes({
            method: 'GET',
            url: '/api/novara',
            headers: { 'x-sync-secret': 'valid_sync_secret' }
        });
        await novaraHandler(req, res);
        // Authenticated successfully, then reached API key check
        expect(res.statusCode).toBe(500);
        expect(res.data.error).toContain('NOVARA_API_KEY');
    });
});

describe('Redis Abstraction Layer (api/lib/redis.js, IDEA-A04)', () => {
    const { getRedisClient, ensureRedis, resetRedisClient } = require('../../api/lib/redis');

    afterEach(() => {
        resetRedisClient();
        delete process.env.REDIS_URL;
        delete process.env.KV_URL;
        delete process.env.UPSTASH_REDIS_URL;
    });

    test('getRedisClient returns null when no Redis environment variables are configured', () => {
        delete process.env.REDIS_URL;
        delete process.env.KV_URL;
        delete process.env.UPSTASH_REDIS_URL;
        expect(getRedisClient()).toBeNull();
    });

    test('getRedisClient instantiates singleton client when REDIS_URL is configured', () => {
        process.env.REDIS_URL = 'redis://127.0.0.1:6379';
        const client1 = getRedisClient();
        expect(client1).not.toBeNull();
        const client2 = getRedisClient();
        expect(client2).toBe(client1);
    });

    test('ensureRedis handles null client gracefully', async () => {
        const result = await ensureRedis(null);
        expect(result).toBeNull();
    });

    test('resetRedisClient clears cached instance', () => {
        process.env.REDIS_URL = 'redis://127.0.0.1:6379';
        const client1 = getRedisClient();
        resetRedisClient();
        const client2 = getRedisClient();
        expect(client2).not.toBe(client1);
    });
});

