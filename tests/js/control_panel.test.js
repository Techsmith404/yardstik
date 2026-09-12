const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set up isolated temp directory before requiring server
process.env.NODE_ENV = 'test';
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yardstik-test-data-'));
process.env.DATA_DIR = testDir;
process.env.CONFIG_PATH = path.join(testDir, 'config.json');
process.env.RUNNERS_DIR = path.resolve(__dirname, '../../control-panel/runners');

// Seed test config with known credentials
const TEST_USER = 'admin';
const TEST_PASS = 'secret123';
fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
    admin_username: TEST_USER,
    admin_password: TEST_PASS,
    site_name: 'Test Plant Alpha',
    site_id: 'test-plant',
    latitude: 41.5,
    longitude: -87.2,
    timezone: 'America/Chicago'
}, null, 2));

const {
    app,
    getLatestSunday11PMEpoch,
    processWeeklyAuditReset
} = require('../../control-panel/server');

const authHeader = 'Basic ' + Buffer.from(`${TEST_USER}:${TEST_PASS}`).toString('base64');
const badAuthHeader = 'Basic ' + Buffer.from('wrong:creds').toString('base64');

afterAll(() => {
    try {
        fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
});

describe('Control Panel Authentication Middleware', () => {
    test('Denies requests without authentication (401)', async () => {
        const res = await request(app).get('/api/site-config');
        expect(res.status).toBe(401);
        expect(res.headers['www-authenticate']).toContain('Basic realm=');
    });

    test('Denies requests with invalid credentials (401)', async () => {
        const res = await request(app)
            .get('/api/site-config')
            .set('Authorization', badAuthHeader);
        expect(res.status).toBe(401);
    });

    test('Allows requests with valid credentials (200)', async () => {
        const res = await request(app)
            .get('/api/site-config')
            .set('Authorization', authHeader);
        expect(res.status).toBe(200);
        expect(res.body.site_name).toBe('Test Plant Alpha');
        // SECURITY: Never return raw password
        expect(res.body.admin_password).toBeUndefined();
    });

    test('POST /api/site-config rejects password tampering with 403 Nice Try', async () => {
        const res = await request(app)
            .post('/api/site-config')
            .set('Authorization', authHeader)
            .send({ admin_password: 'hacked_password' });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Nice try');
    });

    test('POST /api/site-config rejects username tampering with 403 Nice Try', async () => {
        const res = await request(app)
            .post('/api/site-config')
            .set('Authorization', authHeader)
            .send({ admin_username: 'new_admin_user' });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Nice try');
    });

    test('POST /api/site-config rejects site_id tampering with 403 Nice Try', async () => {
        const res = await request(app)
            .post('/api/site-config')
            .set('Authorization', authHeader)
            .send({ site_id: 'changed-site-id' });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Nice try');
    });

    test('POST /api/site-config allows updating benign fields', async () => {
        const res = await request(app)
            .post('/api/site-config')
            .set('Authorization', authHeader)
            .send({ site_name: 'Updated Plant Name', timezone: 'America/New_York' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config.site_name).toBe('Updated Plant Name');
    });
});

describe('Sunday 11:00 PM Weekly Audit Reset Protocol (SSoT §9.4)', () => {
    test('Calculates previous Sunday 11:00 PM correctly', () => {
        // Test with Monday 9:00 AM (2026-09-07 09:00)
        const monday = new Date(2026, 8, 7, 9, 0, 0); // Month is 0-indexed (8 = Sep)
        const epoch = getLatestSunday11PMEpoch(monday);
        const resetDate = new Date(epoch);
        expect(resetDate.getDay()).toBe(0); // Sunday
        expect(resetDate.getHours()).toBe(23); // 11 PM
        expect(resetDate.getDate()).toBe(6); // Sep 6
    });

    test('Calculates Sunday before 11 PM as previous week reset', () => {
        // Sunday at 22:30 (10:30 PM) -> Should reset back 7 days to prior Sunday
        const sundayNight = new Date(2026, 8, 6, 22, 30, 0);
        const epoch = getLatestSunday11PMEpoch(sundayNight);
        const resetDate = new Date(epoch);
        expect(resetDate.getDay()).toBe(0);
        expect(resetDate.getHours()).toBe(23);
        expect(resetDate.getDate()).toBe(30); // Aug 30
    });

    test('processWeeklyAuditReset zeroes Mobile Cranes blend_audit checkmarks', () => {
        const staleReset = new Date(2026, 7, 1).getTime(); // August 1 (stale)
        const mockData = {
            last_audit_reset: staleReset,
            categories: [
                {
                    name: 'Mobile Cranes',
                    items: [
                        { name: 'Crane 1', blend_audit: true },
                        { name: 'Crane 2', blend_audit: false }
                    ]
                },
                {
                    name: 'Locomotives',
                    items: [
                        { name: 'Engine 101', blend_audit: true } // Should NOT be modified
                    ]
                }
            ]
        };

        const changed = processWeeklyAuditReset(mockData);
        expect(changed).toBe(true);
        expect(mockData.categories[0].items[0].blend_audit).toBe(false);
        expect(mockData.categories[0].items[1].blend_audit).toBe(false);
        // Non-crane categories should remain untouched
        expect(mockData.categories[1].items[0].blend_audit).toBe(true);
        expect(mockData.last_audit_reset).toBeGreaterThan(staleReset);
    });

    test('processWeeklyAuditReset is idempotent if already reset this week', () => {
        const currentReset = getLatestSunday11PMEpoch();
        const mockData = {
            last_audit_reset: currentReset,
            categories: [
                {
                    name: 'Mobile Cranes',
                    items: [{ name: 'Crane 1', blend_audit: true }]
                }
            ]
        };

        const changed = processWeeklyAuditReset(mockData);
        expect(changed).toBe(false);
        // Checkmark preserved because audit was already reset after Sunday 11:00 PM
        expect(mockData.categories[0].items[0].blend_audit).toBe(true);
    });
});

describe('Control Panel CRUD & Operational Endpoints', () => {
    test('GET and POST /api/equipment', async () => {
        const payload = {
            categories: [
                {
                    name: 'Material Handlers',
                    items: [{ name: 'MH-01', status: 'operational', notes: 'Checked' }]
                }
            ]
        };

        const postRes = await request(app)
            .post('/api/equipment')
            .set('Authorization', authHeader)
            .send(payload);
        expect(postRes.status).toBe(200);
        expect(postRes.body.success).toBe(true);

        const getRes = await request(app)
            .get('/api/equipment')
            .set('Authorization', authHeader);
        expect(getRes.status).toBe(200);
        expect(getRes.body.categories).toHaveLength(1);
        expect(getRes.body.categories[0].name).toBe('Material Handlers');
        expect(getRes.body.last_audit_reset).toBeDefined();
    });

    test('GET and POST /api/reminders with !LIMIT transformation', async () => {
        const rawMarkdown = '# Safety Reminder\n!LIMIT 02-04\nWatch your pinch points.';
        const postRes = await request(app)
            .post('/api/reminders')
            .set('Authorization', authHeader)
            .set('Content-Type', 'text/plain')
            .send(rawMarkdown);
        expect(postRes.status).toBe(200);

        const getRes = await request(app)
            .get('/api/reminders')
            .set('Authorization', authHeader);
        expect(getRes.status).toBe(200);
        expect(getRes.text).toContain('!EXPIRE');
        expect(getRes.text).toContain('Watch your pinch points.');
    });

    test('GET and POST /api/features', async () => {
        const featureConfig = {
            theme_mode: 'obsidian',
            features: { osha_counter: true, weather_fx: false }
        };
        const postRes = await request(app)
            .post('/api/features')
            .set('Authorization', authHeader)
            .send(featureConfig);
        expect(postRes.status).toBe(200);

        const getRes = await request(app)
            .get('/api/features')
            .set('Authorization', authHeader);
        expect(getRes.status).toBe(200);
        expect(getRes.body.theme_mode).toBe('obsidian');
        expect(getRes.body.features.weather_fx).toBe(false);
    });

    test('GET /api/scripts lists runners alphabetically', async () => {
        const res = await request(app)
            .get('/api/scripts')
            .set('Authorization', authHeader);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        for (let i = 0; i < res.body.length - 1; i++) {
            expect(res.body[i].name.localeCompare(res.body[i+1].name)).toBeLessThanOrEqual(0);
        }
    });

    test('GET and POST /api/commodity-rules', async () => {
        const rules = {
            categories: [
                { id: 'custom_scrap', name: 'Custom Scrap', color: '#ff0000', keywords: ['SCRAP'] }
            ],
            default_color: '#38bdf8'
        };
        const postRes = await request(app)
            .post('/api/commodity-rules')
            .set('Authorization', authHeader)
            .send(rules);
        expect(postRes.status).toBe(200);
        expect(postRes.body.count).toBe(1);

        const getRes = await request(app)
            .get('/api/commodity-rules')
            .set('Authorization', authHeader);
        expect(getRes.status).toBe(200);
        expect(getRes.body.categories[0].id).toBe('custom_scrap');
    });
});

describe('SVG Track Map Upload & Security Sanitization (SSoT §8 / Security Hardening)', () => {
    test('Rejects non-SVG content', async () => {
        const res = await request(app)
            .post('/api/track-map/upload')
            .set('Authorization', authHeader)
            .attach('file', Buffer.from('<html><body>Not an SVG</body></html>'), 'test.svg');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('valid SVG');
    });

    test('Rejects SVG containing <script> tags', async () => {
        const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        const res = await request(app)
            .post('/api/track-map/upload')
            .set('Authorization', authHeader)
            .attach('file', Buffer.from(maliciousSvg), 'xss.svg');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('script tags which are not allowed');
    });

    test('Rejects SVG containing <foreignObject> elements', async () => {
        const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe></iframe></foreignObject></svg>';
        const res = await request(app)
            .post('/api/track-map/upload')
            .set('Authorization', authHeader)
            .attach('file', Buffer.from(maliciousSvg), 'foreign.svg');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('foreignObject elements which are not allowed');
    });

    test('Rejects SVG containing inline event handlers (e.g. onload=)', async () => {
        const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><rect width="10" height="10"/></svg>';
        const res = await request(app)
            .post('/api/track-map/upload')
            .set('Authorization', authHeader)
            .attach('file', Buffer.from(maliciousSvg), 'onload.svg');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('event handler attributes which are not allowed');
    });

    test('Rejects SVG containing javascript: URIs in href', async () => {
        const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click</text></a></svg>';
        const res = await request(app)
            .post('/api/track-map/upload')
            .set('Authorization', authHeader)
            .attach('file', Buffer.from(maliciousSvg), 'href.svg');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('javascript: URIs which are not allowed');
    });

    test('Accepts clean SVG vector drawings', async () => {
        const cleanSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#00f0ff" id="track-01" data-capacity="15"/></svg>';
        const res = await request(app)
            .post('/api/track-map/upload')
            .set('Authorization', authHeader)
            .attach('file', Buffer.from(cleanSvg), 'clean-track-map.svg');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
