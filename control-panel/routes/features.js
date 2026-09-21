const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { logAction } = require('../lib/audit');
const { syncToCloud } = require('../lib/cloud');
const { bumpVersion } = require('../lib/version');
const { requireRole } = require('../middleware/auth');

function getConfigPath() {
    return process.env.CONFIG_PATH || '/opt/config.json';
}

function getDataDir() {
    return process.env.DATA_DIR || '/data';
}

function getFeaturesPath() {
    return process.env.FEATURES_PATH || path.join(getDataDir(), 'features.json');
}

// ── Features Endpoints ──────────────────────────────────────────────────────

router.get('/features', (req, res) => {
    try {
        const featPath = getFeaturesPath();
        if (fs.existsSync(featPath)) {
            const data = JSON.parse(fs.readFileSync(featPath, 'utf8'));
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

router.post('/features', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const data = req.body;
        const featPath = getFeaturesPath();
        const dataDir = getDataDir();
        fs.writeFileSync(featPath, JSON.stringify(data, null, 4), 'utf8');
        bumpVersion(dataDir);
        logAction({ req, user: req.user, action: 'features.update', details: 'Updated features & theme configuration.' });
        syncToCloud();
        res.json({ success: true, message: 'Features & theme configuration saved successfully.' });
    } catch (err) {
        console.error('Error saving features:', err);
        res.status(500).json({ error: 'Failed to save features configuration' });
    }
});

// ── Site Settings Endpoints ─────────────────────────────────────────────────

const CONFIG_DEFAULTS = {
    site_name: 'Kiosk — Location Name',
    site_id: 'kiosk-location',
    latitude: 32.7767,
    longitude: -96.7970,
    timezone: 'America/Chicago',
    vercel_api_url: '',
    admin_username: 'admin'
};

router.get('/site-config', requireRole(['admin']), (req, res) => {
    try {
        const configPath = getConfigPath();
        let data = {};
        if (fs.existsSync(configPath)) {
            data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        const safeConfig = { ...CONFIG_DEFAULTS, ...data };
        delete safeConfig.admin_password;
        res.json(safeConfig);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read site config: ' + e.message });
    }
});

router.post('/site-config', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const configPath = getConfigPath();
        const dataDir = getDataDir();
        const current = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : {};

        const allowed = ['site_name', 'site_id', 'latitude', 'longitude', 'timezone', 'vercel_api_url', 'admin_username'];
        const updated = { ...current };
        allowed.forEach(key => {
            if (req.body[key] !== undefined) updated[key] = req.body[key];
        });

        if (typeof req.body.admin_password === 'string' && req.body.admin_password.trim().length > 0) {
            updated.admin_password = req.body.admin_password.trim();
        }

        fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

        const safeFrontendConfig = { ...updated };
        delete safeFrontendConfig.admin_password;
        fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(safeFrontendConfig, null, 2), 'utf8');
        bumpVersion(dataDir);

        logAction({ req, user: req.user, action: 'config.update', details: 'Updated site configuration settings.' });
        syncToCloud();

        const returnConfig = { ...updated };
        delete returnConfig.admin_password;
        res.json({ success: true, config: returnConfig });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save site config: ' + e.message });
    }
});

module.exports = router;
