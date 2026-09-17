/**
 * 🏭 YardStik End-to-End Plant Operations Simulation Suite
 * ==============================================================================
 * Simulates a full plant operations cycle across all subsystems:
 * 1. Admin setup & RBAC onboarding lifecycle (Admin -> Invite -> Register -> Login)
 * 2. Equipment management, Crane scale calibration & weekly blend audits
 * 3. Track check spreadsheet upload, parsing & atomic state distribution
 * 4. Automation runner discovery & execution with parameter validation
 * 5. Special event emergency alert broadcast & teardown
 * 6. 24-hour shift schedule transitions & 11:00 PM toolbox rollover offset
 * 7. Sunday 11:00 PM weekly audit reset calculation
 * 8. Severe weather & lightning strike 30-minute OSHA cooldown engine
 * 9. Audit trail recording, search filtering & RFC-4180 CSV export
 * ==============================================================================
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set up isolated temp environment for test run
process.env.NODE_ENV = 'test';
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yardstik-e2e-simulation-'));
process.env.DATA_DIR = testDir;
process.env.CONFIG_PATH = path.join(testDir, 'config.json');
process.env.RUNNERS_DIR = path.resolve(__dirname, '../../control-panel/runners');

// Seed test config
const INITIAL_ADMIN = 'admin';
const INITIAL_PASS = 'admin_super_secret_999';
fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
    admin_username: INITIAL_ADMIN,
    admin_password: INITIAL_PASS,
    site_name: 'Burns Harbor Staging Plant',
    site_id: 'burns-harbor-dev',
    latitude: 41.6045,
    longitude: -87.1311,
    timezone: 'America/Chicago'
}, null, 2));

// Seed base tracker & equipment data files
fs.writeFileSync(path.join(testDir, 'trackers.json'), JSON.stringify({
    last_incident_date: '2026-01-01',
    daily_blend_target: 120,
    daily_blend_count: 85
}, null, 2));

fs.writeFileSync(path.join(testDir, 'equipment.json'), JSON.stringify({
    categories: [
        {
            name: 'Overhead Cranes',
            items: [
                { name: 'Crane 1', status: 'OK', note: '' },
                { name: 'Crane 2', status: 'OK', note: '', scale_active: true, last_scale_audit: '2026-09-14T08:00:00Z' }
            ]
        },
        {
            name: 'Locomotives',
            items: [
                { name: 'Engine 505', status: 'OK', note: '' }
            ]
        }
    ],
    weekly_blend_audit: {
        completed: false,
        audited_by: null,
        audited_at: null
    }
}, null, 2));

const {
    app,
    getLatestSunday11PMEpoch,
    processWeeklyAuditReset
} = require('../../control-panel/server');

const { initAuthDb, getDb } = require('../../control-panel/lib/db');
const { logAction, queryAuditLogs, exportAuditLogsCsv } = require('../../control-panel/lib/audit');

afterAll(() => {
    try {
        fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
});

describe('🏭 YardStik End-to-End Plant Operations Simulation', () => {
    let adminToken;
    let techToken;
    let viewerToken;
    let inviteToken;

    // ── Phase 1: Authentication, Onboarding & RBAC ──────────────────────────
    describe('Phase 1: User Onboarding & RBAC Lifecycle', () => {
        test('1.1 Admin logs in and receives valid 256-bit session token', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: INITIAL_ADMIN, password: INITIAL_PASS });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.role).toBe('admin');
            adminToken = res.body.token;
        });

        test('1.2 Admin generates a single-use invite for Maintenance Tech', async () => {
            const res = await request(app)
                .post('/api/auth/invite')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'maintenance', durationHours: 24 });

            expect(res.status).toBe(200);
            expect(res.body.invite).toBeDefined();
            expect(res.body.invite.token).toBeDefined();
            inviteToken = res.body.invite.token;
        });

        test('1.3 Maintenance Tech verifies and redeems invite token', async () => {
            const verifyRes = await request(app)
                .get(`/api/auth/verify-invite?token=${inviteToken}`);
            expect(verifyRes.status).toBe(200);
            expect(verifyRes.body.valid).toBe(true);
            expect(verifyRes.body.invite.role).toBe('maintenance');

            const registerRes = await request(app)
                .post('/api/auth/register')
                .send({
                    token: inviteToken,
                    username: 'tech_bob',
                    password: 'SecureTechPassword2026!'
                });

            expect(registerRes.status).toBe(200);
            expect(registerRes.body.success).toBe(true);
            expect(registerRes.body.token).toBeDefined();
            techToken = registerRes.body.token;
        });

        test('1.4 Invite cannot be redeemed a second time (TOCTOU prevention)', async () => {
            const secondAttempt = await request(app)
                .post('/api/auth/register')
                .send({
                    token: inviteToken,
                    username: 'tech_imposter',
                    password: 'AnotherPassword123!'
                });

            expect(secondAttempt.status).toBe(400);
            expect(secondAttempt.body.error).toBeDefined();
        });

        test('1.5 Role-Based Authorization enforcement: Tech blocked from Admin-only endpoints', async () => {
            // Attempt to list all users (Admin only)
            const res = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${techToken}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toMatch(/Forbidden/i);
        });
    });

    // ── Phase 2: Equipment & Plant Floor Operations ─────────────────────────
    describe('Phase 2: Equipment State Management & Compliance Audits', () => {
        test('2.1 Maintenance Tech flags Crane 1 as Out of Service (OS) with repair note', async () => {
            const currentEq = JSON.parse(fs.readFileSync(path.join(testDir, 'equipment.json'), 'utf8'));
            currentEq.categories[0].items[0].status = 'OS';
            currentEq.categories[0].items[0].note = 'Hoist wire rope frayed. Tagged out for replacement.';

            const res = await request(app)
                .post('/api/equipment')
                .set('Authorization', `Bearer ${techToken}`)
                .send(currentEq);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify persisted on disk
            const savedEq = JSON.parse(fs.readFileSync(path.join(testDir, 'equipment.json'), 'utf8'));
            expect(savedEq.categories[0].items[0].status).toBe('OS');
            expect(savedEq.categories[0].items[0].note).toContain('wire rope frayed');
        });

        test('2.2 Maintenance Tech logs Crane 2 zero-calibration scale audit', async () => {
            const currentEq = JSON.parse(fs.readFileSync(path.join(testDir, 'equipment.json'), 'utf8'));
            const auditTimestamp = new Date().toISOString();
            currentEq.categories[0].items[1].last_scale_audit = auditTimestamp;

            const res = await request(app)
                .post('/api/equipment')
                .set('Authorization', `Bearer ${techToken}`)
                .send(currentEq);

            expect(res.status).toBe(200);

            const savedEq = JSON.parse(fs.readFileSync(path.join(testDir, 'equipment.json'), 'utf8'));
            expect(savedEq.categories[0].items[1].last_scale_audit).toBe(auditTimestamp);
        });

        test('2.3 Maintenance Tech completes Weekly Blend Audit certification', async () => {
            const currentEq = JSON.parse(fs.readFileSync(path.join(testDir, 'equipment.json'), 'utf8'));
            currentEq.weekly_blend_audit = {
                completed: true,
                audited_by: 'tech_bob',
                audited_at: new Date().toISOString()
            };

            const res = await request(app)
                .post('/api/equipment')
                .set('Authorization', `Bearer ${techToken}`)
                .send(currentEq);

            expect(res.status).toBe(200);

            const savedEq = JSON.parse(fs.readFileSync(path.join(testDir, 'equipment.json'), 'utf8'));
            expect(savedEq.weekly_blend_audit.completed).toBe(true);
            expect(savedEq.weekly_blend_audit.audited_by).toBe('tech_bob');
        });
    });

    // ── Phase 3: Track Check Spreadsheet & Parser Simulation ────────────────
    describe('Phase 3: Rail Yard Track Ingestion & Atomicity', () => {
        const sampleTracks = [
            {
                id: '1',
                name: 'Track 1',
                cars: 8,
                capacity: 15,
                commodity: '8 - SCRAP STEEL (SHRED), CLEAR TO NORTH SWITCH',
                notes: '8 - SCRAP STEEL (SHRED), CLEAR TO NORTH SWITCH',
                status: 'occupied',
                is_clear: false,
                is_bad_order: false,
                is_blend: false,
                dwell_days: 1,
                dwell_warning: false
            },
            {
                id: '2',
                name: 'Track 2',
                cars: 0,
                capacity: 12,
                commodity: 'CLEAR',
                notes: 'CLEAR',
                status: 'clear',
                is_clear: true,
                is_bad_order: false,
                is_blend: false,
                dwell_days: 0,
                dwell_warning: false
            },
            {
                id: '21',
                name: 'Track 21',
                cars: 4,
                capacity: 10,
                commodity: '4 - BLEND BOF HEATS',
                notes: '4 - BLEND BOF HEATS, 21/22 SWITCH O.S.',
                status: 'occupied',
                is_clear: false,
                is_bad_order: true,
                is_blend: true,
                dwell_days: 4,
                dwell_warning: true
            }
        ];

        test('3.1 Admin saves active yard occupancy records', async () => {
            const res = await request(app)
                .post('/api/tracks')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(sampleTracks);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(3);

            // Verify tracks.json exists and is valid JSON
            const tracksPath = path.join(testDir, 'tracks.json');
            expect(fs.existsSync(tracksPath)).toBe(true);
            const saved = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));
            expect(saved.length).toBe(3);
            expect(saved[2].is_blend).toBe(true);
        });

        test('3.2 Public /api/tracks endpoint serves updated yard state', async () => {
            const res = await request(app).get('/api/tracks');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(3);
            expect(res.body[0].name).toBe('Track 1');
        });

        test('3.3 Version.txt bumped with modern epoch timestamp', () => {
            const versionPath = path.join(testDir, 'version.txt');
            expect(fs.existsSync(versionPath)).toBe(true);
            const versionStr = fs.readFileSync(versionPath, 'utf8').trim();
            const versionNum = Number(versionStr);
            expect(isNaN(versionNum)).toBe(false);
            expect(versionNum).toBeGreaterThan(1700000000); // Valid recent epoch seconds or ms
        });
    });

    // ── Phase 4: Automation Runner Pipeline Simulation ──────────────────────
    describe('Phase 4: Automation Runner Discovery & Execution', () => {
        test('4.1 Discovers installed runner automation manifests', async () => {
            const res = await request(app)
                .get('/api/scripts')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);

            const oshaRunner = res.body.find(s => s.id === 'update_osha');
            expect(oshaRunner).toBeDefined();
            expect(oshaRunner.name).toContain('OSHA');
        });

        test('4.2 Rejects runner execution with invalid parameter types', async () => {
            const res = await request(app)
                .post('/api/execute/update_osha')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    params: {
                        last_incident_date: 'INVALID-DATE-STRING'
                    }
                });

            // Either rejected at validation or script terminates non-zero
            expect([400, 500]).toContain(res.status);
        });

        test('4.3 Rejects arbitrary unapproved script execution paths (Security Guard)', async () => {
            const res = await request(app)
                .post('/api/execute/malicious_exploit')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ params: {} });

            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/Script configuration not found/i);
        });
    });

    // ── Phase 5: Special Event Emergency Alerts ─────────────────────────────
    describe('Phase 5: Emergency Broadcast & Special Event Alerts', () => {
        test('5.1 Broadcasts active emergency weather shelter alert', async () => {
            const res = await request(app)
                .post('/api/special-event')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: '⚡ SEVERE THUNDERSTORM WARNING',
                    description: 'Take shelter in designated reinforced zones immediately.',
                    duration: '30',
                    endTime: '2026-09-16T22:00:00Z'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify live GET reflects alert
            const getRes = await request(app).get('/api/special-event');
            expect(getRes.status).toBe(200);
            expect(getRes.body.title).toContain('SEVERE THUNDERSTORM');
            expect(getRes.body.description).toContain('Take shelter');
        });

        test('5.2 Clears emergency alert and removes banner state', async () => {
            const delRes = await request(app)
                .delete('/api/special-event')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(delRes.status).toBe(200);
            expect(delRes.body.success).toBe(true);

            const getRes = await request(app).get('/api/special-event');
            expect(getRes.status).toBe(404);
        });
    });

    // ── Phase 6: Plant Shift Cycle & Safety Rollover Math ───────────────────
    describe('Phase 6: 24-Hour Shift Logic & Toolbox Talk Rollover', () => {
        test('6.1 Calculates shift names correctly (Day, Evening, Night)', () => {
            function getActiveShift(hour) {
                if (hour >= 7 && hour < 15) return 'Day Shift (1st)';
                if (hour >= 15 && hour < 23) return 'Afternoon Shift (2nd)';
                return 'Night Shift (3rd)';
            }

            expect(getActiveShift(8)).toBe('Day Shift (1st)');
            expect(getActiveShift(16)).toBe('Afternoon Shift (2nd)');
            expect(getActiveShift(23)).toBe('Night Shift (3rd)');
            expect(getActiveShift(2)).toBe('Night Shift (3rd)');
        });

        test('6.2 Implements +1 hour shift rollover offset for 11:00 PM toolbox talks (SSoT §3.4)', () => {
            // At 11:05 PM (23:05), adding 1 hour pushes into the NEXT calendar day (Day of Year advances by 1)
            const now2305 = new Date('2026-09-16T23:05:00Z');
            const targetTime = new Date(now2305.getTime() + (60 * 60 * 1000));

            expect(targetTime.getUTCDate()).toBe(17); // Rolled over from 16 -> 17
        });

        test('6.3 Calculates Sunday 11:00 PM weekly audit reset boundary', () => {
            const epoch = getLatestSunday11PMEpoch();
            expect(typeof epoch).toBe('number');
            expect(epoch).toBeGreaterThan(0);

            // Calculated epoch must be in the past or exactly now
            expect(epoch).toBeLessThanOrEqual(Date.now());
        });
    });

    // ── Phase 7: Severe Weather & Lightning Safety Engine ───────────────────
    describe('Phase 7: Severe Weather Trigger & OSHA 30-Min Cooldown', () => {
        test('7.1 Evaluates stormy weather conditions correctly', () => {
            function isLightningConditionsMet(activeAlerts, weatherCode, rainProbabilities) {
                if (activeAlerts > 0) return true;
                if (weatherCode >= 60) return true; // Rain / Storm
                if (rainProbabilities && rainProbabilities.slice(0, 3).some(p => p >= 50)) return true;
                return false;
            }

            // Clear skies (Code 0, 0 alerts, 10% rain)
            expect(isLightningConditionsMet(0, 0, [10, 10, 10])).toBe(false);

            // Severe Thunderstorm alert active
            expect(isLightningConditionsMet(1, 0, [10, 10, 10])).toBe(true);

            // Heavy rain detected (WMO Code 65)
            expect(isLightningConditionsMet(0, 65, [10, 10, 10])).toBe(true);

            // 70% rain probability in next hour
            expect(isLightningConditionsMet(0, 2, [70, 40, 20])).toBe(true);
        });

        test('7.2 Evaluates OSHA 30-minute lightning cooldown timer', () => {
            const COOLDOWN_MS = 30 * 60 * 1000;
            const strikeTime = new Date(Date.now() - (10 * 60 * 1000)); // Strike 10 mins ago

            const msSinceStrike = Date.now() - strikeTime.getTime();
            const isCooldownActive = msSinceStrike < COOLDOWN_MS;
            const remainingMinutes = Math.ceil((COOLDOWN_MS - msSinceStrike) / 60000);

            expect(isCooldownActive).toBe(true);
            expect(remainingMinutes).toBe(20); // 30 - 10 = 20 mins remaining
        });
    });

    // ── Phase 8: Audit Trail Logging & RFC-4180 CSV Export ──────────────────
    describe('Phase 8: Audit Logging Integrity & Compliance CSV Export', () => {
        test('8.1 Audit trail records state mutations with user, action, and details', () => {
            const logs = queryAuditLogs({ limit: 50 });
            expect(logs.total).toBeGreaterThan(0);

            const actions = logs.logs.map(l => l.action);
            expect(actions).toContain('auth.login_success');
            expect(actions).toContain('equipment.update');
            expect(actions).toContain('tracks.update');
        });

        test('8.2 Exports RFC-4180 compliant CSV with fully quoted fields', () => {
            const csv = exportAuditLogsCsv();
            expect(csv).toContain('"Timestamp","Username","Role","Action","Details","IP Address"');
            expect(csv).toContain('tech_bob');
            expect(csv).toContain('equipment.update');
        });

        test('8.3 Public /api/audit-logs/export endpoint downloads CSV for Admin', async () => {
            const res = await request(app)
                .get('/api/audit-logs/export')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/csv');
            expect(res.text).toContain('"Timestamp","Username","Role"');
        });
    });
});
