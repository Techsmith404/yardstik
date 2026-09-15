// api/auth.js - Vercel Serverless Function for Cloud Authentication & RBAC (Issue #14)

const crypto = require('crypto');
const {
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
    ensureAdminUser
} = require('./lib/cloud-auth');

module.exports = async function handler(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || (req.headers.origin || 'null');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PATCH,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const siteId = req.query.site || (req.body && req.body.site_id) || process.env.DEFAULT_SITE_ID || 'default-site';

    // Parse sub-path from URL
    const urlParts = (req.url || '').split('?');
    const pathName = urlParts[0].replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');

    // ── 1. GET /api/auth/me ─────────────────────────────────────────────────
    if (req.method === 'GET' && (pathName === 'me' || pathName === '')) {
        const token = getAuthToken(req);
        if (!token) {
            return res.status(200).json({ authenticated: false, user: null });
        }
        const sess = await getSession(siteId, token);
        if (!sess) {
            return res.status(200).json({ authenticated: false, user: null });
        }
        return res.status(200).json({
            authenticated: true,
            user: {
                id: sess.userId,
                username: sess.username,
                displayName: sess.displayName,
                role: sess.role
            }
        });
    }

    // ── 2. POST /api/auth/login ─────────────────────────────────────────────
    if (req.method === 'POST' && pathName === 'login') {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const users = await ensureAdminUser(siteId);
        const cleanUser = username.trim().toLowerCase();
        const user = users[cleanUser];

        if (!user || !user.active) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isValid = verifyPassword(password, user.password_hash, user.salt);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const sessionData = {
            token,
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            expiresAt
        };

        await saveSession(siteId, token, sessionData, 7 * 24 * 60 * 60);
        await logAudit(siteId, {
            req,
            user,
            action: 'auth.login',
            details: `Cloud user login: ${user.username} (${user.role})`
        });

        res.setHeader('Set-Cookie', `yardstik_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role
            }
        });
    }

    // ── 3. POST /api/auth/logout ────────────────────────────────────────────
    if (req.method === 'POST' && pathName === 'logout') {
        const token = getAuthToken(req);
        if (token) {
            const sess = await getSession(siteId, token);
            await deleteSession(siteId, token);
            if (sess) {
                await logAudit(siteId, {
                    req,
                    user: { id: sess.userId, username: sess.username },
                    action: 'auth.logout',
                    details: `Cloud user logout: ${sess.username}`
                });
            }
        }
        res.setHeader('Set-Cookie', 'yardstik_session=; Path=/; HttpOnly; Max-Age=0');
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }

    // ── 4. GET /api/auth/verify-invite ──────────────────────────────────────
    if (req.method === 'GET' && pathName === 'verify-invite') {
        const token = req.query.token;
        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token is required' });
        }

        const invites = await getInvites(siteId);
        const invite = invites.find(i => i.token === token && !i.usedAt && new Date(i.expiresAt) > new Date());

        if (!invite) {
            return res.status(404).json({ valid: false, error: 'Invalid or expired invite token' });
        }

        return res.status(200).json({
            valid: true,
            invite: {
                token: invite.token,
                role: invite.role,
                expiresAt: invite.expiresAt
            }
        });
    }

    // ── 5. POST /api/auth/register ──────────────────────────────────────────
    if (req.method === 'POST' && pathName === 'register') {
        const { token, username, password, displayName } = req.body || {};
        if (!token || !username || !password) {
            return res.status(400).json({ error: 'Missing required registration fields' });
        }

        const cleanUsername = username.trim().toLowerCase();
        if (cleanUsername.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters long' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        const invites = await getInvites(siteId);
        const inviteIndex = invites.findIndex(i => i.token === token && !i.usedAt && new Date(i.expiresAt) > new Date());

        if (inviteIndex === -1) {
            return res.status(400).json({ error: 'Invalid or expired invitation token' });
        }

        const users = await getUsers(siteId);
        if (users[cleanUsername]) {
            return res.status(400).json({ error: 'Username is already in use' });
        }

        const invite = invites[inviteIndex];
        const { hash, salt } = hashPassword(password);
        const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
        const now = new Date().toISOString();

        const newUser = {
            id: userId,
            username: cleanUsername,
            displayName: (displayName || '').trim() || cleanUsername,
            role: invite.role || 'viewer',
            password_hash: hash,
            salt: salt,
            createdAt: now,
            active: 1
        };

        users[cleanUsername] = newUser;
        await saveUsers(siteId, users);

        // Mark invite redeemed
        invites[inviteIndex].usedAt = now;
        invites[inviteIndex].usedBy = userId;
        invites[inviteIndex].usedByUsername = cleanUsername;
        await saveInvites(siteId, invites);

        // Create initial session
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const sessionData = {
            token: sessionToken,
            userId: newUser.id,
            username: newUser.username,
            displayName: newUser.displayName,
            role: newUser.role,
            expiresAt
        };

        await saveSession(siteId, sessionToken, sessionData);
        await logAudit(siteId, {
            req,
            user: newUser,
            action: 'auth.register',
            details: `Registered account via invite: ${newUser.username} (${newUser.role})`
        });

        res.setHeader('Set-Cookie', `yardstik_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
        return res.status(200).json({
            success: true,
            token: sessionToken,
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                role: newUser.role
            }
        });
    }

    // ── 6. POST /api/auth/invite (Admin Only) ────────────────────────────────
    if (req.method === 'POST' && pathName === 'invite') {
        const token = getAuthToken(req);
        const sess = await getSession(siteId, token);
        const secretHeader = req.headers['x-sync-secret'];
        const isSecretAuth = process.env.SYNC_SECRET && secretHeader === process.env.SYNC_SECRET;

        if (!isSecretAuth && (!sess || sess.role !== 'admin')) {
            return res.status(403).json({ error: 'Admin role required to generate invitations' });
        }

        const { role = 'viewer', durationHours = 72 } = req.body || {};
        const cleanRole = ['admin', 'maintenance', 'viewer'].includes(role) ? role : 'viewer';
        const inviteToken = 'inv_' + crypto.randomBytes(16).toString('hex');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();

        const invite = {
            token: inviteToken,
            role: cleanRole,
            createdBy: sess ? sess.username : 'admin',
            createdAt: now.toISOString(),
            expiresAt
        };

        const invites = await getInvites(siteId);
        invites.unshift(invite);
        await saveInvites(siteId, invites);

        await logAudit(siteId, {
            req,
            user: sess ? { id: sess.userId, username: sess.username } : null,
            action: 'user.invite_created',
            details: `Created ${cleanRole} invite token: ${inviteToken}`
        });

        const host = req.headers.host || 'localhost';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const inviteUrl = `${protocol}://${host}/register.html?invite=${inviteToken}`;

        return res.status(200).json({
            success: true,
            invite,
            inviteUrl
        });
    }

    // ── 7. GET /api/auth/invites (Admin Only) ────────────────────────────────
    if (req.method === 'GET' && pathName === 'invites') {
        const token = getAuthToken(req);
        const sess = await getSession(siteId, token);
        if (!sess || sess.role !== 'admin') {
            return res.status(403).json({ error: 'Admin role required' });
        }

        const invites = await getInvites(siteId);
        return res.status(200).json(invites);
    }

    // ── 8. GET /api/auth/users (Admin Only) ──────────────────────────────────
    if (req.method === 'GET' && pathName === 'users') {
        const token = getAuthToken(req);
        const sess = await getSession(siteId, token);
        if (!sess || sess.role !== 'admin') {
            return res.status(403).json({ error: 'Admin role required' });
        }

        const usersMap = await getUsers(siteId);
        const userList = Object.values(usersMap).map(u => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            role: u.role,
            createdAt: u.createdAt,
            active: u.active
        }));
        return res.status(200).json(userList);
    }

    // ── 9. GET /api/auth/audit-logs (Admin Only) ─────────────────────────────
    if (req.method === 'GET' && pathName === 'audit-logs') {
        const token = getAuthToken(req);
        const sess = await getSession(siteId, token);
        if (!sess || sess.role !== 'admin') {
            return res.status(403).json({ error: 'Admin role required' });
        }

        const logs = await getAuditLogs(siteId);
        return res.status(200).json({ logs, total: logs.length });
    }

    return res.status(404).json({ error: 'Endpoint not found' });
};
