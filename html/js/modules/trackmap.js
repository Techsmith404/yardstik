// YardStik Universal Interactive Track Map & Track Check Module
import { cachedFeatures } from "./features.js";

export let cachedTracks = [];
export let trackStats = {
    totalCars: 0,
    totalCapacity: 0,
    badOrderCars: 0,
    blendCars: 0,
    clearTracksCount: 0,
    dwellWarningCount: 0
};

export let commodityRules = {
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

export async function fetchCommodityRules() {
    try {
        const res = await fetch("assets/data/commodity_rules.json?t=" + new Date().getTime());
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.categories)) {
                commodityRules = data;
            }
        }
    } catch (e) {
        console.warn("Using default commodity rules:", e);
    }
}

export function findBestCommodityMatch(text, options = {}) {
    if (!text || !text.trim() || !commodityRules || !commodityRules.categories || !commodityRules.categories.length) {
        return {
            category: { id: "default", name: "Other / General", color: commodityRules?.default_color || "#38bdf8" },
            score: 0,
            matchedKeyword: null
        };
    }

    const { allowEmptyKeywords = true } = options;
    const rawUpper = text.toUpperCase().trim();
    // Strip leading count digits, punctuation, and normalize whitespace
    const cleanUpper = rawUpper.replace(/^[0-9\s\-–—:]+/, "").replace(/[()[\],;+]/g, " ").replace(/\s+/g, " ").trim();

    let bestMatch = null;
    let highestScore = -1;

    const totalCats = commodityRules.categories.length;

    commodityRules.categories.forEach((cat, catIdx) => {
        if (!cat.keywords || !Array.isArray(cat.keywords)) return;

        cat.keywords.forEach(kw => {
            if (!kw || !kw.trim()) return;
            const kwUpper = kw.toUpperCase().trim();
            if (!allowEmptyKeywords && (kwUpper === "CLEAR" || kwUpper === "EMPTY")) {
                return;
            }

            const escaped = kwUpper.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
            const reg = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, "i");

            if (reg.test(rawUpper)) {
                const kwWords = kwUpper.split(/\s+/).filter(Boolean);
                const kwWordCount = kwWords.length;
                const kwCharLen = kwUpper.length;

                let score = 0;

                // 1. Exact full text match (e.g. cleanUpper === "MSA FLATS" matching kw "MSA FLATS")
                if (cleanUpper === kwUpper) {
                    score += 50000;
                }

                // 2. Multi-word specificity (each word in keyword adds huge specificity)
                score += kwWordCount * 2000;

                // 3. Keyword character length (longer phrases like "MSA FLATS" > "FLATS")
                score += kwCharLen * 50;

                // 4. Exact start of text match bonus
                if (cleanUpper.startsWith(kwUpper)) {
                    score += 500;
                }

                // 5. Category list priority as tie-breaker
                score += (totalCats - catIdx) * 0.1;

                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = {
                        category: cat,
                        score: score,
                        matchedKeyword: kw
                    };
                }
            }
        });
    });

    if (bestMatch) {
        return bestMatch;
    }

    return {
        category: { id: "default", name: "Other / General", color: commodityRules.default_color || "#38bdf8" },
        score: 0,
        matchedKeyword: null
    };
}

export function getCommodityCategory(track) {
    if (!track) return { id: "ob_empty", name: "OB / Empty", color: "#22c55e" };
    if (!commodityRules || !commodityRules.categories || !commodityRules.categories.length) {
        return { id: "default", name: "General Freight", color: "#38bdf8" };
    }

    if (track.is_bad_order) {
        const boCat = commodityRules.categories.find(c => c.id === "bad_order");
        return boCat || { id: "bad_order", name: "Bad Order", color: "#ef4444" };
    }
    if (track.is_clear || !track.cars || track.cars === 0) {
        const obCat = commodityRules.categories.find(c => c.id === "ob_empty");
        return obCat || { id: "ob_empty", name: "OB / Empty", color: "#22c55e" };
    }

    // When track is occupied with cars (>0), ignore pure "CLEAR" or "EMPTY" keywords so actual occupied commodities match!
    let rawText = ((track.commodity || "") + " " + (track.notes || "")).toUpperCase();
    if (track.cars > 0) {
        rawText = rawText.replace(/\b(CLEAR|EMPTY)\b/gi, " ").trim();
    }

    const match = findBestCommodityMatch(rawText, { allowEmptyKeywords: !(track.cars > 0) });
    return match.category;
}

export function getCapacityBedColor(cars, capacity, isBadOrder = false) {
    if (isBadOrder) return "rgba(239, 68, 68, 0.55)";
    if (!cars || cars <= 0) return "rgba(148, 163, 184, 0.22)"; // subtle slate for clear
    if (!capacity || capacity <= 0) capacity = 20;
    const pct = (cars / capacity) * 100;
    if (pct <= 25) return "rgba(56, 189, 248, 0.42)";  // subtle blue
    if (pct <= 50) return "rgba(34, 197, 94, 0.42)";   // subtle green
    if (pct <= 75) return "rgba(234, 179, 8, 0.48)";   // subtle yellow
    if (pct <= 90) return "rgba(249, 115, 22, 0.52)";  // subtle orange
    return "rgba(239, 68, 68, 0.6)";                   // subtle red
}


export function normalizeCompoundPathData(d) {
    if (!d || !d.trim()) return d;
    const subpathStrings = d.trim().split(/(?=[Mm])/);
    if (subpathStrings.length <= 1) return d;

    const subpaths = [];
    for (const sp of subpathStrings) {
        const matches = sp.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
        if (!matches) continue;
        const pts = [];
        let i = 0;
        let cmd = "L";
        while (i < matches.length) {
            const token = matches[i];
            if (/^[A-Za-z]$/.test(token)) {
                cmd = token.toUpperCase();
                i++;
            }
            if (cmd === "M" || cmd === "L") {
                if (i + 1 < matches.length && !isNaN(Number(matches[i])) && !isNaN(Number(matches[i+1]))) {
                    pts.push([parseFloat(matches[i]), parseFloat(matches[i+1])]);
                    i += 2;
                } else {
                    i++;
                }
            } else {
                i++;
            }
        }
        if (pts.length > 0) subpaths.push(pts);
    }

    if (subpaths.length === 2) {
        const [p1, p2] = subpaths;
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (dist(p1[0], p2[0]) < 2.0) {
            const combined = [...p2.slice().reverse(), ...p1.slice(1)];
            return "M " + combined.map(pt => `${pt[0]} ${pt[1]}`).join(" L ");
        } else if (dist(p1[p1.length - 1], p2[0]) < 2.0) {
            const combined = [...p1, ...p2.slice(1)];
            return "M " + combined.map(pt => `${pt[0]} ${pt[1]}`).join(" L ");
        } else if (dist(p1[0], p2[p2.length - 1]) < 2.0) {
            const combined = [...p2, ...p1.slice(1)];
            return "M " + combined.map(pt => `${pt[0]} ${pt[1]}`).join(" L ");
        } else if (dist(p1[p1.length - 1], p2[p2.length - 1]) < 2.0) {
            const combined = [...p1, ...p2.slice().reverse().slice(1)];
            return "M " + combined.map(pt => `${pt[0]} ${pt[1]}`).join(" L ");
        }
    }
    return d;
}

function extractTrackIdFromElement(el) {
    if (!el) return null;
    const idAttr = el.getAttribute("id") || "";
    if (idAttr) {
        let clean = idAttr.trim();
        clean = clean.replace(/^[nsew]curve[-_]/i, "");
        clean = clean.replace(/^car[-_]zone[-_]/i, "");
        clean = clean.replace(/^cars[-_]/i, "");
        clean = clean.replace(/^track[-_]/i, "");
        clean = clean.replace(/[-_]cars$/i, "");
        clean = clean.replace(/[-_]car[-_]zone$/i, "");
        clean = clean.replace(/^label[-_]/i, "");
        clean = clean.replace(/[-_]\d+$/, "");
        return clean.toUpperCase();
    }
    const dataTrack = el.getAttribute("data-track") || el.getAttribute("data-car-track");
    if (dataTrack) return dataTrack.trim().toUpperCase();

    const txt = el.querySelector("text") || (el.tagName && el.tagName.toLowerCase() === "text" ? el : null);
    if (txt) {
        const raw = txt.textContent.trim().replace(/\s*\(.*\)/, "").toUpperCase();
        return raw;
    }
    return null;
}

