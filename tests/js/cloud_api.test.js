const syncHandler = require('../../api/sync');
const lightningHandler = require('../../api/lightning');

// Mock request / response helper
function createMockReqRes(options = {}) {
    const req = {
        method: options.method || 'GET',
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
