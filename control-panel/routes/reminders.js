const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { logAction } = require('../lib/audit');
const { syncToCloud } = require('../lib/cloud');
const { bumpVersion } = require('../lib/version');
const { requireRole } = require('../middleware/auth');

function getDataDir() {
    return process.env.DATA_DIR || '/data';
}

function getRemindersPath() {
    return process.env.REMINDERS_PATH || path.join(getDataDir(), 'reminders.md');
}

router.get('/reminders', (req, res) => {
    try {
        const remPath = getRemindersPath();
        if (fs.existsSync(remPath)) {
            const content = fs.readFileSync(remPath, 'utf8');
            res.send(content);
        } else {
            res.send('# Announcements\n\nNo reminders configured yet.');
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read reminders file' });
    }
});

router.post('/reminders', requireRole(['admin']), express.text({ type: '*/*' }), (req, res) => {
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

        const remPath = getRemindersPath();
        const dataDir = getDataDir();
        fs.writeFileSync(remPath, body, 'utf8');
        bumpVersion(dataDir);
        logAction({ req, user: req.user, action: 'reminders.update', details: 'Updated Markdown announcements deck.' });
        syncToCloud();
        res.json({ success: true, message: 'Reminders saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save reminders file' });
    }
});

module.exports = router;
