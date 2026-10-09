const fs = require('fs');
const path = require('path');
const { checkAndPerformAuditReset } = require('./audit-reset');
const { bumpVersion } = require('./version');

/**
 * Helper to resolve the current active toolbox slide (or manual override)
 */
function getCurrentToolboxSlideInfo(dataDirOverride) {
    const dataDir = dataDirOverride || process.env.DATA_DIR || '/data';
    try {
        const actualNow = new Date();
        const now = new Date(actualNow.getTime() + (60 * 60 * 1000)); // Shift +1h for 11:00 PM rollover
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

        // 1. Check trackers.json for manual daily override
        const trackersPath = path.join(dataDir, 'trackers.json');
        if (fs.existsSync(trackersPath)) {
            try {
                const trackers = JSON.parse(fs.readFileSync(trackersPath, 'utf8'));
                if (trackers.toolbox_override_date === todayStr && trackers.toolbox_override_file) {
                    const overridePath = path.join(dataDir, trackers.toolbox_override_file);
                    if (fs.existsSync(overridePath)) {
                        return { filename: trackers.toolbox_override_file, filePath: overridePath, isOverride: true, slideNum: 'override' };
                    }
                }
            } catch {}
        }

        // 2. Day-of-year calculation
        const start = new Date(Date.UTC(now.getFullYear(), 0, 0));
        const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const dayOfYear = Math.round((todayUTC - start) / (1000 * 60 * 60 * 24));
        const year = now.getFullYear();
        const isLeap = ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
        let slideNum = dayOfYear;
        if (isLeap) {
            if (dayOfYear === 60) slideNum = 20;
            else if (dayOfYear > 60) slideNum = dayOfYear - 1;
        }
        const paddedNum = slideNum.toString().padStart(3, '0');
        const targetFilename = `${paddedNum}.png`;

        const candidateDirs = [
            process.env.SAFETY_SLIDES_DIR,
            '/safety-slides',
            '/opt/kiosk-data/safety-slides',
            path.join(dataDir, 'safety-slides'),
            path.join(__dirname, '../../html/assets/safety-slides'),
            path.join(__dirname, '../public/safety-slides')
        ].filter(Boolean);

        for (const dir of candidateDirs) {
            const candidatePath = path.join(dir, targetFilename);
            if (fs.existsSync(candidatePath)) {
                return { filename: targetFilename, filePath: candidatePath, isOverride: false, slideNum: paddedNum };
            }
        }
    } catch (err) {
        console.warn('[Toolbox Sync] Error resolving slide:', err.message);
    }
    return null;
}

/**
 * Helper to push live ephemeral files to Vercel Cloud for mobile and remote viewers
 */
