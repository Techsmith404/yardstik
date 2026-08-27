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
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
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
        const usersData = await usersReq.json();
        if (!usersData.ok || !usersData.users) {
            return res.status(500).json({ success: false, error: 'Invalid Users API response format' });
        }

        // Endpoint Discovery Probe
        if (req.query.probe) {
            const probeEndpoints = [
                'trainings.list',
                'training.list',
                'training-modules.list',
                'training-assignments.list',
                'user-trainings.list',
                'employee-trainings.list',
                'training-records.list',
                'training-requirements.list'
            ];
            const probeResults = {};
            for (const ep of probeEndpoints) {
                try {
                    const r = await fetch(`https://api.novaraflex.com/v1/${ep}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: apiKey, m_user_id: '69e63ee7d857c10012b18813' })
                    });
                    const resJson = await r.json();
                    probeResults[ep] = { 
                        status: r.status, 
                        ok: resJson.ok, 
                        keys: Object.keys(resJson), 
                        error: resJson.error || null,
                        summary: resJson.trainings ? `${resJson.trainings.length} trainings` : (resJson.modules ? `${resJson.modules.length} modules` : null)
                    };
                } catch (pe) {
                    probeResults[ep] = { error: pe.message };
                }
            }
            return res.status(200).json({ success: true, probeResults });
        }

        // Discovery Endpoint: List all field offices across the entire organization
        if (req.query.inspect === 'offices' || req.query.inspect === 'locations') {
            let directOfficesApi = null;
            try {
                const offReq = await fetch('https://api.novaraflex.com/v1/field-offices.list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: apiKey })
                });
                directOfficesApi = await offReq.json();
            } catch (e) {}

            const officeSummary = {};
            usersData.users.forEach(u => {
                const offices = Array.isArray(u.fieldOffice_id) ? u.fieldOffice_id : (u.fieldOffice_id ? [u.fieldOffice_id] : ['UNASSIGNED']);
                offices.forEach(offId => {
                    if (!officeSummary[offId]) {
                        officeSummary[offId] = {
                            officeId: offId,
                            activeCount: 0,
                            sampleEmployees: []
                        };
                    }
                    if (!u.terminationDate || u.terminationDate > Date.now()) {
                        officeSummary[offId].activeCount++;
                        if (officeSummary[offId].sampleEmployees.length < 5) {
                            officeSummary[offId].sampleEmployees.push(`${u.firstname} ${u.lastname}`);
                        }
                    }
                });
            });

            return res.status(200).json({
                success: true,
                directOfficesApi: directOfficesApi,
                locationsDetected: Object.values(officeSummary)
            });
        }

        // 2. Filter for specific Field Office (configurable via env/query/default) and only get active employees
        const TARGET_FIELD_OFFICE = process.env.NOVARA_FIELD_OFFICE_ID || process.env.TARGET_FIELD_OFFICE || req.query.office || null;
        const userMap = {};
        const activeIds = [];
        const inspectUsers = [];
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
                inspectUsers.push({
                    id: u.id,
                    name: `${u.lastname}, ${u.firstname}`,
                    fieldOfficeId: u.fieldOffice_id || null,
                    hireDate: u.hireDate || u.hire_date || u.startDate || u.start_date || null,
                    vacationDate: u.vacationDate || u.vacation_date || u.seniorityDate || u.seniority_date || u.custom_vacation_date || null,
                    rawUserKeys: Object.keys(u).filter(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('hire') || k.toLowerCase().includes('vacation') || k.toLowerCase().includes('start') || k.toLowerCase().includes('seniority')),
                    allDateValues: Object.fromEntries(Object.entries(u).filter(([k]) => k.toLowerCase().includes('date') || k.toLowerCase().includes('hire') || k.toLowerCase().includes('vacation') || k.toLowerCase().includes('start') || k.toLowerCase().includes('seniority')))
                });
            }
        });

        if (req.query.inspect === 'dates') {
            return res.status(200).json({ success: true, count: inspectUsers.length, targetOfficeFilter: TARGET_FIELD_OFFICE, users: inspectUsers });
        }

        if (activeIds.length === 0) {
            return res.status(200).json({ success: true, response: [] });
        }

        // 3. Fetch Training Status ONLY for active employees (bypasses 1000 limit pagination)
        const statusReq = await fetch('https://api.novaraflex.com/v1/training-employee-status.list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: apiKey, m_user_ids: activeIds })
        });
        
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

        // 4. Calculate missing and expiring training videos per user
        const todayD = new Date();
        const todayNum = parseInt(
            todayD.getFullYear().toString() + 
            String(todayD.getMonth() + 1).padStart(2, '0') + 
            String(todayD.getDate()).padStart(2, '0'), 
            10
        );

        if (req.query.inspect === 'trainings' || req.query.inspect === 'status') {
            return res.status(200).json({ success: true, count: statusData.employees.length, employees: statusData.employees });
        }

        if (req.query.inspect === 'expiring') {
            const expiringUsers = [];
            statusData.employees.forEach(emp => {
                if (Array.isArray(emp.last_completed)) {
                    const expList = emp.last_completed.filter(item => item.startsExpiringOn && todayNum >= item.startsExpiringOn);
                    if (expList.length > 0 && userMap[emp.m_user_id]) {
                        expiringUsers.push({
                            name: userMap[emp.m_user_id].name,
                            expiringCount: expList.length,
                            expList
                        });
                    }
                }
            });
            return res.status(200).json({ success: true, count: expiringUsers.length, expiringUsers });
        }

        if (req.query.inspect === 'kaden' || req.query.inspect === 'user' || req.query.user) {
            const searchName = (req.query.user || req.query.inspect || 'kaden').toLowerCase();
            const matchingUsers = Object.entries(userMap).filter(([id, u]) => u.name.toLowerCase().includes(searchName));
            const matchingEmployees = statusData.employees.filter(emp => matchingUsers.some(([id]) => id === emp.m_user_id));
            return res.status(200).json({
                success: true,
                todayNum,
                matchingUsers,
                matchingEmployees
            });
        }

        const result = [];
        statusData.employees.forEach(emp => {
            const incompleteIds = new Set(emp.incomplete_training_ids || []);
            
            // Check for trainings that have reached their "startsExpiringOn" date window
            let expiringCount = 0;
            if (Array.isArray(emp.last_completed)) {
                emp.last_completed.forEach(item => {
                    const startsExp = typeof item.startsExpiringOn === 'number' ? item.startsExpiringOn : parseInt((item.startsExpiringOn || '').toString().replace(/[^0-9]/g, ''), 10);
                    if (startsExp && todayNum >= startsExp) {
                        // Avoid double-counting if it already moved to incomplete
                        if (!incompleteIds.has(item.id)) {
                            expiringCount++;
                        }
                    } else if (item.expiresOn) {
                        const expNum = parseInt((item.expiresOn || '').toString().replace(/[^0-9]/g, ''), 10);
                        if (expNum && expNum <= todayNum + 30 && !incompleteIds.has(item.id)) {
                            expiringCount++;
                        }
                    }
                });
            }

            const totalDue = incompleteIds.size + expiringCount;

            if (totalDue > 0) {
                if (userMap[emp.m_user_id]) {
                    result.push({
                        userId: emp.m_user_id,
                        name: userMap[emp.m_user_id].name,
                        photoUrl: userMap[emp.m_user_id].photoUrl,
                        missingCount: totalDue,
                        incompleteCount: incompleteIds.size,
                        expiringCount: expiringCount
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
                const siteKey = req.query.site || process.env.DEFAULT_SITE_ID || 'burns-harbor';
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

        res.status(200).json({
            success: true,
            response: result,
            anniversaries: anniversariesPayload
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};
