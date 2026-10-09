/**
 * ⚡ Blitzortung Real-Time Community Lightning Service (IDEA-F04 / Option A)
 * Ingests free, crowdsourced Time-of-Arrival (TOA) lightning strikes via Blitzortung WebSocket
 * feed, eliminates Xweather 10x API billing multipliers, and normalizes strike payloads
 * to the exact YardStik radar/proximity schema for OSHA 30-minute safety compliance.
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const BLITZORTUNG_SERVERS = [
    'wss://ws1.blitzortung.org',
    'wss://ws7.blitzortung.org'
];

/**
 * LZW Decompression algorithm for Blitzortung WebSocket packets.
 * Blitzortung frames are compressed with character-level dictionary encoding.
 */
function decodeBlitzortung(b) {
    if (!b || typeof b !== 'string') return '';
    const e = {};
    const d = Array.from(b);
    let c = d[0];
    let f = c;
    const g = [c];
    let h = 256;
    let o = h;
    for (let i = 1; i < d.length; i++) {
        const charCode = d[i].charCodeAt(0);
        let a = h > charCode ? d[i] : (e[charCode] !== undefined ? e[charCode] : null);
        if (!a) {
            a = f + c;
        }
        g.push(a);
        c = a[0];
        e[o] = f + c;
        o++;
        f = a;
    }
    return g.join('');
}

/**
 * Great-circle distance using Haversine formula (returns statute miles).
 */
function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in statute miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Initial compass bearing in degrees (0-360) from point 1 to point 2.
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return Math.round(brng);
}

/**
 * Converts degree bearing (0-360) to 16-wind compass abbreviation (e.g. N, SSW, ENE).
 */
function bearingToCompass(bearing) {
    const sectors = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(bearing / 22.5) % 16;
    return sectors[idx];
}

/**
 * Formats internal strike objects into the canonical normalized YardStik schema
 * consumed by html/js/modules/lightning.js, mobile.js, and tests.
 */
function formatStrikeResponse(strikes, targetLat, targetLon, radiusMiles = 15) {
    const now = Date.now();
    const maxAgeMs = 35 * 60 * 1000; // 35 minutes (covers 30-min OSHA cooldown + 5-min buffer)

    const nearby = strikes
        .filter(s => {
            const age = now - s.timeMs;
            if (age > maxAgeMs) return false;
            const dist = calculateDistanceMiles(targetLat, targetLon, s.lat, s.lon);
            return dist <= radiusMiles;
        })
        .map(s => {
            const distMiles = calculateDistanceMiles(targetLat, targetLon, s.lat, s.lon);
            const bearing = calculateBearing(targetLat, targetLon, s.lat, s.lon);
            const compass = bearingToCompass(bearing);
            return {
                ob: {
                    dateTimeISO: new Date(s.timeMs).toISOString(),
                    timestamp: Math.floor(s.timeMs / 1000)
                },
                loc: {
                    lat: Number(s.lat.toFixed(4)),
                    long: Number(s.lon.toFixed(4))
                },
                relativeTo: {
                    distanceMI: Number(distMiles.toFixed(1)),
                    distanceKM: Number((distMiles * 1.60934).toFixed(1)),
                    bearing: bearing,
                    bearingENG: compass
                },
                provider: 'blitzortung'
            };
        })
        // Sort closest first, then most recent
        .sort((a, b) => a.relativeTo.distanceMI - b.relativeTo.distanceMI || b.ob.timestamp - a.ob.timestamp);

    return {
        success: true,
        provider: 'blitzortung',
        count: nearby.length,
        response: nearby
    };
}

class BlitzortungService {
    constructor(options = {}) {
        this.latitude = options.latitude || 41.6045;
        this.longitude = options.longitude || -87.1311;
        this.radiusMiles = options.radiusMiles || 15;
        this.dataDir = options.dataDir || '/data';
        this.onStrike = options.onStrike || null;
        this.enabled = options.enabled !== false;

        this.ws = null;
        this.serverIndex = 0;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.isStarted = false;
        this.lastMessageTime = 0;

        // Circular buffer storing strikes within monitored boundary (max 50 miles)
        this.strikes = [];
        this.maxBufferLength = 200;
    }

    start() {
        if (this.isStarted || !this.enabled) return;
        this.isStarted = true;
        this.connect();
    }

