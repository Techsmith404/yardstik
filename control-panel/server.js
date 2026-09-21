const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { seedDefaultAdminIfNeeded, cleanupExpiredSessions } = require('./lib/auth');
const { pruneAuditLogs } = require('./lib/audit');
const {
    getLatestSunday11PMEpoch,
    processWeeklyAuditReset,
    checkAndPerformAuditReset
} = require('./lib/audit-reset');
const { syncToCloud, syncNovaraData } = require('./lib/cloud');
const { getBlitzortungService } = require('./lib/blitzortung');
const {
    getAuthConfig,
    authenticateUser
} = require('./middleware/auth');
const { router: authRouter, loginLimiter } = require('./routes/auth');

const app = express();

// Restrict CORS to configured origins only — never wildcard on an industrial panel
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false;
app.use(cors({ origin: corsOrigins, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/config.json';
const DATA_DIR = process.env.DATA_DIR || '/data';

// Global error handlers — catches unexpected async/sync failures
process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err);
});

// Initialize SQLite DB and seed admin account
seedDefaultAdminIfNeeded(CONFIG_PATH);

// Authentication & Session Middleware
app.use(authenticateUser);

// Serve the frontend UI and data
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/data', express.static(DATA_DIR));

// ── Health Check Endpoint (IDEA-I01) ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

// ── Modular API Routes (IDEA-A01) ────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/users', require('./routes/users'));
app.use('/api/audit-logs', require('./routes/audit'));
app.use('/api', require('./routes/equipment'));
app.use('/api', require('./routes/tracks'));
app.use('/api', require('./routes/shifts'));
app.use('/api', require('./routes/features'));
app.use('/api', require('./routes/reminders'));
app.use('/api', require('./routes/runners'));
app.use('/api', require('./routes/lightning'));
app.use('/api', require('./routes/novara'));

if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Control Panel Server running on port ${PORT}`);
        checkAndPerformAuditReset();

        // Start Blitzortung Community Lightning Service (IDEA-F04)
        if (process.env.ENABLE_BLITZORTUNG !== 'false') {
            try {
                let siteConfig = {};
                if (fs.existsSync(CONFIG_PATH)) {
                    try { siteConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
                }
                const blitz = getBlitzortungService({
                    latitude: siteConfig.latitude || 41.6045,
                    longitude: siteConfig.longitude || -87.1311,
                    radiusMiles: 15,
                    dataDir: DATA_DIR,
                    onStrike: () => {
                        syncToCloud().catch(() => {});
                    }
                });
                blitz.start();
                console.log('[Blitzortung] Real-time community lightning monitor initialized.');
            } catch (bErr) {
                console.warn('[Blitzortung] Failed to initialize lightning service:', bErr.message);
            }
        }

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
    loginLimiter,
    getBlitzortungService
};
