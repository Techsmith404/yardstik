const express = require('express');
const router = express.Router();
const { syncNovaraData } = require('../lib/cloud');
const { requireAuth } = require('../middleware/auth');

router.post('/novara/sync', requireAuth, async (req, res) => {
    try {
        await syncNovaraData();
        res.json({ success: true, message: 'Novara sync triggered' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to sync Novara: ' + e.message });
    }
});

module.exports = router;
