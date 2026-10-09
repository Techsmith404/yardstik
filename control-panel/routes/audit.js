const express = require('express');
const router = express.Router();
const { queryAuditLogs, exportAuditLogsCsv } = require('../lib/audit');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole(['admin']), (req, res) => {
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

router.get('/export', requireRole(['admin']), (req, res) => {
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

module.exports = router;
