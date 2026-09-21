const fs = require('fs');
const path = require('path');

/**
  * Bumps version.txt to trigger browser live-reload on all connected kiosk clients.
  * Standardised on milliseconds (Date.now()) for consistency across all callers.
  * @param {string} [dataDir] Optional directory override, defaults to DATA_DIR env or '/data'
  */
function bumpVersion(dataDir) {
    const dir = dataDir || process.env.DATA_DIR || '/data';
    try {
        fs.writeFileSync(path.join(dir, 'version.txt'), Date.now().toString(), 'utf8');
    } catch (e) {
        console.error('[Version] Failed to bump version.txt:', e.message);
    }
}

module.exports = { bumpVersion };