function formatSwitchTitle(idStr) {
    if (!idStr) return "Switch Turnout";
    let clean = idStr.replace(/^switch[-_]/i, "");
    let dir = "";
    if (/[-_][nsew]$/i.test(clean)) {
        const d = clean.slice(-1).toUpperCase();
        dir = d === "N" ? "North" : (d === "S" ? "South" : (d === "E" ? "East" : "West"));
        clean = clean.slice(0, -2);
    }
    const parts = clean.split(/[-_]/);
    if (parts.length >= 2) {
        return `Switch: Track ${parts[0]} / Track ${parts[1]}${dir ? " (" + dir + ")" : ""}`;
    }
    return `Switch: ${clean}${dir ? " (" + dir + ")" : ""}`;
}

function getElementExactLength(el) {
    if (!el) return 500;
    try {
        if (typeof el.getTotalLength === "function") {
            const len = el.getTotalLength();
            if (len > 0) return len;
        }
    } catch (e) {}

    if (el.tagName && el.tagName.toLowerCase() === "polyline") {
        const pointsAttr = el.getAttribute("points") || "";
        const coords = pointsAttr.trim().split(/[\s,]+/).map(Number);
        let total = 0;
        for (let i = 0; i < coords.length - 3; i += 2) {
            const dx = coords[i+2] - coords[i];
            const dy = coords[i+3] - coords[i+1];
            total += Math.hypot(dx, dy);
        }
        if (total > 0) return total;
    }
    return 600;
}

export function getCommodityCategoryForText(text) {
    const match = findBestCommodityMatch(text, { allowEmptyKeywords: false });
    return match.category;
}

export function extractDirectionFromText(text) {
    if (!text) return { dir: null, cleanText: text };
    let dir = null;
    let cleanText = text;

    // Matches: S/END, N/END, E/END, W/END, S END, N END, E END, W END, NORTH END, SOUTH END, EAST END, WEST END, AT S/END, etc.
    const dirMatch = cleanText.match(/(?:\b(?:AT|ON)\s+)?\b([NSEW])(?:\s*[\/]\s*END|\s+END|\s+SIDE)\b/i) ||
                     cleanText.match(/\b(NORTH|SOUTH|EAST|WEST)(?:\s+END|\s+SIDE)?\b/i) ||
                     cleanText.match(/\b([NSEW])\/E\b/i) ||
                     cleanText.match(/\(([NSEW])\)/i);

    if (dirMatch) {
        const rawDir = dirMatch[1].toUpperCase();
        if (rawDir.startsWith("N")) dir = "N";
        else if (rawDir.startsWith("S")) dir = "S";
        else if (rawDir.startsWith("E")) dir = "E";
        else if (rawDir.startsWith("W")) dir = "W";

        cleanText = cleanText.replace(dirMatch[0], "").trim();
        cleanText = cleanText.replace(/\s+/g, " ");
    }

    return { dir, cleanText };
}