    stop() {
        this.isStarted = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                this.ws.close();
            } catch {}
            this.ws = null;
        }
    }

    connect() {
        if (!this.isStarted) return;
        const serverUrl = BLITZORTUNG_SERVERS[this.serverIndex % BLITZORTUNG_SERVERS.length];

        try {
            this.ws = new WebSocket(serverUrl, {
                headers: {
                    Origin: 'https://www.lightningmaps.org',
                    'User-Agent': 'YardStik-Lightning-Monitor/1.0'
                },
                handshakeTimeout: 10000
            });

            this.ws.on('open', () => {
                this.reconnectAttempts = 0;
                this.lastMessageTime = Date.now();
                // Send standard Blitzortung handshake to initiate data flow
                try {
                    this.ws.send(JSON.stringify({ a: 111 }));
                } catch {}

                // Ping/stall check every 30s
                if (this.pingTimer) clearInterval(this.pingTimer);
                this.pingTimer = setInterval(() => {
                    if (Date.now() - this.lastMessageTime > 60000) {
                        // Stalled connection, force recycle
                        this.reconnect();
                    }
                }, 30000);
            });

            this.ws.on('message', (data) => {
                this.lastMessageTime = Date.now();
                this.handleMessage(data);
            });

            this.ws.on('error', () => {
                // Failover silently to alternate server on error
                this.reconnect();
            });

            this.ws.on('close', () => {
                this.reconnect();
            });
        } catch (e) {
            this.reconnect();
        }
    }

    reconnect() {
        if (!this.isStarted || this.reconnectTimer) return;
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                this.ws.close();
            } catch {}
            this.ws = null;
        }
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        this.serverIndex++;
        this.reconnectAttempts++;
        // Jittered exponential backoff: 2s, 4s, 8s, up to 30s max
        const backoffMs = Math.min(30000, 2000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 6))) + Math.random() * 1000;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, backoffMs);
    }

    handleMessage(rawMsg) {
        try {
            const rawStr = rawMsg.toString();
            const decodedStr = decodeBlitzortung(rawStr);
            if (!decodedStr) return;

            const packet = JSON.parse(decodedStr);
            if (!packet || typeof packet.lat !== 'number' || typeof packet.lon !== 'number') {
                return;
            }

            this.addStrike(packet);
        } catch {}
    }

    /**
     * Ingests a raw strike object, calculates age/distance, and stores in buffer.
     */
    addStrike(raw) {
        // Calculate timestamp in ms: packet.time is in nanoseconds since epoch
        let timeMs = Date.now();
        if (raw.time) {
            try {
                if (typeof raw.time === 'number') {
                    timeMs = raw.time > 1e16 ? Math.floor(raw.time / 1e6) : (raw.time > 1e11 ? raw.time : raw.time * 1000);
                } else if (typeof raw.time === 'string' && /^\d+$/.test(raw.time)) {
                    const bi = BigInt(raw.time);
                    timeMs = Number(bi / 1000000n);
                }
            } catch {
                timeMs = Date.now();
            }
        }

        const distFromSite = calculateDistanceMiles(this.latitude, this.longitude, raw.lat, raw.lon);
        // Only track strikes within 75 miles of site to preserve memory
        if (distFromSite > 75) {
            return;
        }

        const strike = {
            lat: raw.lat,
            lon: raw.lon,
            timeMs: timeMs,
            distFromSite: distFromSite,
            alt: raw.alt || 0,
            pol: raw.pol || 0
        };

        this.strikes.push(strike);
        if (this.strikes.length > this.maxBufferLength) {
            this.strikes.shift();
        }

        // If strike occurred within operational alert radius (default 15 miles), persist
        if (distFromSite <= this.radiusMiles) {
            this.persistActiveStrike(strike);
            if (typeof this.onStrike === 'function') {
                try { this.onStrike(strike); } catch {}
            }
        }
    }

    persistActiveStrike(strike) {
        const payload = formatStrikeResponse(this.strikes, this.latitude, this.longitude, this.radiusMiles);
        try {
            const targetPath = path.join(this.dataDir, 'lightning.json');
            fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
        } catch {}
    }

    getStrikes(targetLat, targetLon, radiusMiles) {
        const lat = targetLat !== undefined ? targetLat : this.latitude;
        const lon = targetLon !== undefined ? targetLon : this.longitude;
        const radius = radiusMiles !== undefined ? radiusMiles : this.radiusMiles;
        return formatStrikeResponse(this.strikes, lat, lon, radius);
    }

    getLatestStrike(targetLat, targetLon, radiusMiles) {
        const res = this.getStrikes(targetLat, targetLon, radiusMiles);
        return res.response && res.response.length > 0 ? res.response[0] : null;
    }

    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    getStatus() {
        return {
            connected: this.isConnected(),
            server: BLITZORTUNG_SERVERS[this.serverIndex % BLITZORTUNG_SERVERS.length],
            bufferCount: this.strikes.length,
            latitude: this.latitude,
            longitude: this.longitude,
            radiusMiles: this.radiusMiles,
            lastMessageTime: this.lastMessageTime
        };
    }
}

let defaultServiceInstance = null;

function getBlitzortungService(options = {}) {
    if (!defaultServiceInstance) {
        defaultServiceInstance = new BlitzortungService(options);
    }
    return defaultServiceInstance;
}

module.exports = {
    decodeBlitzortung,
    calculateDistanceMiles,
    calculateBearing,
    bearingToCompass,
    formatStrikeResponse,
    BlitzortungService,
    getBlitzortungService
};
