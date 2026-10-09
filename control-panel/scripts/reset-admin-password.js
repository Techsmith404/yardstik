#!/usr/bin/env node
/**
 * reset-admin-password.js — Kiosk Administrator Password Reset Utility
 *
 * Resets the admin user password in the embedded SQLite database (yardstik.db)
 * and synchronizes config.json if present.
 *
 * Usage:
 *   node scripts/reset-admin-password.js <new_password>
 *   docker exec -it yardstik-control-panel node scripts/reset-admin-password.js <new_password>
 */

const fs = require('fs');
const path = require('path');
const { getDb } = require('../lib/db');
const { hashPassword, updateUserPassword, getConfigFileInfo } = require('../lib/auth');

const newPassword = process.argv[2];
if (!newPassword || newPassword.trim().length < 6) {
    console.error('❌ Error: Password must be specified and be at least 6 characters long.');
    console.error('Usage: node scripts/reset-admin-password.js <new_password>');
    process.exit(1);
}

const cleanPassword = newPassword.trim();

// Ensure DATA_DIR is appropriately set if run on host outside container
if (!process.env.DATA_DIR) {
    if (fs.existsSync('/opt/kiosk-data/data')) {
        process.env.DATA_DIR = '/opt/kiosk-data/data';
    } else if (fs.existsSync('/data')) {
        process.env.DATA_DIR = '/data';
    } else {
        process.env.DATA_DIR = path.resolve(__dirname, '../../html/assets/data');
    }
}

const { config, path: cfgPath } = getConfigFileInfo();
const username = process.env.AUTH_USERNAME || config.admin_username || 'admin';

try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(username.toLowerCase());
    if (existing) {
        updateUserPassword(username, cleanPassword);
        console.log(`✅ Updated password for user '${username}' in SQLite database.`);
    } else {
        const { hash, salt } = hashPassword(cleanPassword);
        const now = new Date().toISOString();
        const userId = 'usr_' + require('crypto').randomBytes(6).toString('hex');
        db.prepare(`
            INSERT INTO users (id, username, password_hash, salt, display_name, role, created_at, updated_at, active)
            VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, 1)
        `).run(userId, username.toLowerCase(), hash, salt, 'System Administrator', now, now);
        console.log(`✅ Created admin user '${username}' with new password in SQLite database.`);
    }

    // Also update config.json if accessible so config and database stay in sync
    if (cfgPath && fs.existsSync(cfgPath)) {
        try {
            const stat = fs.statSync(cfgPath);
            if (stat.isFile()) {
                const current = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
                current.admin_password = cleanPassword;
                fs.writeFileSync(cfgPath, JSON.stringify(current, null, 2), 'utf8');
                console.log(`✅ Synchronized admin_password in ${cfgPath}`);
            }
        } catch (fErr) {
            console.warn(`⚠️ Warning: Could not update config.json at ${cfgPath}: ${fErr.message}`);
        }
    }

    console.log(`\n🎉 Success! You can now sign in as '${username}' with your new password at /login.html\n`);
    process.exit(0);
} catch (err) {
    console.error(`❌ Error resetting password: ${err.message}`);
    process.exit(1);
}
