const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/config.json';

// Dynamic Auth helper: reads credentials from config.json (or env / default fallback)
function getAuthConfig() {
    let username = process.env.AUTH_USERNAME || 'admin';
    let password = process.env.AUTH_PASSWORD || 'MasterPassword123';
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (cfg.admin_username) username = cfg.admin_username;
            if (cfg.admin_password) password = cfg.admin_password;
        }
    } catch (e) {
        console.error('Error reading auth from config:', e);
    }
    return { username, password };
}

// Helper to push live ephemeral files to Vercel Cloud for mobile and remote viewers
async function syncToCloud() {
    try {
        checkAndPerformAuditReset();
        let siteConfig = {};
        if (fs.existsSync(CONFIG_PATH)) {
            siteConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
        if (!siteConfig.vercel_api_url) return; // Cloud sync disabled if vercel_api_url not specified
        const vercelBase = siteConfig.vercel_api_url.replace(/\/+$/, '');
        const siteId = siteConfig.site_id || 'default-site';

        const filesToSync = {};
        const syncFiles = ['reminders.md', 'equipment.json', 'trackers.json', 'special.json', 'shifts.json', 'version.txt', 'config.json', 'seniority.json'];

        syncFiles.forEach(f => {
            const p = path.join('/data', f);
            if (fs.existsSync(p)) {
                try {
                    const raw = fs.readFileSync(p, 'utf8');
                    filesToSync[f] = f.endsWith('.json') ? JSON.parse(raw) : raw;
                } catch {}
            }
        });

        if (Object.keys(filesToSync).length === 0) return;

        const payload = {
            site_id: siteId,
            secret: siteConfig.sync_secret || '',
            files: filesToSync
        };

        const res = await fetch(`${vercelBase}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`[Cloud Sync] Pushed ${Object.keys(filesToSync).length} ephemeral files to ${vercelBase}`);
        } else {
            console.warn(`[Cloud Sync] Cloud returned status: ${res.status}`);
        }
    } catch (e) {
        console.warn(`[Cloud Sync] Offline / skipped (${e.message})`);
    }
}

// Basic Auth Middleware to protect the Control Panel
app.use((req, res, next) => {
    // Allow CORS preflight requests
    if (req.method === 'OPTIONS') return next();
    
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    const auth = getAuthConfig();
    if (login && password && login === auth.username && password === auth.password) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Kiosk Control Panel"');
    res.status(401).send('Authentication required.');
});

// Serve the frontend UI
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/data', express.static('/data'));

// Set up multer for file uploads
const upload = multer({ dest: '/tmp/uploads/' });

// Define paths based on whether we are in Docker or local dev
const RUNNERS_DIR = process.env.RUNNERS_DIR || '/app/conf/runners';

app.get('/api/scripts', (req, res) => {
    try {
        const files = fs.readdirSync(RUNNERS_DIR).filter(f => f.endsWith('.json'));
        const scripts = files.map(file => {
            const content = fs.readFileSync(path.join(RUNNERS_DIR, file), 'utf8');
            const data = JSON.parse(content);
            data.id = file.replace('.json', '');
            return data;
        });
        
        // Sort alphabetically by name
        scripts.sort((a, b) => a.name.localeCompare(b.name));
        res.json(scripts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load scripts config' });
    }
});

// Native Markdown Editor Endpoints
const REMINDERS_PATH = '/data/reminders.md'; // Mapped from ./html/assets/data

app.get('/api/reminders', (req, res) => {
    try {
        if (fs.existsSync(REMINDERS_PATH)) {
            const content = fs.readFileSync(REMINDERS_PATH, 'utf8');
            res.send(content);
        } else {
            res.send('# Announcements\n\nNo reminders configured yet.');
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read reminders file' });
    }
});

app.post('/api/reminders', express.text({type: '*/*'}), (req, res) => {
    try {
        let body = req.body;
        // Convert !LIMIT DD-HH into an absolute !EXPIRE YYYY-MM-DD-HH timestamp
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
        
        fs.writeFileSync(REMINDERS_PATH, body, 'utf8');
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        res.json({ success: true, message: 'Reminders saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save reminders file' });
    }
});

// Native Equipment Editor Endpoints
const EQUIPMENT_PATH = '/data/equipment.json'; // Mapped from ./html/assets/data

function getLatestSunday11PMEpoch(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sunday, 1 = Monday...
    const hours = d.getHours();
    
    let daysToSubtract = day;
    if (day === 0 && hours < 23) {
        daysToSubtract = 7;
    }
    
    const sunday11pm = new Date(d);
    sunday11pm.setDate(d.getDate() - daysToSubtract);
    sunday11pm.setHours(23, 0, 0, 0);
    return sunday11pm.getTime();
}

function processWeeklyAuditReset(data) {
    if (!data || !data.categories) return false;
    const latestSundayReset = getLatestSunday11PMEpoch();
    
    if (!data.last_audit_reset || data.last_audit_reset < latestSundayReset) {
        let changed = false;
        data.categories.forEach(cat => {
            if ((cat.name || '').trim().toLowerCase() === 'mobile cranes' && Array.isArray(cat.items)) {
                cat.items.forEach(item => {
                    if (item.blend_audit === true) {
                        item.blend_audit = false;
                        changed = true;
                    }
                });
            }
        });
        data.last_audit_reset = latestSundayReset;
        return true;
    }
    return false;
}

function checkAndPerformAuditReset() {
    try {
        if (!fs.existsSync(EQUIPMENT_PATH)) return false;
        const raw = fs.readFileSync(EQUIPMENT_PATH, 'utf8');
        let data = JSON.parse(raw);
        if (processWeeklyAuditReset(data)) {
            console.log('[Audit Engine] Sunday 11:00 PM weekly audit reset executed. Resetting all Mobile Cranes audits to false.');
            fs.writeFileSync(EQUIPMENT_PATH, JSON.stringify(data, null, 2), 'utf8');
            try {
                fs.writeFileSync('/data/version.txt', Math.floor(Date.now() / 1000).toString(), 'utf8');
            } catch {}
            return true;
        }
    } catch (e) {
        console.error('[Audit Engine] Error checking weekly audit reset:', e);
    }
    return false;
}

app.get('/api/equipment', (req, res) => {
    try {
        if (fs.existsSync(EQUIPMENT_PATH)) {
            const raw = fs.readFileSync(EQUIPMENT_PATH, 'utf8');
            let data = JSON.parse(raw);
            if (processWeeklyAuditReset(data)) {
                fs.writeFileSync(EQUIPMENT_PATH, JSON.stringify(data, null, 2), 'utf8');
                try {
                    fs.writeFileSync('/data/version.txt', Math.floor(Date.now() / 1000).toString(), 'utf8');
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

app.post('/api/equipment', express.json(), (req, res) => {
    try {
        const payload = req.body || { categories: [] };
        if (!payload.last_audit_reset) {
            payload.last_audit_reset = getLatestSunday11PMEpoch();
        }
        processWeeklyAuditReset(payload);
        fs.writeFileSync(EQUIPMENT_PATH, JSON.stringify(payload, null, 2), 'utf8');
        
        // Bump version.txt to instantly refresh Kiosk TVs
        try {
            fs.writeFileSync('/data/version.txt', Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {
            console.error('Failed to bump version.txt', vErr);
        }
        
        syncToCloud();
        res.json({ success: true, message: 'Equipment saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save equipment file' });
    }
});

// Native Shift Schedule Editor Endpoints
const SHIFTS_PATH = '/data/shifts.json';

app.get('/api/shifts', (req, res) => {
    try {
        if (fs.existsSync(SHIFTS_PATH)) {
            const content = fs.readFileSync(SHIFTS_PATH, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.send(content);
        } else {
            res.json({ shifts: [] });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read shifts file' });
    }
});

app.post('/api/shifts', express.json(), (req, res) => {
    try {
        fs.writeFileSync(SHIFTS_PATH, JSON.stringify(req.body, null, 2), 'utf8');
        try {
            fs.writeFileSync('/data/version.txt', Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {
            console.error('Failed to bump version.txt', vErr);
        }
        syncToCloud();
        res.json({ success: true, message: 'Shift schedules saved successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save shifts file' });
    }
});

// Native Seniority Overrides API Endpoints
const SENIORITY_PATH = '/data/seniority.json';

app.get('/api/seniority', (req, res) => {
    try {
        if (fs.existsSync(SENIORITY_PATH)) {
            const content = fs.readFileSync(SENIORITY_PATH, 'utf8');
            res.json(JSON.parse(content));
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read seniority file' });
    }
});

app.post('/api/seniority', express.json(), (req, res) => {
    try {
        fs.writeFileSync(SENIORITY_PATH, JSON.stringify(req.body, null, 2), 'utf8');
        try {
            fs.writeFileSync('/data/version.txt', Math.floor(Date.now() / 1000).toString(), 'utf8');
        } catch (vErr) {}
        syncToCloud();
        res.json({ success: true, message: 'Seniority records saved and synced successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save seniority file' });
    }
});

// We accept any file uploads. Multer handles it.
app.post('/api/execute/:id', upload.any(), (req, res) => {
    const scriptId = req.params.id;
    const configPath = path.join(RUNNERS_DIR, `${scriptId}.json`);
    
    if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Script configuration not found' });
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const args = [];
        
        // Build arguments list based on the configuration parameters
        if (config.parameters) {
            config.parameters.forEach(p => {
                let val = req.body[p.name];
                
                if (p.type === 'file_upload') {
                    // Find the uploaded file in req.files
                    const file = req.files.find(f => f.fieldname === p.name);
                    if (file) {
                        val = file.path;
                    }
                }
                
                if (val !== undefined && val !== '') {
                    if (p.param) {
                        args.push(p.param);
                    }
                    args.push(val);
                }
            });
        }
        
        console.log(`Executing: ${config.script_path} ${args.join(' ')}`);
        
        const child = spawn(config.script_path, args);
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) syncToCloud();
            res.json({
                success: code === 0,
                code: code,
                output: output,
                error: errorOutput
            });
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to execute script' });
    }
});

// Special Event API
app.get('/api/special-event', (req, res) => {
    try {
        if (fs.existsSync('/data/special.json')) {
            const data = fs.readFileSync('/data/special.json', 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({ error: 'No special event found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/special-event', upload.single('image'), (req, res) => {
    try {
        let currentData = {};
        if (fs.existsSync('/data/special.json')) {
            currentData = JSON.parse(fs.readFileSync('/data/special.json', 'utf8'));
        }
        
        currentData.title = req.body.title || '';
        currentData.description = req.body.description || '';
        currentData.duration = req.body.duration || '20';
        currentData.endTime = req.body.endTime || '';
        
        if (req.file) {
            const ext = path.extname(req.file.originalname);
            const imgPath = `/data/special_img${ext}`;
            fs.copyFileSync(req.file.path, imgPath);
            currentData.image = `assets/data/special_img${ext}`;
        }
        
        fs.writeFileSync('/data/special.json', JSON.stringify(currentData, null, 2));
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        res.json({ success: true, image: currentData.image });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/special-event', (req, res) => {
    try {
        if (fs.existsSync('/data/special.json')) {
            const data = JSON.parse(fs.readFileSync('/data/special.json', 'utf8'));
            if (data.image) {
                const imgPath = '/data/' + data.image.split('/').pop();
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            }
            fs.unlinkSync('/data/special.json');
        }
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Site Settings API ──────────────────────────────────────────────────────
// Reads and writes /opt/config.json (mounted from /opt/kiosk-data/config.json on the host)
const CONFIG_DEFAULTS = {
    site_name: 'Kiosk — Location Name',
    site_id: 'kiosk-location',
    latitude: 32.7767,
    longitude: -96.7970,
    timezone: 'America/Chicago',
    vercel_api_url: '',
    admin_username: 'admin'
};

app.get('/api/site-config', (req, res) => {
    try {
        let data = {};
        if (fs.existsSync(CONFIG_PATH)) {
            data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
        const safeConfig = { ...CONFIG_DEFAULTS, ...data };
        // Never return raw password to frontend
        delete safeConfig.admin_password;
        res.json(safeConfig);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read site config: ' + e.message });
    }
});

app.post('/api/site-config', express.json(), (req, res) => {
    try {
        const current = fs.existsSync(CONFIG_PATH)
            ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
            : {};

        // Allow known safe keys
        const allowed = ['site_name', 'site_id', 'latitude', 'longitude', 'timezone', 'vercel_api_url', 'admin_username'];
        const updated = { ...current };
        allowed.forEach(key => {
            if (req.body[key] !== undefined) updated[key] = req.body[key];
        });

        // Update password if a new non-empty password was supplied
        if (typeof req.body.admin_password === 'string' && req.body.admin_password.trim().length > 0) {
            updated.admin_password = req.body.admin_password.trim();
        }

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
        // Also save sanitized config to /data/config.json so the kiosk frontend reads it cleanly
        const safeFrontendConfig = { ...updated };
        delete safeFrontendConfig.admin_password;
        fs.writeFileSync('/data/config.json', JSON.stringify(safeFrontendConfig, null, 2), 'utf8');

        // Bump version.txt so the kiosk reloads and picks up the new config
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        
        const returnConfig = { ...updated };
        delete returnConfig.admin_password;
        res.json({ success: true, config: returnConfig });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save site config: ' + e.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Control Panel Server running on port ${PORT}`);
    checkAndPerformAuditReset();
    setTimeout(syncToCloud, 3000);
    setInterval(syncToCloud, 5 * 60 * 1000);
    setInterval(checkAndPerformAuditReset, 60 * 1000); // Check every 60s for Sunday 11:00 PM audit reset
});
