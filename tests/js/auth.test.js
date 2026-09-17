const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.NODE_ENV = 'test';
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yardstik-auth-test-'));
process.env.DATA_DIR = testDir;
process.env.CONFIG_PATH = path.join(testDir, 'config.json');
process.env.DB_PATH = path.join(testDir, 'yardstik.db');
process.env.RUNNERS_DIR = path.resolve(__dirname, '../../control-panel/runners');

// Seed test config with known credentials
const TEST_ADMIN = 'admin';
const TEST_PASS = 'secret123';
fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
    admin_username: TEST_ADMIN,
    admin_password: TEST_PASS,
    site_name: 'Auth Test Facility'
}, null, 2));

const {
    hashPassword,
    verifyPassword,
    createUser,
    verifyUser,
    listUsers,
    updateUserRole,
    deleteUser,
    createSession,
    getSessionUser,
    createInvite,
    verifyInviteToken,
    redeemInvite
} = require('../../control-panel/lib/auth');
const { app } = require('../../control-panel/server');

afterAll(() => {
    try {
        fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
});

describe('1. Cryptography & Password Security', () => {
    test('Hashes password with random salt and verifies correctly', () => {
        const password = 'IndustrialPass123!';
        const { hash, salt } = hashPassword(password);
        expect(hash).toBeDefined();
        expect(salt).toBeDefined();
        expect(typeof hash).toBe('string');
        expect(verifyPassword(password, hash, salt)).toBe(true);
        expect(verifyPassword('WrongPass', hash, salt)).toBe(false);
    });

    test('Generates different salts for identical passwords', () => {
        const p1 = hashPassword('SamePassword');
        const p2 = hashPassword('SamePassword');
        expect(p1.salt).not.toBe(p2.salt);
        expect(p1.hash).not.toBe(p2.hash);
    });
});

describe('2. User Account Lifecycle & Constraints', () => {
    let techUserId;

    test('Creates user with role and retrieves user list', () => {
        const user = createUser({
            username: 'tech_bob',
            password: 'BobSecurePassword123',
            displayName: 'Bob The Builder',
            role: 'maintenance'
        });
        expect(user.id).toBeDefined();
        expect(user.username).toBe('tech_bob');
        expect(user.role).toBe('maintenance');
        techUserId = user.id;

        const users = listUsers();
        expect(users.some(u => u.username === 'tech_bob')).toBe(true);
    });

    test('Prevents duplicate username registration', () => {
        expect(() => {
            createUser({
                username: 'tech_bob',
                password: 'AnotherPassword123',
                displayName: 'Bob Clone',
                role: 'viewer'
            });
        }).toThrow(/already in use/);
    });

    test('Updates user role', () => {
        const changed = updateUserRole(techUserId, 'admin');
        expect(changed).toBe(true);
        const users = listUsers();
        const updated = users.find(u => u.id === techUserId);
        expect(updated.role).toBe('admin');
        // Restore to maintenance
        updateUserRole(techUserId, 'maintenance');
    });

    test('Deletes user account', () => {
        const tempUser = createUser({
            username: 'temp_user',
            password: 'TempPassword123',
            role: 'viewer'
        });
        expect(deleteUser(tempUser.id)).toBe(true);
        const users = listUsers();
        expect(users.some(u => u.username === 'temp_user')).toBe(false);
    });
});

describe('3. Registration Invite Tokens Lifecycle', () => {
    test('Generates single-use invite and redeems successfully', () => {
        const invite = createInvite({ role: 'maintenance', createdBy: 'admin', durationHours: 24 });
        expect(invite.token).toBeDefined();
        expect(invite.role).toBe('maintenance');

        const validInvite = verifyInviteToken(invite.token);
        expect(validInvite).not.toBeNull();
        expect(validInvite.role).toBe('maintenance');

        const newUser = redeemInvite({
            token: invite.token,
            username: 'alice_maint',
            password: 'AlicePassword123',
            displayName: 'Alice Engineer'
        });
        expect(newUser.username).toBe('alice_maint');
        expect(newUser.role).toBe('maintenance');

        // Cannot redeem the same token twice
        expect(() => {
            redeemInvite({
                token: invite.token,
                username: 'impostor',
                password: 'ImpostorPassword123'
            });
        }).toThrow(/Invalid or expired/);
    });
});

describe('4. Session Management & Auth REST Endpoints', () => {
    let adminToken;
    let maintToken;

    test('POST /api/auth/login succeeds for valid admin', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: TEST_ADMIN, password: TEST_PASS });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.role).toBe('admin');
        adminToken = res.body.token;
    });

    test('POST /api/auth/login fails for invalid password (401)', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: TEST_ADMIN, password: 'WrongPassword' });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Invalid username or password');
    });

    test('GET /api/auth/me returns authenticated user profile', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.authenticated).toBe(true);
        expect(res.body.user.username).toBe(TEST_ADMIN);
    });

    test('POST /api/auth/login succeeds for maintenance technician', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'tech_bob', password: 'BobSecurePassword123' });
        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('maintenance');
        maintToken = res.body.token;
    });

    test('POST /api/auth/logout clears session', async () => {
        const tempRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'alice_maint', password: 'AlicePassword123' });
        const tempToken = tempRes.body.token;

        const logoutRes = await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${tempToken}`);
        expect(logoutRes.status).toBe(200);

        const meRes = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${tempToken}`);
        expect(meRes.body.authenticated).toBe(false);

        // Even if browser sends cached Basic Auth, /api/auth/me must reject it without active session token
        const basicAuthHeader = 'Basic ' + Buffer.from(`${TEST_ADMIN}:${TEST_PASS}`).toString('base64');
        const basicMeRes = await request(app)
            .get('/api/auth/me')
            .set('Authorization', basicAuthHeader);
        expect(basicMeRes.body.authenticated).toBe(false);
        expect(basicMeRes.body.user).toBeNull();
    });
});

