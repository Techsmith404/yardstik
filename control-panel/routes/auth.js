const express = require('express');
const router = express.Router();
const {
    verifyUser,
    createSession,
    deleteSession,
    createInvite,
    verifyInviteToken,
    redeemInvite,
    listInvites,
    deleteInvite
} = require('../lib/auth');
const { logAction } = require('../lib/audit');
const { createRateLimiter } = require('../lib/rate-limit');
const { requireRole, getSessionToken } = require('../middleware/auth');

// Rate limit auth endpoints: max 20 login attempts per 15 minutes per IP (IDEA-S02)
const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

router.post('/login', loginLimiter, (req, res) => {
    try {
        const { username, password } = req.body || {};
        // Validate inputs before hitting the DB — prevents null audit log entries
        if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        const user = verifyUser(username, password);
        if (!user) {
            logAction({ req, user: null, action: 'auth.login_failed', details: `Failed login attempt for username: ${username}` });
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const session = createSession(user.id);
        logAction({ req, user, action: 'auth.login_success', details: `User ${user.username} logged in successfully.` });

        res.setHeader('Set-Cookie', `session_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
        res.json({
            success: true,
            token: session.token,
            user
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/logout', (req, res) => {
    try {
        const token = req.sessionToken || getSessionToken(req);
        if (token) {
            deleteSession(token);
        }
        if (req.user) {
            logAction({ req, user: req.user, action: 'auth.logout', details: `User ${req.user.username} logged out.` });
        }
        res.setHeader('Set-Cookie', 'session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/me', (req, res) => {
    // Session token MUST be present for interactive session auth state.
    // This prevents cached HTTP Basic Auth headers from triggering unwanted auto-login loops on login.html after logout.
    if (!req.user || !req.sessionToken) {
        return res.json({ authenticated: false, user: null });
    }
    res.json({
        authenticated: true,
        user: req.user
    });
});

router.post('/register', (req, res) => {
    try {
        const { token, username, password, displayName } = req.body;
        const newUser = redeemInvite({ token, username, password, displayName });
        const session = createSession(newUser.id);

        logAction({ req, user: newUser, action: 'auth.register', details: `New user registered: ${newUser.username} (${newUser.role})` });

        res.setHeader('Set-Cookie', `session_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
        res.json({
            success: true,
            token: session.token,
            user: newUser
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/verify-invite', (req, res) => {
    try {
        const { token } = req.query;
        const invite = verifyInviteToken(token);
        if (!invite) {
            return res.status(400).json({ valid: false, error: 'Invitation link is invalid or expired' });
        }
        res.json({ valid: true, invite: { role: invite.role, created_by: invite.created_by, expires_at: invite.expires_at } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/invite', requireRole(['admin']), (req, res) => {
    try {
        const { role, durationHours } = req.body;
        const invite = createInvite({
            role: role || 'maintenance',
            createdBy: req.user.username,
            durationHours: durationHours ? parseInt(durationHours, 10) : 72
        });

        logAction({ req, user: req.user, action: 'user.invite_created', details: `Created invite token for role: ${invite.role}` });

        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:1337';
        const inviteUrl = `${protocol}://${host}/register.html?invite=${invite.token}`;

        res.json({
            success: true,
            invite,
            inviteUrl
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/invites', requireRole(['admin']), (req, res) => {
    try {
        const invites = listInvites();
        res.json(invites);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/invites/:token', requireRole(['admin']), (req, res) => {
    try {
        deleteInvite(req.params.token);
        logAction({ req, user: req.user, action: 'user.invite_deleted', details: `Revoked invite token: ${req.params.token}` });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = {
    router,
    loginLimiter
};
