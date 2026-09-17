const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const { getDb } = require('./lib/db');
const {
    seedDefaultAdminIfNeeded,
    verifyUser,
    createUser,
    listUsers,
    getUserById,
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
} = require('./lib/auth');
const {
    logAction,
    queryAuditLogs,
    exportAuditLogsCsv,
    pruneAuditLogs
} = require('./lib/audit');
const { createRateLimiter } = require('./lib/rate-limit');
const { getLatestSunday11PMEpoch, isAuditResetCurrent } = require('./lib/audit-reset');
const { validateAndSanitizeSvg } = require('./lib/svg-sanitizer');

const app = express();

// Restrict CORS to configured origins only — never wildcard on an industrial panel
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false;
app.use(cors({ origin: corsOrigins, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/config.json';
const DATA_DIR = process.env.DATA_DIR || '/data';
const RUNNERS_DIR = process.env.RUNNERS_DIR || '/app/conf/runners';
const TRACKS_PATH = process.env.TRACKS_PATH || path.join(DATA_DIR, 'tracks.json');
const TRACK_MAP_PATH = process.env.TRACK_MAP_PATH || path.join(DATA_DIR, 'track-map.svg');
// 11 PM shift rollover offset in ms (1 hour) — configurable per SSoT §3.4
const SHIFT_ROLLOVER_OFFSET_MS = parseInt(process.env.SHIFT_ROLLOVER_OFFSET_MS || '3600000', 10);

/**
 * Bumps version.txt to trigger browser live-reload on all connected kiosk clients.
 * Standardised on milliseconds (Date.now()) for consistency across all callers.
 */
function bumpVersion() {
    try {
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
    } catch (e) {
        console.error('[Version] Failed to bump version.txt:', e.message);
    }
}

/** Fire-and-forget cloud sync with error logging (prevents unhandled rejections). */
function triggerSync() {
    syncToCloud().catch(e => console.warn('[Cloud Sync]', e.message));
}

// Global error handlers — catches unexpected async/sync failures
process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err);
});

// Initialize SQLite DB and seed admin account
seedDefaultAdminIfNeeded(CONFIG_PATH);

// Helper to get legacy auth config for fallback
function getAuthConfig() {
    let username = process.env.AUTH_USERNAME || 'admin';
    let password = process.env.AUTH_PASSWORD || '';
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (cfg.admin_username) username = cfg.admin_username;
            if (cfg.admin_password) password = cfg.admin_password;
        }
    } catch (e) {
        console.error('Error reading auth from config:', e);
    }
    return { username, password };
}

