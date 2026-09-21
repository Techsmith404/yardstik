const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getBlitzortungService } = require('../lib/blitzortung');
const { syncToCloud } = require('../lib/cloud');

router.get('/lightning', (req, res) => {
    try {
        const configPath = process.env.CONFIG_PATH || '/opt/config.json';
        const dataDir = process.env.DATA_DIR || '/data';
        let siteConfig = {};
        if (fs.existsSync(configPath)) {
            try { siteConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
        }
        let lat = parseFloat(req.query.lat);
        let lon = parseFloat(req.query.lon);
        let radius = parseFloat(req.query.radius) || 15;
        if (isNaN(lat)) lat = siteConfig.latitude || 41.6045;
        if (isNaN(lon)) lon = siteConfig.longitude || -87.1311;

        const lightningFilePath = path.join(dataDir, 'lightning.json');
        const blitz = getBlitzortungService({
            latitude: lat,
            longitude: lon,
            radiusMiles: radius,
            dataDir: dataDir,
            onStrike: () => {
                syncToCloud().catch(() => {});
            }
        });

        const liveData = blitz.getStrikes(lat, lon, radius);
        if (liveData.count > 0 || !fs.existsSync(lightningFilePath)) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
            return res.json(liveData);
        }

        try {
            const raw = fs.readFileSync(lightningFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
            return res.json(parsed);
        } catch {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
            return res.json(liveData);
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, response: [] });
    }
});

module.exports = router;
