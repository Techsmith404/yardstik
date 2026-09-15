const crypto = require('crypto');
const { getDb } = require('./db');

// Extracts client IP reliably taking into account potential reverse proxies
function getClientIp(req) {
    if (!req) return '127.0.0.1';
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket ? req.socket.remoteAddress : (req.ip || '127.0.0.1');
}

// Logs an action to the audit_logs SQLite table
function logAction({ req, user, action, details }) {
    try {
        const db = getDb();
        const id = 'aud_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        const epoch = Date.now();
        const timestamp = new Date().toISOString();
        const userId = (user && user.id) ? user.id : null;
        const username = (user && user.username) ? user.username : 'system';
        const role = (user && user.role) ? user.role : 'system';
        const ip = getClientIp(req) || '127.0.0.1';
        const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');

        const stmt = db.prepare(`
            INSERT INTO audit_logs (id, epoch, timestamp, user_id, username, role, action, details, ip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, epoch, timestamp, userId, username, role, action, detailsStr, ip);
        return id;
    } catch (err) {
        console.error('[Audit Log] Failed to record audit log:', err.message);
        return null;
    }
}

// Queries audit logs with pagination and search filters
function queryAuditLogs({ action, username, search, limit = 50, offset = 0 } = {}) {
    const db = getDb();
    let whereClauses = [];
    let params = [];

    if (action && action !== 'all') {
        whereClauses.push('action LIKE ?');
        params.push(`%${action}%`);
    }

    if (username) {
        whereClauses.push('username = ?');
        params.push(username);
    }

    if (search) {
        whereClauses.push('(details LIKE ? OR username LIKE ? OR action LIKE ? OR ip LIKE ?)');
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereSql}`);
    const totalRow = countStmt.get(...params);
    const total = totalRow ? totalRow.total : 0;

    // Get paginated rows
    const dataStmt = db.prepare(`
        SELECT id, epoch, timestamp, user_id, username, role, action, details, ip
        FROM audit_logs
        ${whereSql}
        ORDER BY epoch DESC
        LIMIT ? OFFSET ?
    `);
    const logs = dataStmt.all(...params, limit, offset);

    return {
        total,
        limit,
        offset,
        logs
    };
}

// Exports audit logs to standard CSV format
function exportAuditLogsCsv(filters = {}) {
    const { logs } = queryAuditLogs({ ...filters, limit: 10000, offset: 0 });
    
    // CSV Header
    const headers = ['Timestamp', 'Username', 'Role', 'Action', 'Details', 'IP Address'];
    const rows = [headers.join(',')];

    logs.forEach(log => {
        const safeDetails = '"' + (log.details || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
        const safeAction = '"' + (log.action || '').replace(/"/g, '""') + '"';
        const row = [
            log.timestamp,
            log.username,
            log.role,
            safeAction,
            safeDetails,
            log.ip || ''
        ];
        rows.push(row.join(','));
    });

    return rows.join('\r\n');
}

// Ring-buffer pruning to retain latest entries (e.g. 5,000 entries max)
function pruneAuditLogs(maxEntries = 5000) {
    try {
        const db = getDb();
        const countStmt = db.prepare('SELECT COUNT(*) as total FROM audit_logs');
        const { total } = countStmt.get();
        if (total > maxEntries) {
            const deleteCount = total - maxEntries;
            const pruneStmt = db.prepare(`
                DELETE FROM audit_logs WHERE id IN (
                    SELECT id FROM audit_logs ORDER BY epoch ASC LIMIT ?
                )
            `);
            pruneStmt.run(deleteCount);
            console.log(`[Audit Log] Pruned ${deleteCount} old audit log entries.`);
        }
    } catch (e) {
        console.error('[Audit Log] Pruning error:', e.message);
    }
}

module.exports = {
    logAction,
    queryAuditLogs,
    exportAuditLogsCsv,
    pruneAuditLogs,
    getClientIp
};
