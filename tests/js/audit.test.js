const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.NODE_ENV = 'test';
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yardstik-audit-test-'));
process.env.DATA_DIR = testDir;
process.env.CONFIG_PATH = path.join(testDir, 'config.json');
process.env.DB_PATH = path.join(testDir, 'yardstik.db');
process.env.RUNNERS_DIR = path.resolve(__dirname, '../../control-panel/runners');

const TEST_ADMIN = 'admin';
const TEST_PASS = 'secret123';
fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
    admin_username: TEST_ADMIN,
    admin_password: TEST_PASS
}, null, 2));

const { logAction, queryAuditLogs, exportAuditLogsCsv, pruneAuditLogs } = require('../../control-panel/lib/audit');
const { app } = require('../../control-panel/server');

afterAll(() => {
    try {
        fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
});

describe('1. Audit Logging Core Engine', () => {
    test('Records structured audit event in SQLite table', () => {
        const id = logAction({
            user: { id: 'usr_123', username: 'john_doe', role: 'maintenance' },
            action: 'equipment.update',
            details: 'Changed Crane 4 to PM: Oil leak'
        });
        expect(id).toBeDefined();

        const result = queryAuditLogs({ action: 'equipment.update' });
        expect(result.total).toBeGreaterThan(0);
        const match = result.logs.find(l => l.id === id);
        expect(match).toBeDefined();
        expect(match.username).toBe('john_doe');
        expect(match.role).toBe('maintenance');
        expect(match.details).toContain('Oil leak');
    });

    test('Queries audit logs with search filtering', () => {
        logAction({
            user: { id: 'usr_admin', username: 'admin', role: 'admin' },
            action: 'config.update',
            details: 'Updated plant site coordinates'
        });

        const searchResult = queryAuditLogs({ search: 'coordinates' });
        expect(searchResult.logs.length).toBeGreaterThan(0);
        expect(searchResult.logs[0].details).toContain('coordinates');
    });

    test('Exports RFC-4180 compliant CSV', () => {
        const csv = exportAuditLogsCsv();
        expect(csv).toContain('"Timestamp","Username","Role","Action","Details","IP Address"');
        expect(csv).toContain('john_doe');
        expect(csv).toContain('equipment.update');
    });

    test('Prunes old logs when exceeding limit', () => {
        for (let i = 0; i < 20; i++) {
            logAction({
                user: { username: 'bulk_tester', role: 'viewer' },
                action: 'bulk.test',
                details: `Log entry #${i}`
            });
        }
        pruneAuditLogs(10);
        const res = queryAuditLogs({ limit: 100 });
        expect(res.total).toBeLessThanOrEqual(10);
    });
});

describe('2. Audit Logging REST Endpoints', () => {
    let adminToken;

    beforeAll(async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: TEST_ADMIN, password: TEST_PASS });
        adminToken = loginRes.body.token;
    });

    test('State mutation (equipment save) automatically triggers audit log entry', async () => {
        await request(app)
            .post('/api/equipment')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ categories: [{ name: 'Locomotives', items: [{ name: 'Engine 505', status: 'OK' }] }] });

        const auditRes = await request(app)
            .get('/api/audit-logs?action=equipment')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(auditRes.status).toBe(200);
        expect(auditRes.body.logs.length).toBeGreaterThan(0);
        expect(auditRes.body.logs[0].action).toBe('equipment.update');
    });

    test('GET /api/audit-logs/export downloads CSV file', async () => {
        const res = await request(app)
            .get('/api/audit-logs/export')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.text).toContain('"Timestamp","Username","Role"');
    });
});
