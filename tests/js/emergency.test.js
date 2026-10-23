const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('../../control-panel/node_modules/express');

describe('Emergency Broadcast & SSE Takeover Engine', () => {
    let testDataDir;
    let originalEnv;
    let app;
    let eventsLib;

    beforeEach(() => {
        originalEnv = { ...process.env };
        testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yardstik-emergency-test-'));
        process.env.DATA_DIR = testDataDir;
        process.env.CONFIG_PATH = path.join(testDataDir, 'config.json');

        fs.writeFileSync(path.join(testDataDir, 'config.json'), JSON.stringify({
            site_name: 'Test Site',
            site_id: 'test-plant',
            sync_secret: 'test-secret'
        }), 'utf8');

        // Fresh require
        jest.resetModules();
        eventsLib = require('../../control-panel/lib/events');
        eventsLib.resetForTesting();

        app = express();
        app.use(express.json());

        // Mock auth middleware for testing
        app.use((req, res, next) => {
            const role = req.headers['x-mock-role'];
            if (role) {
                req.user = { id: 1, username: 'test-' + role, role: role };
            }
            next();
        });

        app.use('/api', require('../../control-panel/routes/emergency'));
    });

    afterEach(() => {
        eventsLib.resetForTesting();
        process.env = originalEnv;
        try {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        } catch (e) {}
    });

    test('Rejects emergency broadcast if unauthenticated (401)', async () => {
        const res = await request(app)
            .post('/api/emergency/broadcast')
            .send({ title: 'TORNADO WARNING', message: 'Take shelter' });

        expect(res.statusCode).toBe(401);
    });

    test('Rejects emergency broadcast for insufficient role like viewer (403)', async () => {
        const res = await request(app)
            .post('/api/emergency/broadcast')
            .set('x-mock-role', 'viewer')
            .send({ title: 'TORNADO WARNING', message: 'Take shelter' });

        expect(res.statusCode).toBe(403);
    });

    test('Rejects emergency broadcast without title or message (400)', async () => {
        const res = await request(app)
            .post('/api/emergency/broadcast')
            .set('x-mock-role', 'admin')
            .send({});

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('requires a title or message');
    });

    test('Admin successfully broadcasts emergency takeover, persists state, and bumps version.txt', async () => {
        const res = await request(app)
            .post('/api/emergency/broadcast')
            .set('x-mock-role', 'admin')
            .send({
                title: 'EVACUATE FACILITY',
                message: 'All personnel report to muster station Alpha.',
                severity: 'evacuation',
                duration: 120,
                sound: true
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.emergency.active).toBe(true);
        expect(res.body.emergency.title).toBe('EVACUATE FACILITY');
        expect(res.body.emergency.severity).toBe('evacuation');
        expect(res.body.emergency.duration).toBe(120);

        // Verify emergency.json on disk
        const emPath = path.join(testDataDir, 'emergency.json');
        expect(fs.existsSync(emPath)).toBe(true);
        const emData = JSON.parse(fs.readFileSync(emPath, 'utf8'));
        expect(emData.active).toBe(true);
        expect(emData.title).toBe('EVACUATE FACILITY');

        // Verify version.txt was bumped
        const verPath = path.join(testDataDir, 'version.txt');
        expect(fs.existsSync(verPath)).toBe(true);

        // Verify GET /api/emergency returns current active state
        const getRes = await request(app).get('/api/emergency');
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.active).toBe(true);
        expect(getRes.body.title).toBe('EVACUATE FACILITY');
    });

    test('Supervisor successfully clears emergency broadcast', async () => {
        // Broadcast first
        await request(app)
            .post('/api/emergency/broadcast')
            .set('x-mock-role', 'admin')
            .send({ title: 'FIRE DRILL', message: 'Practice evacuation' });

        // Clear broadcast
        const clearRes = await request(app)
            .post('/api/emergency/clear')
            .set('x-mock-role', 'supervisor')
            .send({});

        expect(clearRes.statusCode).toBe(200);
        expect(clearRes.body.success).toBe(true);
        expect(clearRes.body.emergency.active).toBe(false);

        // Verify state is inactive
        const getRes = await request(app).get('/api/emergency');
        expect(getRes.statusCode).toBe(200);
        expect(getRes.body.active).toBe(false);

        // Verify emergency.json indicates inactive
        const emPath = path.join(testDataDir, 'emergency.json');
        const emData = JSON.parse(fs.readFileSync(emPath, 'utf8'));
        expect(emData.active).toBe(false);
    });

    test('GET /api/events/stream registers client and sets SSE headers', (done) => {
        const server = app.listen(0, () => {
            const port = server.address().port;
            const http = require('http');

            const req = http.get(`http://127.0.0.1:${port}/api/events/stream`, (res) => {
                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toBe('text/event-stream');
                expect(res.headers['cache-control']).toBe('no-cache, no-transform');

                let receivedData = '';
                res.on('data', (chunk) => {
                    receivedData += chunk.toString();
                    if (receivedData.includes(': connected')) {
                        req.destroy();
                        server.close(done);
                    }
                });
            });
        });
    });
});
