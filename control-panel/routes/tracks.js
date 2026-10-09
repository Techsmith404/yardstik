const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logAction } = require('../lib/audit');
const { syncToCloud } = require('../lib/cloud');
const { bumpVersion } = require('../lib/version');
const { validateAndSanitizeSvg } = require('../lib/svg-sanitizer');
const { requireRole } = require('../middleware/auth');

function getDataDir() {
    return process.env.DATA_DIR || '/data';
}

function getTracksPath() {
    return process.env.TRACKS_PATH || path.join(getDataDir(), 'tracks.json');
}

function getTrackMapPath() {
    return process.env.TRACK_MAP_PATH || path.join(getDataDir(), 'track-map.svg');
}

function getCommodityRulesPath() {
    return process.env.COMMODITY_RULES_PATH || path.join(getDataDir(), 'commodity_rules.json');
}

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

// Executes Python parsing engine for uploaded spreadsheets
function executeTrackParser(uploadedPath) {
    return new Promise((resolve, reject) => {
        const parserScript = path.join(__dirname, '../scripts/parse_track_check.py');
        const tracksPath = getTracksPath();
        const dataDir = getDataDir();
        const py = spawn('python3', [parserScript, uploadedPath, tracksPath]);
        let stderr = '';
        py.stderr.on('data', (d) => stderr += d.toString());
        py.on('error', (err) => {
            try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
            reject(new Error('Failed to launch parser process: ' + err.message));
        });
        py.on('close', (code) => {
            try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
            if (code === 0) {
                bumpVersion(dataDir);
                syncToCloud();
                let parsed = [];
                try {
                    parsed = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));
                } catch {}
                resolve(parsed);
            } else {
                reject(new Error(stderr || 'Exit code ' + code));
            }
        });
    });
}

// ── Tracks Endpoints ────────────────────────────────────────────────────────

router.get('/tracks', (req, res) => {
    try {
        const tracksPath = getTracksPath();
        if (fs.existsSync(tracksPath)) {
            const data = JSON.parse(fs.readFileSync(tracksPath, 'utf8'));
            res.json(data);
        } else {
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to read tracks: ' + e.message });
    }
});

router.post('/tracks', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const tracks = req.body;
        if (!Array.isArray(tracks)) {
            return res.status(400).json({ error: 'Expected array of tracks' });
        }
        const tracksPath = getTracksPath();
        const dataDir = getDataDir();
        fs.writeFileSync(tracksPath, JSON.stringify(tracks, null, 2), 'utf8');
        bumpVersion(dataDir);
        logAction({ req, user: req.user, action: 'tracks.update', details: `Updated ${tracks.length} track records.` });
        syncToCloud();
        res.json({ success: true, count: tracks.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save tracks: ' + e.message });
    }
});

router.post('/tracks/upload', requireRole(['admin']), uploadTrack.single('file'), async (req, res) => {
    try {
        let uploadedPath = req.file ? req.file.path : null;

        if (!uploadedPath && req.body && (req.body.file_base64 || req.body.content)) {
            const rawBase64 = req.body.file_base64 || req.body.content;
            const b64 = typeof rawBase64 === 'object' && rawBase64.$content ? rawBase64.$content : rawBase64;
            const buf = Buffer.from(b64, 'base64');
            uploadedPath = path.join('/tmp', `direct_upload_${Date.now()}_${req.body.filename || 'track_check.xlsx'}`);
            fs.writeFileSync(uploadedPath, buf);
        }

        if (!uploadedPath) {
            return res.status(400).json({ error: 'No file uploaded or file_base64 provided' });
        }

        const parsed = await executeTrackParser(uploadedPath);
        logAction({ req, user: req.user, action: 'tracks.upload', details: `Uploaded and parsed track spreadsheet (${parsed.length} tracks).` });
        res.json({ success: true, count: parsed.length, tracks: parsed });
    } catch (e) {
        res.status(500).json({ error: 'Upload processing failed: ' + e.message });
    }
});

router.get('/tracks/template', (req, res) => {
    const csvContent = 'Track ID,Track Name,Car Count,Commodity / Contents,Inbound Date (YYYY-MM-DD),Notes\n23,Track 23,0,Empty,,CLEAR\n24,Track 24,4,1 - DL Bale, 3 - Shred S/End,2026-09-01,1 - DL BALE, 3 - SHRED S/END\n48,Track 48,13,DLs (7 - P&S, 6 - Bales),2026-08-19,P&S FROM 8/19\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="standard_track_check_template.csv"');
    res.send(csvContent);
});

