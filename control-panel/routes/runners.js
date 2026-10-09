const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logAction } = require('../lib/audit');
const { syncToCloud } = require('../lib/cloud');
const { requireRole } = require('../middleware/auth');

function getRunnersDir() {
    return process.env.RUNNERS_DIR || '/app/conf/runners';
}

const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

// ── Scripts & Automation Runners Endpoints ──────────────────────────────────

function getScriptsHandler(req, res) {
    try {
        const runnersDir = getRunnersDir();
        if (!fs.existsSync(runnersDir)) {
            return res.json([]);
        }
        const files = fs.readdirSync(runnersDir).filter(f => f.endsWith('.json'));
        const scripts = files.flatMap(file => {
            try {
                const content = fs.readFileSync(path.join(runnersDir, file), 'utf8');
                const data = JSON.parse(content);
                data.id = file.replace('.json', '');
                return [data];
            } catch {
                console.warn(`[Scripts] Skipping malformed runner config: ${file}`);
                return [];
            }
        });
        scripts.sort((a, b) => a.name.localeCompare(b.name));
        res.json(scripts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load scripts config' });
    }
}

router.get('/scripts', requireRole(['admin']), getScriptsHandler);
router.get('/runners', requireRole(['admin']), getScriptsHandler);

function executeScriptHandler(req, res) {
    const runnersDir = getRunnersDir();
    const scriptId = path.basename(req.params.id);
    const configPath = path.join(runnersDir, `${scriptId}.json`);

    if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Script configuration not found' });
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const allowedScriptDirs = [
            path.resolve(runnersDir),
            path.resolve('/app/scripts'),
            path.resolve('/app/conf/scripts'),
        ];

        // Security: validate script_path is within an allowed directory (prevents arbitrary execution)
        const resolvedPath = path.resolve(config.script_path || '');
        const isAllowed = allowedScriptDirs.some(d => resolvedPath.startsWith(d));
        if (!isAllowed) {
            console.error(`[Runner] Blocked execution of out-of-allowlist path: ${resolvedPath}`);
            return res.status(403).json({ error: 'Script path is outside allowed directories.' });
        }

        const args = [];

        if (config.parameters) {
            config.parameters.forEach(p => {
                let val = req.body[p.name];
                if (p.type === 'file_upload') {
                    const file = req.files ? req.files.find(f => f.fieldname === p.name) : null;
                    if (file) val = file.path;
                }
                if (val !== undefined && val !== '') {
                    if (p.param) args.push(p.param);
                    args.push(val);
                }
            });
        }

        // Log parameter names only (not values) to avoid sensitive data in audit logs
        const paramNames = (config.parameters || []).map(p => p.name).join(', ');
        logAction({ req, user: req.user, action: 'runner.execute', details: `Executed runner: ${config.name || scriptId} | params: ${paramNames}` });

        const child = spawn(resolvedPath, args);
        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => output += data.toString());
        child.stderr.on('data', (data) => errorOutput += data.toString());

        child.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    code: -1,
                    output: output,
                    error: 'Failed to spawn process: ' + err.message
                });
            }
        });

        child.on('close', (code) => {
            if (code === 0) syncToCloud();
            if (!res.headersSent) {
                res.json({
                    success: code === 0,
                    code: code,
                    output: output,
                    error: errorOutput
                });
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to execute script' });
    }
}

router.post('/execute/:id', requireRole(['admin']), upload.any(), executeScriptHandler);
router.post('/runners/execute/:id', requireRole(['admin']), upload.any(), executeScriptHandler);

module.exports = router;
