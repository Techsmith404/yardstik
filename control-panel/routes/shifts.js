const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { logAction } = require('../lib/audit');
const { syncToCloud } = require('../lib/cloud');
const { bumpVersion } = require('../lib/version');
const { requireRole } = require('../middleware/auth');

function getDataDir() {
    return process.env.DATA_DIR || '/data';
}

function getShiftsPath() {
    return process.env.SHIFTS_PATH || path.join(getDataDir(), 'shifts.json');
}

function getSeniorityPath() {
    return process.env.SENIORITY_PATH || path.join(getDataDir(), 'seniority.json');
}

function getSpecialPath() {
    return path.join(getDataDir(), 'special.json');
}

const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

// ── Shifts Endpoints ────────────────────────────────────────────────────────

router.get('/shifts', (req, res) => {
    try {
        const shiftsPath = getShiftsPath();
        if (fs.existsSync(shiftsPath)) {
            const content = fs.readFileSync(shiftsPath, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.send(content);
        } else {
            res.json({ shifts: [] });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read shifts file' });
    }
});

router.post('/shifts', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const shiftsPath = getShiftsPath();
        const dataDir = getDataDir();
        fs.writeFileSync(shiftsPath, JSON.stringify(req.body, null, 2), 'utf8');
        try {
            fs.writeFileSync(path.join(dataDir, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
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

// ── Seniority Endpoints ─────────────────────────────────────────────────────

router.get('/seniority', (req, res) => {
    try {
        const seniorityPath = getSeniorityPath();
        if (fs.existsSync(seniorityPath)) {
            const content = fs.readFileSync(seniorityPath, 'utf8');
            res.json(JSON.parse(content));
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read seniority file' });
    }
});

router.post('/seniority', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const seniorityPath = getSeniorityPath();
        const dataDir = getDataDir();
        fs.writeFileSync(seniorityPath, JSON.stringify(req.body, null, 2), 'utf8');
        try {
            fs.writeFileSync(path.join(dataDir, 'version.txt'), Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {}
        logAction({ req, user: req.user, action: 'seniority.update', details: 'Updated employee seniority milestone records.' });
        syncToCloud();
        res.json({ success: true, message: 'Seniority records saved and synced successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save seniority file' });
    }
});

// ── Special Event Endpoints ─────────────────────────────────────────────────

router.get('/special-event', (req, res) => {
    try {
        const specialPath = getSpecialPath();
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

router.post('/special-event', requireRole(['admin']), upload.single('image'), (req, res) => {
    try {
        const specialPath = getSpecialPath();
        const dataDir = getDataDir();
        let currentData = {};
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
            const imgPath = path.join(dataDir, `special_img${ext}`);
            fs.copyFileSync(req.file.path, imgPath);
            currentData.image = `assets/data/special_img${ext}`;
        }

        fs.writeFileSync(specialPath, JSON.stringify(currentData, null, 2));
        bumpVersion(dataDir);
        logAction({ req, user: req.user, action: 'special_event.update', details: `Configured special event: ${currentData.title}` });
        syncToCloud();
        res.json({ success: true, image: currentData.image });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/special-event', requireRole(['admin']), (req, res) => {
    try {
        const specialPath = getSpecialPath();
        const dataDir = getDataDir();
        if (fs.existsSync(specialPath)) {
            const data = JSON.parse(fs.readFileSync(specialPath, 'utf8'));
            if (data.image) {
                const imgPath = path.join(dataDir, data.image.split('/').pop());
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            }
            fs.unlinkSync(specialPath);
        }
        bumpVersion(dataDir);
        logAction({ req, user: req.user, action: 'special_event.delete', details: 'Cleared special event alert.' });
        syncToCloud();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
