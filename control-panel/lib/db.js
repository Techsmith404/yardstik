const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let dbInstance = null;

function getDb(customPath) {
    if (dbInstance) return dbInstance;

    const dataDir = process.env.DATA_DIR || '/data';
    const dbPath = customPath || process.env.DB_PATH || path.join(dataDir, 'yardstik.db');

    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const db = new DatabaseSync(dbPath);
    dbInstance = db;

    // Enable WAL mode and foreign keys for high concurrency & integrity
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');

    initSchema(db);
    return db;
}

function initSchema(db) {
    // 1. Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'maintenance', 'viewer')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // 2. Invites table (Single-use registration tokens)
    db.exec(`
        CREATE TABLE IF NOT EXISTS invites (
            token TEXT PRIMARY KEY,
            role TEXT NOT NULL CHECK(role IN ('admin', 'maintenance', 'viewer')),
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            used_by TEXT,
            FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    `);

    // 3. Sessions table (Active login sessions)
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    `);

    // 4. Audit Logs table (Issue #15)
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            epoch INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            user_id TEXT,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            ip TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_epoch ON audit_logs(epoch DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_logs(username);
    `);
}

function resetDbForTesting() {
    if (dbInstance) {
        try {
            dbInstance.close();
        } catch {}
        dbInstance = null;
    }
}

module.exports = {
    getDb,
    resetDbForTesting
};
