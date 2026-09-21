/**
 * ⚡ Blitzortung Real-Time Community Lightning Unit Tests (SSoT §6.2 / IDEA-F04)
 * Validates LZW decompression, distance/bearing math, strike filtering, and schema normalization.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    decodeBlitzortung,
    calculateDistanceMiles,
    calculateBearing,
    bearingToCompass,
    formatStrikeResponse,
    BlitzortungService
} = require('../../control-panel/lib/blitzortung');

describe('Blitzortung Community Lightning Service (IDEA-F04)', () => {
    describe('LZW Decompression (decodeBlitzortung)', () => {
        test('Handles empty and non-string inputs safely', () => {
            expect(decodeBlitzortung('')).toBe('');
            expect(decodeBlitzortung(null)).toBe('');
            expect(decodeBlitzortung(undefined)).toBe('');
        });

        test('Decompresses plain strings without dictionary expansion', () => {
            expect(decodeBlitzortung('abc')).toBe('abc');
        });

        test('Accurately decompresses repeated patterns via LZW dictionary', () => {
            function encodeLZW(str) {
                const dict = {};
                const data = (str + '').split('');
                const out = [];
                let curr = data[0];
                let code = 256;
                for (let i = 1; i < data.length; i++) {
                    const next = data[i];
                    if (dict[curr + next] !== undefined) {
                        curr += next;
                    } else {
                        out.push(curr.length > 1 ? String.fromCharCode(dict[curr]) : curr);
                        dict[curr + next] = code++;
                        curr = next;
                    }
                }
                out.push(curr.length > 1 ? String.fromCharCode(dict[curr]) : curr);
                return out.join('');
            }

            const original = '{"time":1790018318906605600,"lat":41.6045,"lon":-87.1311}';
            const compressed = encodeLZW(original);
            const decoded = decodeBlitzortung(compressed);
            expect(decoded).toBe(original);
        });
    });

    describe('Geodesic Math (Distance & Bearing)', () => {
        const siteLat = 41.6045;
        const siteLon = -87.1311;

        test('Distance between identical coordinates is 0', () => {
            expect(calculateDistanceMiles(siteLat, siteLon, siteLat, siteLon)).toBe(0);
        });

        test('Distance matches known geographic bounds', () => {
            // Approx 1 degree latitude is ~69 miles
            const dist = calculateDistanceMiles(siteLat, siteLon, siteLat + 0.1, siteLon);
            expect(dist).toBeGreaterThan(6);
            expect(dist).toBeLessThan(8);
        });

        test('Calculates cardinal bearings and compass headings accurately', () => {
            // Directly North
            const bearingN = calculateBearing(siteLat, siteLon, siteLat + 0.5, siteLon);
            expect(bearingN).toBe(0);
            expect(bearingToCompass(bearingN)).toBe('N');

            // Directly South
            const bearingS = calculateBearing(siteLat, siteLon, siteLat - 0.5, siteLon);
            expect(bearingS).toBe(180);
            expect(bearingToCompass(bearingS)).toBe('S');

            // East
            const bearingE = calculateBearing(siteLat, siteLon, siteLat, siteLon + 0.5);
            expect(bearingE).toBeGreaterThan(80);
            expect(bearingE).toBeLessThan(100);
            expect(bearingToCompass(bearingE)).toMatch(/E|ENE|ESE/);

            // West
            const bearingW = calculateBearing(siteLat, siteLon, siteLat, siteLon - 0.5);
            expect(bearingW).toBeGreaterThan(260);
            expect(bearingW).toBeLessThan(280);
            expect(bearingToCompass(bearingW)).toMatch(/W|WNW|WSW/);
        });
    });

    describe('Schema Normalization & Strike Filtering (formatStrikeResponse)', () => {
        const siteLat = 41.6045;
        const siteLon = -87.1311;

        test('Filters out strikes beyond radius', () => {
            const strikes = [
                { lat: siteLat + 0.05, lon: siteLon + 0.05, timeMs: Date.now() - 60000 }, // ~4 miles
                { lat: siteLat + 0.8, lon: siteLon + 0.8, timeMs: Date.now() - 60000 }    // ~60 miles
            ];
            const formatted = formatStrikeResponse(strikes, siteLat, siteLon, 15);
            expect(formatted.success).toBe(true);
            expect(formatted.provider).toBe('blitzortung');
            expect(formatted.count).toBe(1);
            expect(formatted.response.length).toBe(1);
            expect(formatted.response[0].relativeTo.distanceMI).toBeLessThan(15);
        });

        test('Filters out strikes older than 35 minutes (OSHA cooldown boundary)', () => {
            const strikes = [
                { lat: siteLat + 0.02, lon: siteLon + 0.02, timeMs: Date.now() - (10 * 60 * 1000) }, // 10 min ago (active)
                { lat: siteLat + 0.02, lon: siteLon + 0.02, timeMs: Date.now() - (40 * 60 * 1000) }  // 40 min ago (expired)
            ];
            const formatted = formatStrikeResponse(strikes, siteLat, siteLon, 15);
            expect(formatted.count).toBe(1);
            expect(formatted.response.length).toBe(1);
        });

        test('Matches canonical YardStik Xweather-compatible schema structure', () => {
            const strikeTime = Date.now() - (5 * 60 * 1000);
            const strikes = [
                { lat: 41.65, lon: -87.10, timeMs: strikeTime }
            ];
            const formatted = formatStrikeResponse(strikes, siteLat, siteLon, 15);
            const entry = formatted.response[0];

            expect(entry.ob).toBeDefined();
            expect(entry.ob.dateTimeISO).toBe(new Date(strikeTime).toISOString());
            expect(entry.ob.timestamp).toBe(Math.floor(strikeTime / 1000));
            expect(entry.loc.lat).toBe(41.65);
            expect(entry.loc.long).toBe(-87.1);
            expect(entry.relativeTo.distanceMI).toBeGreaterThan(0);
            expect(entry.relativeTo.distanceKM).toBeGreaterThan(0);
            expect(entry.relativeTo.bearing).toBeDefined();
            expect(entry.relativeTo.bearingENG).toBeDefined();
            expect(entry.provider).toBe('blitzortung');
        });
    });

    describe('BlitzortungService Lifecycle & Persistence', () => {
        let tempDir;
        let service;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blitz-test-'));
            service = new BlitzortungService({
                latitude: 41.6045,
                longitude: -87.1311,
                radiusMiles: 15,
                dataDir: tempDir,
                enabled: false // do not connect live WS during unit tests
            });
        });

        afterEach(() => {
            if (service) service.stop();
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {}
        });

        test('Ingests raw strike and auto-persists lightning.json when within alert radius', () => {
            const strikeTimestampNs = BigInt(Date.now()) * 1000000n;
            service.addStrike({
                time: strikeTimestampNs.toString(),
                lat: 41.63,
                lon: -87.12,
                alt: 100,
                pol: 1
            });

            const strikes = service.getStrikes();
            expect(strikes.count).toBe(1);
            expect(strikes.response[0].relativeTo.distanceMI).toBeLessThan(15);

            // Verify disk persistence
            const targetFile = path.join(tempDir, 'lightning.json');
            expect(fs.existsSync(targetFile)).toBe(true);
            const saved = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
            expect(saved.success).toBe(true);
            expect(saved.provider).toBe('blitzortung');
            expect(saved.response.length).toBe(1);
        });

        test('Ignores distant strikes outside monitored boundary (> 75 miles)', () => {
            service.addStrike({
                time: Date.now() * 1e6,
                lat: 25.0, // Florida (far from Indiana)
                lon: -80.0
            });
            expect(service.strikes.length).toBe(0);
        });

        test('Provides latest strike helper', () => {
            service.addStrike({
                time: Date.now() * 1e6,
                lat: 41.62,
                lon: -87.12
            });
            const latest = service.getLatestStrike();
            expect(latest).toBeDefined();
            expect(latest.relativeTo.distanceMI).toBeLessThan(15);
        });
    });
});