router.get('/tracks/template-excel', (req, res) => {
    const dataDir = getDataDir();
    const candidates = [
        path.join(__dirname, '../public', 'example-track-check.xlsx'),
        path.join(dataDir, 'example-track-check.xlsx'),
        path.join(__dirname, '../../html/assets/data', 'example-track-check.xlsx')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return res.download(p, 'example-track-check.xlsx');
        }
    }
    res.status(404).json({ error: 'Excel starter template not found.' });
});

// ── Track Map Upload Endpoint ───────────────────────────────────────────────

router.post('/track-map/upload', requireRole(['admin']), uploadTrack.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const uploadedPath = req.file.path;
        const content = fs.readFileSync(uploadedPath, 'utf8');
        const validation = validateAndSanitizeSvg(content);
        if (!validation.valid) {
            fs.unlinkSync(uploadedPath);
            return res.status(400).json({ error: validation.error });
        }

        const cleanSvg = validation.cleanSvg;
        const trackMapPath = getTrackMapPath();
        const dataDir = getDataDir();
        fs.writeFileSync(trackMapPath, cleanSvg, 'utf8');
        if (process.env.NODE_ENV !== 'test') {
            const localImgPath = path.join(__dirname, '../../html/assets/images/track-map.svg');
            if (fs.existsSync(path.dirname(localImgPath))) {
                try { fs.writeFileSync(localImgPath, cleanSvg, 'utf8'); } catch {}
            }
            const localDataPath = path.join(__dirname, '../../html/assets/data/track-map.svg');
            if (fs.existsSync(path.dirname(localDataPath))) {
                try { fs.writeFileSync(localDataPath, cleanSvg, 'utf8'); } catch {}
            }
        }
        try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch {}
        bumpVersion(dataDir);
        logAction({ req, user: req.user, action: 'track_map.upload', details: 'Uploaded new SVG track map vector.' });
        syncToCloud();
        res.json({ success: true, message: 'Track map SVG uploaded successfully.' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to upload track map: ' + e.message });
    }
});

// ── Commodity Rules Endpoints ───────────────────────────────────────────────

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
            name: "DL (Download / Scrap)",
            color: "#c084fc",
            keywords: ["DL", "DL'S", "DLS", "DOWNLOAD", "DOWNLOADS", "DOG BONE", "DOGBONE", "SLITTER", "SHEET", "SHEETS", "BALE", "BALES", "P&S", "SHRED", "SCRAP", "SWEEP", "TO SWEEP"],
            description: "Download scrap, slitter, sheets, baler scrap, P&S, and shred."
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

router.get('/commodity-rules', (req, res) => {
    try {
        const rulesPath = getCommodityRulesPath();
        if (fs.existsSync(rulesPath)) {
            const data = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
            return res.json(data);
        }
        const localPath = path.join(__dirname, '../../html/assets/data/commodity_rules.json');
        if (fs.existsSync(localPath)) {
            const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            return res.json(data);
        }
        res.json(DEFAULT_COMMODITY_RULES);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read commodity rules: ' + e.message });
    }
});

router.post('/commodity-rules', requireRole(['admin']), express.json(), (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !Array.isArray(payload.categories)) {
            return res.status(400).json({ error: 'Expected object with categories array' });
        }
        const formattedJson = JSON.stringify(payload, null, 2);
        const rulesPath = getCommodityRulesPath();

        if (fs.existsSync(path.dirname(rulesPath))) {
            fs.writeFileSync(rulesPath, formattedJson, 'utf8');
        }
        if (process.env.NODE_ENV !== 'test') {
            const localPath = path.join(__dirname, '../../html/assets/data/commodity_rules.json');
            if (fs.existsSync(path.dirname(localPath))) {
                fs.writeFileSync(localPath, formattedJson, 'utf8');
            }
            const localVer = path.join(__dirname, '../../html/assets/data/version.txt');
            if (fs.existsSync(path.dirname(localVer))) fs.writeFileSync(localVer, Date.now().toString(), 'utf8');
        }

        logAction({ req, user: req.user, action: 'commodity_rules.update', details: `Saved ${payload.categories.length} commodity rules.` });
        syncToCloud();
        res.json({ success: true, count: payload.categories.length });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save commodity rules: ' + e.message });
    }
});

module.exports = router;
