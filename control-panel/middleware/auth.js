const crypto = require('crypto');
const fs = require('fs');
const { verifyUser, getSessionUser } = require('../lib/auth');

function getAuthConfig() {
    const configPath = process.env.CONFIG_PATH || '/opt/config.json';
    let username = process.env.AUTH_USERNAME || 'admin';
    let password = process.env.AUTH_PASSWORD || '';
    try {
        if (fs.existsSync(configPath)) {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (cfg.admin_username) username = cfg.admin_username;
            if (cfg.admin_password) password = cfg.admin_password;
        }
    } catch (e) {
        console.error('Error reading auth from config:', e);
    }
    return { username, password };
}

function getSessionToken(req) {
    // 1. Authorization: Bearer <token>
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    // 2. Cookie: session_token=<value>
    if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const c of cookies) {
            const eqIdx = c.trim().indexOf('=');
            if (eqIdx < 0) continue;
            const name = c.trim().slice(0, eqIdx);
            const val  = c.trim().slice(eqIdx + 1);
            if (name === 'session_token' && val) {
                return decodeURIComponent(val);
            }
        }
    }
    return null;
}

function getBasicAuthUser(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Basic ')) {
        const b64 = authHeader.slice(6).trim();
        const creds = Buffer.from(b64, 'base64').toString('utf8');
        const colon = creds.indexOf(':');
        if (colon >= 0) {
            const username = creds.slice(0, colon);
            const password = creds.slice(colon + 1);

            // 1. Try SQLite users
            const user = verifyUser(username, password);
            if (user) return user;

            // 2. Try legacy config with timingSafeEqual
            const legacy = getAuthConfig();
            if (legacy.username && legacy.password && username === legacy.username) {
                try {
                    const legacyOk = crypto.timingSafeEqual(
                        Buffer.from(password),
                        Buffer.from(legacy.password)
                    );
                    if (legacyOk) {
                        return {
                            id: 'usr_legacy_admin',
                            username: legacy.username,
                            displayName: 'System Admin',
                            role: 'admin',
                            active: 1
                        };
                    }
                } catch {
                    // Buffers of different lengths
                }
            }
        }
    }
    return null;
}

function authenticateUser(req, res, next) {
    // 1. Check Session Token
    const token = getSessionToken(req);
    if (token) {
        const sessionUser = getSessionUser(token);
        if (sessionUser) {
            req.user = sessionUser;
            req.sessionToken = token;
            return next();
        }
    }

    // 2. Check Basic Auth (for automated tests / runners / legacy CLI)
    const basicUser = getBasicAuthUser(req);
    if (basicUser) {
        req.user = basicUser;
        return next();
    }

    req.user = null;
    next();
}

function requireAuth(req, res, next) {
    if (!req.user) {
        res.set('WWW-Authenticate', 'Basic realm="Kiosk Control Panel"');
        return res.status(401).json({ error: 'Authentication required.' });
    }
    next();
}

function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            res.set('WWW-Authenticate', 'Basic realm="Kiosk Control Panel"');
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role.` });
        }
        next();
    };
}

module.exports = {
    getAuthConfig,
    getSessionToken,
    getBasicAuthUser,
    authenticateUser,
    requireAuth,
    requireRole
};
