const syncHandler = require('../../api/sync');
const lightningHandler = require('../../api/lightning');
const authHandler = require('../../api/auth');
const equipmentHandler = require('../../api/equipment');

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

    test('Rejects request with 500 when no Xweather keys are configured', async () => {
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

        const { req, res } = createMockReqRes({
            method: 'GET',
            query: { lat: '41.604', lon: '-87.131' }
        });
        await lightningHandler(req, res);
        expect(res.statusCode).toBe(500);
        expect(res.data.error).toContain('No Xweather API Keys configured');

        process.env = originalEnv;
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
