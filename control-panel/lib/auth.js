const crypto = require('crypto');
const fs = require('fs');
const { getDb } = require('./db');

const SESSION_DURATION_HOURS = 24 * 7; // 7 days session
const INVITE_DURATION_HOURS = 72; // 72 hours invite validity

// Hash password with unique salt using scrypt
function hashPassword(password, salt) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
}

// Constant-time password verification to prevent timing attacks
function verifyPassword(password, hash, salt) {
    const hashedAttempt = crypto.scryptSync(password, salt, 64);
    const storedHash = Buffer.from(hash, 'hex');
    if (hashedAttempt.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(hashedAttempt, storedHash);
}

// Seed default admin from config.json (or environment) if no users exist
function seedDefaultAdminIfNeeded(configPath) {
    const db = getDb();
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const result = countStmt.get();
    if (result && result.count > 0) return;

    let username = process.env.AUTH_USERNAME || 'admin';
    let password = process.env.AUTH_PASSWORD || '';

    try {
        if (configPath && fs.existsSync(configPath)) {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (cfg.admin_username) username = cfg.admin_username;
            if (cfg.admin_password) password = cfg.admin_password;
        }
    } catch (e) {
        console.error('[Auth] Error reading config during admin seeding:', e.message);
    }

    // Default password if completely unset
    if (!password) {
        password = 'admin';
    }

    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();
    const userId = 'usr_' + crypto.randomBytes(6).toString('hex');

    const insertStmt = db.prepare(`
        INSERT INTO users (id, username, password_hash, salt, display_name, role, created_at, updated_at, active)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, 1)
    `);

    insertStmt.run(userId, username, hash, salt, 'System Administrator', now, now);
    console.log(`[Auth] Seeded initial admin account: ${username}`);
}

// User CRUD
function createUser({ username, password, displayName, role = 'viewer' }) {
    const db = getDb();
    const cleanUsername = (username || '').trim().toLowerCase();
    const cleanDisplayName = (displayName || '').trim() || cleanUsername;
    const cleanRole = ['admin', 'maintenance', 'viewer'].includes(role) ? role : 'viewer';

    if (!cleanUsername || cleanUsername.length < 3) {
        throw new Error('Username must be at least 3 characters long');
    }
    if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
    }

    const { hash, salt } = hashPassword(password);
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const insertStmt = db.prepare(`
        INSERT INTO users (id, username, password_hash, salt, display_name, role, created_at, updated_at, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    try {
        insertStmt.run(userId, cleanUsername, hash, salt, cleanDisplayName, cleanRole, now, now);
        return {
            id: userId,
            username: cleanUsername,
            displayName: cleanDisplayName,
            role: cleanRole,
            createdAt: now,
            active: 1
        };
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
            throw new Error('Username is already in use');
        }
        throw err;
    }
}

function verifyUser(username, password) {
    if (!username || !password) return null;
    const db = getDb();
    const cleanUsername = username.trim().toLowerCase();

    const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1');
    const user = stmt.get(cleanUsername);
    if (!user) return null;

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) return null;

    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        active: user.active
    };
}

function getUserById(userId) {
    const db = getDb();
    const stmt = db.prepare('SELECT id, username, display_name, role, created_at, updated_at, active FROM users WHERE id = ?');
    const user = stmt.get(userId);
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        active: user.active
    };
}

function listUsers() {
    const db = getDb();
    const stmt = db.prepare('SELECT id, username, display_name, role, created_at, updated_at, active FROM users ORDER BY created_at ASC');
    const rows = stmt.all();
    return rows.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        role: u.role,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        active: u.active
    }));
}

function updateUserRole(userId, newRole) {
    if (!['admin', 'maintenance', 'viewer'].includes(newRole)) {
        throw new Error('Invalid role specified');
    }
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?');
    const result = stmt.run(newRole, now, userId);
    return result.changes > 0;
}

function deleteUser(userId) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
}

// Session Management
function createSession(userId) {
    const db = getDb();
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

    const stmt = db.prepare(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    stmt.run(token, userId, now.toISOString(), expiresAt.toISOString());
    return { token, expiresAt: expiresAt.toISOString() };
}

function getSessionUser(token) {
    if (!token) return null;
    const db = getDb();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
        SELECT u.id, u.username, u.display_name, u.role, u.active, s.expires_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
    `);
    const row = stmt.get(token, now);
    if (!row) return null;

    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        active: row.active
    };
}

function deleteSession(token) {
    if (!token) return;
    const db = getDb();
    const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
    stmt.run(token);
}

function cleanupExpiredSessions() {
    const db = getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
    stmt.run(now);
}

// Invite Token Management
function createInvite({ role = 'viewer', createdBy = 'admin', durationHours = INVITE_DURATION_HOURS }) {
    const cleanRole = ['admin', 'maintenance', 'viewer'].includes(role) ? role : 'viewer';
    const db = getDb();
    const token = 'inv_' + crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    const stmt = db.prepare(`
        INSERT INTO invites (token, role, created_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(token, cleanRole, createdBy, now.toISOString(), expiresAt.toISOString());

    return {
        token,
        role: cleanRole,
        createdBy,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
    };
}

function verifyInviteToken(token) {
    if (!token) return null;
    const db = getDb();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
        SELECT * FROM invites
        WHERE token = ? AND used_at IS NULL AND expires_at > ?
    `);
    return stmt.get(token, now) || null;
}

function redeemInvite({ token, username, password, displayName }) {
    const invite = verifyInviteToken(token);
    if (!invite) {
        throw new Error('Invalid or expired invitation token');
    }

    const newUser = createUser({
        username,
        password,
        displayName,
        role: invite.role
    });

    const db = getDb();
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
        UPDATE invites
        SET used_at = ?, used_by = ?
        WHERE token = ?
    `);
    updateStmt.run(now, newUser.id, token);

    return newUser;
}

function listInvites() {
    const db = getDb();
    const stmt = db.prepare(`
        SELECT i.token, i.role, i.created_by, i.created_at, i.expires_at, i.used_at, u.username as used_by_username
        FROM invites i
        LEFT JOIN users u ON i.used_by = u.id
        ORDER BY i.created_at DESC
    `);
    return stmt.all();
}

function deleteInvite(token) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM invites WHERE token = ?');
    const res = stmt.run(token);
    return res.changes > 0;
}

module.exports = {
    hashPassword,
    verifyPassword,
    seedDefaultAdminIfNeeded,
    createUser,
    verifyUser,
    getUserById,
    listUsers,
    updateUserRole,
    deleteUser,
    createSession,
    getSessionUser,
    deleteSession,
    cleanupExpiredSessions,
    createInvite,
    verifyInviteToken,
    redeemInvite,
    listInvites,
    deleteInvite
};
