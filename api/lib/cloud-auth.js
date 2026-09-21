// api/lib/cloud-auth.js - Shared Cloud Auth & Redis Storage Layer for Vercel Serverless

const crypto = require('crypto');
const { getRedisClient } = require('./redis');

const memoryStore = {
    users: {},
    sessions: {},
    invites: {},
    audit_logs: []
};

function hashPassword(password, salt) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    try {
        const hashedAttempt = crypto.scryptSync(password, salt, 64);
        const storedHash = Buffer.from(hash, 'hex');
        if (hashedAttempt.length !== storedHash.length) return false;
        return crypto.timingSafeEqual(hashedAttempt, storedHash);
    } catch {
        return false;
    }
}

function getAuthToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)yardstik_session=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
    }
    return null;
}

async function getUsers(siteId) {
    const client = getRedisClient();
    if (!client) return memoryStore.users[siteId] || {};
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        const raw = await client.get(`kiosk:${siteId}:users`);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn('Error reading users from Redis:', e.message);
        return memoryStore.users[siteId] || {};
    }
}

async function saveUsers(siteId, users) {
    const client = getRedisClient();
    if (!client) {
        memoryStore.users[siteId] = users;
        return;
    }
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        await client.set(`kiosk:${siteId}:users`, JSON.stringify(users));
    } catch (e) {
        console.warn('Error saving users to Redis:', e.message);
        memoryStore.users[siteId] = users;
    }
}

async function getInvites(siteId) {
    const client = getRedisClient();
    if (!client) return memoryStore.invites[siteId] || [];
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        const raw = await client.get(`kiosk:${siteId}:invites`);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.warn('Error reading invites from Redis:', e.message);
        return memoryStore.invites[siteId] || [];
    }
}

async function saveInvites(siteId, invites) {
    const client = getRedisClient();
    if (!client) {
        memoryStore.invites[siteId] = invites;
        return;
    }
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        await client.set(`kiosk:${siteId}:invites`, JSON.stringify(invites));
    } catch (e) {
        console.warn('Error saving invites to Redis:', e.message);
        memoryStore.invites[siteId] = invites;
    }
}

async function getSession(siteId, token) {
    if (!token) return null;
    const client = getRedisClient();
    if (!client) {
        const sess = memoryStore.sessions[token];
        if (sess && new Date(sess.expiresAt) > new Date()) return sess;
        return null;
    }
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        const raw = await client.get(`kiosk:${siteId}:session:${token}`);
        if (!raw) return null;
        const sess = JSON.parse(raw);
        if (new Date(sess.expiresAt) > new Date()) return sess;
        return null;
    } catch (e) {
        console.warn('Error reading session from Redis:', e.message);
        return null;
    }
}

async function saveSession(siteId, token, sessionData, ttlSeconds = 604800) {
    const client = getRedisClient();
    if (!client) {
        memoryStore.sessions[token] = sessionData;
        return;
    }
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        await client.setex(`kiosk:${siteId}:session:${token}`, ttlSeconds, JSON.stringify(sessionData));
    } catch (e) {
        console.warn('Error saving session to Redis:', e.message);
        memoryStore.sessions[token] = sessionData;
    }
}

async function deleteSession(siteId, token) {
    if (!token) return;
    const client = getRedisClient();
    if (!client) {
        delete memoryStore.sessions[token];
        return;
    }
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        await client.del(`kiosk:${siteId}:session:${token}`);
    } catch (e) {
        console.warn('Error deleting session from Redis:', e.message);
    }
}

async function logAudit(siteId, { req, user, action, details }) {
    const client = getRedisClient();
    const record = {
        id: 'aud_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        timestamp: new Date().toISOString(),
        ip: (req && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'cloud')).toString().split(',')[0].trim(),
        user_id: user ? user.userId || user.id : null,
        username: user ? user.username : 'system',
        action: action,
        details: details || ''
    };

    if (!client) {
        memoryStore.audit_logs.unshift(record);
        if (memoryStore.audit_logs.length > 500) memoryStore.audit_logs.pop();
        return;
    }

    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        const key = `kiosk:${siteId}:audit_logs`;
        const raw = await client.get(key);
        let logs = raw ? JSON.parse(raw) : [];
        logs.unshift(record);
        if (logs.length > 500) logs = logs.slice(0, 500);
        await client.set(key, JSON.stringify(logs));
    } catch (e) {
        console.warn('Error logging audit to Redis:', e.message);
    }
}

async function getAuditLogs(siteId) {
    const client = getRedisClient();
    if (!client) {
        return memoryStore.audit_logs;
    }
    try {
        if (client.status === 'wait' || client.status === 'close') await client.connect();
        const raw = await client.get(`kiosk:${siteId}:audit_logs`);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

async function ensureAdminUser(siteId) {
    const users = await getUsers(siteId);
    if (Object.keys(users).length > 0) return users;

    const username = (process.env.AUTH_USERNAME || 'admin').trim().toLowerCase();
    const password = process.env.AUTH_PASSWORD || 'admin';
    const { hash, salt } = hashPassword(password);
    const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();

    users[username] = {
        id: userId,
        username: username,
        displayName: 'System Administrator',
        role: 'admin',
        password_hash: hash,
        salt: salt,
        createdAt: now,
        active: 1
    };

    await saveUsers(siteId, users);
    return users;
}

module.exports = {
    getRedisClient,
    hashPassword,
    verifyPassword,
    getAuthToken,
    getUsers,
    saveUsers,
    getInvites,
    saveInvites,
    getSession,
    saveSession,
    deleteSession,
    logAudit,
    getAuditLogs,
    ensureAdminUser,
    memoryStore
};
