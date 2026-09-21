// ==========================================================================
// 🏛️ YardStik: Mobile Companion App Logic
// Strictly conforms to SSoT §9.1: Zero Regex Lookbehinds, Zero Top-Level Await
// ==========================================================================

(function() {
    'use strict';

    // State
    let siteConfig = {
        site_name: "YardStik Mobile",
        site_id: "default-site",
        latitude: 41.6045,
        longitude: -87.1311,
        vercel_api_url: ""
    };

    let rawEquipmentData = null;
    let rawTracksData = [];
    let equipmentFilter = 'all';
    let equipmentSearch = '';
    let trackFilter = 'all';
    let trackSearch = '';
    let currentVersion = null;
    let activeShiftData = null;
    let lightningCooldownInterval = null;
    let countdownIntervals = [];

    // Mobile Floor Auth & Quick Edit State (Issue #14)
    let currentMobileUser = null;
    let activeQuickEditCatIndex = -1;
    let activeQuickEditItemIndex = -1;
    let activeQuickEditStatus = 'OK';

    function getAuthHeaders() {
        var headers = { 'Content-Type': 'application/json' };
        try {
            var tok = localStorage.getItem('yardstik_session_token');
            if (tok) {
                headers['Authorization'] = 'Bearer ' + tok;
            }
        } catch(e) {}
        return headers;
    }

    // Helper: Determine URL for local data or Vercel cloud sync
    function getDataUrl(filename) {
        const urlParams = new URLSearchParams(window.location.search);
        const siteId = urlParams.get('site');
        const siteQuery = siteId ? 'site=' + encodeURIComponent(siteId) + '&' : '';
        
        if (window.location.hostname.indexOf('vercel.app') !== -1 || window.location.protocol === 'https:') {
            return '/api/sync?' + siteQuery + 'file=' + filename + '&t=' + Date.now();
        }
        return 'assets/data/' + filename + '?t=' + Date.now();
    }

    // Helper: Sanitize Markdown HTML using DOMPurify with fallback
    function sanitizeMarkdownHtml(dirtyHtml) {
        if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
        if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
            return window.DOMPurify.sanitize(dirtyHtml, {
                ALLOWED_TAGS: [
                    'b', 'i', 'em', 'strong', 'u', 's', 'ul', 'ol', 'li', 'p', 'br',
                    'a', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span',
                    'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
                ],
                ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style']
            });
        }
        return dirtyHtml
            .replace(/<\/?(?:script|object|embed|iframe|form|input|button|link|meta)\b[^>]*>/gi, '')
            .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
            .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
    }

    // Helper: Format Dates and Times
    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function formatTime12(d) {
        let hours = d.getHours();
        const minutes = pad2(d.getMinutes());
        const seconds = pad2(d.getSeconds());
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return hours + ':' + minutes + ':' + seconds + ' ' + ampm;
    }

    // Live Clock Loop
    function startClock() {
        const clockEl = document.getElementById('mobile-clock');
        function tick() {
            const now = new Date();
            if (clockEl) {
                clockEl.textContent = formatTime12(now);
            }
            updateShiftProgress(now);
        }
        tick();
        setInterval(tick, 1000);
    }

    // ==========================================================================
    // 1. Site Configuration & Version Check
    // ==========================================================================

    function fetchSiteConfig() {
        return fetch(getDataUrl('config.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                if (data) {
                    siteConfig = Object.assign({}, siteConfig, data);
                    if (siteConfig.site_name) {
                        document.title = siteConfig.site_name + ' - Mobile';
                        const titleEl = document.getElementById('mobile-header-title');
                        if (titleEl) titleEl.textContent = siteConfig.site_name;
                    }
                }
            })
            .catch(function(err) {
                console.warn("Config fetch error:", err);
            });
    }

    function checkVersion() {
        fetch('assets/data/version.txt?t=' + Date.now())
            .then(function(res) {
                if (res.ok) return res.text();
                return null;
            })
            .then(function(ver) {
                if (!ver) return;
                const trimmed = ver.trim();
                if (currentVersion === null) {
                    currentVersion = trimmed;
                } else if (currentVersion !== trimmed) {
                    console.log("New version detected, refreshing data feeds:", trimmed);
                    currentVersion = trimmed;
                    refreshAllData(true);
                }
            })
            .catch(function() {});
    }

    // ==========================================================================
    // 2. Shift Tracker Calculation
    // ==========================================================================

    function loadShifts() {
        return fetch(getDataUrl('shifts.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                if (data && data.shifts) {
                    activeShiftData = data.shifts;
                    updateShiftProgress(new Date());
                }
            })
            .catch(function(err) {
                console.warn("Shifts fetch error:", err);
            });
    }

    function updateShiftProgress(now) {
        const shiftLabelEl = document.getElementById('hero-shift-name');
        const shiftBarEl = document.getElementById('hero-shift-bar');
        const shiftTimeEl = document.getElementById('hero-shift-time');
        if (!shiftLabelEl || !shiftBarEl || !activeShiftData) return;

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let matchedShift = null;

        for (let i = 0; i < activeShiftData.length; i++) {
            const s = activeShiftData[i];
            const startParts = s.start.split(':');
            const endParts = s.end.split(':');
            const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
            const endMin = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);

            if (startMin <= endMin) {
                if (currentMinutes >= startMin && currentMinutes < endMin) {
                    matchedShift = { shift: s, startMin: startMin, endMin: endMin };
                    break;
                }
            } else {
                // Crosses midnight (e.g. 23:00 to 07:00)
                if (currentMinutes >= startMin || currentMinutes < endMin) {
                    let adjustedCurrent = currentMinutes;
                    let adjustedEnd = endMin;
                    if (currentMinutes < endMin) adjustedCurrent += 1440;
                    adjustedEnd += 1440;
                    matchedShift = { shift: s, startMin: startMin, endMin: adjustedEnd, currentMin: adjustedCurrent };
                    break;
                }
            }
        }

        if (matchedShift) {
            const s = matchedShift.shift;
            const cur = matchedShift.currentMin !== undefined ? matchedShift.currentMin : currentMinutes;
            const total = matchedShift.endMin - matchedShift.startMin;
            const elapsed = Math.max(0, cur - matchedShift.startMin);
            const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
            const remainingMins = Math.max(0, matchedShift.endMin - cur);
            const remH = Math.floor(remainingMins / 60);
            const remM = remainingMins % 60;

            shiftLabelEl.textContent = s.name;
            shiftBarEl.style.width = pct.toFixed(1) + '%';
            if (shiftTimeEl) {
                shiftTimeEl.textContent = remH + 'h ' + remM + 'm remaining (' + pct.toFixed(0) + '%)';
            }
        } else {
            shiftLabelEl.textContent = "Off-Shift / Operations Normal";
            shiftBarEl.style.width = '100%';
            if (shiftTimeEl) shiftTimeEl.textContent = "Active";
        }
    }

    // ==========================================================================
    // 3. Trackers & OSHA Recordable Streak
    // ==========================================================================

    function loadTrackers() {
        return fetch(getDataUrl('trackers.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                if (!data) return;

                // 1. OSHA Safe Days
                const oshaValEl = document.getElementById('hero-osha-val');
                let safeDays = 0;
                if (data.last_incident_date) {
                    const incDate = new Date(data.last_incident_date);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - incDate.getTime());
                    safeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                } else if (data.safe_days !== undefined) {
                    safeDays = data.safe_days;
                }
                if (oshaValEl) oshaValEl.textContent = safeDays.toString();

                // 2. Production Tracker / Blend Recipe
                const blendValEl = document.getElementById('hero-blend-val');
                const blendLblEl = document.getElementById('hero-blend-lbl');
                const trackerVal = (data.production_tracker_value !== undefined && data.production_tracker_value !== null && data.production_tracker_value !== '')
                    ? data.production_tracker_value
                    : data.blend_recipe;
                const rawTrackerLabel = (data.production_tracker_label && data.production_tracker_label.trim())
                    ? data.production_tracker_label.trim()
                    : 'Active Blend #';

                if (blendValEl && trackerVal !== undefined && trackerVal !== null && trackerVal !== '') {
                    let displayVal = trackerVal.toString().trim();
                    if (rawTrackerLabel.indexOf('#') !== -1 && displayVal.indexOf('#') !== 0) {
                        displayVal = '#' + displayVal;
                    }
                    blendValEl.textContent = displayVal;
                    if (blendLblEl) blendLblEl.textContent = rawTrackerLabel.replace(/#/g, '').trim();
                }

                // 3. Daily Toolbox Talk & Stand-Down
                renderToolboxTalk(data);
            })
            .catch(function(err) {
                console.warn("Trackers fetch error:", err);
            });
    }

    // Daily Toolbox Talk Calculation with +1 hr offset for 11:00 PM rollover (SSoT §9.3)
    function renderToolboxTalk(trackersData) {
        const container = document.getElementById('toolbox-container');
        if (!container) return;

        const actualNow = new Date();
        const now = new Date(actualNow.getTime() + (60 * 60 * 1000)); // Shift +1h for 11pm rollover
        const todayStr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());

        let isOverride = false;
        let slideImgUrl = '';
        let slideTitle = 'Daily Toolbox Talk';
        let slideBadgeText = '';

        const isRemoteCloud = (window.location.hostname.indexOf('vercel.app') !== -1 || window.location.protocol === 'https:');

        if (trackersData && trackersData.toolbox_override_date === todayStr && trackersData.toolbox_override_file) {
            isOverride = true;
            slideTitle = 'Safety Stand-down';
            slideBadgeText = 'ACTIVE OVERRIDE';
            slideImgUrl = isRemoteCloud ? getDataUrl('toolbox_slide.png') : ('assets/data/' + trackersData.toolbox_override_file);
        } else {
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
            slideBadgeText = 'Slide #' + paddedNum;
            slideImgUrl = isRemoteCloud ? getDataUrl('toolbox_slide.png') : ('assets/safety-slides/' + paddedNum + '.png');
        }

        const cardClass = isOverride ? 'toolbox-card standdown' : 'toolbox-card';
        const badgeBg = isOverride ? 'var(--danger)' : 'var(--accent-purple)';

        container.innerHTML = 
            '<div class="' + cardClass + '">' +
                '<div class="toolbox-title-wrap">' +
                    '<h3 class="toolbox-title"><i class="fa-solid fa-person-chalkboard"></i> ' + slideTitle + '</h3>' +
                    '<span class="badge" style="background: ' + badgeBg + '; color: #fff;">' + slideBadgeText + '</span>' +
                '</div>' +
                '<div class="toolbox-img-preview-box" id="toolbox-preview-box">' +
                    '<img src="' + slideImgUrl + '" class="toolbox-img" alt="' + slideTitle + '" onerror="if(!this.src.includes(\'001.png\')) this.src=\'assets/safety-slides/001.png\'">' +
                    '<div class="toolbox-img-overlay"><i class="fa-solid fa-up-right-and-down-left-from-center"></i> Tap to Zoom</div>' +
                '</div>' +
            '</div>';

        const previewBox = document.getElementById('toolbox-preview-box');
        if (previewBox) {
            previewBox.addEventListener('click', function() {
                const img = previewBox.querySelector('img');
                if (img) openImageModal(img.src);
            });
        }
    }

    // ==========================================================================
    // 4. Equipment Management & Scale Audit Reset (SSoT §9.4)
    // ==========================================================================

    function isAuditResetCurrent(lastAuditResetEpoch) {
        const d = new Date();
        const day = d.getDay();
        const hours = d.getHours();
        let daysToSubtract = day;
        if (day === 0 && hours < 23) daysToSubtract = 7;
        const sunday11pm = new Date(d);
        sunday11pm.setDate(d.getDate() - daysToSubtract);
        sunday11pm.setHours(23, 0, 0, 0);
        return !!(lastAuditResetEpoch && lastAuditResetEpoch >= sunday11pm.getTime());
    }

    function loadEquipment() {
        return fetch(getDataUrl('equipment.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                if (!data) return;
                rawEquipmentData = data;
                renderEquipmentList();
            })
            .catch(function(err) {
                console.warn("Equipment fetch error:", err);
            });
    }

    function renderEquipmentList() {
        const container = document.getElementById('equipment-list-container');
        const badgeEl = document.getElementById('badge-equipment');
        if (!container || !rawEquipmentData || !rawEquipmentData.categories) return;

        const auditIsCurrent = isAuditResetCurrent(rawEquipmentData.last_audit_reset);
        let attentionCount = 0;
        let totalItems = 0;
        let okCount = 0;
        let craneScaleCount = 0;
        let html = '';

        const filterLower = equipmentFilter.toLowerCase();
        const searchLower = equipmentSearch.toLowerCase().trim();

        const isMaintRole = currentMobileUser && (currentMobileUser.role === 'maintenance' || currentMobileUser.role === 'admin');

        rawEquipmentData.categories.forEach(function(cat, catIdx) {
            const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';
            let catHtml = '';
            let catMatches = 0;

            cat.items.forEach(function(item, itemIdx) {
                totalItems++;
                const status = (item.status || 'OK').toUpperCase();
                const isAttention = status === 'OS' || status === 'PM';
                if (isAttention) attentionCount++;
                if (status === 'OK') okCount++;
                if (isMobileCranes && item.scale && item.scale !== 'NO' && item.scale !== 'NONE') craneScaleCount++;

                // Apply Filter Chip
                if (filterLower === 'attention' && !isAttention) return;
                if (filterLower === 'ok' && status !== 'OK') return;
                if (filterLower === 'cranes' && !isMobileCranes) return;

                // Apply Search Filter
                if (searchLower) {
                    const itemName = (item.name || '').toLowerCase();
                    const itemReason = (item.reason || '').toLowerCase();
                    const catName = (cat.name || '').toLowerCase();
                    if (itemName.indexOf(searchLower) === -1 && itemReason.indexOf(searchLower) === -1 && catName.indexOf(searchLower) === -1) {
                        return;
                    }
                }

                catMatches++;

                let itemClass = 'equipment-item-card ok';
                let statusBadge = '<span class="badge badge-ok"><i class="fa-solid fa-check"></i> OK</span>';

                if (status === 'OS') {
                    itemClass = 'equipment-item-card os';
                    const reason = item.reason ? item.reason.toUpperCase() : 'OUT OF SERVICE';
                    statusBadge = '<span class="badge badge-os"><i class="fa-solid fa-triangle-exclamation"></i> ' + reason + '</span>';
                } else if (status === 'PM') {
                    itemClass = 'equipment-item-card pm';
                    const reason = item.reason ? item.reason.toUpperCase() : 'ISSUE';
                    statusBadge = '<span class="badge badge-pm"><i class="fa-solid fa-wrench"></i> ' + reason + '</span>';
                }

                let extraBadges = '';
                if (isMobileCranes && item.scale && item.scale !== 'NO' && item.scale !== 'NONE') {
                    if (item.scale === 'OK') {
                        const isAudited = auditIsCurrent && !!item.blend_audit;
                        extraBadges += '<span class="badge badge-scale">SCALE OK</span>';
                        extraBadges += '<span class="badge badge-audit ' + (isAudited ? 'audited' : 'pending') + '">' +
                            'Audit ' + (isAudited ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>') +
                            '</span>';
                    } else if (item.scale === 'OS') {
                        extraBadges += '<span class="badge badge-scale-os">SCALE OS</span>';
                    }
                }

                const editBtn = isMaintRole ? 
                    '<button class="btn-quick-edit-trigger" data-cat-idx="' + catIdx + '" data-item-idx="' + itemIdx + '" title="Quick Edit" style="background: none; border: none; color: var(--brand-blue); cursor: pointer; padding: 4px 6px; font-size: 0.95rem;"><i class="fa-solid fa-pen-to-square"></i></button>' : '';

                catHtml += 
                    '<div class="' + itemClass + '" ' + (isMaintRole ? 'style="cursor: pointer;"' : '') + '>' +
                        '<div class="equipment-item-info">' +
                            '<span class="equipment-item-name">' + item.name + '</span>' +
                        '</div>' +
                        '<div class="equipment-item-badges">' +
                            extraBadges +
                            statusBadge +
                            editBtn +
                        '</div>' +
                    '</div>';
            });

            if (catMatches > 0) {
                html += 
                    '<div class="equipment-category-group">' +
                        '<div class="category-title">' +
                            '<span>' + cat.name.toUpperCase() + '</span>' +
                            '<span>' + catMatches + ' items</span>' +
                        '</div>' +
                        '<div class="equipment-list">' +
                            catHtml +
                        '</div>' +
                    '</div>';
            }
        });

        if (!html) {
            html = '<div style="text-align: center; color: var(--text-muted); padding: 30px 15px;">No equipment matches your search/filter.</div>';
        }

        container.innerHTML = html;

        if (isMaintRole) {
            container.querySelectorAll('.btn-quick-edit-trigger').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var cIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
                    var iIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
                    openQuickEditModal(cIdx, iIdx);
                });
            });
            container.querySelectorAll('.equipment-item-card').forEach(function(card) {
                card.addEventListener('click', function(e) {
                    var btn = card.querySelector('.btn-quick-edit-trigger');
                    if (btn) {
                        var cIdx = parseInt(btn.getAttribute('data-cat-idx'), 10);
                        var iIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
                        openQuickEditModal(cIdx, iIdx);
                    }
                });
            });
        }

        // Update Bottom Nav Badge
        if (badgeEl) {
            if (attentionCount > 0) {
                badgeEl.textContent = attentionCount.toString();
                badgeEl.style.display = 'block';
            } else {
                badgeEl.style.display = 'none';
            }
        }

        // Update Filter Chip counts
        const countAll = document.getElementById('count-equip-all');
        const countAtt = document.getElementById('count-equip-attention');
        const countCranes = document.getElementById('count-equip-cranes');
        const countOk = document.getElementById('count-equip-ok');
        if (countAll) countAll.textContent = totalItems.toString();
        if (countAtt) countAtt.textContent = attentionCount.toString();
        if (countCranes) countCranes.textContent = craneScaleCount.toString();
        if (countOk) countOk.textContent = okCount.toString();
    }

    // ==========================================================================
    // 5. Rail Yard Tracks
    // ==========================================================================

    function loadTracks() {
        return fetch(getDataUrl('tracks.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                if (!data) return;
                rawTracksData = data;
                renderTracksList();
            })
            .catch(function(err) {
                console.warn("Tracks fetch error:", err);
            });
    }

    function renderTracksList() {
        const container = document.getElementById('tracks-list-container');
        const badgeEl = document.getElementById('badge-tracks');
        if (!container) return;

        let totalCars = 0;
        let clearCount = 0;
        let dwellCount = 0;
        let badOrderCount = 0;
        let asOfStr = '';
        let html = '';

        const filterLower = trackFilter.toLowerCase();
        const searchLower = trackSearch.toLowerCase().trim();

        rawTracksData.forEach(function(t) {
            if (!t) return;
            if (!asOfStr && t.updated_at) asOfStr = t.updated_at;
            totalCars += (t.cars || 0);
            if (t.is_clear) clearCount++;
            if (t.dwell_warning) dwellCount++;
            if (t.is_bad_order) badOrderCount++;

            // Apply Filter Chip
            if (filterLower === 'warnings' && !t.dwell_warning) return;
            if (filterLower === 'blend' && !t.is_blend) return;
            if (filterLower === 'badorder' && !t.is_bad_order) return;
            if (filterLower === 'clear' && !t.is_clear) return;

            // Apply Search Filter
            if (searchLower) {
                const trackName = (t.name || ('Track ' + t.id)).toLowerCase();
                const commodity = (t.commodity || '').toLowerCase();
                if (trackName.indexOf(searchLower) === -1 && commodity.indexOf(searchLower) === -1) {
                    return;
                }
            }

            let cardClass = 'track-card';
            let statusText = (t.cars || 0) + ' Cars';
            let statusColor = 'var(--brand-blue)';

            if (t.is_clear) {
                cardClass += ' clear';
                statusText = 'CLEAR';
                statusColor = 'var(--success)';
            } else if (t.is_bad_order) {
                cardClass += ' bad-order';
                statusColor = 'var(--danger)';
            } else if (t.dwell_warning) {
                cardClass += ' dwell-warning';
                statusColor = 'var(--warning)';
            } else if (t.is_blend) {
                statusColor = 'var(--blend-cyan)';
            }

            let footerBadges = '';
            if (t.dwell_warning) {
                footerBadges += '<span class="badge-dwell"><i class="fa-solid fa-clock"></i> ' + t.dwell_days + 'd Dwell</span>';
            }
            if (t.is_bad_order) {
                footerBadges += '<span class="badge-bad-order"><i class="fa-solid fa-ban"></i> BAD ORDER</span>';
            }

            html += 
                '<div class="' + cardClass + '" style="cursor: pointer;" onclick="window.openTrackDetail(\'' + (t.id || t.name) + '\')">' +
                    '<div class="track-card-head">' +
                        '<span class="track-card-title">' + (t.name || ('Track ' + t.id)) + '</span>' +
                        '<span class="track-card-car-count" style="color: ' + statusColor + ';">' + statusText + '</span>' +
                    '</div>' +
                    '<div class="track-card-commodity">' + (t.commodity || (t.is_clear ? 'Empty' : 'In Service')) + '</div>' +
                    (footerBadges ? '<div class="track-card-footer">' + footerBadges + '</div>' : '') +
                '</div>';
        });

        if (!html) {
            html = '<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 30px 15px;">No tracks match your search/filter.</div>';
        }

        container.innerHTML = html;

        // Update Summary Pills
        const pillCars = document.getElementById('track-summary-cars');
        const pillClear = document.getElementById('track-summary-clear');
        const pillDwell = document.getElementById('track-summary-dwell');
        const pillBadOrder = document.getElementById('track-summary-badorder');
        if (pillCars) pillCars.textContent = totalCars.toString();
        if (pillClear) pillClear.textContent = clearCount.toString();
        if (pillDwell) pillDwell.textContent = dwellCount.toString();
        if (pillBadOrder) pillBadOrder.textContent = badOrderCount.toString();

        // Update Bottom Nav Badge
        const totalAlerts = dwellCount + badOrderCount;
        if (badgeEl) {
            if (totalAlerts > 0) {
                badgeEl.textContent = totalAlerts.toString();
                badgeEl.style.display = 'block';
            } else {
                badgeEl.style.display = 'none';
            }
        }
    }

    // ==========================================================================
    // 6. Novara LMS Safety Training & Anniversaries
    // ==========================================================================

    function renderAnniversariesList(employees) {
        const container = document.getElementById('anniversaries-container');
        if (!container) return;

        if (!Array.isArray(employees) || employees.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No upcoming milestones this month.</div>';
            return;
        }

        let html = '';
        employees.forEach(function(emp) {
            const isToday = emp.days_until === 0;
            const yearStr = emp.years === 1 ? 'Year' : 'Years';
            const daysText = isToday ? 'Today! 🎉' : (emp.days_until === 1 ? 'Tomorrow' : (emp.days_until !== undefined && emp.days_until !== null ? 'in ' + emp.days_until + ' days' : ''));
            const itemStyle = isToday 
                ? 'border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.08);' 
                : 'border-left: 4px solid var(--accent-purple);';
            const badgeStyle = isToday 
                ? 'background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; font-weight: 800;' 
                : 'background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); color: #d8b4fe;';

            const avatarHtml = emp.photoUrl
                ? '<img src="' + emp.photoUrl + '" class="safety-person-avatar" style="width: 34px; height: 34px;" alt="' + emp.name + '" onerror="this.src=\'assets/safety-slides/001.png\'">'
                : '<span style="font-size: 1.3rem;">' + (isToday ? '🎂' : '🎉') + '</span>';

            html += 
                '<div class="anniversary-item" style="' + itemStyle + '">' +
                    '<div style="display: flex; align-items: center; gap: 10px;">' +
                        avatarHtml +
                        '<div>' +
                            '<div style="font-weight: 700; color: #fff;">' + emp.name + '</div>' +
                            '<div style="font-size: 0.75rem; color: var(--text-muted);">' + 
                                (emp.date || emp.hire_date || 'Milestone') + 
                                (daysText ? ' • <span style="color: ' + (isToday ? '#fcd34d' : 'var(--text-secondary)') + '; font-weight: ' + (isToday ? '700' : '400') + ';">' + daysText + '</span>' : '') + 
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<span class="badge" style="' + badgeStyle + ' font-size: 0.82rem;">' + emp.years + ' ' + yearStr + (isToday ? '!' : '') + '</span>' +
                '</div>';
        });
        container.innerHTML = html;
    }

    function loadSafetyAndMilestones() {
        const vercelBase = siteConfig.vercel_api_url ? siteConfig.vercel_api_url.replace(/\/+$/, '') : '';
        const navBadgeEl = document.getElementById('badge-safety');
        let anniversariesLoaded = false;

        function fetchFallbackAnniversaries() {
            if (anniversariesLoaded) return;
            
            fetch(getDataUrl('anniversaries.json'))
                .then(function(res) {
                    if (res.ok) return res.json();
                    return null;
                })
                .then(function(data) {
                    if (anniversariesLoaded) return;
                    const emps = (data && data.employees) || (data && data.anniversaries && data.anniversaries.employees) || (data && Array.isArray(data.anniversaries) ? data.anniversaries : null);
                    renderAnniversariesList(emps || []);
                    if (emps && emps.length > 0) anniversariesLoaded = true;
                })
                .catch(function(err) {
                    console.warn("Anniversaries fetch error:", err);
                    renderAnniversariesList([]);
                });
        }

        // Novara Safety Training
        fetch(getDataUrl('safety_videos.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                const container = document.getElementById('safety-roster-container');
                if (!container) return;

                if (!data || !data.success || !data.response || data.response.length === 0) {
                    container.innerHTML = '<div style="color: var(--success); text-align: center; padding: 15px; font-style: italic;"><i class="fa-solid fa-circle-check"></i> All employees 100% up to date! 🎉</div>';
                    if (navBadgeEl) navBadgeEl.style.display = 'none';
                } else {
                    let overdueTotal = 0;
                    let html = '';

                    data.response.forEach(function(emp) {
                        const expCount = emp.expiringCount || 0;
                        const incompCount = emp.incompleteCount || 0;
                        overdueTotal += incompCount;

                        let badgesHtml = '';
                        if (expCount > 0) {
                            badgesHtml += '<span class="badge" style="background: var(--warning-bg); border: 1px solid var(--warning-border); color: #fcd34d;"><i class="fa-solid fa-clock"></i> ' + expCount + ' Due</span>';
                        }
                        if (incompCount > 0) {
                            badgesHtml += '<span class="badge" style="background: var(--danger-bg); border: 1px solid var(--danger-border); color: #fca5a5;"><i class="fa-solid fa-triangle-exclamation"></i> ' + incompCount + ' Overdue</span>';
                        }

                        html += 
                            '<div class="safety-person-row">' +
                                '<div class="safety-person-left">' +
                                    '<img src="' + emp.photoUrl + '" class="safety-person-avatar" alt="' + emp.name + '" onerror="this.src=\'assets/safety-slides/001.png\'">' +
                                    '<span class="safety-person-name">' + emp.name + '</span>' +
                                '</div>' +
                                '<div style="display: flex; gap: 6px;">' + badgesHtml + '</div>' +
                            '</div>';
                    });

                    container.innerHTML = html;

                    if (navBadgeEl) {
                        if (overdueTotal > 0) {
                            navBadgeEl.textContent = overdueTotal.toString();
                            navBadgeEl.style.display = 'block';
                        } else {
                            navBadgeEl.style.display = 'none';
                        }
                    }
                }

                // Check if Novara response also carried anniversaries
                if (data && data.anniversaries && Array.isArray(data.anniversaries.employees) && data.anniversaries.employees.length > 0) {
                    renderAnniversariesList(data.anniversaries.employees);
                    anniversariesLoaded = true;
                } else {
                    fetchFallbackAnniversaries();
                }
            })
            .catch(function(err) {
                console.warn("Novara fetch error:", err);
                fetchFallbackAnniversaries();
            });
    }

    // ==========================================================================
    // 7. Markdown Reminders & Magic Words Engine (No Lookbehinds!)
    // ==========================================================================

    function loadReminders() {
        return fetch(getDataUrl('reminders.md'))
            .then(function(res) {
                if (res.ok) return res.text();
                return '';
            })
            .then(function(rawText) {
                const container = document.getElementById('reminders-feed-container');
                if (!container) return;

                if (!rawText.trim()) {
                    container.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No active announcements.</div>';
                    return;
                }

                // Split markdown by "# " headers safely without lookbehind
                const rawSections = rawText.split('\n# ');
                let parsedHtml = '';

                // Clear previous countdown timers
                countdownIntervals.forEach(function(timerId) { clearInterval(timerId); });
                countdownIntervals = [];

                for (let i = 0; i < rawSections.length; i++) {
                    let section = rawSections[i].trim();
                    if (!section) continue;
                    if (section.indexOf('# ') === 0) section = section.substring(2).trim();

                    const lines = section.split('\n');
                    let title = lines[0].trim();
                    let body = lines.slice(1).join('\n');

                    let priority = 'normal';
                    if (/!HIGH/i.test(body) || /<!--\s*priority:\s*high\s*-->/i.test(body)) priority = 'high';
                    if (/!CRITICAL/i.test(body) || /<!--\s*priority:\s*critical\s*-->/i.test(body)) priority = 'critical';

                    // Parse Expire
                    const expireMatch = body.match(/!EXPIRE\s+([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
                    if (expireMatch) {
                        const parts = expireMatch[1].split('-');
                        const expDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), parseInt(parts[3], 10), 0, 0, 0);
                        if (Date.now() > expDate.getTime()) continue;
                        body = body.replace(expireMatch[0], '');
                    }

                    // Parse Countdown: !COUNTDOWN YYYY-MM-DD-HH or MM-DD-HH-mm
                    let countdownHtml = '';
                    const countdownMatch = body.match(/!COUNTDOWN\s+([0-9]{2,4}-[0-9]{2}-[0-9]{2}(?:-[0-9]{2})?)/i);
                    if (countdownMatch) {
                        const targetStr = countdownMatch[1];
                        const timerUniqueId = 'countdown-' + i;
                        countdownHtml = '<div class="reminder-countdown-box" id="' + timerUniqueId + '">Calculating...</div>';
                        body = body.replace(countdownMatch[0], '');

                        (function(elId, target) {
                            function updateTick() {
                                const el = document.getElementById(elId);
                                if (!el) return;
                                const parts = target.split('-').map(function(p) { return parseInt(p, 10); });
                                let targetDate;
                                const curYear = new Date().getFullYear();
                                if (parts.length === 3) {
                                    targetDate = new Date(curYear, parts[0] - 1, parts[1], parts[2], 0, 0);
                                } else if (parts.length === 4) {
                                    if (parts[0] > 2000) targetDate = new Date(parts[0], parts[1] - 1, parts[2], parts[3], 0, 0);
                                    else targetDate = new Date(curYear, parts[0] - 1, parts[1], parts[2], parts[3], 0);
                                }
                                if (!targetDate) return;
                                const diff = targetDate.getTime() - Date.now();
                                if (diff <= 0) {
                                    el.textContent = "COUNTDOWN COMPLETE";
                                } else {
                                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                                    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                    const s = Math.floor((diff % (1000 * 60)) / 1000);
                                    el.textContent = (d > 0 ? d + 'd ' : '') + pad2(h) + 'h ' + pad2(m) + 'm ' + pad2(s) + 's';
                                }
                            }
                            updateTick();
                            const intervalId = setInterval(updateTick, 1000);
                            countdownIntervals.push(intervalId);
                        })(timerUniqueId, targetStr);
                    }

                    // Clean other magic words
                    body = body.replace(/!(HIGH|CRITICAL|SPLIT|LARGE|CENTER|LONG|ONLY|QR https?:\/\/[^\s]+)/ig, '');

                    let rawParsed = typeof window.marked !== 'undefined' ? window.marked.parse(body) : body;
                    let parsedBody = sanitizeMarkdownHtml(rawParsed);

                    parsedHtml += 
                        '<div class="reminder-card ' + priority + '">' +
                            '<h3 class="reminder-card-title">' +
                                (priority === 'critical' ? '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i> ' : '') +
                                (priority === 'high' ? '<i class="fa-solid fa-circle-exclamation" style="color: var(--warning);"></i> ' : '') +
                                title +
                            '</h3>' +
                            '<div class="reminder-body">' + parsedBody + '</div>' +
                            countdownHtml +
                        '</div>';
                }

                container.innerHTML = parsedHtml || '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No active announcements.</div>';
            })
            .catch(function(err) {
                console.warn("Reminders fetch error:", err);
            });
    }

    // Special Event Broadcast (`special.json`)
    function loadSpecial() {
        return fetch(getDataUrl('special.json'))
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                const container = document.getElementById('special-event-container');
                if (!container) return;

                if (!data || !data.title) {
                    container.style.display = 'none';
                    return;
                }

                if (data.endTime && (Date.now() > new Date(data.endTime).getTime())) {
                    container.style.display = 'none';
                    return;
                }

                let imgHtml = '';
                if (data.image) {
                    imgHtml = '<div style="margin-top: 10px; cursor: pointer;" onclick="window.openImageModal(\'' + data.image + '\')">' +
                        '<img src="' + data.image + '" style="max-width: 100%; border-radius: 8px; border: 1px solid var(--card-border);" alt="Special Event">' +
                        '</div>';
                }

                container.innerHTML = 
                    '<div class="reminder-card critical">' +
                        '<h3 class="reminder-card-title"><i class="fa-solid fa-bullhorn" style="color: var(--danger);"></i> ' + data.title + '</h3>' +
                        '<div class="reminder-body">' + (data.description || '').replace(/\n/g, '<br>') + '</div>' +
                        imgHtml +
                    '</div>';
                container.style.display = 'block';
            })
            .catch(function(err) {
                console.warn("Special event fetch error:", err);
            });
    }

    // ==========================================================================
    // 8. Weather, NWS Alerts & Lightning Proximity Meter
    // ==========================================================================

    function loadWeatherAndAlerts() {
        const lat = siteConfig.latitude || 41.6045;
        const lon = siteConfig.longitude || -87.1311;
        const weatherBannerEl = document.getElementById('hero-weather-banner');
        const weatherWidgetEl = document.getElementById('weather-widget-container');

        // 1. Fetch NWS Active Alerts (filter out non-industrial marine statements)
        fetch('https://api.weather.gov/alerts/active?point=' + lat + ',' + lon, { cache: 'no-store' })
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(nwsData) {
                if (nwsData && nwsData.features && nwsData.features.length > 0 && weatherBannerEl) {
                    const marineRe = /beach hazard|rip current|small craft|gale|lake shore flood|marine/i;
                    const validFeatures = nwsData.features.filter(function(f) {
                        const eventName = (f.properties && f.properties.event) || '';
                        return !marineRe.test(eventName);
                    });

                    if (validFeatures.length > 0) {
                        const alert = validFeatures[0].properties;
                        const isSevere = alert.severity === 'Severe' || alert.severity === 'Extreme';
                        weatherBannerEl.className = 'alert-banner' + (isSevere ? '' : ' warning');
                        let subText = alert.headline || alert.description || 'Tap to view live radar map';
                        // Clean up lengthy date prefixes
                        subText = subText.replace(/^.*?issued\s+/i, 'Issued ').replace(/\s+by\s+NWS.*$/i, '');
                        weatherBannerEl.innerHTML = 
                            '<div class="alert-banner-left">' +
                                '<i class="fa-solid fa-triangle-exclamation alert-banner-icon"></i>' +
                                '<div>' +
                                    '<h4 class="alert-banner-title">' + (alert.event || 'WEATHER ALERT') + '</h4>' +
                                    '<p class="alert-banner-sub">' + subText + '</p>' +
                                '</div>' +
                            '</div>' +
                            '<i class="fa-solid fa-chevron-right" style="color: var(--text-muted); font-size: 0.8rem; flex-shrink: 0;"></i>';
                        weatherBannerEl.style.display = 'flex';
                        weatherBannerEl.onclick = function() {
                            window.open('https://zoom.earth/maps/radar/#view=' + lat + ',' + lon + ',8z', '_blank');
                        };
                    } else {
                        if (!lightningCooldownInterval) {
                            weatherBannerEl.style.display = 'none';
                        }
                    }
                }
            })
            .catch(function() {});

        // 2. Fetch Open-Meteo Forecast
        fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current_weather=true&hourly=precipitation_probability,precipitation,snowfall,weathercode&daily=precipitation_sum,snowfall_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto', { cache: 'no-store' })
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(wxData) {
                if (!wxData || !weatherWidgetEl) return;

                const curTemp = wxData.current_weather ? Math.round(wxData.current_weather.temperature) : '--';
                const curHour = new Date().getHours();
                const precipProb = (wxData.hourly && wxData.hourly.precipitation_probability) ? wxData.hourly.precipitation_probability.slice(curHour, curHour + 12) : [];
                const precipAmt = (wxData.hourly && wxData.hourly.precipitation) ? wxData.hourly.precipitation.slice(curHour, curHour + 12) : [];
                const snowAmt = (wxData.hourly && wxData.hourly.snowfall) ? wxData.hourly.snowfall.slice(curHour, curHour + 12) : [];

                let isSnow = false;
                let next12hPrecip = 0;
                for (let i = 0; i < 12; i++) {
                    if ((snowAmt[i] && snowAmt[i] > 0)) isSnow = true;
                    next12hPrecip += ((snowAmt[i] || 0) + (precipAmt[i] || 0));
                }

                let dailyTotal = isSnow ? ((wxData.daily && wxData.daily.snowfall_sum) ? wxData.daily.snowfall_sum[0] : 0) : ((wxData.daily && wxData.daily.precipitation_sum) ? wxData.daily.precipitation_sum[0] : 0);

                const formatAmt = function(amt) {
                    if (amt === undefined || amt === null || amt === 0) return '0.0"';
                    return amt < 0.1 ? '< 0.1"' : amt.toFixed(1) + '"';
                };

                weatherWidgetEl.innerHTML = 
                    '<div class="widget-card" style="cursor: pointer;" onclick="window.open(\'https://zoom.earth/maps/radar/#view=' + lat + ',' + lon + ',8z\', \'_blank\')">' +
                        '<div class="widget-card-header">' +
                            '<h3 class="widget-card-title"><i class="fa-solid fa-cloud-sun-rain"></i> Local Weather & Radar</h3>' +
                            '<span class="widget-card-stats">' + curTemp + '°F</span>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: space-around; align-items: center; text-align: center; padding: 6px 0;">' +
                            '<div>' +
                                '<div style="font-family: \'Outfit\', sans-serif; font-size: 1.4rem; font-weight: 800; color: #fff;">' + formatAmt(dailyTotal) + '</div>' +
                                '<div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">TODAY ' + (isSnow ? 'SNOW' : 'RAIN') + '</div>' +
                            '</div>' +
                            '<div style="width: 1px; height: 30px; background: rgba(255,255,255,0.1);"></div>' +
                            '<div>' +
                                '<div style="font-family: \'Outfit\', sans-serif; font-size: 1.4rem; font-weight: 800; color: var(--brand-blue);">' + formatAmt(next12hPrecip) + '</div>' +
                                '<div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">NEXT 12 HOURS</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            })
            .catch(function() {});

        // 3. Lightning Check (via Proxy API)
        checkLightningProximity();
    }

    function checkLightningProximity() {
        const vercelBase = siteConfig.vercel_api_url ? siteConfig.vercel_api_url.replace(/\/+$/, '') : '';
        const lat = siteConfig.latitude || 41.6045;
        const lon = siteConfig.longitude || -87.1311;
        const bannerEl = document.getElementById('hero-weather-banner');

        // Check mock parameter
        const mock = new URLSearchParams(window.location.search).get('mock');
        if (mock === 'lightning') {
            triggerLightningBanner(4.2, new Date(Date.now() - (5 * 60000)));
            return;
        }

        fetch(vercelBase + '/api/lightning?lat=' + lat + '&lon=' + lon)
            .then(function(res) {
                if (res.ok) return res.json();
                return null;
            })
            .then(function(data) {
                if (data && data.success && data.response && data.response.length > 0) {
                    const strike = data.response[0];
                    const dist = strike.relativeTo ? strike.relativeTo.distanceMI : null;
                    const strikeTime = strike.ob ? new Date(strike.ob.dateTimeISO) : null;
                    if (dist !== null && strikeTime !== null) {
                        triggerLightningBanner(dist, strikeTime);
                    }
                }
            })
            .catch(function() {});
    }

    function triggerLightningBanner(dist, strikeTime) {
        const bannerEl = document.getElementById('hero-weather-banner');
        if (!bannerEl) return;

        bannerEl.className = 'alert-banner';
        bannerEl.innerHTML = 
            '<div class="alert-banner-left">' +
                '<i class="fa-solid fa-bolt-lightning alert-banner-icon"></i>' +
                '<div>' +
                    '<h4 class="alert-banner-title">LIGHTNING DETECTED (' + dist.toFixed(1) + ' mi)</h4>' +
                    '<p class="alert-banner-sub">OSHA 30-min Outdoor Cooldown Active</p>' +
                '</div>' +
            '</div>' +
            '<div class="alert-banner-timer" id="lightning-countdown">--:--</div>';
        bannerEl.style.display = 'flex';
        bannerEl.onclick = function() {
            window.open('https://www.lightningmaps.org/?lang=en#y=' + siteConfig.latitude + ';x=' + siteConfig.longitude + ';z=10;', '_blank');
        };

        if (lightningCooldownInterval) clearInterval(lightningCooldownInterval);
        lightningCooldownInterval = setInterval(function() {
            const timerEl = document.getElementById('lightning-countdown');
            if (!timerEl) return;

            const msSinceStrike = Date.now() - strikeTime.getTime();
            const msCooldown = 30 * 60 * 1000;

            if (msSinceStrike >= msCooldown) {
                timerEl.textContent = "CLEAR";
                clearInterval(lightningCooldownInterval);
            } else {
                const msRemaining = msCooldown - msSinceStrike;
                const minLeft = Math.floor(msRemaining / 60000);
                const secLeft = Math.floor((msRemaining % 60000) / 1000);
                timerEl.textContent = pad2(minLeft) + ':' + pad2(secLeft);
            }
        }, 1000);
    }

    // ==========================================================================
    // 9. Fullscreen Image Modal & Track Detail Bottom Sheet
    // ==========================================================================

    window.openImageModal = function(src) {
        const modal = document.getElementById('modal-lightbox');
        const modalImg = document.getElementById('modal-lightbox-img');
        if (modal && modalImg) {
            modalImg.src = src;
            modal.classList.add('open');
        }
    };

    window.closeImageModal = function() {
        const modal = document.getElementById('modal-lightbox');
        if (modal) {
            modal.classList.remove('open');
        }
    };

    window.openTrackDetail = function(trackId) {
        if (!rawTracksData || !rawTracksData.length) return;
        const track = rawTracksData.find(function(t) {
            return (t && (t.id === trackId || (t.id + '') === (trackId + '') || t.name === trackId));
        });
        if (!track) return;

        const modal = document.getElementById('modal-track-sheet');
        const contentEl = document.getElementById('modal-track-card-content');
        if (!modal || !contentEl) return;

        let statusBadge = '<span class="badge badge-ok"><i class="fa-solid fa-check"></i> CLEAR</span>';
        let statusColor = 'var(--success)';

        if (track.is_bad_order) {
            statusBadge = '<span class="badge badge-os"><i class="fa-solid fa-triangle-exclamation"></i> BAD ORDER</span>';
            statusColor = 'var(--danger)';
        } else if (track.is_blend) {
            statusBadge = '<span class="badge" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: var(--blend-cyan);"><i class="fa-solid fa-flask"></i> ACTIVE BLEND</span>';
            statusColor = 'var(--blend-cyan)';
        } else if (track.dwell_warning) {
            statusBadge = '<span class="badge badge-pm"><i class="fa-solid fa-clock"></i> ' + track.dwell_days + 'd DWELL WARNING</span>';
            statusColor = 'var(--warning)';
        } else if (!track.is_clear) {
            statusBadge = '<span class="badge" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #93c5fd;">OCCUPIED</span>';
            statusColor = 'var(--brand-blue)';
        }

        let capacityHtml = '';
        if (track.capacity) {
            const pct = Math.min(100, Math.round(((track.cars || 0) / track.capacity) * 100));
            capacityHtml = 
                '<div class="modal-track-row" style="flex-direction: column; align-items: stretch; gap: 6px;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                        '<span class="modal-track-lbl">Track Capacity:</span>' +
                        '<span style="font-weight: 700; color: #fff; font-size: 0.85rem;">' + (track.cars || 0) + ' / ' + track.capacity + ' Cars (' + pct + '%)</span>' +
                    '</div>' +
                    '<div style="width: 100%; height: 6px; background: rgba(0,0,0,0.4); border-radius: 3px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);">' +
                        '<div style="height: 100%; width: ' + pct + '%; background: ' + statusColor + '; border-radius: 3px;"></div>' +
                    '</div>' +
                '</div>';
        }

        let switchAlertHtml = '';
        if (track.os_switches && track.os_switches.length > 0) {
            const switchNotes = track.os_switches.map(function(s) { return s.raw || (s.tracks.join('/') + ' Switch O.S.'); }).join(', ');
            switchAlertHtml = '<div class="modal-track-switch-box"><i class="fa-solid fa-ban"></i> Switch Out of Service: ' + switchNotes + '</div>';
        }

        let notesHtml = '';
        if (track.notes && track.notes !== track.commodity) {
            notesHtml = '<div class="modal-track-notes-box"><strong><i class="fa-solid fa-clipboard-list"></i> Conductor Notes:</strong><br>' + track.notes + '</div>';
        }

        let dwellRow = '';
        if (track.oldest_inbound_date) {
            dwellRow = 
                '<div class="modal-track-row">' +
                    '<span class="modal-track-lbl">Oldest Inbound:</span>' +
                    '<span class="modal-track-val" style="color: var(--warning);">' + track.oldest_inbound_date + ' (' + (track.dwell_days || 0) + ' Days)</span>' +
                '</div>';
        }

        let updatedRow = '';
        if (track.updated_at) {
            try {
                const d = new Date(track.updated_at);
                if (!isNaN(d.getTime())) {
                    updatedRow = 
                        '<div class="modal-track-row">' +
                            '<span class="modal-track-lbl">Last Track Check:</span>' +
                            '<span class="modal-track-val" style="font-size: 0.85rem; color: var(--text-muted);">' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>' +
                        '</div>';
                }
            } catch (e) {}
        }

        contentEl.innerHTML = 
            '<div class="modal-track-handle"></div>' +
            '<div class="modal-track-header">' +
                '<h3 class="modal-track-title">' +
                    '<i class="fa-solid fa-train" style="color: ' + statusColor + ';"></i> ' +
                    (track.name || ('Track ' + track.id)) +
                '</h3>' +
                '<button class="modal-track-close-btn" onclick="window.closeTrackDetail()">&times;</button>' +
            '</div>' +
            '<div class="modal-track-badges">' +
                statusBadge +
            '</div>' +
            '<div class="modal-track-row">' +
                '<span class="modal-track-lbl">Car Count:</span>' +
                '<span class="modal-track-val" style="font-size: 1.25rem; font-weight: 800; color: ' + statusColor + ';">' + (track.cars || 0) + ' Cars</span>' +
            '</div>' +
            capacityHtml +
            '<div class="modal-track-row">' +
                '<span class="modal-track-lbl">Commodity:</span>' +
                '<span class="modal-track-val">' + (track.commodity || (track.is_clear ? 'Empty' : 'Occupied')) + '</span>' +
            '</div>' +
            dwellRow +
            updatedRow +
            switchAlertHtml +
            notesHtml;

        modal.classList.add('open');
    };

    window.closeTrackDetail = function() {
        const modal = document.getElementById('modal-track-sheet');
        if (modal) modal.classList.remove('open');
    };

    // ==========================================================================
    // 10. Navigation Tabs & Search Handlers
    // ==========================================================================

    function setupEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                const targetTab = tab.getAttribute('data-tab');
                switchTab(targetTab);
            });
        });

        // Manual Refresh Button
        const refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                refreshBtn.classList.add('spinning');
                refreshAllData(true).then(function() {
                    setTimeout(function() {
                        refreshBtn.classList.remove('spinning');
                    }, 600);
                });
            });
        }

        // Equipment Filter Chips
        const equipChips = document.querySelectorAll('.chip-equip');
        equipChips.forEach(function(chip) {
            chip.addEventListener('click', function() {
                equipChips.forEach(function(c) { c.classList.remove('active'); });
                chip.classList.add('active');
                equipmentFilter = chip.getAttribute('data-filter');
                renderEquipmentList();
            });
        });

        // Equipment Search Input
        const equipSearchInput = document.getElementById('input-equip-search');
        const equipSearchClear = document.getElementById('btn-clear-equip-search');
        if (equipSearchInput) {
            equipSearchInput.addEventListener('input', function(e) {
                equipmentSearch = e.target.value;
                if (equipSearchClear) {
                    if (equipmentSearch) equipSearchClear.classList.add('visible');
                    else equipSearchClear.classList.remove('visible');
                }
                renderEquipmentList();
            });
        }
        if (equipSearchClear) {
            equipSearchClear.addEventListener('click', function() {
                if (equipSearchInput) equipSearchInput.value = '';
                equipmentSearch = '';
                equipSearchClear.classList.remove('visible');
                renderEquipmentList();
            });
        }

        // Track Filter Chips
        const trackChips = document.querySelectorAll('.chip-track');
        trackChips.forEach(function(chip) {
            chip.addEventListener('click', function() {
                trackChips.forEach(function(c) { c.classList.remove('active'); });
                chip.classList.add('active');
                trackFilter = chip.getAttribute('data-filter');
                renderTracksList();
            });
        });

        // Track Search Input
        const trackSearchInput = document.getElementById('input-track-search');
        const trackSearchClear = document.getElementById('btn-clear-track-search');
        if (trackSearchInput) {
            trackSearchInput.addEventListener('input', function(e) {
                trackSearch = e.target.value;
                if (trackSearchClear) {
                    if (trackSearch) trackSearchClear.classList.add('visible');
                    else trackSearchClear.classList.remove('visible');
                }
                renderTracksList();
            });
        }
        if (trackSearchClear) {
            trackSearchClear.addEventListener('click', function() {
                if (trackSearchInput) trackSearchInput.value = '';
                trackSearch = '';
                trackSearchClear.classList.remove('visible');
                renderTracksList();
            });
        }

        // Modal Lightbox Close Events
        const modal = document.getElementById('modal-lightbox');
        const modalClose = document.getElementById('modal-close-btn');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) window.closeImageModal();
            });
        }
        if (modalClose) {
            modalClose.addEventListener('click', window.closeImageModal);
        }

        // Track Detail Bottom Sheet Close Events
        const trackModal = document.getElementById('modal-track-sheet');
        if (trackModal) {
            trackModal.addEventListener('click', function(e) {
                if (e.target === trackModal) window.closeTrackDetail();
            });
        }

        // Mobile Auth & Maintenance Event Bindings (Issue #14)
        const btnMobileAuth = document.getElementById('btn-mobile-auth');
        const btnCloseMobileAuth = document.getElementById('btn-close-mobile-auth');
        const mobileLoginForm = document.getElementById('mobile-login-form');
        const btnMobileLogout = document.getElementById('btn-mobile-logout');
        const modalMobileAuth = document.getElementById('modal-mobile-auth');

        if (btnMobileAuth) btnMobileAuth.addEventListener('click', openMobileAuthModal);
        if (btnCloseMobileAuth) btnCloseMobileAuth.addEventListener('click', closeMobileAuthModal);
        if (mobileLoginForm) mobileLoginForm.addEventListener('submit', handleMobileLogin);
        if (btnMobileLogout) btnMobileLogout.addEventListener('click', handleMobileLogout);
        if (modalMobileAuth) {
            modalMobileAuth.addEventListener('click', function(e) {
                if (e.target === modalMobileAuth) closeMobileAuthModal();
            });
        }

        // Equipment Quick Edit Modal Bindings
        const btnCloseQuickEdit = document.getElementById('btn-close-quick-edit');
        const quickEditForm = document.getElementById('quick-edit-form');
        const modalQuickEdit = document.getElementById('modal-equip-quick-edit');

        if (btnCloseQuickEdit) btnCloseQuickEdit.addEventListener('click', closeQuickEditModal);
        if (quickEditForm) quickEditForm.addEventListener('submit', saveQuickEdit);
        if (modalQuickEdit) {
            modalQuickEdit.addEventListener('click', function(e) {
                if (e.target === modalQuickEdit) closeQuickEditModal();
            });
        }

        document.querySelectorAll('.btn-status-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                activeQuickEditStatus = btn.getAttribute('data-status');
                updateStatusButtonsUI(activeQuickEditStatus);
            });
        });
    }

    // ==========================================================================
    // 10. Mobile Floor Maintenance & Auth Interactions (Issue #14)
    // ==========================================================================

    function checkMobileAuth() {
        return fetch('/api/auth/me', { headers: getAuthHeaders() })
            .then(function(res) {
                if (res.ok) return res.json();
                throw new Error('HTTP ' + res.status);
            })
            .then(function(data) {
                if (data && data.authenticated && data.user) {
                    currentMobileUser = data.user;
                } else {
                    currentMobileUser = null;
                }
                updateMobileAuthButtonUI();
                renderEquipmentList();
            })
            .catch(function() {
                currentMobileUser = null;
                updateMobileAuthButtonUI();
            });
    }

    function updateMobileAuthButtonUI() {
        const btn = document.getElementById('btn-mobile-auth');
        if (!btn) return;
        if (currentMobileUser) {
            btn.innerHTML = '<i class="fa-solid fa-user-check" style="color: var(--success);"></i>';
            btn.title = (currentMobileUser.displayName || currentMobileUser.username) + ' (' + (currentMobileUser.role || '') + ')';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-user"></i>';
            btn.title = 'Maintenance Login';
        }
    }

    function openMobileAuthModal() {
        const modal = document.getElementById('modal-mobile-auth');
        const loginForm = document.getElementById('mobile-login-form');
        const loggedInBox = document.getElementById('mobile-auth-logged-in');
        const errBox = document.getElementById('mobile-auth-error');
        if (!modal) return;

        if (errBox) errBox.style.display = 'none';

        if (currentMobileUser) {
            if (loginForm) loginForm.style.display = 'none';
            if (loggedInBox) loggedInBox.style.display = 'block';
            const userDisplay = document.getElementById('mobile-auth-user-display');
            const roleBadge = document.getElementById('mobile-auth-role-badge');
            const avatar = document.getElementById('mobile-auth-avatar');
            if (userDisplay) userDisplay.textContent = currentMobileUser.displayName || currentMobileUser.username;
            if (roleBadge) roleBadge.textContent = (currentMobileUser.role || 'MAINTENANCE').toUpperCase();
            if (avatar) avatar.textContent = (currentMobileUser.displayName || currentMobileUser.username || 'A').charAt(0).toUpperCase();
        } else {
            if (loginForm) loginForm.style.display = 'block';
            if (loggedInBox) loggedInBox.style.display = 'none';
        }

        modal.style.display = 'flex';
    }

    function closeMobileAuthModal() {
        const modal = document.getElementById('modal-mobile-auth');
        if (modal) modal.style.display = 'none';
    }

    function handleMobileLogin(e) {
        e.preventDefault();
        const unameInput = document.getElementById('mobile-auth-username');
        const passInput = document.getElementById('mobile-auth-password');
        const errBox = document.getElementById('mobile-auth-error');
        const submitBtn = document.getElementById('btn-mobile-login-submit');

        if (!unameInput || !passInput) return;
        const username = unameInput.value.trim();
        const password = passInput.value;

        if (errBox) errBox.style.display = 'none';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
        }

        fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        })
        .then(function(res) {
            if (res.ok) return res.json();
            return res.json().then(function(errData) {
                throw new Error((errData && errData.error) || 'HTTP ' + res.status);
            });
        })
        .then(function(data) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Unlock Maintenance Mode';
            }
            if (data && data.success) {
                if (data.token) {
                    try { localStorage.setItem('yardstik_session_token', data.token); } catch(e) {}
                }
                currentMobileUser = data.user;
                updateMobileAuthButtonUI();
                renderEquipmentList();
                closeMobileAuthModal();
            } else {
                throw new Error((data && data.error) || 'Invalid username or password');
            }
        })
        .catch(function(err) {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Unlock Maintenance Mode';
            }
            if (errBox) {
                errBox.textContent = err.message || 'Login failed';
                errBox.style.display = 'block';
            }
        });
    }

    function handleMobileLogout() {
        fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() })
            .then(function() {
                try { localStorage.removeItem('yardstik_session_token'); } catch(e) {}
                currentMobileUser = null;
                updateMobileAuthButtonUI();
                renderEquipmentList();
                closeMobileAuthModal();
            })
            .catch(function() {
                try { localStorage.removeItem('yardstik_session_token'); } catch(e) {}
                currentMobileUser = null;
                updateMobileAuthButtonUI();
                renderEquipmentList();
                closeMobileAuthModal();
            });
    }

    function openQuickEditModal(catIdx, itemIdx) {
        if (!rawEquipmentData || !rawEquipmentData.categories || !rawEquipmentData.categories[catIdx]) return;
        const cat = rawEquipmentData.categories[catIdx];
        const item = cat.items ? cat.items[itemIdx] : null;
        if (!item) return;

        activeQuickEditCatIndex = catIdx;
        activeQuickEditItemIndex = itemIdx;
        activeQuickEditStatus = (item.status || 'OK').toUpperCase();

        const modal = document.getElementById('modal-equip-quick-edit');
        const titleEl = document.getElementById('quick-edit-title');
        const catNameEl = document.getElementById('quick-edit-cat-name');
        const reasonInput = document.getElementById('quick-edit-reason');
        const craneSection = document.getElementById('quick-edit-crane-section');
        const scaleSelect = document.getElementById('quick-edit-scale-status');
        const auditCheckbox = document.getElementById('quick-edit-blend-audit');

        if (titleEl) titleEl.textContent = 'Edit ' + item.name;
        if (catNameEl) catNameEl.textContent = cat.name.toUpperCase();
        if (reasonInput) reasonInput.value = item.reason || '';

        updateStatusButtonsUI(activeQuickEditStatus);

        const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';
        if (craneSection) {
            craneSection.style.display = isMobileCranes ? 'block' : 'none';
            if (isMobileCranes) {
                if (scaleSelect) scaleSelect.value = item.scale || 'OK';
                if (auditCheckbox) auditCheckbox.checked = !!item.blend_audit;
            }
        }

        if (modal) modal.style.display = 'flex';
    }

    function updateStatusButtonsUI(status) {
        document.querySelectorAll('.btn-status-toggle').forEach(function(btn) {
            const btnStatus = btn.getAttribute('data-status');
            if (btnStatus === status) {
                btn.style.outline = '2px solid #fff';
                btn.style.opacity = '1';
            } else {
                btn.style.outline = 'none';
                btn.style.opacity = '0.6';
            }
        });
    }

    function closeQuickEditModal() {
        const modal = document.getElementById('modal-equip-quick-edit');
        if (modal) modal.style.display = 'none';
        activeQuickEditCatIndex = -1;
        activeQuickEditItemIndex = -1;
    }

    function saveQuickEdit(e) {
        e.preventDefault();
        if (activeQuickEditCatIndex < 0 || activeQuickEditItemIndex < 0 || !rawEquipmentData) return;

        const cat = rawEquipmentData.categories[activeQuickEditCatIndex];
        const item = cat.items[activeQuickEditItemIndex];
        const reasonInput = document.getElementById('quick-edit-reason');
        const scaleSelect = document.getElementById('quick-edit-scale-status');
        const auditCheckbox = document.getElementById('quick-edit-blend-audit');
        const saveBtn = document.getElementById('btn-save-quick-edit');

        item.status = activeQuickEditStatus;
        item.reason = reasonInput ? reasonInput.value.trim() : '';

        const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';
        if (isMobileCranes) {
            if (scaleSelect) item.scale = scaleSelect.value;
            if (auditCheckbox) item.blend_audit = auditCheckbox.checked;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        }

        fetch('/api/equipment', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(rawEquipmentData)
        })
        .then(function(res) {
            if (res.ok) return res.json();
            return res.json().then(function(errData) {
                throw new Error((errData && errData.error) || 'HTTP ' + res.status);
            });
        })
        .then(function(data) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes to Floor Display';
            }
            if (data && data.success) {
                renderEquipmentList();
                closeQuickEditModal();
            } else {
                alert((data && data.error) || 'Failed to save equipment update');
            }
        })
        .catch(function(err) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes to Floor Display';
            }
            alert('Network error saving equipment update');
        });
    }

    function switchTab(tabName) {
        const tabBtns = document.querySelectorAll('.nav-tab');
        const tabViews = document.querySelectorAll('.mobile-tab-view');

        tabBtns.forEach(function(btn) {
            if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        tabViews.forEach(function(view) {
            if (view.id === 'view-' + tabName) view.classList.add('active');
            else view.classList.remove('active');
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================================================
    // 11. Global Refresh & Initialization Loop
    // ==========================================================================

    function refreshAllData(isSilent) {
        return Promise.all([
            fetchSiteConfig(),
            loadShifts(),
            loadTrackers(),
            loadEquipment(),
            loadTracks(),
            loadSafetyAndMilestones(),
            loadReminders(),
            loadSpecial(),
            loadWeatherAndAlerts()
        ]);
    }

    function initMobileApp() {
        setupEventListeners();
        startClock();
        checkMobileAuth();
        fetchSiteConfig().then(function() {
            refreshAllData();
        });

        // Polling Intervals
        setInterval(checkVersion, 5000); // 5s Version check
        setInterval(loadEquipment, 60000); // 1 min Equipment
        setInterval(loadTracks, 60000); // 1 min Tracks
        setInterval(loadTrackers, 600000); // 10 min Trackers
        setInterval(loadShifts, 600000); // 10 min Shifts
        setInterval(loadSafetyAndMilestones, 900000); // 15 min Safety & LMS
        setInterval(loadReminders, 3600000); // 1 hour Reminders
        setInterval(loadWeatherAndAlerts, 600000); // 10 min Weather
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileApp);
    } else {
        initMobileApp();
    }
})();
