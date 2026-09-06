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
        const syncFiles = ['reminders.md', 'equipment.json', 'trackers.json', 'special.json', 'shifts.json', 'version.txt', 'config.json', 'seniority.json', 'features.json', 'tracks.json', 'track-map.svg', 'commodity_rules.json'];

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

// Production Trackers Endpoints
app.get('/api/trackers', (req, res) => {
    try {
        const trackersPath = '/data/trackers.json';
        if (fs.existsSync(trackersPath)) {
            const data = JSON.parse(fs.readFileSync(trackersPath, 'utf8'));
            res.json(data);
        } else {
            res.json({});
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read trackers file' });
    }
});

// Features & Theme Toggles Endpoints
const FEATURES_PATH = '/data/features.json';

app.get('/api/features', (req, res) => {
    try {
        if (fs.existsSync(FEATURES_PATH)) {
            const data = JSON.parse(fs.readFileSync(FEATURES_PATH, 'utf8'));
            res.json(data);
        } else {
            res.json({
                theme_mode: 'auto',
                dedicated_theme: 'default',
                shift_theme_dedication: false,
                shift_themes: { "1": "default", "2": "obsidian", "3": "cyberpunk" },
                features: {
                    weather_fx: true,
                    lightning_radar: true,
                    osha_counter: true,
                    production_tracker: true,
                    equipment_status: true,
                    scale_audit_badges: true,
                    shift_tracker: true,
                    toolbox_talk: true,
                    reminders: true,
                    anniversaries: true,
                    safety_videos: true,
                    mobile_qr: true
                }
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read features configuration' });
    }
});

app.post('/api/features', (req, res) => {
    try {
        const data = req.body;
        fs.writeFileSync(FEATURES_PATH, JSON.stringify(data, null, 4), 'utf8');
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        res.json({ success: true, message: 'Features & theme configuration saved successfully.' });
    } catch (err) {
        console.error('Error saving features:', err);
        res.status(500).json({ error: 'Failed to save features configuration' });
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
        payload.last_audit_reset = getLatestSunday11PMEpoch();
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

// ── Track Management & Track Check API ──────────────────────────────────────
const TRACKS_PATH = '/data/tracks.json';
const TRACK_MAP_PATH = '/data/track-map.svg';

const trackStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = '/tmp';
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, 'track_upload_' + Date.now() + path.extname(file.originalname));
    }
});
const uploadTrack = multer({ storage: trackStorage });

app.get('/api/tracks', (req, res) => {
    try {
        if (fs.existsSync(TRACKS_PATH)) {
            const data = JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
            res.json(data);
        } else {
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to read tracks: ' + e.message });
    }
});

app.post('/api/tracks', express.json(), (req, res) => {
    try {
        const tracks = req.body;
        if (!Array.isArray(tracks)) {
            return res.status(400).json({ error: 'Expected array of tracks' });
        }
        fs.writeFileSync(TRACKS_PATH, JSON.stringify(tracks, null, 2), 'utf8');
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        res.json({ success: true, count: tracks.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save tracks: ' + e.message });
    }
});

app.post('/api/tracks/upload', uploadTrack.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const uploadedPath = req.file.path;
        const parserScript = path.join(__dirname, '../scripts/parse_track_check.py');
        const fallbackScript = path.join(__dirname, 'scripts/parse_track_check.py');
        const scriptToUse = fs.existsSync(parserScript) ? parserScript : fallbackScript;

        const py = spawn('python3', [scriptToUse, uploadedPath, TRACKS_PATH]);
        let stderr = '';
        py.stderr.on('data', (d) => stderr += d.toString());
        py.on('close', (code) => {
            try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
            if (code === 0) {
                fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
                syncToCloud();
                const parsed = JSON.parse(fs.readFileSync(TRACKS_PATH, 'utf8'));
                res.json({ success: true, count: parsed.length, tracks: parsed });
            } else {
                res.status(500).json({ error: 'Parser failed: ' + (stderr || 'Exit code ' + code) });
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'Upload processing failed: ' + e.message });
    }
});

app.post('/api/track-map/upload', uploadTrack.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const uploadedPath = req.file.path;
        const content = fs.readFileSync(uploadedPath, 'utf8');
        if (!content.includes('<svg') && !content.includes('</svg>')) {
            fs.unlinkSync(uploadedPath);
            return res.status(400).json({ error: 'File is not a valid SVG drawing' });
        }
        fs.writeFileSync(TRACK_MAP_PATH, content, 'utf8');
        const localImgPath = path.join(__dirname, '../html/assets/images/track-map.svg');
        if (fs.existsSync(path.dirname(localImgPath))) {
            try { fs.writeFileSync(localImgPath, content, 'utf8'); } catch {}
        }
        const localDataPath = path.join(__dirname, '../html/assets/data/track-map.svg');
        if (fs.existsSync(path.dirname(localDataPath))) {
            try { fs.writeFileSync(localDataPath, content, 'utf8'); } catch {}
        }
        try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
        fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
        syncToCloud();
        res.json({ success: true, message: 'Track map SVG uploaded successfully.' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to upload track map: ' + e.message });
    }
});

app.get('/api/tracks/template', (req, res) => {
    const csvContent = 'Track ID,Track Name,Car Count,Commodity / Contents,Inbound Date (YYYY-MM-DD),Notes\n23,Track 23,0,Empty,,CLEAR\n24,Track 24,4,1 - DL Bale, 3 - Shred S/End,2026-09-01,1 - DL BALE, 3 - SHRED S/END\n48,Track 48,13,DLs (7 - P&S, 6 - Bales),2026-08-19,P&S FROM 8/19\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="standard_track_check_template.csv"');
    res.send(csvContent);
});

app.get('/api/tracks/template-excel', (req, res) => {
    const candidates = [
        path.join(__dirname, 'public', 'example-track-check.xlsx'),
        path.join('/data', 'example-track-check.xlsx'),
        path.join(__dirname, '../html/assets/data', 'example-track-check.xlsx')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return res.download(p, 'example-track-check.xlsx');
        }
    }
    res.status(404).json({ error: 'Excel starter template not found.' });
});

// ── Commodity Rules & Classification API ────────────────────────────────────
const COMMODITY_RULES_PATH = '/data/commodity_rules.json';
const DEFAULT_COMMODITY_RULES = {
    categories: [
        {
            id: "bad_order",
            name: "Bad Order / O.S.",
            color: "#ef4444",
            keywords: ["B.O", "BAD ORDER", "O.S", "O.S.", "OS", "DEFECT", "REPAIR"],
            description: "Bad order cars and out of service track turnouts."
        },
        {
            id: "blend_bof",
            name: "Blend / BOF",
            color: "#00f0ff",
            keywords: ["BLEND", "BOF", "MH82", "MH81", "MH97", "SMS", "MSA"],
            description: "Active blend loading, BOF heats, and mill charges."
        },
        {
            id: "up",
            name: "UP (Hot Rail / Plate)",
            color: "#f97316",
            keywords: ["UP", "HOT RAIL", "SLAB", "SLABS", "ONE CUT", "ONE CUTS", "PLATE", "COBBLE", "HEAVY TRIM", "LIGHT TRIM", "TRIM", "SMASH", "COIL", "COILS", "SCALE", "NOTICE", "MILL SCALE", "SPEAR"],
            description: "Hot rail slabs, plate, cobble, coils, smash, and steel trim products."
        },
        {
            id: "dl",
            name: "DL (Direct Load / Scrap)",
            color: "#c084fc",
            keywords: ["DL", "DL'S", "DLS", "DOG BONE", "DOGBONE", "SLITTER", "SHEET", "SHEETS", "BALE", "BALES", "P&S", "SHRED", "SCRAP", "SWEEP", "TO SWEEP"],
            description: "Direct load scrap, slitter, sheets, baler scrap, P&S, and shred."
        },
        {
            id: "ob_empty",
            name: "OB / Empty",
            color: "#22c55e",
            keywords: ["EMPTY", "CLEAR", "MTY", "OB", "OB'S", "OBS", "OUTBOUND", "FLAT", "FLATS"],
            description: "Outbound loads, empty flats, and cleared tracks."
        },
        {
            id: "raw_materials",
            name: "Raw Materials / HBI",
            color: "#38bdf8",
            keywords: ["HBI", "ORE", "PELLETS", "COAL", "COKE", "LIMESTONE"],
            description: "Raw charge materials, HBI, pellets, and flux."
        }
    ],
    default_color: "#38bdf8"
};

app.get('/api/commodity-rules', (req, res) => {
    try {
        if (fs.existsSync(COMMODITY_RULES_PATH)) {
            const data = JSON.parse(fs.readFileSync(COMMODITY_RULES_PATH, 'utf8'));
            return res.json(data);
        }
        const localPath = path.join(__dirname, '../html/assets/data/commodity_rules.json');
        if (fs.existsSync(localPath)) {
            const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            return res.json(data);
        }
        res.json(DEFAULT_COMMODITY_RULES);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read commodity rules: ' + e.message });
    }
});

app.post('/api/commodity-rules', express.json(), (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !Array.isArray(payload.categories)) {
            return res.status(400).json({ error: 'Expected object with categories array' });
        }
        const formattedJson = JSON.stringify(payload, null, 2);
        
        // Write to container /data path if directory exists
        if (fs.existsSync(path.dirname(COMMODITY_RULES_PATH))) {
            fs.writeFileSync(COMMODITY_RULES_PATH, formattedJson, 'utf8');
        }
        // Write to local repo data path if present
        const localPath = path.join(__dirname, '../html/assets/data/commodity_rules.json');
        if (fs.existsSync(path.dirname(localPath))) {
            fs.writeFileSync(localPath, formattedJson, 'utf8');
        }
        
        // Bump version.txt to instantly refresh Kiosks
        try {
            if (fs.existsSync('/data')) fs.writeFileSync('/data/version.txt', Date.now().toString(), 'utf8');
            const localVer = path.join(__dirname, '../html/assets/data/version.txt');
            if (fs.existsSync(path.dirname(localVer))) fs.writeFileSync(localVer, Date.now().toString(), 'utf8');
        } catch {}

        syncToCloud();
        res.json({ success: true, count: payload.categories.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save commodity rules: ' + e.message });
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
