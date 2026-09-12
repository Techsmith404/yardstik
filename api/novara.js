let redisClient = null;
function getRedisClient() {
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    if (!redisUrl) return null;
    if (!redisClient) {
        try {
            const Redis = require('ioredis');
            redisClient = new Redis(redisUrl, {
                connectTimeout: 3000,
                maxRetriesPerRequest: 1,
                enableReadyCheck: false,
                lazyConnect: true
            });
        } catch (e) {
            return null;
        }
    }
    return redisClient;
}

module.exports = async function handler(req, res) {
    // SECURITY: Restrict CORS origin to the configured allowed origin.
    // Access-Control-Allow-Credentials: true is incompatible with wildcard '*' origin.
    // Use ALLOWED_ORIGIN env var to specify the permitted kiosk frontend origin.
    const allowedOrigin = process.env.ALLOWED_ORIGIN || (req.headers.origin || 'null');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const apiKey = process.env.NOVARA_API_KEY || process.env.NOVARA_API_TOKEN;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'NOVARA_API_KEY / NOVARA_API_TOKEN not configured' });
        }

        // 1. Fetch Users
        const usersReq = await fetch('https://api.novaraflex.com/v1/users.list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: apiKey })
        });
        let usersData;
        try {
            usersData = await usersReq.json();
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Failed to parse Users API response' });
        }
        if (!usersData || !usersData.ok || !usersData.users) {
            return res.status(500).json({ success: false, error: 'Invalid Users API response format' });
        }

        // SECURITY: ?inspect= debug endpoints removed — they exposed full PII (employee names,
        // IDs, hire dates, training statuses) to unauthenticated callers. Discovery/debug tasks
        // should be performed using the Novara API directly with proper credentials.

        // 2. Filter for specific Field Office (configurable via env only — query param override removed)
        // SECURITY: ?office= query override removed to prevent unauthenticated pivot to any field office.
        const TARGET_FIELD_OFFICE = process.env.NOVARA_FIELD_OFFICE_ID || process.env.TARGET_FIELD_OFFICE || null;
        const userMap = {};
        const activeIds = [];
        const now = Date.now();
        
        usersData.users.forEach(u => {
            const isAtLocation = !TARGET_FIELD_OFFICE || (u.fieldOffice_id && u.fieldOffice_id.includes(TARGET_FIELD_OFFICE));
            const isEmployed = !u.terminationDate || u.terminationDate > now;
            
            if (isAtLocation && isEmployed) {
                activeIds.push(u.id);
                const fallbackAvatar = `https://ui-avatars.com/api/?name=${u.firstname}+${u.lastname}&background=202830&color=cbd5e1&size=150`;
                userMap[u.id] = {
                    name: `${u.firstname} ${u.lastname}`,
                    photoUrl: fallbackAvatar
                };
                // SECURITY: inspectUsers PII accumulation removed along with ?inspect=dates endpoint.
            }
        });

        // SECURITY: ?inspect=dates endpoint removed — exposed full employee PII without authentication.

        if (activeIds.length === 0) {
            return res.status(200).json({ success: true, response: [] });
        }

        // 3. Fetch Training Status AND Catalog in parallel
        const [statusReq, catalogReq] = await Promise.all([
            fetch('https://api.novaraflex.com/v1/training-employee-status.list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: apiKey, m_user_ids: activeIds })
            }),
            fetch('https://api.novaraflex.com/v1/trainings.list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: apiKey })
            }).catch(() => null)
        ]);
        
        let statusData = null;
        try {
            statusData = await statusReq.json();
        } catch (parseErr) {
            return res.status(500).json({ success: false, error: 'Novara training endpoint returned non-JSON response', httpStatus: statusReq.status });
        }

        if (!statusData || !statusData.ok || !statusData.employees) {
            return res.status(200).json({
                success: false,
                error: statusData?.error || 'Invalid Status API response format',
                activeUserCount: activeIds.length,
                rawNovaraResponse: statusData
            });
        }

        let catalogTrainings = [];
        if (catalogReq) {
            try {
                const catJson = await catalogReq.json();
                if (catJson && Array.isArray(catJson.trainings)) {
                    catalogTrainings = catJson.trainings;
                }
            } catch (e) {}
        }

        // 4. Calculate missing and expiring training videos per user
        const todayD = new Date();
        const currentMonth = todayD.getMonth() + 1; // 1-12 (e.g. 8 for August)
        const currentDay = todayD.getDate(); // 1-31
        const todayNum = parseInt(
            todayD.getFullYear().toString() + 
            String(currentMonth).padStart(2, '0') + 
            String(currentDay).padStart(2, '0'), 
            10
        );

        function parseTrainingNumericId(idStr) {
            if (typeof idStr === 'number') return idStr;
            if (!idStr) return null;
            const match = idStr.toString().match(/\d+/);
            return match ? parseInt(match[0], 10) : null;
        }

        function isTrainingAssignedToOffice(training, targetOffice) {
            if (!targetOffice) return true;
            if (!training.assignedToType || training.assignedToType === 'none' || training.assignedToType === 'all') return true;
            const condStr = JSON.stringify(training.assignedToCondition || '');
            return condStr.includes(targetOffice);
        }

        function isWindowTrainingCurrentlyOpen(t) {
            if (t.scheduleType !== 'window') return false;
            if (t.window_openMonth == null || t.window_closeMonth == null) return false;
            
            const oM = t.window_openMonth;
            const oD = t.window_openDay || 1;
            const cM = t.window_closeMonth;
            const cD = t.window_closeDay || 1;

            if (oM <= cM) {
                return (currentMonth > oM || (currentMonth === oM && currentDay >= oD)) &&
                       (currentMonth < cM || (currentMonth === cM && currentDay <= cD));
            } else {
                // Window wraps around new year (e.g. Dec to Jan)
                return (currentMonth > oM || (currentMonth === oM && currentDay >= oD)) ||
                       (currentMonth < cM || (currentMonth === cM && currentDay <= cD));
            }
        }

        // Collect all currently open window-based monthly trainings for this location
        const activeWindowTrainings = catalogTrainings.filter(t => 
            isWindowTrainingCurrentlyOpen(t) && isTrainingAssignedToOffice(t, TARGET_FIELD_OFFICE)
        ).map(t => {
            const primaryId = parseTrainingNumericId(t.id);
            const includedIds = (t.includedTrainings_id || []).map(parseTrainingNumericId).filter(Boolean);
            const lessonId = t.lesson_id ? parseTrainingNumericId(t.lesson_id) : null;
            return {
                title: t.title,
                primaryId,
                allAcceptedIds: new Set([primaryId, lessonId, ...includedIds].filter(Boolean))
            };
        });


        // SECURITY: ?inspect=trainings, ?inspect=status, ?inspect=kaden, ?inspect=user debug
        // endpoints removed — all exposed full employee training records without authentication.

        const result = [];
        statusData.employees.forEach(emp => {
            const incompleteIds = new Set(emp.incomplete_training_ids || []);
            const completeIds = new Set(emp.complete_training_ids || []);
            
            // 1. Check for recurring trainings that have reached their "startsExpiringOn" date window
            let expiringAnnualCount = 0;
            if (Array.isArray(emp.last_completed)) {
                emp.last_completed.forEach(item => {
                    const startsExp = typeof item.startsExpiringOn === 'number' ? item.startsExpiringOn : parseInt((item.startsExpiringOn || '').toString().replace(/[^0-9]/g, ''), 10);
                    if (startsExp && todayNum >= startsExp) {
                        if (!incompleteIds.has(item.id)) {
                            expiringAnnualCount++;
                        }
                    } else if (item.expiresOn) {
                        const expNum = parseInt((item.expiresOn || '').toString().replace(/[^0-9]/g, ''), 10);
                        if (expNum && expNum <= todayNum + 30 && !incompleteIds.has(item.id)) {
                            expiringAnnualCount++;
                        }
                    }
                });
            }

            // 2. Check for currently open monthly window trainings not yet completed
            let openWindowDueCount = 0;
            activeWindowTrainings.forEach(wt => {
                const isCompleted = Array.from(wt.allAcceptedIds).some(id => completeIds.has(id));
                const isAlreadyIncomplete = Array.from(wt.allAcceptedIds).some(id => incompleteIds.has(id));
                
                if (!isCompleted && !isAlreadyIncomplete) {
                    openWindowDueCount++;
                }
            });

            const totalDue = incompleteIds.size + expiringAnnualCount + openWindowDueCount;

            if (totalDue > 0) {
                if (userMap[emp.m_user_id]) {
                    result.push({
                        userId: emp.m_user_id,
                        name: userMap[emp.m_user_id].name,
                        photoUrl: userMap[emp.m_user_id].photoUrl,
                        missingCount: totalDue,
                        incompleteCount: incompleteIds.size,
                        expiringCount: expiringAnnualCount + openWindowDueCount
                    });
                }
            }
        });

        // Sort by total missing/expiring count descending (people with most due at the top)
        result.sort((a, b) => b.missingCount - a.missingCount);

        // Helper to parse date without timezone shifting
        function parseDateParts(dVal) {
            if (!dVal) return null;
            if (typeof dVal === 'string') {
                const match = dVal.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (match) {
                    return {
                        year: parseInt(match[1], 10),
                        month: parseInt(match[2], 10) - 1, // 0-indexed
                        day: parseInt(match[3], 10)
                    };
                }
            }
            if (typeof dVal === 'number' || (typeof dVal === 'string' && /^\d+$/.test(dVal.trim()))) {
                const num = Number(dVal);
                const ms = num < 10000000000 ? num * 1000 : num;
                const dtNum = new Date(ms);
                if (!isNaN(dtNum.getTime())) {
                    return {
                        year: dtNum.getUTCFullYear(),
                        month: dtNum.getUTCMonth(),
                        day: dtNum.getUTCDate()
                    };
                }
            }
            const dt = new Date(dVal);
            if (isNaN(dt.getTime())) return null;
            return {
                year: dt.getUTCFullYear(),
                month: dt.getUTCMonth(),
                day: dt.getUTCDate()
            };
        }

        // 5. Automated Anniversary Engine with Configurable Seniority Overrides
        let legacyHireOverrides = {};
        if (process.env.NOVARA_HIRE_OVERRIDES) {
            try {
                legacyHireOverrides = typeof process.env.NOVARA_HIRE_OVERRIDES === 'string' 
                    ? JSON.parse(process.env.NOVARA_HIRE_OVERRIDES) 
                    : process.env.NOVARA_HIRE_OVERRIDES;
            } catch (e) {
                console.warn('Failed to parse NOVARA_HIRE_OVERRIDES:', e.message);
            }
        }

        // Also check Redis for dynamically synced seniority.json from Control Panel
        const rClient = getRedisClient();
        if (rClient) {
            try {
                if (rClient.status === 'wait' || rClient.status === 'close') await rClient.connect();
                const siteKey = req.query.site || process.env.DEFAULT_SITE_ID || 'default-site';
                const redisSeniority = await rClient.get(`kiosk:${siteKey}:seniority.json`);
                if (redisSeniority) {
                    const parsedSeniority = JSON.parse(redisSeniority);
                    legacyHireOverrides = { ...legacyHireOverrides, ...parsedSeniority };
                }
            } catch (rErr) {
                console.warn('Redis seniority lookup skipped:', rErr.message);
            }
        }

        function normalizeTokens(str) {
            if (!str) return [];
            return str
                .toLowerCase()
                .replace(/[^a-z0-9 ]/g, ' ')
                .split(/\s+/)
                .filter(t => t.length > 1); // filters out 1-letter middle initials like "L" or "C"
        }

        function matchNormalizedOverride(firstName, lastName, overridesMap) {
            if (!overridesMap || Object.keys(overridesMap).length === 0) return null;
            
            const reversed = `${lastName}, ${firstName}`;
            const normal = `${firstName} ${lastName}`;
            if (overridesMap[reversed]) return overridesMap[reversed];
            if (overridesMap[normal]) return overridesMap[normal];

            const targetTokens = new Set(normalizeTokens(`${firstName} ${lastName}`));
            if (targetTokens.size === 0) return null;

            for (const [key, dateVal] of Object.entries(overridesMap)) {
                const keyTokens = normalizeTokens(key);
                if (keyTokens.length === targetTokens.size && keyTokens.every(t => targetTokens.has(t))) {
                    return dateVal;
                }
            }
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentYear = today.getFullYear();
        const anniversaryEmployees = [];

        usersData.users.forEach(u => {
            const isAtLocation = !TARGET_FIELD_OFFICE || (u.fieldOffice_id && u.fieldOffice_id.includes(TARGET_FIELD_OFFICE));
            const isEmployed = !u.terminationDate || u.terminationDate > now;
            if (!isAtLocation || !isEmployed) return;

            let rawHire = matchNormalizedOverride(u.firstname, u.lastname, legacyHireOverrides);
            if (!rawHire && (u.hireDate || u.hire_date || u.startDate || u.start_date)) {
                rawHire = u.hireDate || u.hire_date || u.startDate || u.start_date;
            }

            const parts = parseDateParts(rawHire);
            if (!parts) return;

            const hireYear = parts.year;
            const hireMonth = parts.month;
            const hireDay = parts.day;

            // Target anniversary for this current year (at midnight local time)
            let targetAnniversary = new Date(currentYear, hireMonth, hireDay, 0, 0, 0);

            // If it already passed earlier this year, calculate for next year
            let anniversaryYear = currentYear;
            const diffDaysThisYear = Math.round((targetAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDaysThisYear < 0) {
                anniversaryYear = currentYear + 1;
                targetAnniversary = new Date(anniversaryYear, hireMonth, hireDay, 0, 0, 0);
            }

            const daysUntil = Math.round((targetAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const yearsOfService = anniversaryYear - hireYear;

            // Only show upcoming in the next 30 days and valid >= 1 year milestones
            if (daysUntil >= 0 && daysUntil <= 30 && yearsOfService >= 1) {
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                anniversaryEmployees.push({
                    name: userMap[u.id] ? userMap[u.id].name : `${u.firstname} ${u.lastname}`,
                    years: yearsOfService,
                    date: `${monthNames[hireMonth]} ${hireDay}`,
                    days_until: daysUntil,
                    photoUrl: userMap[u.id] ? userMap[u.id].photoUrl : null
                });
            }
        });

        // Sort by upcoming (today / 0 days first)
        anniversaryEmployees.sort((a, b) => a.days_until - b.days_until);

        const anniversariesPayload = {
            is_today: anniversaryEmployees.some(a => a.days_until === 0),
            employees: anniversaryEmployees
        };

        if (req.query.type === 'anniversaries') {
            return res.status(200).json({ success: true, ...anniversariesPayload });
        }

        const totalIncomplete = result.reduce((sum, e) => sum + (e.incompleteCount || 0), 0);
        const totalExpiring = result.reduce((sum, e) => sum + (e.expiringCount || 0), 0);
        const totalMissing = totalIncomplete + totalExpiring;

        res.status(200).json({
            success: true,
            totalMissing,
            totalIncomplete,
            totalExpiring,
            employeeCount: result.length,
            response: result,
            anniversaries: anniversariesPayload
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};