// ── Health Check Endpoint (IDEA-I01) ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// ── Auth & RBAC Middleware ──────────────────────────────────────────────────
function getSessionToken(req) {
    // 1. Authorization: Bearer <token>
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    // 2. Cookie: session_token=<value> — use indexOf to handle base64 values with '=' padding
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

            // 2. Try legacy config — use timingSafeEqual to prevent timing oracle attacks
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
                    // Buffers of different lengths → timingSafeEqual throws → not a match
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

app.use(authenticateUser);

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

// Serve the frontend UI and data
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/data', express.static(DATA_DIR));

// Helper to resolve the current active toolbox slide (or manual override)
function getCurrentToolboxSlideInfo() {
    try {
        const actualNow = new Date();
        const now = new Date(actualNow.getTime() + (60 * 60 * 1000)); // Shift +1h for 11:00 PM rollover
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

        // 1. Check trackers.json for manual daily override
        const trackersPath = path.join(DATA_DIR, 'trackers.json');
        if (fs.existsSync(trackersPath)) {
            try {
                const trackers = JSON.parse(fs.readFileSync(trackersPath, 'utf8'));
                if (trackers.toolbox_override_date === todayStr && trackers.toolbox_override_file) {
                    const overridePath = path.join(DATA_DIR, trackers.toolbox_override_file);
                    if (fs.existsSync(overridePath)) {
                        return { filename: trackers.toolbox_override_file, filePath: overridePath, isOverride: true, slideNum: 'override' };
                    }
                }
            } catch {}
        }

        // 2. Day-of-year calculation
        const start = new Date(Date.UTC(now.getFullYear(), 0, 0));
        const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const dayOfYear = Math.round((todayUTC - start) / (1000 * 60 * 60 * 24));
        const year = now.getFullYear();
        const isLeap = ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
        let slideNum = dayOfYear;
        if (isLeap) {
            if (dayOfYear === 60) slideNum = 20;
            else if (dayOfYear > 60) slideNum = dayOfYear - 1;
        }
        const paddedNum = slideNum.toString().padStart(3, '0');
        const targetFilename = `${paddedNum}.png`;

        const candidateDirs = [
            process.env.SAFETY_SLIDES_DIR,
            '/safety-slides',
            '/opt/kiosk-data/safety-slides',
            path.join(DATA_DIR, 'safety-slides'),
            path.join(__dirname, '../html/assets/safety-slides'),
            path.join(__dirname, 'public/safety-slides')
        ].filter(Boolean);

        for (const dir of candidateDirs) {
            const candidatePath = path.join(dir, targetFilename);
            if (fs.existsSync(candidatePath)) {
                return { filename: targetFilename, filePath: candidatePath, isOverride: false, slideNum: paddedNum };
            }
        }
    } catch (err) {
        console.warn('[Toolbox Sync] Error resolving slide:', err.message);
    }
    return null;
}

// Helper to push live ephemeral files to Vercel Cloud for mobile and remote viewers
async function syncToCloud() {
    try {
        checkAndPerformAuditReset();
        let siteConfig = {};
        if (fs.existsSync(CONFIG_PATH)) {
            siteConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
        if (!siteConfig.vercel_api_url) return;
        const vercelBase = siteConfig.vercel_api_url.replace(/\/+$/, '');
        const siteId = siteConfig.site_id || 'default-site';

        const filesToSync = {};
        const syncFiles = [
            'reminders.md', 'equipment.json', 'trackers.json', 'special.json',
            'shifts.json', 'version.txt', 'config.json', 'seniority.json',
            'features.json', 'tracks.json', 'track-map.svg', 'commodity_rules.json',
            'anniversaries.json', 'safety_videos.json'
        ];

        syncFiles.forEach(f => {
            const p = path.join(DATA_DIR, f);
            if (fs.existsSync(p)) {
                try {
                    const raw = fs.readFileSync(p, 'utf8');
                    filesToSync[f] = f.endsWith('.json') ? JSON.parse(raw) : raw;
                } catch {}
            }
        });

        // Attach current single daily toolbox slide as base64
        const slideInfo = getCurrentToolboxSlideInfo();
        if (slideInfo && fs.existsSync(slideInfo.filePath)) {
            try {
                const imgBuf = fs.readFileSync(slideInfo.filePath);
                if (imgBuf.length > 0 && imgBuf.length <= 5 * 1024 * 1024) {
                    filesToSync['toolbox_slide.png'] = imgBuf.toString('base64');
                    filesToSync['toolbox_slide_meta.json'] = {
                        slide_number: slideInfo.slideNum,
                        filename: slideInfo.filename,
                        is_override: slideInfo.isOverride,
                        updated_at: Date.now()
                    };
                }
            } catch (slideErr) {
                console.warn('[Cloud Sync] Failed to attach toolbox slide:', slideErr.message);
            }
        }

        if (Object.keys(filesToSync).length === 0) return;

        const payload = {
            site_id: siteId,
            secret: siteConfig.sync_secret || '',
            files: filesToSync
        };

        const res = await fetch(`${vercelBase}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`[Cloud Sync] Pushed ${Object.keys(filesToSync).length} ephemeral files to ${vercelBase}`);
        } else {
            console.warn(`[Cloud Sync] Cloud returned status: ${res.status}`);
        }
    } catch (e) {
        console.warn(`[Cloud Sync] Offline / skipped (${e.message})`);
    }
}

/**
 * Periodically pulls Novara LMS video compliance and anniversary data
 * from Vercel using the secure x-sync-secret header and caches flat-files locally.
 */
async function syncNovaraData() {
    try {
        let siteConfig = {};
        if (fs.existsSync(CONFIG_PATH)) {
            siteConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
        if (!siteConfig.vercel_api_url || !siteConfig.sync_secret) return;
        const vercelBase = siteConfig.vercel_api_url.replace(/\/+$/, '');
        const siteId = siteConfig.site_id || 'default-site';

        const res = await fetch(`${vercelBase}/api/novara?site=${encodeURIComponent(siteId)}`, {
            headers: { 'x-sync-secret': siteConfig.sync_secret }
        });
        if (!res.ok) {
            console.warn(`[Novara Sync] Remote /api/novara returned HTTP ${res.status}`);
            return;
        }
        const data = await res.json();
        if (!data || !data.success) return;

        let changed = false;

        // 1. Process safety videos
        const safetyVideosPayload = {
            success: true,
            totalMissing: data.totalMissing || 0,
            totalIncomplete: data.totalIncomplete || 0,
            totalExpiring: data.totalExpiring || 0,
            employeeCount: data.employeeCount || 0,
            response: data.response || [],
            updated_at: Date.now()
        };
        const safetyVideosPath = path.join(DATA_DIR, 'safety_videos.json');
        const prevSafetyVideos = fs.existsSync(safetyVideosPath) ? fs.readFileSync(safetyVideosPath, 'utf8') : '';
        const newSafetyVideosStr = JSON.stringify(safetyVideosPayload, null, 2);
        if (prevSafetyVideos !== newSafetyVideosStr) {
            fs.writeFileSync(safetyVideosPath, newSafetyVideosStr, 'utf8');
            changed = true;
        }

        // 2. Process anniversaries
        const anniversariesPayload = {
            is_today: data.anniversaries?.is_today || false,
            employees: data.anniversaries?.employees || [],
            updated_at: Date.now()
        };
        const anniversariesPath = path.join(DATA_DIR, 'anniversaries.json');
        const prevAnniversaries = fs.existsSync(anniversariesPath) ? fs.readFileSync(anniversariesPath, 'utf8') : '';
        const newAnniversariesStr = JSON.stringify(anniversariesPayload, null, 2);
        if (prevAnniversaries !== newAnniversariesStr) {
            fs.writeFileSync(anniversariesPath, newAnniversariesStr, 'utf8');
            changed = true;
        }

        if (changed) {
            console.log('[Novara Sync] Refreshed safety_videos.json and anniversaries.json');
            bumpVersion();
            triggerSync();
        }
    } catch (e) {
        console.warn('[Novara Sync] Error syncing Novara data:', e.message);
    }
}

app.post('/api/novara/sync', async (req, res) => {
    try {
        const user = getSessionUser(req);
        if (!user && !getBasicAuthUser(req)) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        await syncNovaraData();
        res.json({ success: true, message: 'Novara sync triggered' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to sync Novara: ' + e.message });
    }
});

// ── Auth Endpoints (Issue #14) ──────────────────────────────────────────────

// Rate limit auth endpoints: max 20 login attempts per 15 minutes per IP (IDEA-S02)
const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
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

app.post('/api/auth/logout', (req, res) => {
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

app.get('/api/auth/me', (req, res) => {
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

app.post('/api/auth/register', (req, res) => {
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

app.get('/api/auth/verify-invite', (req, res) => {
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

app.post('/api/auth/invite', requireRole(['admin']), (req, res) => {
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

app.get('/api/auth/invites', requireRole(['admin']), (req, res) => {
    try {
        const invites = listInvites();
        res.json(invites);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/auth/invites/:token', requireRole(['admin']), (req, res) => {
    try {
        deleteInvite(req.params.token);
        logAction({ req, user: req.user, action: 'user.invite_deleted', details: `Revoked invite token: ${req.params.token}` });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── User Management Endpoints (Issue #14) ───────────────────────────────────

app.get('/api/users', requireRole(['admin']), (req, res) => {
    try {
        const users = listUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/users/:id/role', requireRole(['admin']), (req, res) => {
    try {
        const { role } = req.body;
        const targetUser = getUserById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        updateUserRole(req.params.id, role);
        logAction({
            req,
            user: req.user,
            action: 'user.role_change',
            details: `Changed role of user ${targetUser.username} from ${targetUser.role} to ${role}`
        });

        res.json({ success: true, message: `User role updated to ${role}` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/users/:id', requireRole(['admin']), (req, res) => {
    try {
        const targetUser = getUserById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own active account' });
        }

        deleteUser(req.params.id);
        logAction({ req, user: req.user, action: 'user.delete', details: `Deleted user account: ${targetUser.username}` });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Audit Logs Endpoints (Issue #15) ────────────────────────────────────────

app.get('/api/audit-logs', requireRole(['admin']), (req, res) => {
    try {
        const { action, username, search, limit, offset } = req.query;
        const result = queryAuditLogs({
            action,
            username,
            search,
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/audit-logs/export', requireRole(['admin']), (req, res) => {
    try {
        const { action, username, search } = req.query;
        const csv = exportAuditLogsCsv({ action, username, search });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="yardstik_audit_logs_${Date.now()}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── File Uploads Setup ──────────────────────────────────────────────────────
const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

// Executes Python parsing engine for uploaded spreadsheets
function executeTrackParser(uploadedPath) {
    return new Promise((resolve, reject) => {
        const parserScript = path.join(__dirname, 'scripts/parse_track_check.py');
        const py = spawn('python3', [parserScript, uploadedPath, TRACKS_PATH]);
        let stderr = '';
        py.stderr.on('data', (d) => stderr += d.toString());
        py.on('error', (err) => {
            try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
            reject(new Error('Failed to launch parser process: ' + err.message));
        });
        py.on('close', (code) => {
            try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
            if (code === 0) {
                fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
                syncToCloud();
                let parsed = [];
                try {
                    parsed = JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
                } catch {}
                resolve(parsed);
            } else {
                reject(new Error(stderr || 'Exit code ' + code));
            }
        });
    });
}

// ── Scripts & Automation Runners ────────────────────────────────────────────

app.get('/api/scripts', requireRole(['admin']), (req, res) => {
    try {
        const files = fs.readdirSync(RUNNERS_DIR).filter(f => f.endsWith('.json'));
        // Gracefully skip malformed JSON files instead of crashing the whole endpoint
        const scripts = files.flatMap(file => {
            try {
                const content = fs.readFileSync(path.join(RUNNERS_DIR, file), 'utf8');
                const data = JSON.parse(content);
                data.id = file.replace('.json', '');
                return [data];
            } catch {
                console.warn(`[Scripts] Skipping malformed runner config: ${file}`);
                return [];
            }
        });
        scripts.sort((a, b) => a.name.localeCompare(b.name));
        res.json(scripts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load scripts config' });
    }
});

// Allowlist of directories from which runner scripts may be executed
const ALLOWED_SCRIPT_DIRS = [
    path.resolve(RUNNERS_DIR),
    path.resolve('/app/scripts'),
    path.resolve('/app/conf/scripts'),
];

app.post('/api/execute/:id', requireRole(['admin']), upload.any(), (req, res) => {
    const scriptId = path.basename(req.params.id);
    const configPath = path.join(RUNNERS_DIR, `${scriptId}.json`);

    if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Script configuration not found' });
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Security: validate script_path is within an allowed directory (prevents arbitrary execution)
        const resolvedPath = path.resolve(config.script_path || '');
        const isAllowed = ALLOWED_SCRIPT_DIRS.some(d => resolvedPath.startsWith(d));
        if (!isAllowed) {
            console.error(`[Runner] Blocked execution of out-of-allowlist path: ${resolvedPath}`);
            return res.status(403).json({ error: 'Script path is outside allowed directories.' });
        }

        const args = [];

        if (config.parameters) {
            config.parameters.forEach(p => {
                let val = req.body[p.name];
                if (p.type === 'file_upload') {
                    const file = req.files ? req.files.find(f => f.fieldname === p.name) : null;
                    if (file) val = file.path;
                }
                if (val !== undefined && val !== '') {
                    if (p.param) args.push(p.param);
                    args.push(val);
                }
            });
        }

        // Log parameter names only (not values) to avoid sensitive data in audit logs
        const paramNames = (config.parameters || []).map(p => p.name).join(', ');
        logAction({ req, user: req.user, action: 'runner.execute', details: `Executed runner: ${config.name || scriptId} | params: ${paramNames}` });

        const child = spawn(resolvedPath, args);
        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => output += data.toString());
        child.stderr.on('data', (data) => errorOutput += data.toString());

        child.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    code: -1,
                    output: output,
                    error: 'Failed to spawn process: ' + err.message
                });
            }
        });

        child.on('close', (code) => {
            if (code === 0) syncToCloud();
            if (!res.headersSent) {
                res.json({
                    success: code === 0,
                    code: code,
                    output: output,
                    error: errorOutput
                });
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to execute script' });
    }
});

// ── Production Trackers Endpoints ───────────────────────────────────────────

app.get('/api/trackers', (req, res) => {
    try {
        const trackersPath = path.join(DATA_DIR, 'trackers.json');
        if (fs.existsSync(trackersPath)) {
            const data = JSON.parse(fs.readFileSync(trackersPath, 'utf8'));
            res.json(data);
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read trackers file' });
    }
});

// ── Features & Theme Toggles Endpoints ──────────────────────────────────────
const FEATURES_PATH = process.env.FEATURES_PATH || path.join(DATA_DIR, 'features.json');

app.get('/api/features', (req, res) => {
    try {
        if (fs.existsSync(FEATURES_PATH)) {
            const data = JSON.parse(fs.readFileSync(FEATURES_PATH, 'utf8'));
            res.json(data);
        } else {
            res.json({
                theme_mode: 'auto',
                dedicated_theme: 'default',
                shift_theme_dedication: false,
                shift_themes: { "1": "default", "2": "obsidian", "3": "cyberpunk" },
                features: {
                    weather_fx: true,
                    lightning_radar: true,
                    osha_counter: true,
                    production_tracker: true,
                    equipment_status: true,
                    scale_audit_badges: true,
                    shift_tracker: true,
                    toolbox_talk: true,
                    reminders: true,
                    anniversaries: true,
                    safety_videos: true,
                    mobile_qr: true
                }
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read features configuration' });
    }
});

app.post('/api/features', requireRole(['admin']), (req, res) => {
    try {
        const data = req.body;
        fs.writeFileSync(FEATURES_PATH, JSON.stringify(data, null, 4), 'utf8');
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
        logAction({ req, user: req.user, action: 'features.update', details: 'Updated features & theme configuration.' });
        syncToCloud();
        res.json({ success: true, message: 'Features & theme configuration saved successfully.' });
    } catch (err) {
        console.error('Error saving features:', err);
        res.status(500).json({ error: 'Failed to save features configuration' });
    }
});

// ── Native Markdown Editor Endpoints ────────────────────────────────────────
const REMINDERS_PATH = process.env.REMINDERS_PATH || path.join(DATA_DIR, 'reminders.md');

app.get('/api/reminders', (req, res) => {
    try {
        if (fs.existsSync(REMINDERS_PATH)) {
            const content = fs.readFileSync(REMINDERS_PATH, 'utf8');
            res.send(content);
        } else {
            res.send('# Announcements\n\nNo reminders configured yet.');
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read reminders file' });
    }
});

app.post('/api/reminders', requireRole(['admin']), express.text({ type: '*/*' }), (req, res) => {
    try {
        let body = req.body;
        body = body.replace(/!LIMIT\s+(\d{2})-(\d{2})/gi, (match, dd, hh) => {
            const now = new Date();
            now.setDate(now.getDate() + parseInt(dd, 10));
            now.setHours(now.getHours() + parseInt(hh, 10));

            const expYear = now.getFullYear();
            const expMonth = String(now.getMonth() + 1).padStart(2, '0');
            const expDay = String(now.getDate()).padStart(2, '0');
            const expHour = String(now.getHours()).padStart(2, '0');

            return `!EXPIRE ${expYear}-${expMonth}-${expDay}-${expHour}`;
        });

        fs.writeFileSync(REMINDERS_PATH, body, 'utf8');
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
        logAction({ req, user: req.user, action: 'reminders.update', details: 'Updated Markdown announcements deck.' });
        syncToCloud();
        res.json({ success: true, message: 'Reminders saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save reminders file' });
    }
});

// ── Native Equipment Editor Endpoints ───────────────────────────────────────
const EQUIPMENT_PATH = process.env.EQUIPMENT_PATH || path.join(DATA_DIR, 'equipment.json');

function processWeeklyAuditReset(data) {
    if (!data || !data.categories) return false;
    const latestSundayReset = getLatestSunday11PMEpoch();

    if (!data.last_audit_reset || data.last_audit_reset < latestSundayReset) {
        let changed = false;
        data.categories.forEach(cat => {
            if ((cat.name || '').trim().toLowerCase() === 'mobile cranes' && Array.isArray(cat.items)) {
                cat.items.forEach(item => {
                    if (item.blend_audit === true) {
                        item.blend_audit = false;
                        changed = true;
                    }
                });
            }
        });
        data.last_audit_reset = latestSundayReset;
        return true;
    }
    return false;
}

function checkAndPerformAuditReset() {
    try {
        if (!fs.existsSync(EQUIPMENT_PATH)) return false;
        const raw = fs.readFileSync(EQUIPMENT_PATH, 'utf8');
        let data = JSON.parse(raw);
        if (processWeeklyAuditReset(data)) {
            console.log('[Audit Engine] Sunday 11:00 PM weekly audit reset executed.');
            fs.writeFileSync(EQUIPMENT_PATH, JSON.stringify(data, null, 2), 'utf8');
            try {
                fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
            } catch {}
            return true;
        }
    } catch (e) {
        console.error('[Audit Engine] Error checking weekly audit reset:', e);
    }
    return false;
}

app.get('/api/equipment', (req, res) => {
    try {
        if (fs.existsSync(EQUIPMENT_PATH)) {
            const raw = fs.readFileSync(EQUIPMENT_PATH, 'utf8');
            let data = JSON.parse(raw);
            if (processWeeklyAuditReset(data)) {
                fs.writeFileSync(EQUIPMENT_PATH, JSON.stringify(data, null, 2), 'utf8');
                try {
                    fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
                } catch {}
                syncToCloud();
            }
            res.json(data);
        } else {
            res.json({ categories: [], last_audit_reset: getLatestSunday11PMEpoch() });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read equipment file' });
    }
});

// RBAC: Accessible by both admin and maintenance workers!
app.post('/api/equipment', requireRole(['admin', 'maintenance']), express.json(), (req, res) => {
    try {
        const payload = req.body || { categories: [] };
        payload.last_audit_reset = payload.last_audit_reset || getLatestSunday11PMEpoch();
        fs.writeFileSync(EQUIPMENT_PATH, JSON.stringify(payload, null, 2), 'utf8');

        // Bump version.txt to instantly refresh Kiosk TVs
        try {
            fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {
            console.error('Failed to bump version.txt', vErr);
        }

        logAction({
            req,
            user: req.user,
            action: 'equipment.update',
            details: `Updated equipment state (${(payload.categories || []).length} categories).`
        });

        syncToCloud();
        res.json({ success: true, message: 'Equipment saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save equipment file' });
    }
});

// ── Native Shift Schedule Editor Endpoints ──────────────────────────────────
const SHIFTS_PATH = process.env.SHIFTS_PATH || path.join(DATA_DIR, 'shifts.json');

app.get('/api/shifts', (req, res) => {
    try {
        if (fs.existsSync(SHIFTS_PATH)) {
            const content = fs.readFileSync(SHIFTS_PATH, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.send(content);
        } else {
            res.json({ shifts: [] });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read shifts file' });
    }
});

app.post('/api/shifts', requireRole(['admin']), express.json(), (req, res) => {
    try {
        fs.writeFileSync(SHIFTS_PATH, JSON.stringify(req.body, null, 2), 'utf8');
        try {
            fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {
            console.error('Failed to bump version.txt', vErr);
        }
        logAction({ req, user: req.user, action: 'shifts.update', details: 'Updated facility shift schedules.' });
        syncToCloud();
        res.json({ success: true, message: 'Shift schedules saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save shifts file' });
    }
});

// ── Native Seniority Overrides API Endpoints ────────────────────────────────
const SENIORITY_PATH = process.env.SENIORITY_PATH || path.join(DATA_DIR, 'seniority.json');

app.get('/api/seniority', (req, res) => {
    try {
        if (fs.existsSync(SENIORITY_PATH)) {
            const content = fs.readFileSync(SENIORITY_PATH, 'utf8');
            res.json(JSON.parse(content));
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read seniority file' });
    }
});

app.post('/api/seniority', requireRole(['admin']), express.json(), (req, res) => {
    try {
        fs.writeFileSync(SENIORITY_PATH, JSON.stringify(req.body, null, 2), 'utf8');
        try {
            fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {}
        logAction({ req, user: req.user, action: 'seniority.update', details: 'Updated employee seniority milestone records.' });
        syncToCloud();
        res.json({ success: true, message: 'Seniority records saved and synced successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save seniority file' });
    }
});

// ── Special Event API ───────────────────────────────────────────────────────

app.get('/api/special-event', (req, res) => {
    try {
        const specialPath = path.join(DATA_DIR, 'special.json');
        if (fs.existsSync(specialPath)) {
            const data = fs.readFileSync(specialPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({ error: 'No special event found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/special-event', requireRole(['admin']), upload.single('image'), (req, res) => {
    try {
        let currentData = {};
        const specialPath = path.join(DATA_DIR, 'special.json');
        if (fs.existsSync(specialPath)) {
            currentData = JSON.parse(fs.readFileSync(specialPath, 'utf8'));
        }

        currentData.title = req.body.title || '';
        currentData.description = req.body.description || '';
        currentData.duration = req.body.duration || '20';
        currentData.endTime = req.body.endTime || '';

        if (req.file) {
            const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
            const ext = path.extname(req.file.originalname).toLowerCase();
            if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
                try { fs.unlinkSync(req.file.path); } catch {}
                return res.status(400).json({ error: 'Invalid file type. Only JPG, PNG, GIF, and WebP images are allowed.' });
            }
            const imgPath = path.join(DATA_DIR, `special_img${ext}`);
            fs.copyFileSync(req.file.path, imgPath);
            currentData.image = `assets/data/special_img${ext}`;
        }

        fs.writeFileSync(specialPath, JSON.stringify(currentData, null, 2));
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
        logAction({ req, user: req.user, action: 'special_event.update', details: `Configured special event: ${currentData.title}` });
        syncToCloud();
        res.json({ success: true, image: currentData.image });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/special-event', requireRole(['admin']), (req, res) => {
    try {
        const specialPath = path.join(DATA_DIR, 'special.json');
        if (fs.existsSync(specialPath)) {
            const data = JSON.parse(fs.readFileSync(specialPath, 'utf8'));
            if (data.image) {
                const imgPath = path.join(DATA_DIR, data.image.split('/').pop());
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            }
            fs.unlinkSync(specialPath);
        }
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
        logAction({ req, user: req.user, action: 'special_event.delete', details: 'Cleared special event alert.' });
        syncToCloud();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Track Management & Track Check API ──────────────────────────────────────
const trackStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = '/tmp';
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, 'track_upload_' + Date.now() + path.extname(file.originalname));
    }
});
const uploadTrack = multer({ storage: trackStorage });

app.get('/api/tracks', (req, res) => {
    try {
        if (fs.existsSync(TRACKS_PATH)) {
            const data = JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
            res.json(data);
        } else {
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to read tracks: ' + e.message });
    }
});

app.post('/api/tracks', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const tracks = req.body;
        if (!Array.isArray(tracks)) {
            return res.status(400).json({ error: 'Expected array of tracks' });
        }
        fs.writeFileSync(TRACKS_PATH, JSON.stringify(tracks, null, 2), 'utf8');
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
        logAction({ req, user: req.user, action: 'tracks.update', details: `Updated ${tracks.length} track records.` });
        syncToCloud();
        res.json({ success: true, count: tracks.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save tracks: ' + e.message });
    }
});

app.post('/api/tracks/upload', requireRole(['admin']), uploadTrack.single('file'), async (req, res) => {
    try {
        let uploadedPath = req.file ? req.file.path : null;

        if (!uploadedPath && req.body && (req.body.file_base64 || req.body.content)) {
            const rawBase64 = req.body.file_base64 || req.body.content;
            const b64 = typeof rawBase64 === 'object' && rawBase64.$content ? rawBase64.$content : rawBase64;
            const buf = Buffer.from(b64, 'base64');
            uploadedPath = path.join('/tmp', `direct_upload_${Date.now()}_${req.body.filename || 'track_check.xlsx'}`);
            fs.writeFileSync(uploadedPath, buf);
        }

        if (!uploadedPath) {
            return res.status(400).json({ error: 'No file uploaded or file_base64 provided' });
        }

        const parsed = await executeTrackParser(uploadedPath);
        logAction({ req, user: req.user, action: 'tracks.upload', details: `Uploaded and parsed track spreadsheet (${parsed.length} tracks).` });
        res.json({ success: true, count: parsed.length, tracks: parsed });
    } catch (e) {
        res.status(500).json({ error: 'Upload processing failed: ' + e.message });
    }
});

app.post('/api/track-map/upload', requireRole(['admin']), uploadTrack.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const uploadedPath = req.file.path;
        const content = fs.readFileSync(uploadedPath, 'utf8');
        const validation = validateAndSanitizeSvg(content);
        if (!validation.valid) {
            fs.unlinkSync(uploadedPath);
            return res.status(400).json({ error: validation.error });
        }

        const cleanSvg = validation.cleanSvg;
        fs.writeFileSync(TRACK_MAP_PATH, cleanSvg, 'utf8');
        if (process.env.NODE_ENV !== 'test') {
            const localImgPath = path.join(__dirname, '../html/assets/images/track-map.svg');
            if (fs.existsSync(path.dirname(localImgPath))) {
                try { fs.writeFileSync(localImgPath, cleanSvg, 'utf8'); } catch {}
            }
            const localDataPath = path.join(__dirname, '../html/assets/data/track-map.svg');
            if (fs.existsSync(path.dirname(localDataPath))) {
                try { fs.writeFileSync(localDataPath, cleanSvg, 'utf8'); } catch {}
            }
        }
        try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');
        logAction({ req, user: req.user, action: 'track_map.upload', details: 'Uploaded new SVG track map vector.' });
        syncToCloud();
        res.json({ success: true, message: 'Track map SVG uploaded successfully.' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to upload track map: ' + e.message });
    }
});

app.get('/api/tracks/template', (req, res) => {
    const csvContent = 'Track ID,Track Name,Car Count,Commodity / Contents,Inbound Date (YYYY-MM-DD),Notes\n23,Track 23,0,Empty,,CLEAR\n24,Track 24,4,1 - DL Bale, 3 - Shred S/End,2026-09-01,1 - DL BALE, 3 - SHRED S/END\n48,Track 48,13,DLs (7 - P&S, 6 - Bales),2026-08-19,P&S FROM 8/19\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="standard_track_check_template.csv"');
    res.send(csvContent);
});

app.get('/api/tracks/template-excel', (req, res) => {
    const candidates = [
        path.join(__dirname, 'public', 'example-track-check.xlsx'),
        path.join(DATA_DIR, 'example-track-check.xlsx'),
        path.join(__dirname, '../html/assets/data', 'example-track-check.xlsx')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return res.download(p, 'example-track-check.xlsx');
        }
    }
    res.status(404).json({ error: 'Excel starter template not found.' });
});

// ── Commodity Rules & Classification API ────────────────────────────────────
const COMMODITY_RULES_PATH = process.env.COMMODITY_RULES_PATH || path.join(DATA_DIR, 'commodity_rules.json');
const DEFAULT_COMMODITY_RULES = {
    categories: [
        {
            id: "bad_order",
            name: "Bad Order / O.S.",
            color: "#ef4444",
            keywords: ["B.O", "BAD ORDER", "O.S", "O.S.", "OS", "DEFECT", "REPAIR"],
            description: "Bad order cars and out of service track turnouts."
        },
        {
            id: "blend_bof",
            name: "Blend / BOF",
            color: "#00f0ff",
            keywords: ["BLEND", "BOF", "MH82", "MH81", "MH97", "SMS", "MSA"],
            description: "Active blend loading, BOF heats, and mill charges."
        },
        {
            id: "up",
            name: "UP (Hot Rail / Plate)",
            color: "#f97316",
            keywords: ["UP", "HOT RAIL", "SLAB", "SLABS", "ONE CUT", "ONE CUTS", "PLATE", "COBBLE", "HEAVY TRIM", "LIGHT TRIM", "TRIM", "SMASH", "COIL", "COILS", "SCALE", "NOTICE", "MILL SCALE", "SPEAR"],
            description: "Hot rail slabs, plate, cobble, coils, smash, and steel trim products."
        },
        {
            id: "dl",
            name: "DL (Download / Scrap)",
            color: "#c084fc",
            keywords: ["DL", "DL'S", "DLS", "DOWNLOAD", "DOWNLOADS", "DOG BONE", "DOGBONE", "SLITTER", "SHEET", "SHEETS", "BALE", "BALES", "P&S", "SHRED", "SCRAP", "SWEEP", "TO SWEEP"],
            description: "Download scrap, slitter, sheets, baler scrap, P&S, and shred."
        },
        {
            id: "ob_empty",
            name: "OB / Empty",
            color: "#22c55e",
            keywords: ["EMPTY", "CLEAR", "MTY", "OB", "OB'S", "OBS", "OUTBOUND", "FLAT", "FLATS"],
            description: "Outbound loads, empty flats, and cleared tracks."
        },
        {
            id: "raw_materials",
            name: "Raw Materials / HBI",
            color: "#38bdf8",
            keywords: ["HBI", "ORE", "PELLETS", "COAL", "COKE", "LIMESTONE"],
            description: "Raw charge materials, HBI, pellets, and flux."
        }
    ],
    default_color: "#38bdf8"
};

app.get('/api/commodity-rules', (req, res) => {
    try {
        if (fs.existsSync(COMMODITY_RULES_PATH)) {
            const data = JSON.parse(fs.readFileSync(COMMODITY_RULES_PATH, 'utf8'));
            return res.json(data);
        }
        const localPath = path.join(__dirname, '../html/assets/data/commodity_rules.json');
        if (fs.existsSync(localPath)) {
            const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            return res.json(data);
        }
        res.json(DEFAULT_COMMODITY_RULES);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read commodity rules: ' + e.message });
    }
});

app.post('/api/commodity-rules', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !Array.isArray(payload.categories)) {
            return res.status(400).json({ error: 'Expected object with categories array' });
        }
        const formattedJson = JSON.stringify(payload, null, 2);

        if (fs.existsSync(path.dirname(COMMODITY_RULES_PATH))) {
            fs.writeFileSync(COMMODITY_RULES_PATH, formattedJson, 'utf8');
        }
        if (process.env.NODE_ENV !== 'test') {
            const localPath = path.join(__dirname, '../html/assets/data/commodity_rules.json');
            if (fs.existsSync(path.dirname(localPath))) {
                fs.writeFileSync(localPath, formattedJson, 'utf8');
            }
            const localVer = path.join(__dirname, '../html/assets/data/version.txt');
            if (fs.existsSync(path.dirname(localVer))) fs.writeFileSync(localVer, Date.now().toString(), 'utf8');
        }

        logAction({ req, user: req.user, action: 'commodity_rules.update', details: `Saved ${payload.categories.length} commodity rules.` });
        syncToCloud();
        res.json({ success: true, count: payload.categories.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save commodity rules: ' + e.message });
    }
});

// ── Site Settings API ──────────────────────────────────────────────────────
const CONFIG_DEFAULTS = {
    site_name: 'Kiosk — Location Name',
    site_id: 'kiosk-location',
    latitude: 32.7767,
    longitude: -96.7970,
    timezone: 'America/Chicago',
    vercel_api_url: '',
    admin_username: 'admin'
};

app.get('/api/site-config', requireRole(['admin']), (req, res) => {
    try {
        let data = {};
        if (fs.existsSync(CONFIG_PATH)) {
            data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
        const safeConfig = { ...CONFIG_DEFAULTS, ...data };
        delete safeConfig.admin_password;
        res.json(safeConfig);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read site config: ' + e.message });
    }
});

app.post('/api/site-config', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const current = fs.existsSync(CONFIG_PATH)
            ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
            : {};

        const allowed = ['site_name', 'site_id', 'latitude', 'longitude', 'timezone', 'vercel_api_url', 'admin_username'];
        const updated = { ...current };
        allowed.forEach(key => {
            if (req.body[key] !== undefined) updated[key] = req.body[key];
        });

        if (typeof req.body.admin_password === 'string' && req.body.admin_password.trim().length > 0) {
            updated.admin_password = req.body.admin_password.trim();
        }

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');

        const safeFrontendConfig = { ...updated };
        delete safeFrontendConfig.admin_password;
        fs.writeFileSync(path.join(DATA_DIR, 'config.json'), JSON.stringify(safeFrontendConfig, null, 2), 'utf8');
        fs.writeFileSync(path.join(DATA_DIR, 'version.txt'), Date.now().toString(), 'utf8');

        logAction({ req, user: req.user, action: 'config.update', details: 'Updated site configuration settings.' });
        syncToCloud();

        const returnConfig = { ...updated };
        delete returnConfig.admin_password;
        res.json({ success: true, config: returnConfig });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save site config: ' + e.message });
    }
});

if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Control Panel Server running on port ${PORT}`);
        checkAndPerformAuditReset();
        setTimeout(syncToCloud, 3000);
        setInterval(syncToCloud, 5 * 60 * 1000);
        setTimeout(syncNovaraData, 5000);
        setInterval(syncNovaraData, 15 * 60 * 1000); // Poll Novara LMS every 15m (SSoT §6.2)
        setInterval(checkAndPerformAuditReset, 60 * 1000);
        setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Clean expired sessions hourly
        setInterval(() => pruneAuditLogs(5000), 24 * 60 * 60 * 1000); // Daily audit log maintenance
    });
}

module.exports = {
    app,
    getAuthConfig,
    getLatestSunday11PMEpoch,
    processWeeklyAuditReset,
    checkAndPerformAuditReset,
    syncToCloud,
    syncNovaraData,
    loginLimiter
};