describe('5. Role-Based Access Control (RBAC) Enforcement', () => {
    let adminToken;
    let maintToken;

    beforeAll(async () => {
        const adminRes = await request(app).post('/api/auth/login').send({ username: TEST_ADMIN, password: TEST_PASS });
        adminToken = adminRes.body.token;
        const maintRes = await request(app).post('/api/auth/login').send({ username: 'tech_bob', password: 'BobSecurePassword123' });
        maintToken = maintRes.body.token;
    });

    test('Admin can access protected /api/users endpoint', async () => {
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('Maintenance user is FORBIDDEN (403) from accessing /api/users', async () => {
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${maintToken}`);
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Forbidden');
    });

    test('Maintenance user is FORBIDDEN (403) from accessing /api/site-config', async () => {
        const res = await request(app)
            .get('/api/site-config')
            .set('Authorization', `Bearer ${maintToken}`);
        expect(res.status).toBe(403);
    });

    test('Maintenance user IS ALLOWED (200) to update equipment status', async () => {
        const payload = {
            categories: [
                {
                    name: 'Mobile Cranes',
                    items: [{ name: 'Crane 1', status: 'PM', reason: 'Hydraulic Hose Check', blend_audit: true }]
                }
            ]
        };
        const res = await request(app)
            .post('/api/equipment')
            .set('Authorization', `Bearer ${maintToken}`)
            .send(payload);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('Unauthenticated request to /api/equipment POST is rejected (401)', async () => {
        const res = await request(app)
            .post('/api/equipment')
            .send({ categories: [] });
        expect(res.status).toBe(401);
    });
});

const { createRateLimiter } = require('../../control-panel/lib/rate-limit');

describe('6. Auth Rate Limiting Middleware (IDEA-S02)', () => {
    test('Allows requests up to limit and rejects subsequent requests with 429', () => {
        const limiter = createRateLimiter({
            windowMs: 60000,
            max: 3,
            message: { error: 'Too many attempts' }
        });

        const req = { ip: '192.168.1.50' };
        const res = {
            headers: {},
            statusCode: 200,
            setHeader(k, v) { this.headers[k] = v; },
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; }
        };
        let nextCalled = 0;
        const next = () => { nextCalled++; };

        // Attempt 1
        limiter(req, res, next);
        expect(nextCalled).toBe(1);
        expect(res.headers['RateLimit-Remaining']).toBe(2);

        // Attempt 2
        limiter(req, res, next);
        expect(nextCalled).toBe(2);
        expect(res.headers['RateLimit-Remaining']).toBe(1);

        // Attempt 3
        limiter(req, res, next);
        expect(nextCalled).toBe(3);
        expect(res.headers['RateLimit-Remaining']).toBe(0);

        // Attempt 4: Blocked with 429
        limiter(req, res, next);
        expect(nextCalled).toBe(3);
        expect(res.statusCode).toBe(429);
        expect(res.body.error).toContain('Too many attempts');
        expect(res.headers['Retry-After']).toBeDefined();
    });

    test('Differentiates between different client IP addresses', () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
        const res = {
            headers: {},
            statusCode: 200,
            setHeader(k, v) { this.headers[k] = v; },
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; }
        };

        limiter({ ip: '10.0.0.1' }, res, () => {});
        limiter({ ip: '10.0.0.1' }, res, () => {});
        // IP 1 hits limit
        limiter({ ip: '10.0.0.1' }, res, () => {});
        expect(res.statusCode).toBe(429);

        // IP 2 is separate and allowed
        res.statusCode = 200;
        let ip2NextCalled = false;
        limiter({ ip: '10.0.0.2' }, res, () => { ip2NextCalled = true; });
        expect(ip2NextCalled).toBe(true);
        expect(res.statusCode).toBe(200);
    });
});

const { getDb, runMigrations } = require('../../control-panel/lib/db');

describe('7. Database Migration Framework (IDEA-A02)', () => {
    test('Initializes DB with user_version >= 1', () => {
        const db = getDb();
        const row = db.prepare('PRAGMA user_version;').get();
        expect(Number(row.user_version)).toBeGreaterThanOrEqual(1);
    });

    test('Applies pending migrations in sequence and bumps user_version', () => {
        const db = getDb();
        const testMigrations = [
            { version: 100, description: 'Add test column', sql: 'ALTER TABLE users ADD COLUMN test_migrated TEXT DEFAULT NULL;' },
            { version: 101, description: 'Add custom index', sql: 'CREATE INDEX IF NOT EXISTS idx_users_test ON users(test_migrated);' }
        ];

        runMigrations(db, testMigrations);
        const row = db.prepare('PRAGMA user_version;').get();
        expect(Number(row.user_version)).toBe(101);

        // Verify column was added
        const users = db.prepare('SELECT test_migrated FROM users LIMIT 1;').all();
        expect(Array.isArray(users)).toBe(true);

        // Idempotency: Running migrations again leaves version unchanged
        runMigrations(db, testMigrations);
        const rowAfter = db.prepare('PRAGMA user_version;').get();
        expect(Number(rowAfter.user_version)).toBe(101);
    });
});