async function syncToCloud() {
    const configPath = process.env.CONFIG_PATH || '/opt/config.json';
    const dataDir = process.env.DATA_DIR || '/data';
    try {
        checkAndPerformAuditReset();
        let siteConfig = {};
        if (fs.existsSync(configPath)) {
            siteConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        if (!siteConfig.vercel_api_url) return;
        const vercelBase = siteConfig.vercel_api_url.replace(/\/+$/, '');
        const siteId = siteConfig.site_id || 'default-site';

        const filesToSync = {};
        const syncFiles = [
            'reminders.md', 'equipment.json', 'trackers.json', 'special.json',
            'shifts.json', 'version.txt', 'config.json', 'seniority.json',
            'features.json', 'tracks.json', 'track-map.svg', 'commodity_rules.json',
            'anniversaries.json', 'safety_videos.json', 'lightning.json'
        ];

        syncFiles.forEach(f => {
            const p = path.join(dataDir, f);
            if (fs.existsSync(p)) {
                try {
                    const raw = fs.readFileSync(p, 'utf8');
                    filesToSync[f] = f.endsWith('.json') ? JSON.parse(raw) : raw;
                } catch {}
            }
        });

        // Attach current single daily toolbox slide as base64
        const slideInfo = getCurrentToolboxSlideInfo(dataDir);
        if (slideInfo && fs.existsSync(slideInfo.filePath)) {
            try {
                const imgBuf = fs.readFileSync(slideInfo.filePath);
                if (imgBuf.length > 0 && imgBuf.length <= 5 * 1024 * 1024) {
                    filesToSync['toolbox_slide.png'] = imgBuf.toString('base64');
                    filesToSync['toolbox_slide_meta.json'] = {
                        slide_number: slideInfo.slideNum,
                        filename: slideInfo.filename,
                        is_override: slideInfo.isOverride,
                        updated_at: Date.now()
                    };
                }
            } catch (slideErr) {
                console.warn('[Cloud Sync] Failed to attach toolbox slide:', slideErr.message);
            }
        }

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

/** Fire-and-forget cloud sync with error logging */
function triggerSync() {
    syncToCloud().catch(e => console.warn('[Cloud Sync]', e.message));
}

/**
 * Periodically pulls Novara LMS video compliance and anniversary data
 * from Vercel using the secure x-sync-secret header and caches flat-files locally.
 */
async function syncNovaraData() {
    const configPath = process.env.CONFIG_PATH || '/opt/config.json';
    const dataDir = process.env.DATA_DIR || '/data';
    try {
        let siteConfig = {};
        if (fs.existsSync(configPath)) {
            siteConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        if (!siteConfig.vercel_api_url || !siteConfig.sync_secret) return;
        const vercelBase = siteConfig.vercel_api_url.replace(/\/+$/, '');
        const siteId = siteConfig.site_id || 'default-site';

        const res = await fetch(`${vercelBase}/api/novara?site=${encodeURIComponent(siteId)}`, {
            headers: { 'x-sync-secret': siteConfig.sync_secret }
        });
        if (!res.ok) {
            console.warn(`[Novara Sync] Remote /api/novara returned HTTP ${res.status}`);
            return;
        }
        const data = await res.json();
        if (!data || !data.success) return;

        let changed = false;

        // 1. Process safety videos
        const safetyVideosPayload = {
            success: true,
            totalMissing: data.totalMissing || 0,
            totalIncomplete: data.totalIncomplete || 0,
            totalExpiring: data.totalExpiring || 0,
            employeeCount: data.employeeCount || 0,
            response: data.response || [],
            updated_at: Date.now()
        };
        const safetyVideosPath = path.join(dataDir, 'safety_videos.json');
        const prevSafetyVideos = fs.existsSync(safetyVideosPath) ? fs.readFileSync(safetyVideosPath, 'utf8') : '';
        const newSafetyVideosStr = JSON.stringify(safetyVideosPayload, null, 2);
        if (prevSafetyVideos !== newSafetyVideosStr) {
            fs.writeFileSync(safetyVideosPath, newSafetyVideosStr, 'utf8');
            changed = true;
        }

        // 2. Process anniversaries
        const anniversariesPayload = {
            is_today: data.anniversaries?.is_today || false,
            employees: data.anniversaries?.employees || [],
            updated_at: Date.now()
        };
        const anniversariesPath = path.join(dataDir, 'anniversaries.json');
        const prevAnniversaries = fs.existsSync(anniversariesPath) ? fs.readFileSync(anniversariesPath, 'utf8') : '';
        const newAnniversariesStr = JSON.stringify(anniversariesPayload, null, 2);
        if (prevAnniversaries !== newAnniversariesStr) {
            fs.writeFileSync(anniversariesPath, newAnniversariesStr, 'utf8');
            changed = true;
        }

        if (changed) {
            console.log('[Novara Sync] Refreshed safety_videos.json and anniversaries.json');
            bumpVersion(dataDir);
            triggerSync();
        }
    } catch (e) {
        console.warn('[Novara Sync] Error syncing Novara data:', e.message);
    }
}

module.exports = {
    getCurrentToolboxSlideInfo,
    syncToCloud,
    triggerSync,
    syncNovaraData
};
