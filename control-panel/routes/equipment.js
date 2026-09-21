const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getLatestSunday11PMEpoch, processWeeklyAuditReset } = require('../lib/audit-reset');
const { logAction } = require('../lib/audit');
const { syncToCloud } = require('../lib/cloud');
const { bumpVersion } = require('../lib/version');
const { requireRole } = require('../middleware/auth');

function getDataDir() {
    return process.env.DATA_DIR || '/data';
}

function getEquipmentPath() {
    return process.env.EQUIPMENT_PATH || path.join(getDataDir(), 'equipment.json');
}

function getTrackersPath() {
    return path.join(getDataDir(), 'trackers.json');
}

// ── Equipment Endpoints ─────────────────────────────────────────────────────

router.get('/equipment', (req, res) => {
    try {
        const eqPath = getEquipmentPath();
        const dataDir = getDataDir();
        if (fs.existsSync(eqPath)) {
            const raw = fs.readFileSync(eqPath, 'utf8');
            let data = JSON.parse(raw);
            if (processWeeklyAuditReset(data)) {
                fs.writeFileSync(eqPath, JSON.stringify(data, null, 2), 'utf8');
                try {
                    fs.writeFileSync(path.join(dataDir, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
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

// RBAC: Accessible by both admin and maintenance workers
router.post('/equipment', requireRole(['admin', 'maintenance']), express.json(), (req, res) => {
    try {
        const payload = req.body || { categories: [] };
        const eqPath = getEquipmentPath();
        const dataDir = getDataDir();
        payload.last_audit_reset = payload.last_audit_reset || getLatestSunday11PMEpoch();
        fs.writeFileSync(eqPath, JSON.stringify(payload, null, 2), 'utf8');

        // Bump version.txt to instantly refresh Kiosk TVs
        try {
            fs.writeFileSync(path.join(dataDir, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
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

// ── Trackers Endpoints ──────────────────────────────────────────────────────

router.get('/trackers', (req, res) => {
    try {
        const trkPath = getTrackersPath();
        if (fs.existsSync(trkPath)) {
            const data = JSON.parse(fs.readFileSync(trkPath, 'utf8'));
            res.json(data);
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read trackers file' });
    }
});

module.exports = router;