export function getTrackCommodityBreakdown(track) {
    if (!track || !track.cars || track.cars <= 0) return [];

    if (track.is_bad_order) {
        const boCat = commodityRules?.categories?.find(c => c.id === "bad_order") || { id: "bad_order", name: "Bad Order", color: "#ef4444" };
        return [{ count: track.cars, category: boCat, color: boCat.color, desc: "Bad Order", dir: null }];
    }
    if (track.is_clear) {
        const obCat = commodityRules?.categories?.find(c => c.id === "ob_empty") || { id: "ob_empty", name: "OB / Empty", color: "#22c55e" };
        return [{ count: track.cars, category: obCat, color: obCat.color, desc: "Empty", dir: null }];
    }

    const totalCars = track.cars;
    const comm = (track.commodity || "").trim();
    const notes = (track.notes || "").trim();

    let textToParse = notes && notes.length >= comm.length && comm.toUpperCase() !== "CLEAR" ? notes : (comm || notes);
    if (notes && comm && notes !== comm && comm.toUpperCase() !== "CLEAR" && notes.toUpperCase() !== "CLEAR") {
        textToParse = `${comm} + ${notes}`;
    }

    // Clean dates like 8/30 or 12/31
    let cleaned = textToParse
        .replace(/[–—]/g, "-")
        .replace(/[‘’]/g, "'")
        .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
        .replace(/#\d+/g, "")
        .replace(/(?:SWITCH\s+)?O\.?S\.?\s*(?:AT\s+[\w/-]+|[\w/-]+\s+SWITCH)?/gi, "")
        .replace(/\bP\s*&\s*S\b/gi, "__P_AND_S__");

    // Check for prefix parenthetical breakdown e.g. "10 - DL'S (5 - SHEETS + 5 - P&S)"
    cleaned = cleaned.replace(/(\d+)\s*(?:[-–:]|\s+)?([A-Za-z0-9'’\/&\s]+?)?\s*\(([^)]+)\)/g, (match, pCount, pLabel, inside) => {
        const prefixNum = parseInt(pCount, 10);
        const insideNums = (inside.match(/\b\d+\b/g) || []).map(Number);
        const insideSum = insideNums.reduce((a, b) => a + b, 0);
        if (insideSum === prefixNum) {
            return inside;
        }
        return match;
    });

    // Unprefixed parenthetical check: "(5 - SHEETS + 5 - P&S)"
    const singleParen = cleaned.match(/^\s*\(([^)]+)\)\s*$/);
    if (singleParen) {
        cleaned = singleParen[1];
    }

    // Delimit adjacent cuts like "5 - SHEETS 3 - UP"
    cleaned = cleaned.replace(/([A-Za-z\/])\s+(\d+\s*[-–:])/g, "$1 + $2");

    // Split into chunks by +, ;, &, comma, AND, or newline
    const rawChunks = cleaned.split(/[,;+&]|\band\b|\n/i);
    const segments = [];

    for (const rawChunk of rawChunks) {
        let ch = rawChunk.replace(/__P_AND_S__/g, "P&S").trim();
        if (!ch) continue;

        const { dir, cleanText } = extractDirectionFromText(ch);
        const textToMatch = cleanText.trim();
        if (!textToMatch) continue;

        // Matches: "3 - UP COIL", "3 UP COILS", "3-DL BALE", "3 DL", "7 P&S"
        const m1 = textToMatch.match(/^(\d+)\s*(?:[-–:]|\bOF\b)?\s*(.+)$/i);
        if (m1) {
            const cnt = parseInt(m1[1], 10);
            const desc = m1[2].replace(/[()]/g, "").replace(/\s+/g, " ").trim();
            if (desc && cnt > 0) {
                const cat = getCommodityCategoryForText(desc);
                segments.push({ count: cnt, category: cat, color: cat.color, desc: desc, dir: dir });
            }
        } else {
            // Matches: "UP COIL 3" or "DOGBONE 3"
            const m2 = textToMatch.match(/^(.+?)\s*[-–:]?\s*(\d+)$/);
            if (m2) {
                const cnt = parseInt(m2[2], 10);
                const desc = m2[1].replace(/[()]/g, "").replace(/\s+/g, " ").trim();
                if (desc && cnt > 0 && isNaN(Number(desc))) {
                    const cat = getCommodityCategoryForText(desc);
                    segments.push({ count: cnt, category: cat, color: cat.color, desc: desc, dir: dir });
                }
            }
        }
    }

    const parsedSum = segments.reduce((sum, s) => sum + s.count, 0);

    if (segments.length === 0 || parsedSum === 0) {
        const primaryCat = getCommodityCategory(track);
        return [{ count: totalCars, category: primaryCat, color: primaryCat.color, desc: textToParse, dir: null }];
    }

    if (parsedSum === totalCars) {
        return segments;
    }

    if (parsedSum < totalCars) {
        const rem = totalCars - parsedSum;
        const primaryCat = getCommodityCategory(track);
        segments.push({ count: rem, category: primaryCat, color: primaryCat.color, desc: "Remainder", dir: null });
        return segments;
    }

    // Clamped fit to totalCars if parsed sum > totalCars
    let cur = 0;
    const clamped = [];
    for (const s of segments) {
        if (cur + s.count <= totalCars) {
            clamped.push(s);
            cur += s.count;
        } else {
            const rem = totalCars - cur;
            if (rem > 0) {
                clamped.push({ count: rem, category: s.category, color: s.color, desc: s.desc, dir: s.dir });
                cur += rem;
            }
            break;
        }
    }
    return clamped.length > 0 ? clamped : [{ count: totalCars, category: getCommodityCategory(track), color: getCommodityCategory(track).color, desc: textToParse, dir: null }];
}

export function getCompassHeading(svg) {
    const fallback = { northVec: { x: 1, y: 0 }, eastVec: { x: 0, y: 1 }, angleDeg: 90 };
    if (!svg && typeof document !== "undefined") {
        svg = document.querySelector("#trackmap-viewport svg") || document.querySelector("svg");
    }
    if (!svg) return fallback;

    const compassEl = svg.querySelector("#compass-rose, .compass-rose, [id*='compass']");
    if (!compassEl) return fallback;

    const transformAttr = compassEl.getAttribute("transform") || "";
    let angleDeg = 90;

    // Parse SVG transform matrix(a, b, c, d, e, f)
    const matrixMatch = transformAttr.match(/matrix\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)/);
    if (matrixMatch) {
        const a = parseFloat(matrixMatch[1]);
        const b = parseFloat(matrixMatch[2]);
        const rotRad = Math.atan2(b, a);
        angleDeg = (rotRad * 180) / Math.PI;
    } else {
        const rotateMatch = transformAttr.match(/rotate\(\s*([-\d.]+)/);
        if (rotateMatch) {
            angleDeg = parseFloat(rotateMatch[1]);
        }
    }

    angleDeg = ((angleDeg % 360) + 360) % 360;

    // Standard unrotated compass asset has North pointing UP (0, -1) in SVG coordinates.
    // Rotating clockwise by angleDeg in SVG screen space:
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const northVec = { x: Math.cos(rad), y: Math.sin(rad) };
    const eastVec = { x: -Math.sin(rad), y: Math.cos(rad) };

    return { northVec, eastVec, angleDeg };
}

export function getPathOrientation(el, svg) {
    if (!el) return { axis: "horizontal", startDir: "S", endDir: "N" };
    let pStart = null;
    let pEnd = null;

    try {
        if (typeof el.getTotalLength === "function" && typeof el.getPointAtLength === "function") {
            const totalLen = el.getTotalLength();
            if (totalLen > 0) {
                pStart = el.getPointAtLength(0);
                pEnd = el.getPointAtLength(totalLen);
            }
        }
    } catch (e) {}

    if (!pStart || !pEnd) {
        if (el.tagName && el.tagName.toLowerCase() === "polyline") {
            const pointsAttr = el.getAttribute("points") || "";
            const coords = pointsAttr.trim().split(/[\s,]+/).map(Number);
            if (coords.length >= 4) {
                pStart = { x: coords[0], y: coords[1] };
                pEnd = { x: coords[coords.length - 2], y: coords[coords.length - 1] };
            }
        } else if (el.tagName && el.tagName.toLowerCase() === "line") {
            pStart = { x: parseFloat(el.getAttribute("x1") || "0"), y: parseFloat(el.getAttribute("y1") || "0") };
            pEnd = { x: parseFloat(el.getAttribute("x2") || "0"), y: parseFloat(el.getAttribute("y2") || "0") };
        } else if (el.tagName && el.tagName.toLowerCase() === "path") {
            const d = el.getAttribute("d") || "";
            const numMatches = d.match(/-?\d+(?:\.\d+)?/g);
            if (numMatches && numMatches.length >= 4) {
                pStart = { x: parseFloat(numMatches[0]), y: parseFloat(numMatches[1]) };
                pEnd = { x: parseFloat(numMatches[numMatches.length - 2]), y: parseFloat(numMatches[numMatches.length - 1]) };
            }
        }
    }

    if (!pStart || !pEnd) {
        return { axis: "horizontal", startDir: "S", endDir: "N" };
    }

    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;

    const svgRoot = svg || el.ownerSVGElement || el.closest("svg");
    const { northVec, eastVec } = getCompassHeading(svgRoot);

    // Project path drawing vector onto compass North and East vectors
    const dotNorth = (dx * northVec.x) + (dy * northVec.y);
    const dotEast = (dx * eastVec.x) + (dy * eastVec.y);

    if (Math.abs(dotNorth) >= Math.abs(dotEast)) {
        // Track runs primarily along North-South axis
        const startDir = dotNorth >= 0 ? "S" : "N";
        const endDir = dotNorth >= 0 ? "N" : "S";
        return { axis: "horizontal", startDir, endDir };
    } else {
        // Track runs primarily along West-East axis
        const startDir = dotEast >= 0 ? "W" : "E";
        const endDir = dotEast >= 0 ? "E" : "W";
        return { axis: "vertical", startDir, endDir };
    }
}

export function sortBreakdownByDirection(breakdown, targetPath) {
    if (!breakdown || breakdown.length <= 1) return breakdown || [];
    const orientation = getPathOrientation(targetPath);
    const { startDir, endDir, axis } = orientation;

    function getSegmentRank(seg) {
        if (!seg.dir) return 1;
        let d = seg.dir.toUpperCase();

        // Cross-axis normalization if user typed S/N on a W/E track or vice versa
        if (axis === "horizontal") {
            if (d === "W") d = "S";
            else if (d === "E") d = "N";
        } else {
            if (d === "S") d = "W";
            else if (d === "N") d = "E";
        }

        if (d === startDir) return 0;
        if (d === endDir) return 2;
        return 1;
    }

    return [...breakdown].sort((a, b) => {
        return getSegmentRank(a) - getSegmentRank(b);
    });
}

export function calculateGlobalYardCarScale(svg, trackMap, carHostElementMap) {
    if (!svg) return { carLen: 22.0, gapLen: 5.5, strokeWidth: 4.8 };

    // 1. Check for explicit scale override in SVG
    const scaleEl = svg.querySelector("#scale-rule, .scale-rule, [id*='scale-rule'], [data-car-len]");
    if (scaleEl) {
        const directLen = parseFloat(scaleEl.getAttribute("data-car-len") || svg.getAttribute("data-car-len"));
        if (directLen && directLen > 0) {
            const carLen = directLen;
            const gapLen = Math.max(1.2, carLen * 0.22);
            const strokeWidth = Math.max(2.0, Math.min(5.0, carLen * 0.38));
            return { carLen, gapLen, strokeWidth };
        }
        const scaleFeet = parseFloat(scaleEl.getAttribute("data-feet"));
        if (scaleFeet && scaleFeet > 0) {
            const rulePx = getElementExactLength(scaleEl);
            const pxPerFoot = rulePx / scaleFeet;
            const carLen = Math.max(4.0, Math.min(28.0, 50.0 * pxPerFoot)); // Standard 50ft car
            const gapLen = Math.max(1.0, carLen * 0.22);
            const strokeWidth = Math.max(2.0, Math.min(5.0, carLen * 0.38));
            return { carLen, gapLen, strokeWidth };
        }
    }

    // 2. Compute minimum ratio (tightest capacity fit) across all tracks in the yard
    const ratios = [];
    if (carHostElementMap && trackMap) {
        Object.keys(carHostElementMap).forEach(trackId => {
            const hostOrHosts = carHostElementMap[trackId];
            const data = trackMap[trackId];
            const hosts = Array.isArray(hostOrHosts) ? hostOrHosts : [hostOrHosts];
            const cap = (data && data.capacity) ? data.capacity : parseInt(hosts[0]?.getAttribute("data-capacity") || "0", 10);
            if (cap >= 3) {
                let totalLen = 0;
                hosts.forEach(el => {
                    totalLen += getElementExactLength(el);
                });
                if (totalLen > 20) {
                    ratios.push(totalLen / cap);
                }
            }
        });
    }

    if (ratios.length > 0) {
        ratios.sort((a, b) => a - b);
        const minRatio = ratios[0]; // Tightest track ratio ensures full capacity fits everywhere
        const carLen = Math.max(4.5, Math.min(24.0, minRatio * 0.72));
        const gapLen = Math.max(1.2, carLen * 0.22);
        const strokeWidth = Math.max(2.0, Math.min(4.8, carLen * 0.38));
        return { carLen, gapLen, strokeWidth };
    }

    return { carLen: 22.0, gapLen: 5.5, strokeWidth: 4.8 };
}

export function getMultiCarDasharray(el, carColors, targetColor, scaleConfig) {
    if (!carColors || !carColors.length) return "none";
    const totalLen = getElementExactLength(el);
    const N = carColors.length;

    const CAR_LEN = (scaleConfig && scaleConfig.carLen) ? scaleConfig.carLen : 22.0;
    const GAP_LEN = (scaleConfig && scaleConfig.gapLen) ? scaleConfig.gapLen : 5.5;
    const totalTrainLen = (N * CAR_LEN) + ((N - 1) * GAP_LEN);

    let startOffset = 5.0;
    if (totalLen > totalTrainLen) {
        startOffset = (totalLen - totalTrainLen) / 2.0;
    }

    const dashes = ["0", startOffset.toFixed(1)];
    for (let i = 0; i < N; i++) {
        const isTarget = (carColors[i] === targetColor);
        if (isTarget) {
            dashes.push(CAR_LEN.toFixed(1), GAP_LEN.toFixed(1));
        } else {
            // Draw 0px dash and skip the exact space of the other car + gap
            dashes.push("0", (CAR_LEN + GAP_LEN).toFixed(1));
        }
    }
    dashes.push("0", (totalLen * 3).toFixed(1));
    return dashes.join(" ");
}

export function getCarDasharray(el, cars, capacity) {
    if (!cars || cars <= 0) return "none";
    const totalLen = getElementExactLength(el);
    const cap = (capacity && capacity > 0) ? capacity : 20;
    const minRatio = totalLen / cap;
    const CAR_LEN = Math.max(4.5, Math.min(24.0, minRatio * 0.72));
    const GAP_LEN = Math.max(1.2, CAR_LEN * 0.22);
    const totalTrainLen = (cars * CAR_LEN) + ((cars - 1) * GAP_LEN);

    let startOffset = 5.0;
    if (totalLen > totalTrainLen) {
        startOffset = (totalLen - totalTrainLen) / 2.0;
    }

    const dashes = [];
    dashes.push("0", startOffset.toFixed(1));
    for (let i = 0; i < cars; i++) {
        dashes.push(CAR_LEN.toFixed(1), GAP_LEN.toFixed(1));
    }
    dashes.push("0", (totalLen * 3).toFixed(1));
    return dashes.join(" ");
}

let lastTracksUpdated = null;

function formatAsOfTimestamp(dateInput) {
    if (!dateInput) return "";
    let d = new Date(dateInput);
    if (isNaN(d.getTime())) {
        const match = String(dateInput).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (match) {
            d = new Date(
                parseInt(match[1], 10),
                parseInt(match[2], 10) - 1,
                parseInt(match[3], 10),
                parseInt(match[4], 10),
                parseInt(match[5], 10),
                match[6] ? parseInt(match[6], 10) : 0
            );
        }
    }
    if (isNaN(d.getTime())) return "";
    
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hh = String(hours).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    
    return `${mm}-${dd} ${hh}:${min} ${ampm}`;
}

export async function fetchTracks() {
    try {
        await fetchCommodityRules();
        const res = await fetch("assets/data/tracks.json?t=" + new Date().getTime());
        if (res.ok) {
            const lastModified = res.headers.get("Last-Modified");
            cachedTracks = await res.json();
            
            const itemDate = cachedTracks.find(t => t.updated_at)?.updated_at;
            const targetDateStr = itemDate || lastModified;
            if (targetDateStr) {
                lastTracksUpdated = formatAsOfTimestamp(targetDateStr);
            }

            calculateTrackStats();
            await renderTrackMap();
            if (isTheaterOpen) {
                updateTheaterMap();
            }
        }
    } catch (e) {
        console.warn("Could not load tracks.json:", e);
    }
}

function calculateTrackStats(activeTrackIds = null) {
    let total = 0, bo = 0, blend = 0, clear = 0, dwell = 0, cap = 0;
    const tracksToCount = (activeTrackIds && activeTrackIds.size > 0)
        ? cachedTracks.filter(t => activeTrackIds.has(t.id.toUpperCase()))
        : cachedTracks;

    tracksToCount.forEach(t => {
        total += (t.cars || 0);
        cap += (t.capacity || 0);
        if (t.is_bad_order) bo += (t.cars || 0);
        if (t.is_blend) blend += (t.cars || 0);
        if (t.is_clear) clear++;
        if (t.dwell_warning) dwell++;
    });
    trackStats = {
        totalCars: total,
        totalCapacity: cap,
        badOrderCars: bo,
        blendCars: blend,
        clearTracksCount: clear,
        dwellWarningCount: dwell
    };
    updateHeaderStats();
}

function updateHeaderStats() {
    const asOfEl = document.getElementById("trackmap-asof");
    if (asOfEl) {
        if (lastTracksUpdated) {
            asOfEl.innerText = `As of: ${lastTracksUpdated}`;
            asOfEl.style.display = "inline-block";
        } else {
            asOfEl.style.display = "none";
        }
    }

    const statsEl = document.getElementById("trackmap-stats-summary");
    if (statsEl) {
        const capText = trackStats.totalCapacity > 0 ? ` / ${trackStats.totalCapacity}` : "";
        statsEl.innerHTML = `
            <span class="track-stat-pill pill-total">🚂 <strong>${trackStats.totalCars}${capText}</strong> Cars</span>
            <span class="track-stat-pill pill-clear">🟢 <strong>${trackStats.clearTracksCount}</strong> Clear</span>
            ${trackStats.badOrderCars > 0 ? `<span class="track-stat-pill pill-bo">🔴 <strong>${trackStats.badOrderCars}</strong> B.O.</span>` : ""}
            ${trackStats.dwellWarningCount > 0 ? `<span class="track-stat-pill pill-dwell">⚠️ <strong>${trackStats.dwellWarningCount}</strong> Dwell</span>` : ""}
            <button id="btn-trackmap-expand" class="trackmap-expand-btn" title="Expand Full Screen">
                <i class="fa-solid fa-expand"></i> Expand
            </button>
        `;
        const expBtn = document.getElementById("btn-trackmap-expand");
        if (expBtn) {
            expBtn.onclick = (e) => {
                e.stopPropagation();
                openExpandedTrackMap();
            };
        }
    }
}

let svgTemplateCache = null;

export async function renderTrackMap() {
    const container = document.getElementById("trackmap-viewport");
    if (!container) return;

    const isEnabled = cachedFeatures?.features?.track_map !== false;
    const widget = document.getElementById("widget-trackmap");
    if (widget) {
        widget.style.display = isEnabled ? "flex" : "none";
    }
    if (!isEnabled) return;

    container.classList.add("clickable-trackmap");
    container.onclick = (e) => {
        if (!e.target.closest("[id*='track'], [id*='label'], [id*='curve'], .train-car-overlay")) {
            openExpandedTrackMap();
        }
    };

    try {
        if (!svgTemplateCache) {
            try {
                const resData = await fetch("assets/data/track-map.svg?t=" + new Date().getTime());
                if (resData.ok) {
                    svgTemplateCache = await resData.text();
                }
            } catch {}

            if (!svgTemplateCache) {
                const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
                if (res.ok) {
                    svgTemplateCache = await res.text();
                }
            }
        }

        if (svgTemplateCache) {
            container.innerHTML = svgTemplateCache;
            bindSvgInteractivity(container, false);
        } else {
            renderFallbackCardGrid(container);
        }
    } catch (e) {
        console.warn("SVG Track Map load error, falling back to card grid:", e);
        renderFallbackCardGrid(container);
    }
}

function bindSvgInteractivity(container, isTheater = false) {
    const svg = container.querySelector("svg");
    if (!svg) return;

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.maxHeight = "100%";
    svg.style.display = "block";

    // Normalize any compound paths created from Boxy SVG joins
    svg.querySelectorAll("path").forEach(p => {
        const d = p.getAttribute("d");
        if (d && (d.match(/[Mm]/g) || []).length > 1) {
            const norm = normalizeCompoundPathData(d);
            if (norm !== d) {
                p.setAttribute("d", norm);
            }
        }
    });

    // Clean up old overlay paths if re-binding
    svg.querySelectorAll(".train-car-overlay").forEach(o => o.remove());

    const trackMap = {};
    cachedTracks.forEach(t => {
        trackMap[t.id.toUpperCase()] = t;
    });

    function isExplicitCarElement(el) {
        if (!el) return false;
        const cls = el.getAttribute("class") || "";
        if (/\b(?:cars|car|car-zone|cars-zone|car-segment)\b/i.test(cls)) return true;
        if (el.hasAttribute("data-cars") || el.hasAttribute("data-car-zone")) return true;
        const id = (el.getAttribute("id") || "").toLowerCase();
        if (/^cars[-_]|^car[-_]zone[-_]|[-_]cars$/i.test(id)) return true;
        return false;
    }

    // Index all track segments and select the designated car segment for each track
    const carHostElementMap = {};
    const trackSegmentsByTrackId = {};

    const trackLineElements = svg.querySelectorAll("[id^='track-'], [id^='track_'], [id*='curve-'], [id*='curve_'], [id^='cars-'], [id^='car-zone-'], path.track, polyline.track, line.track, .track, .cars, .car-zone");
    trackLineElements.forEach(el => {
        const rawId = extractTrackIdFromElement(el);
        if (!rawId) return;
        if (!trackSegmentsByTrackId[rawId]) {
            trackSegmentsByTrackId[rawId] = [];
        }
        trackSegmentsByTrackId[rawId].push(el);
    });

    Object.keys(trackSegmentsByTrackId).forEach(rawId => {
        const segs = trackSegmentsByTrackId[rawId];
        const explicitCarSegs = segs.filter(el => isExplicitCarElement(el));
        if (explicitCarSegs.length > 0) {
            carHostElementMap[rawId] = explicitCarSegs;
        } else {
            const mainSeg = segs.find(el => (el.id && /^track[-_]/i.test(el.id)) || (!/curve/i.test(el.id || ""))) || segs[0];
            carHostElementMap[rawId] = [mainSeg];
        }
    });

    // Calculate track stats filtered strictly to the active tracks present on this SVG map
    const activeTrackIds = new Set(Object.keys(carHostElementMap).map(k => k.toUpperCase()));
    if (!isTheater && activeTrackIds.size > 0) {
        calculateTrackStats(activeTrackIds);
    }

    // Calculate uniform yard car scale (derived from minimum track capacity ratio or scale rule)
    const globalYardScale = calculateGlobalYardCarScale(svg, trackMap, carHostElementMap);

    // 1. Hook Track Lines & Curves (style track bed lines and attach click handlers)
    trackLineElements.forEach(el => {
        const rawId = extractTrackIdFromElement(el);
        if (!rawId) return;
        const data = trackMap[rawId];

        const capAttr = el.getAttribute("data-capacity") || el.dataset?.capacity;
        if (capAttr && data && !data.capacity) {
            data.capacity = parseInt(capAttr, 10);
        }

        if (data) {
            el.classList.add("yard-track-line");
            el.style.cursor = "pointer";

            const cap = data.capacity || 20;
            const bedColor = getCapacityBedColor(data.cars, cap, data.is_bad_order);
            el.style.setProperty("stroke", bedColor, "important");
            el.style.setProperty("stroke-width", "2.8px", "important");

            el.onclick = (e) => {
                if (hasDraggedMap) return;
                e.stopPropagation();
                showTrackModal(data);
            };
            el.onmouseenter = (e) => showTrackHoverTooltip(e, data);
            el.onmouseleave = hideTrackHoverTooltip;
        }
    });

    // 2. Render Car Overlays across Host Segments (supports multi-segment tracks with gap/clearance)
    Object.keys(carHostElementMap).forEach(rawId => {
        const data = trackMap[rawId];
        if (!data || data.cars <= 0 || data.is_clear) return;

        const hostSegs = carHostElementMap[rawId];
        if (!hostSegs || hostSegs.length === 0) return;

        const trackCap = data.capacity || 20;

        // Calculate length of each host segment and total car zone length
        const segLengths = hostSegs.map(el => getElementExactLength(el));
        const totalCarZoneLen = segLengths.reduce((a, b) => a + b, 0);

        // Calculate capacity for each segment proportional to its length
        let allocatedCapSum = 0;
        const segCapacities = segLengths.map((len, idx) => {
            if (idx === segLengths.length - 1) {
                return Math.max(1, trackCap - allocatedCapSum);
            }
            const c = Math.max(1, Math.round(trackCap * (len / (totalCarZoneLen || 1))));
            allocatedCapSum += c;
            return c;
        });

        // Distribute data.cars across segments (fill first segment to capacity, then overflow)
        let remCars = data.cars;
        const segCarCounts = segCapacities.map((cap, idx) => {
            if (idx === segCapacities.length - 1) {
                const c = remCars;
                remCars = 0;
                return c;
            }
            const c = Math.min(remCars, cap);
            remCars -= c;
            return c;
        });

        // Build full carColors array sorted by direction
        const breakdown = getTrackCommodityBreakdown(data);
        const sortedBreakdown = sortBreakdownByDirection(breakdown, hostSegs[0]);
        const carColors = [];
        sortedBreakdown.forEach(seg => {
            for (let k = 0; k < seg.count; k++) {
                carColors.push(seg.color);
            }
        });
        const primaryCat = getCommodityCategory(data);
        while (carColors.length < data.cars) {
            carColors.push(primaryCat.color);
        }
        if (carColors.length > data.cars) {
            carColors.length = data.cars;
        }

        // Slice carColors for each segment and render overlays
        let colorOffset = 0;
        hostSegs.forEach((el, segIdx) => {
            const countForSeg = segCarCounts[segIdx];
            if (countForSeg <= 0) return;

            const segColors = carColors.slice(colorOffset, colorOffset + countForSeg);
            colorOffset += countForSeg;

            const uniqueColors = [...new Set(segColors)];
            uniqueColors.forEach(col => {
                const overlay = el.cloneNode(true);
                overlay.removeAttribute("id");
                overlay.classList.remove("yard-track-line", "cars", "car-zone", "car-zone-guide");
                overlay.classList.add("train-car-overlay");

                const dashPattern = getMultiCarDasharray(el, segColors, col, globalYardScale);

                overlay.style.setProperty("stroke", col, "important");
                overlay.style.setProperty("stroke-width", `${globalYardScale.strokeWidth.toFixed(1)}px`, "important");
                overlay.style.setProperty("stroke-dasharray", dashPattern, "important");
                overlay.style.setProperty("stroke-linecap", "butt", "important");
                overlay.style.setProperty("fill", "none", "important");
                overlay.style.pointerEvents = "auto";
                overlay.style.cursor = "pointer";
                overlay.style.filter = `drop-shadow(0 0 5px ${col})`;

                overlay.onclick = (e) => {
                    if (hasDraggedMap) return;
                    e.stopPropagation();
                    showTrackModal(data);
                };
                overlay.onmouseenter = (e) => showTrackHoverTooltip(e, data);
                overlay.onmouseleave = hideTrackHoverTooltip;

                el.parentNode.insertBefore(overlay, el.nextSibling);
            });
        });
    });

    // 2. Hook Labels / Badges (e.g. label-21, label-21-2, label-68, etc.)
    const labelElements = svg.querySelectorAll("[id^='label-'], [id^='label_'], g[data-track]");
    labelElements.forEach(el => {
        const rawId = extractTrackIdFromElement(el);
        if (!rawId) return;
        const data = trackMap[rawId];

        if (data) {
            const cap = data.capacity || 20;
            const commCat = getCommodityCategory(data);
            const badgeColor = data.is_clear ? "#22c55e" : (data.is_bad_order ? "#ef4444" : (data.is_blend ? "#00f0ff" : (data.dwell_warning ? "#f59e0b" : commCat.color)));

            if (data.is_clear) el.classList.add("badge-clear");
            else if (data.is_bad_order) el.classList.add("badge-bad-order");
            else if (data.is_blend) el.classList.add("badge-blend");
            else if (data.dwell_warning) el.classList.add("badge-dwell");
            else el.classList.add("badge-occ");

            const textEl = el.querySelector("text") || (el.tagName && el.tagName.toLowerCase() === "text" ? el : null);
            const rect = el.querySelector("rect");

            if (textEl && rect) {
                const origX = parseFloat(rect.getAttribute("data-orig-x") || rect.getAttribute("x") || 0);
                const origW = parseFloat(rect.getAttribute("data-orig-w") || rect.getAttribute("width") || 36);
                const origY = parseFloat(rect.getAttribute("data-orig-y") || rect.getAttribute("y") || 0);
                const origH = parseFloat(rect.getAttribute("data-orig-h") || rect.getAttribute("height") || 18);

                if (!rect.hasAttribute("data-orig-x")) {
                    rect.setAttribute("data-orig-x", origX);
                    rect.setAttribute("data-orig-w", origW);
                    rect.setAttribute("data-orig-y", origY);
                    rect.setAttribute("data-orig-h", origH);
                }

                const centerX = origX + (origW / 2);
                const centerY = origY + (origH / 2);

                textEl.setAttribute("x", centerX);
                textEl.setAttribute("y", centerY);
                textEl.removeAttribute("transform");

                if (data.cars > 0) {
                    textEl.textContent = `${rawId} (${data.cars})`;
                } else {
                    textEl.textContent = `${rawId}`;
                }

                textEl.setAttribute("text-anchor", "middle");
                textEl.setAttribute("dominant-baseline", "central");

                const newWidth = data.cars > 0 ? Math.max(origW, 36) : origW;
                rect.setAttribute("width", newWidth);
                rect.setAttribute("x", centerX - (newWidth / 2));

                rect.style.stroke = badgeColor;
                rect.style.fill = `rgba(${hexToRgb(badgeColor)}, 0.25)`;
                textEl.style.fill = badgeColor;
            }

            el.style.cursor = "pointer";
            el.onclick = (e) => {
                if (hasDraggedMap) return;
                e.stopPropagation();
                showTrackModal(data);
            };
            el.onmouseenter = (e) => showTrackHoverTooltip(e, data);
            el.onmouseleave = hideTrackHoverTooltip;
        }
    });

    // Collect all O.S. switches across all tracks
    const allOsSwitches = [];
    cachedTracks.forEach(t => {
        if (Array.isArray(t.os_switches)) {
            allOsSwitches.push(...t.os_switches);
        }
    });

    // 3. Hook Switch Points (e.g. switch-23-24-n, switch-45-70-e, etc.)
    const switchElements = svg.querySelectorAll("[id^='switch-'], [id^='switch_'], circle.switch-point, path.switch-point");
    switchElements.forEach(sw => {
        const idAttr = (sw.getAttribute("id") || "").toLowerCase();
        sw.classList.add("yard-switch-point");
        const title = formatSwitchTitle(idAttr);
        sw.setAttribute("title", title);

        const clean = idAttr.replace(/^switch[-_]/i, "");
        let dir = "";
        let cleanBase = clean;
        if (/[-_][nsew]$/i.test(clean)) {
            dir = clean.slice(-1).toUpperCase();
            cleanBase = clean.slice(0, -2);
        }
        const switchTokens = cleanBase.split(/[-_]/).map(s => s.toUpperCase());

        const osMatch = allOsSwitches.find(rule => {
            const rTracks = (rule.tracks || []).map(x => x.toUpperCase());
            const rDir = (rule.dir || "").toUpperCase();

            if (rDir && dir && rDir !== dir) {
                return false;
            }

            if (rTracks.length >= 2) {
                const hasT1 = switchTokens.includes(rTracks[0]);
                const hasT2 = switchTokens.includes(rTracks[1]) || (rTracks[1] === "22" && (switchTokens.includes("Y") || switchTokens.includes("22")));
                return hasT1 && hasT2;
            } else if (rTracks.length === 1) {
                return switchTokens.includes(rTracks[0]) && (!rDir || rDir === dir);
            }
            return false;
        });

        if (osMatch) {
            sw.classList.add("switch-out-of-service");
            sw.style.setProperty("fill", "#ef4444", "important");
            sw.style.setProperty("stroke", "#ffffff", "important");
            sw.style.setProperty("filter", "drop-shadow(0 0 10px #ef4444)", "important");

            const parent = sw.parentNode;
            const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
            marker.classList.add("switch-os-marker");

            if (sw.tagName && sw.tagName.toLowerCase() === "path") {
                // Standard 24x24 icon centered at (12, 12)
                marker.innerHTML = `
                    <circle cx="12" cy="12" r="12" fill="rgba(239, 68, 68, 0.6)" stroke="#ffffff" stroke-width="1.8"/>
                    <line x1="7" y1="7" x2="17" y2="17" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/>
                    <line x1="17" y1="7" x2="7" y2="17" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/>
                `;
            } else {
                const cx = parseFloat(sw.getAttribute("cx") || 12);
                const cy = parseFloat(sw.getAttribute("cy") || 12);
                const r = parseFloat(sw.getAttribute("r") || 6);
                marker.innerHTML = `
                    <circle cx="${cx}" cy="${cy}" r="${r * 1.4}" fill="rgba(239, 68, 68, 0.6)" stroke="#ffffff" stroke-width="1.8"/>
                    <line x1="${cx - r * 0.6}" y1="${cy - r * 0.6}" x2="${cx + r * 0.6}" y2="${cy + r * 0.7}" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/>
                    <line x1="${cx + r * 0.6}" y1="${cy - r * 0.6}" x2="${cx - r * 0.6}" y2="${cy + r * 0.7}" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round"/>
                `;
            }

            marker.style.cursor = "pointer";
            marker.onmouseenter = (e) => {
                showSimpleTooltip(e, `🔀 <strong>${title}</strong><br><span style="color: #ef4444; font-weight: bold;">⛔ OUT OF SERVICE (O.S.)</span><br><span style="color: #94a3b8; font-size: 0.75rem;">📝 ${osMatch.raw}</span>`);
            };
            marker.onmouseleave = hideTrackHoverTooltip;
            marker.onclick = (e) => {
                e.stopPropagation();
                showSwitchOsModal(title, osMatch.raw);
            };

            parent.appendChild(marker);

            sw.onmouseenter = (e) => {
                showSimpleTooltip(e, `🔀 <strong>${title}</strong><br><span style="color: #ef4444; font-weight: bold;">⛔ OUT OF SERVICE (O.S.)</span><br><span style="color: #94a3b8; font-size: 0.75rem;">📝 ${osMatch.raw}</span>`);
            };
            sw.onclick = (e) => {
                e.stopPropagation();
                showSwitchOsModal(title, osMatch.raw);
            };
        } else {
            sw.onmouseenter = (e) => {
                showSimpleTooltip(e, `🔀 <strong>${title}</strong>`);
            };
            sw.onclick = (e) => {
                e.stopPropagation();
                showSimpleTooltip(e, `🔀 <strong>${title}</strong><br><span style="color: #10b981;">In Service</span>`);
            };
        }
        sw.onmouseleave = hideTrackHoverTooltip;
    });
}

function hexToRgb(hex) {
    if (!hex) return "255, 255, 255";
    const c = hex.replace("#", "");
    const bigint = parseInt(c, 16);
    if (isNaN(bigint)) return "255, 255, 255";
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}

function renderFallbackCardGrid(container) {
    if (!cachedTracks.length) {
        container.innerHTML = `<div style="padding: 20px; color: var(--text-muted); text-align: center;">No track data available.</div>`;
        return;
    }

    let html = `<div class="track-card-grid">`;
    cachedTracks.forEach(t => {
        const badgeClass = t.is_clear ? "badge-clear" : (t.is_bad_order ? "badge-bo" : (t.is_blend ? "badge-blend" : (t.dwell_warning ? "badge-dwell" : "badge-occ")));
        const capText = t.capacity ? ` / ${t.capacity} cap` : "";
        html += `
            <div class="track-card ${badgeClass}" onclick="window.showTrackModalById('${t.id}')">
                <div class="track-card-header">
                    <span class="track-card-id">${t.name}</span>
                    <span class="track-card-cars">${t.is_clear ? "CLEAR" : t.cars + capText + " 🚂"}</span>
                </div>
                <div class="track-card-commodity">${t.commodity || "Empty"}</div>
                ${t.dwell_warning ? `<div class="track-card-dwell">⚠️ ${t.dwell_days} Days Dwell</div>` : ""}
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

window.showTrackModalById = (id) => {
    const t = cachedTracks.find(x => x.id === id);
    if (t) showTrackModal(t);
};

export function showTrackModal(track) {
    let modal = document.getElementById("track-detail-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "track-detail-modal";
        modal.className = "track-modal-backdrop";
        modal.style.zIndex = "1000002";
        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = "none";
        };
        document.body.appendChild(modal);
    }

    const breakdown = (track.cars > 0 && !track.is_clear) ? getTrackCommodityBreakdown(track) : [];
    const commCat = getCommodityCategory(track);
    const statusBadge = track.is_clear 
        ? `<span class="modal-status-badge status-clear">🟢 CLEAR / EMPTY</span>`
        : (track.is_bad_order 
            ? `<span class="modal-status-badge status-bo">🔴 BAD ORDER (B.O.)</span>`
            : (track.is_blend 
                ? `<span class="modal-status-badge status-blend">🔵 ACTIVE BLEND</span>`
                : (track.dwell_warning 
                    ? `<span class="modal-status-badge status-dwell">⚠️ DWELL WARNING (${track.dwell_days} DAYS)</span>`
                    : `<span class="modal-status-badge status-occ">⚪ OCCUPIED</span>`)));

    let capacityInfo = "";
    if (track.capacity) {
        const pct = Math.round((track.cars / track.capacity) * 100);
        const bedColor = getCapacityBedColor(track.cars, track.capacity, track.is_bad_order);
        
        let barSegments = "";
        if (breakdown.length > 1) {
            barSegments = breakdown.map(b => {
                const segPct = (b.count / track.capacity) * 100;
                return `<div style="background: ${b.color}; width: ${segPct}%; height: 100%; transition: width 0.3s ease;" title="${b.count}x ${b.category.name}"></div>`;
            }).join("");
        } else {
            barSegments = `<div style="background: ${commCat.color || bedColor}; width: ${Math.min(pct, 100)}%; height: 100%; border-radius: 4px; transition: width 0.3s ease;"></div>`;
        }

        capacityInfo = `
            <div class="modal-detail-row" style="flex-direction: column; align-items: stretch; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                    <span class="modal-detail-label">Track Capacity Utilization:</span>
                    <span style="font-weight: bold; color: ${commCat.color || '#38bdf8'};">${track.cars} / ${track.capacity} Cars (${pct}%)</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden; display: flex;">
                    ${barSegments}
                </div>
            </div>
        `;
    }

    let commodityBadges = "";
    if (breakdown.length > 1) {
        commodityBadges = breakdown.map(b => {
            const dirLabel = b.dir ? ` [${b.dir}/END]` : "";
            const cleanDesc = (b.desc || "").replace(/[()]/g, "").trim();
            const descSpan = cleanDesc && cleanDesc.toUpperCase() !== b.category.name.toUpperCase() ? ` <small style="opacity: 0.85;">(${cleanDesc})</small>` : "";
            return `
            <span class="modal-status-badge" style="background: rgba(${hexToRgb(b.color)}, 0.18); color: ${b.color}; border: 1px solid ${b.color};">
                📦 ${b.count}x ${b.category.name}${dirLabel}${descSpan}
            </span>
        `;
        }).join("");
    } else if (!track.is_clear && !track.is_bad_order) {
        commodityBadges = `<span class="modal-status-badge" style="background: rgba(${hexToRgb(commCat.color)}, 0.18); color: ${commCat.color}; border: 1px solid ${commCat.color};">📦 ${commCat.name}</span>`;
    }

    modal.innerHTML = `
        <div class="track-modal-card" style="border-color: ${commCat.color ? commCat.color + '66' : 'rgba(56, 189, 248, 0.3)'};">
            <div class="track-modal-header">
                <h3 style="color: ${commCat.color || '#38bdf8'};">${track.name}</h3>
                <button class="track-modal-close" onclick="document.getElementById('track-detail-modal').style.display='none'">&times;</button>
            </div>
            <div class="track-modal-body">
                <div style="margin-bottom: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
                    ${statusBadge}
                    ${commodityBadges}
                </div>
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Car Count:</span>
                    <span class="modal-detail-val" style="font-size: 1.3rem; font-weight: bold; color: ${commCat.color || '#38bdf8'};">${track.cars} Cars</span>
                </div>
                ${capacityInfo}
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Contents / Commodity:</span>
                    <span class="modal-detail-val">${(track.cars > 0 && (track.commodity || '').toUpperCase() === 'CLEAR') ? (track.notes || 'Occupied') : (track.commodity || "None")}</span>
                </div>
                ${track.notes && track.notes !== track.commodity && !(track.cars > 0 && (track.commodity || '').toUpperCase() === 'CLEAR') ? `
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Shift Conductor Notes:</span>
                    <span class="modal-detail-val" style="color: #38bdf8; font-weight: 600;">📝 ${track.notes}</span>
                </div>` : ""}
                ${track.oldest_inbound_date ? `
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Oldest Inbound:</span>
                    <span class="modal-detail-val" style="color: #f59e0b;">${track.oldest_inbound_date} (${track.dwell_days} Days Dwell)</span>
                </div>` : ""}
            </div>
        </div>
    `;
    modal.style.display = "flex";
}

export function showSwitchOsModal(switchTitle, note) {
    let modal = document.getElementById("track-detail-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "track-detail-modal";
        modal.className = "track-modal-backdrop";
        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = "none";
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="track-modal-card" style="border: 2px solid #ef4444; box-shadow: 0 0 25px rgba(239, 68, 68, 0.4);">
            <div class="track-modal-header" style="border-bottom: 1px solid rgba(239, 68, 68, 0.4);">
                <h3 style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> ${switchTitle}</h3>
                <button class="track-modal-close" onclick="document.getElementById('track-detail-modal').style.display='none'">&times;</button>
            </div>
            <div class="track-modal-body">
                <div style="margin-bottom: 15px;">
                    <span class="modal-status-badge status-bo">⛔ SWITCH OUT OF SERVICE (O.S.)</span>
                </div>
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Status:</span>
                    <span class="modal-detail-val" style="color: #ef4444; font-weight: bold;">Out of Service / Bad Order</span>
                </div>
                <div class="modal-detail-row">
                    <span class="modal-detail-label">Conductor Shift Note:</span>
                    <span class="modal-detail-val" style="color: #fca5a5; font-weight: 600;">📝 ${note}</span>
                </div>
                <div style="margin-top: 15px; padding: 10px 12px; background: rgba(239, 68, 68, 0.12); border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.85rem; color: #fecaca;">
                    ⚠️ <strong>Warning:</strong> Do not line switch points for movement across this turnout.
                </div>
            </div>
        </div>
    `;
    modal.style.display = "flex";
}

let hoverTooltipEl = null;

function showTrackHoverTooltip(e, track) {
    if (hasDraggedMap) return;
    if (!hoverTooltipEl) {
        hoverTooltipEl = document.createElement("div");
        hoverTooltipEl.className = "track-hover-tooltip";
        document.body.appendChild(hoverTooltipEl);
    }
    
    const breakdown = (track.cars > 0 && !track.is_clear) ? getTrackCommodityBreakdown(track) : [];
    const commCat = getCommodityCategory(track);
    let capText = "";
    if (track.capacity) {
        const pct = Math.round((track.cars / track.capacity) * 100);
        let breakdownBadges = "";
        if (breakdown.length > 1) {
            breakdownBadges = `<div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">` + 
                breakdown.map(b => {
                    const dirLabel = b.dir ? ` [${b.dir}]` : "";
                    return `<span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; background: rgba(${hexToRgb(b.color)}, 0.2); color: ${b.color}; border: 1px solid ${b.color};">${b.count}x ${b.category.name}${dirLabel}</span>`;
                }).join("") +
                `</div>`;
        } else {
            breakdownBadges = `<span style="color: ${commCat.color}; font-weight: 600; font-size: 0.75rem;">📦 ${commCat.name}</span>`;
        }
        capText = `<br>${breakdownBadges} &bull; <span style="color: #94a3b8; font-size: 0.75rem;">Cap: ${track.cars}/${track.capacity} (${pct}%)</span>`;
    }

    hoverTooltipEl.innerHTML = `
        <strong>${track.name}</strong>: ${track.is_clear ? "CLEAR" : track.cars + " Cars"}<br>
        <span style="color: #cbd5e1; font-size: 0.8rem;">${(track.cars > 0 && (track.commodity || '').toUpperCase() === 'CLEAR') ? (track.notes || 'Occupied') : (track.commodity || "Empty")}</span>
        ${capText}
        ${track.dwell_warning ? `<br><span style="color: #f59e0b; font-size: 0.75rem;">⚠️ ${track.dwell_days}d Dwell</span>` : ""}
    `;
    hoverTooltipEl.style.left = (e.pageX + 12) + "px";
    hoverTooltipEl.style.top = (e.pageY + 12) + "px";
    hoverTooltipEl.style.display = "block";
}

function showSimpleTooltip(e, html) {
    if (hasDraggedMap) return;
    if (!hoverTooltipEl) {
        hoverTooltipEl = document.createElement("div");
        hoverTooltipEl.className = "track-hover-tooltip";
        document.body.appendChild(hoverTooltipEl);
    }
    hoverTooltipEl.innerHTML = html;
    hoverTooltipEl.style.left = (e.pageX + 12) + "px";
    hoverTooltipEl.style.top = (e.pageY + 12) + "px";
    hoverTooltipEl.style.display = "block";
}

function hideTrackHoverTooltip() {
    if (hoverTooltipEl) {
        hoverTooltipEl.style.display = "none";
    }
}

// ── Fullscreen Theater Mode Engine ──────────────────────────────────────────
let isTheaterOpen = false;
let theaterZoom = 1;
let theaterPanX = 0;
let theaterPanY = 0;
let showBuildings = true;
let hasDraggedMap = false;

export async function openExpandedTrackMap() {
    let theater = document.getElementById("trackmap-theater-modal");
    if (!theater) {
        theater = document.createElement("div");
        theater.id = "trackmap-theater-modal";
        theater.className = "track-theater-backdrop";
        document.body.appendChild(theater);

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isTheaterOpen) {
                closeExpandedTrackMap();
            }
        });
    }

    if (!svgTemplateCache) {
        try {
            const resData = await fetch("assets/data/track-map.svg?t=" + new Date().getTime());
            if (resData.ok) svgTemplateCache = await resData.text();
        } catch {}
        if (!svgTemplateCache) {
            try {
                const res = await fetch("assets/images/track-map.svg?t=" + new Date().getTime());
                if (res.ok) svgTemplateCache = await res.text();
            } catch (e) {
                console.warn("Could not load SVG for theater mode:", e);
            }
        }
    }

    const capText = trackStats.totalCapacity > 0 ? ` / ${trackStats.totalCapacity}` : "";

    theater.innerHTML = `
        <div class="track-theater-container">
            <div class="track-theater-header">
                <div class="theater-title-group">
                    <i class="fa-solid fa-train-subway" style="color: #38bdf8; font-size: 1.3rem;"></i>
                    <h2 style="margin: 0; font-size: 1.25rem; color: #fff;">YARD TRACK MAP</h2>
                    <span class="track-stat-pill pill-total">🚂 <strong>${trackStats.totalCars}${capText}</strong> Cars</span>
                    <span class="track-stat-pill pill-clear">🟢 <strong>${trackStats.clearTracksCount}</strong> Clear</span>
                    ${trackStats.badOrderCars > 0 ? `<span class="track-stat-pill pill-bo">🔴 <strong>${trackStats.badOrderCars}</strong> B.O.</span>` : ""}
                    ${trackStats.dwellWarningCount > 0 ? `<span class="track-stat-pill pill-dwell">⚠️ <strong>${trackStats.dwellWarningCount}</strong> Dwell</span>` : ""}
                </div>
                <div class="theater-controls-group">
                    <button id="btn-toggle-legend" class="theater-btn" title="Toggle Commodity & Capacity Legend">
                        <i class="fa-solid fa-palette"></i> Legend
                    </button>
                    <button id="btn-toggle-bld" class="theater-btn ${showBuildings ? "active" : ""}" title="Toggle Building Outlines">
                        <i class="fa-solid fa-building"></i> Buildings
                    </button>
                    <button id="btn-reset-zoom" class="theater-btn" title="Reset Zoom & Pan">
                        <i class="fa-solid fa-arrows-to-dot"></i> Reset
                    </button>
                    <button id="btn-close-theater" class="theater-btn theater-btn-close" title="Close Fullscreen (Esc)">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="track-theater-viewport" id="theater-viewport">
                <div id="theater-legend-panel" class="theater-legend-panel" style="display: none;">
                    <div class="legend-header">
                        <h4><i class="fa-solid fa-palette"></i> Commodity & Bed Legend</h4>
                        <button id="btn-close-legend-panel">&times;</button>
                    </div>
                    <div class="legend-section">
                        <div class="legend-section-title">Train Railcars (Dashes)</div>
                        <div class="legend-grid">
                            ${commodityRules.categories.map(c => `
                                <div class="legend-item">
                                    <span class="legend-swatch" style="background: ${c.color}; color: ${c.color};"></span>
                                    <strong>${c.name}</strong>
                                    <span class="desc">${(c.keywords || []).slice(0, 3).join(", ")}</span>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                    <div class="legend-section">
                        <div class="legend-section-title">Track Bed Rail (Capacity Used)</div>
                        <div class="legend-ramp">
                            <div class="legend-ramp-step" style="background: rgba(56, 189, 248, 0.4); color: #38bdf8;">0-25%</div>
                            <div class="legend-ramp-step" style="background: rgba(34, 197, 94, 0.4); color: #22c55e;">26-50%</div>
                            <div class="legend-ramp-step" style="background: rgba(234, 179, 8, 0.45); color: #eab308;">51-75%</div>
                            <div class="legend-ramp-step" style="background: rgba(249, 115, 22, 0.5); color: #f97316;">76-90%</div>
                            <div class="legend-ramp-step" style="background: rgba(239, 68, 68, 0.6); color: #ef4444;">&gt;90% / BO</div>
                        </div>
                    </div>
                </div>
                <div id="theater-svg-wrapper" class="theater-svg-wrapper">
                    ${svgTemplateCache || "<div style='color:#fff;padding:40px;'>No vector track map available.</div>"}
                </div>
                <div class="theater-hint-bar">
                    <span><i class="fa-solid fa-computer-mouse"></i> Scroll to Zoom | Drag anywhere to Pan | Click Track for Details</span>
                </div>
            </div>
        </div>
    `;

    theater.style.display = "flex";
    isTheaterOpen = true;
    theaterZoom = 1;
    theaterPanX = 0;
    theaterPanY = 0;
    hasDraggedMap = false;

    const viewport = document.getElementById("theater-viewport");
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    const btnClose = document.getElementById("btn-close-theater");
    const btnReset = document.getElementById("btn-reset-zoom");
    const btnToggleBld = document.getElementById("btn-toggle-bld");
    const btnToggleLegend = document.getElementById("btn-toggle-legend");
    const legendPanel = document.getElementById("theater-legend-panel");
    const btnCloseLegend = document.getElementById("btn-close-legend-panel");

    if (btnToggleLegend && legendPanel) {
        btnToggleLegend.onclick = () => {
            const isHidden = legendPanel.style.display === "none";
            legendPanel.style.display = isHidden ? "block" : "none";
            btnToggleLegend.classList.toggle("active", isHidden);
        };
    }
    if (btnCloseLegend && legendPanel && btnToggleLegend) {
        btnCloseLegend.onclick = () => {
            legendPanel.style.display = "none";
            btnToggleLegend.classList.remove("active");
        };
    }

    if (btnClose) btnClose.onclick = closeExpandedTrackMap;
    if (btnReset) btnReset.onclick = resetTheaterTransform;
    if (btnToggleBld) {
        btnToggleBld.onclick = () => {
            showBuildings = !showBuildings;
            btnToggleBld.classList.toggle("active", showBuildings);
            applyBuildingVisibility();
        };
    }

    if (svgWrapper) {
        bindSvgInteractivity(svgWrapper, true);
        applyBuildingVisibility();
    }

    if (viewport && svgWrapper) {
        viewport.onwheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 0.85;
            theaterZoom = Math.min(Math.max(0.6, theaterZoom * delta), 5);
            applyTheaterTransform();
        };

        let isMouseDown = false;
        let startX = 0;
        let startY = 0;
        let initialPanX = 0;
        let initialPanY = 0;

        viewport.onmousedown = (e) => {
            if (e.target.closest("button, .theater-btn")) return;
            isMouseDown = true;
            hasDraggedMap = false;
            startX = e.clientX;
            startY = e.clientY;
            initialPanX = theaterPanX;
            initialPanY = theaterPanY;
            svgWrapper.style.transition = "none";
        };

        window.onmousemove = (e) => {
            if (!isMouseDown) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (Math.hypot(dx, dy) > 8) {
                hasDraggedMap = true;
                viewport.style.cursor = "grabbing";
                hideTrackHoverTooltip();
            }

            theaterPanX = initialPanX + dx;
            theaterPanY = initialPanY + dy;
            applyTheaterTransform();
        };

        window.onmouseup = (e) => {
            if (isMouseDown) {
                isMouseDown = false;
                if (viewport) viewport.style.cursor = "grab";
                if (svgWrapper) svgWrapper.style.transition = "transform 0.05s ease-out";
                if (hasDraggedMap) {
                    setTimeout(() => { hasDraggedMap = false; }, 30);
                } else {
                    hasDraggedMap = false;
                }
            }
        };
    }
}

function updateTheaterMap() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (svgWrapper && svgTemplateCache) {
        svgWrapper.innerHTML = svgTemplateCache;
        bindSvgInteractivity(svgWrapper, true);
        applyBuildingVisibility();
        applyTheaterTransform();
    }
}

function applyTheaterTransform() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (svgWrapper) {
        svgWrapper.style.transform = `translate(${theaterPanX}px, ${theaterPanY}px) scale(${theaterZoom})`;
    }
}

function resetTheaterTransform() {
    theaterZoom = 1;
    theaterPanX = 0;
    theaterPanY = 0;
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (svgWrapper) svgWrapper.style.transition = "transform 0.25s ease";
    applyTheaterTransform();
}

function applyBuildingVisibility() {
    const svgWrapper = document.getElementById("theater-svg-wrapper");
    if (!svgWrapper) return;
    const buildings = svgWrapper.querySelectorAll(".building, .tank, [id*='building'], [class*='building']");
    buildings.forEach(b => {
        b.style.display = showBuildings ? "" : "none";
    });
}

export function closeExpandedTrackMap() {
    const theater = document.getElementById("trackmap-theater-modal");
    if (theater) {
        theater.style.display = "none";
    }
    isTheaterOpen = false;
}
