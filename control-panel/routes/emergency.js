const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
    addSseClient,
    getCurrentEmergency,
    broadcastEmergency,
    clearEmergency,
    getConnectedClientCount
} = require('../lib/events');

// ── SSE Event Stream (Public for Kiosks, TV displays, and Mobile apps) ───────
router.get('/events/stream', (req, res) => {
    addSseClient(req, res);
});

// ── Get Current Emergency State ─────────────────────────────────────────────
router.get('/emergency', (req, res) => {
    try {
        const emergency = getCurrentEmergency();
        res.json({
            ...emergency,
            connectedDisplays: getConnectedClientCount()
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve emergency status: ' + err.message });
    }
});

// ── Broadcast Emergency Screen Takeover ─────────────────────────────────────
router.post('/emergency/broadcast', requireRole(['admin', 'supervisor']), (req, res) => {
    try {
        const { title, message, severity, sound, duration } = req.body || {};

        if (!title && !message) {
            return res.status(400).json({ error: 'Emergency broadcast requires a title or message.' });
        }

        const emergency = broadcastEmergency({
            title,
            message,
            severity,
            sound,
            duration,
            user: req.user,
            req
        });

        res.json({
            success: true,
            emergency,
            connectedDisplays: getConnectedClientCount(),
            message: 'Emergency screen takeover broadcasted successfully.'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to broadcast emergency: ' + err.message });
    }
});

// ── Clear Emergency Screen Takeover ─────────────────────────────────────────
router.post('/emergency/clear', requireRole(['admin', 'supervisor']), (req, res) => {
    try {
        const result = clearEmergency({ user: req.user, req });
        res.json({
            success: true,
            emergency: result,
            message: 'Emergency broadcast cleared.'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear emergency: ' + err.message });
    }
});

router.delete('/emergency/broadcast', requireRole(['admin', 'supervisor']), (req, res) => {
    try {
        const result = clearEmergency({ user: req.user, req });
        res.json({
            success: true,
            emergency: result,
            message: 'Emergency broadcast cleared.'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear emergency: ' + err.message });
    }
});

module.exports = router;
