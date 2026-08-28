        // Mode Detection (Kiosk TV Slide Mode vs Desktop Unified Scroll Mode vs Mobile)
        const urlParams = new URLSearchParams(window.location.search);
        const viewParam = (urlParams.get('view') || '').toLowerCase();

        // 1. Mobile Phone Redirect (if on smartphone or ?view=mobile)
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        if (viewParam === 'mobile' || (!viewParam && isMobileDevice)) {
            if (!window.location.pathname.endsWith('mobile.html')) {
                const targetUrl = new URL('mobile.html', window.location.href);
                urlParams.forEach((val, key) => {
                    if (key !== 'view') targetUrl.searchParams.set(key, val);
                });
                window.location.href = targetUrl.href;
            }
        }

        // 2. Desktop vs Kiosk Mode Evaluation
        // Kiosk mode is active IF:
        // - Explicitly requested via ?view=kiosk
        // - OR running locally on Kiosk PC (hostname is localhost or 127.0.0.1) AND not ?view=desktop
        const isExplicitKiosk = viewParam === 'kiosk';
        const isExplicitDesktop = viewParam === 'desktop';
        const isLocalhostKiosk = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && !isExplicitDesktop;

        const isKioskMode = isExplicitKiosk || isLocalhostKiosk;
        const isDesktopMode = !isKioskMode;

        if (isDesktopMode) {
            document.body.classList.add('desktop-mode');
            const navBar = document.getElementById('desktop-nav-bar');
            if (navBar) navBar.style.display = 'flex';

            const setupDesktopColumns = () => {
                const annSlide = document.querySelector('.announcement-slide');
                const panelAnn = document.getElementById('panel-anniversaries');
                const viewAnn = document.getElementById('view-announcements');
                if (annSlide && panelAnn && viewAnn) {
                    let leftCol = document.getElementById('announcements-col-left');
                    if (!leftCol) {
                        leftCol = document.createElement('div');
                        leftCol.id = 'announcements-col-left';
                        viewAnn.insertBefore(leftCol, viewAnn.firstChild);
                    }
                    leftCol.appendChild(annSlide);
                    leftCol.appendChild(panelAnn);
                }
            };
            if (document.readyState === 'loading') {
                window.addEventListener('DOMContentLoaded', setupDesktopColumns);
            } else {
                setupDesktopColumns();
            }
        }

        // 0. Live Reload Engine & Site Configuration
        let currentVersion = null;
        let siteConfig = {
            site_name: "Operations Dashboard",
            site_id: "default-site",
            latitude: 41.600,
            longitude: -87.100,
            timezone: "America/Chicago",
            vercel_api_url: ""
        };

        async function fetchSiteConfig() {
            try {
                const res = await fetch('assets/data/config.json?t=' + new Date().getTime());
                if (res.ok) {
                    const data = await res.json();
                    siteConfig = { ...siteConfig, ...data };
                    if (siteConfig.vercel_api_url) {
                        siteConfig.vercel_api_url = siteConfig.vercel_api_url.replace(/\/+$/, '');
                    }
                    if (siteConfig.site_name) {
                        document.title = siteConfig.site_name;
                        const desktopTitle = document.getElementById('desktop-title');
                        if (desktopTitle) desktopTitle.innerText = siteConfig.site_name;
                        const headerTitle = document.getElementById('header-dashboard-title');
                        if (headerTitle) headerTitle.innerText = siteConfig.site_name;
                    }
                }
            } catch (e) {
                console.warn('Using default site configuration:', e);
            } finally {
                // Dynamically generate QR code pointing to this site's mobile view
                const qrImg = document.getElementById('mobile-qr-img');
                if (qrImg) {
                    const baseUrl = (siteConfig.vercel_api_url || window.location.origin).replace(/\/+$/, '');
                    const targetUrl = `${baseUrl}/mobile.html`;
                    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(targetUrl)}`;
                }

                // Trigger cloud feeds now that site configuration (and vercel_api_url) is guaranteed loaded
                if (typeof fetchSafetyVideos === 'function') fetchSafetyVideos();
                if (typeof getAnniversaries === 'function') getAnniversaries();
            }
        }
        fetchSiteConfig();

        async function checkVersion() {
            try {
                const res = await fetch('assets/data/version.txt?t=' + new Date().getTime());
                const version = await res.text();
                if (currentVersion === null) {
                    currentVersion = version;
                } else if (currentVersion !== version) {
                    console.log("New version detected, refreshing kiosk...");
                    location.reload();
                }
            } catch(e) {}
        }
        setInterval(checkVersion, 5000);
        
        let cachedShifts = [];
        async function fetchShifts() {
            try {
                const res = await fetch('assets/data/shifts.json?t=' + new Date().getTime());
                const data = await res.json();
                cachedShifts = data.shifts;
            } catch (e) { console.log(e); }
        }
        fetchShifts(); setInterval(fetchShifts, 600000); // Check file every 10 mins

        let activeAlertCount = 0;
        
        // Define allocation logic globally so we can reuse it across different weather components
        function allocateSlots(alertCount) {
            let slots = 4 - alertCount;
            if (typeof hasAllocatedLightningSlot !== 'undefined' && hasAllocatedLightningSlot) {
                slots += 1; // Lightning is very thin, reclaim 1 visual slot
            }
            if (slots < 0) slots = 0;

            const oshaWidget = document.getElementById('osha-widget-container');
            const blendWidget = document.getElementById('blend-widget-container');
            const daylightWidget = document.getElementById('daylight-widget');
            const shiftWidget = document.getElementById('shift-widget');
            
            const headerOsha = document.getElementById('header-osha');
            const headerBlend = document.getElementById('header-blend');
            const fillerContainer = document.getElementById('filler-widgets-container');

            if (slots >= 1) { oshaWidget.style.display = 'flex'; headerOsha.style.display = 'none'; slots--; } 
            else { oshaWidget.style.display = 'none'; headerOsha.style.display = 'block'; }

            if (slots >= 1) { blendWidget.style.display = 'flex'; headerBlend.style.display = 'none'; slots--; } 
            else { blendWidget.style.display = 'none'; headerBlend.style.display = 'block'; }

            let showDaylight = false;
            let showShift = false;
            
            if (slots >= 1) {
                if (slots === 1 && alertCount === 2 && typeof hasAllocatedLightningSlot !== 'undefined' && hasAllocatedLightningSlot) {
                    showShift = true;
                    slots--;
                } else {
                    showDaylight = true;
                    slots--;
                }
            }
            
            if (slots >= 1 && !showShift) {
                showShift = true;
                slots--;
            }

            if (daylightWidget) daylightWidget.style.display = showDaylight ? 'flex' : 'none';
            if (shiftWidget) shiftWidget.style.display = showShift ? 'flex' : 'none';

            if (fillerContainer) {
                fillerContainer.style.display = (daylightWidget.style.display !== 'none' || shiftWidget.style.display !== 'none') ? 'flex' : 'none';
            }
        }
        
        // 1. Clock Tracker & Synchronized Engines
        setInterval(() => {
            document.getElementById('clock').innerText = new Date().toLocaleString('en-US', { 
                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
            if (typeof updateShiftTracker === 'function') updateShiftTracker();
            if (typeof updateLightningWidget === 'function') updateLightningWidget();
            
            // Update any active countdown timers
            document.querySelectorAll('.countdown-timer').forEach(el => {
                let targetStr = el.getAttribute('data-target');
                let targetDate;
                
                // Parse MM-DD-HH-mm format
                const match = targetStr.match(/^([0-9]{2})-([0-9]{2})-([0-9]{2})-([0-9]{2})$/);
                if (match) {
                    const now = new Date();
                    const month = parseInt(match[1]) - 1; // JS months are 0-indexed
                    const date = parseInt(match[2]);
                    const hours = parseInt(match[3]);
                    const mins = parseInt(match[4]);
                    
                    targetDate = new Date(now.getFullYear(), month, date, hours, mins, 0, 0);
                    
                    // If this date is in the past by more than 24 hours, push it to next year
                    // This creates a 24-hour 'active' window where the timer says "IT'S TIME!" instead of instantly resetting.
                    if (targetDate.getTime() < now.getTime() - (24 * 60 * 60 * 1000)) {
                        targetDate.setFullYear(now.getFullYear() + 1);
                    }
                } else {
                    targetDate = new Date(targetStr);
                }
                
                const target = targetDate.getTime();
                const now = new Date().getTime();
                const diff = target - now;
                
                if (diff < 0) {
                    // Flash text every second
                    el.style.color = Math.floor(now / 1000) % 2 === 0 ? '#ff4d4d' : '#ffffff';
                    el.innerText = "IT'S TIME!";
                    return;
                }
                
                // Reset color if it was flashing
                el.style.color = '';
                
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                
                let text = [];
                if (days > 0) text.push(`${days}d`);
                if (hours > 0) text.push(`${hours}h`);
                if (mins > 0) text.push(`${mins}m`);
                text.push(`${secs}s`);
                
                el.innerText = text.join(' ');
            });
        }, 1000);

        // 2. Automated Trackers from JSON Config
        async function updateTrackers() {
            try {
                // Fetch the JSON config file
                const res = await fetch('assets/data/trackers.json?t=' + new Date().getTime());
                const data = await res.json();
                
                // Update OSHA Counter
                if (data.last_incident_date) {
                    const lastIncident = new Date(data.last_incident_date);
                    const today = new Date();
                    
                    // Calculate total day boundaries cleanly
                    const diffTime = today.getTime() - lastIncident.getTime();
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    const safeDays = isNaN(diffDays) ? "!!" : diffDays;
                    document.getElementById('osha-counter').innerText = safeDays;
                    const hOsha = document.getElementById('header-osha-counter');
                    if (hOsha) hOsha.innerText = safeDays;
                }
                
                // Update Production Tracker (Configurable: Blend Recipe / Heat # / Daily Target / etc)
                const trackerVal = (data.production_tracker_value !== undefined && data.production_tracker_value !== null && data.production_tracker_value !== '')
                    ? data.production_tracker_value
                    : data.blend_recipe;

                const trackerLabel = (data.production_tracker_label && data.production_tracker_label.trim())
                    ? data.production_tracker_label.trim()
                    : 'Active Blend Recipe';

                if (trackerVal !== undefined && trackerVal !== null && trackerVal !== '') {
                    const displayVal = trackerVal.toString();
                    const titleText = trackerLabel.endsWith(':') ? trackerLabel : trackerLabel + ':';
                    const headerLabelText = trackerLabel.replace(/^Active\s+/i, '').trim();
                    const cleanHeaderLabel = (headerLabelText.endsWith(':') ? headerLabelText : headerLabelText + ':').toUpperCase();

                    const mainTitle = document.getElementById('blend-widget-title');
                    if (mainTitle) mainTitle.innerText = titleText;

                    const mainDisplay = document.getElementById('blend-recipe-display');
                    if (mainDisplay) mainDisplay.innerText = displayVal;

                    const hLabel = document.getElementById('header-blend-label');
                    if (hLabel) hLabel.innerText = cleanHeaderLabel;

                    const hBlend = document.getElementById('header-blend-display');
                    if (hBlend) hBlend.innerText = displayVal;
                }
            } catch (e) {
                document.getElementById('osha-counter').innerText = "Err";
                const hOsha = document.getElementById('header-osha-counter');
                if (hOsha) hOsha.innerText = "Err";
                
                const blend = document.getElementById('blend-recipe-display');
                if (blend) blend.innerText = "Err";
                const hBlend = document.getElementById('header-blend-display');
                if (hBlend) hBlend.innerText = "Err";
            }
        }
        updateTrackers();
        setInterval(updateTrackers, 600000); // Check file every 10 mins

        // 3. Advanced Weather Matrix Engine
        async function getWeather() {
            try {
                // Ensure shifts are loaded before weather processes them
                if (typeof fetchShifts === 'function' && (!cachedShifts || cachedShifts.length === 0)) {
                    await fetchShifts();
                }
                if (typeof updateShiftTracker === 'function') {
                    updateShiftTracker();
                }
                
                // Ensure site config is loaded
                if (typeof fetchSiteConfig === 'function' && (!siteConfig || !siteConfig.latitude)) {
                    await fetchSiteConfig();
                }

                // Request current stats + daily precipitation outlook blocks + hourly conditions + apparent temp + precipitation + snowfall + sunrise/sunset
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${siteConfig.latitude}&longitude=${siteConfig.longitude}&current_weather=true&hourly=precipitation_probability,windspeed_10m,apparent_temperature,precipitation,snowfall&daily=weathercode,sunrise,sunset,precipitation_sum,snowfall_sum&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto&t=` + new Date().getTime();
                const res = await fetch(url);
                const data = await res.json();
                
                let currentTemp = Math.round(data.current_weather.temperature);
                let currentWind = Math.round(data.current_weather.windspeed);
                let weatherCode = data.current_weather.weathercode;
                
                const currentHourIdx = new Date().getHours();
                let apparentTemp = Math.round(data.hourly.apparent_temperature[currentHourIdx]);
                let precipProb = data.hourly.precipitation_probability.slice(currentHourIdx, currentHourIdx + 12);
                let precipAmount = data.hourly.precipitation.slice(currentHourIdx, currentHourIdx + 12);
                let snowAmount = data.hourly.snowfall.slice(currentHourIdx, currentHourIdx + 12);
                currentWeatherCode = weatherCode;
                currentPrecipProb = precipProb;
                
                // --- DEV MOCK OVERRIDES ---
                const urlParams = new URLSearchParams(window.location.search);
                const mock = urlParams.get('mock');
                if (mock === 'heat') { apparentTemp = 105; currentTemp = 96; }
                if (mock === 'chill') { apparentTemp = -10; currentTemp = 5; }
                if (mock === 'storm' || mock === 'lightning') { weatherCode = 95; currentWind = 45; }
                if (mock === 'tornado') { weatherCode = 99; currentWind = 75; }
                if (mock === 'rain') { precipProb[2] = 85; precipAmount[2] = 0.2; precipAmount[3] = 0.3; precipAmount[4] = 0.1; data.daily.precipitation_sum = [0.6]; }
                if (mock === 'snow') { precipProb[1] = 90; snowAmount[1] = 1.2; snowAmount[2] = 3.5; apparentTemp = 15; data.daily.snowfall_sum = [4.7]; }
                if (mock === 'clear') { apparentTemp = 75; currentWind = 5; weatherCode = 0; precipProb.fill(0); precipAmount.fill(0); snowAmount.fill(0); }
                // --------------------------
                
                // Setup Dynamic Alerts Container
                const alertsContainer = document.getElementById('dynamic-alerts-container');
                alertsContainer.innerHTML = '';
                let weatherAlertCount = 0;
                
                function addAlert(title, value, subtext, color) {
                    weatherAlertCount++;
                    const isHighAlert = (value === 'WARNING' || value === 'EMERGENCY');
                    let animStyle = '';
                    if (value === 'EMERGENCY') animStyle = `animation: pulse-border-glow 2s infinite alternate; box-shadow: 0 0 20px ${color};`;
                    else if (value === 'WARNING') animStyle = `animation: pulse-border-glow 1.5s infinite alternate ease-in-out; box-shadow: 0 0 15px ${color};`;
                    
                    alertsContainer.innerHTML += `
                    <div class="widget weather-alert-interactive" style="border: 1px solid ${color}; border-left: 6px solid ${color}; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 25px; border-radius: 20px; background: linear-gradient(145deg, rgba(20,25,30,0.85) 0%, rgba(5,10,15,0.95) 100%); box-shadow: 0 15px 35px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -10px 20px rgba(0,0,0,0.4); cursor: pointer; transition: transform 0.2s; ${animStyle}" onclick="window.open('https://zoom.earth/maps/radar/#view=${siteConfig.latitude},${siteConfig.longitude},8z', '_blank')" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                        <h3 style="margin-bottom: 8px; color: var(--text-primary); text-align: center; font-size: 1.3rem; letter-spacing: 0.05em; text-transform: uppercase;">${title}</h3>
                        <div class="osha-number" style="color: ${color}; font-size: 3.5rem; text-align: center; line-height: 1.1; margin: 5px 0; ${isHighAlert ? 'text-shadow: 0 0 20px ' + color + ';' : 'text-shadow: 0 4px 10px rgba(0,0,0,0.5);'}">${value}</div>
                        ${subtext ? `<div style="color: var(--text-secondary); font-size: 1rem; margin-top: 10px; text-align: center; font-weight: 600; letter-spacing: 0.02em;">${subtext}</div>` : ''}
                    </div>`;
                }

                // 1. Extreme Temp Alerts
                if (apparentTemp >= 90) {
                    addAlert('Heat Index', `${apparentTemp}°F`, 'Caution: High Heat Risk', 'var(--neon-amber)');
                } else if (apparentTemp <= 32) {
                    addAlert('Wind Chill', `${apparentTemp}°F`, 'Caution: Freezing Temps', '#00ffff');
                }

                // 2. Precipitation Alerts (Rain or Snow)
                let precipStartIdx = -1;
                let precipEndIdx = -1;
                let isSnow = false;
                
                let currentShiftPrecip = 0;
                let nextShiftPrecip = 0;
                let showNextShift = false;
                
                let h1 = 12; 
                let h2 = 0;
                let label1 = "NEXT 12H";
                let label2 = "";
                
                if (window.globalActiveShiftName) {
                    h1 = Math.ceil(window.globalActiveShiftMinsLeft / 60);
                    if (h1 === 0) h1 = 1; // At least current hour
                    label1 = window.globalActiveShiftName;
                    
                    if (window.globalActiveShiftMinsLeft <= 60) {
                        showNextShift = true;
                        h2 = 8; // Next shift is 8 hours
                        label2 = window.globalNextShiftName || "NEXT SHIFT";
                    }
                }
                
                for (let i = 0; i < 12; i++) {
                    if (precipProb[i] > 20 && (precipAmount[i] > 0.001 || snowAmount[i] > 0)) {
                        if (precipStartIdx === -1) precipStartIdx = i;
                        if (snowAmount[i] > 0) isSnow = true;
                        
                        let amt = snowAmount[i] > 0 ? snowAmount[i] : precipAmount[i];
                        if (i < h1) {
                            currentShiftPrecip += amt;
                        } else if (showNextShift && i < h1 + h2) {
                            nextShiftPrecip += amt;
                        } else if (!window.globalActiveShiftName) {
                            currentShiftPrecip += amt; // Fallback to 12h
                        }
                        
                        precipEndIdx = i;
                    }
                }
                
                if (precipStartIdx !== -1) {
                    const formatTime = (offset) => {
                        const d = new Date(); d.setHours(d.getHours() + offset);
                        return d.toLocaleString('en-US', { hour: 'numeric', hour12: true }).replace(':00', '');
                    };
                    const startStr = formatTime(precipStartIdx);
                    const endStr = formatTime(precipEndIdx + 1);
                    
                    let dailyTotal = isSnow ? (data.daily.snowfall_sum && data.daily.snowfall_sum[0] ? data.daily.snowfall_sum[0] : 0) : (data.daily.precipitation_sum && data.daily.precipitation_sum[0] ? data.daily.precipitation_sum[0] : 0);
                    const formatAmt = (amt) => amt < 0.1 ? "< 0.1\"" : amt.toFixed(1) + "\"";
                    
                    let formattedHTML = `<span>${formatAmt(dailyTotal)}<span style="font-size: 1rem; color: var(--text-secondary); display: block; margin-top: 2px;">TODAY</span></span>`;
                    
                    formattedHTML += `<span style="color: rgba(255,255,255,0.2);">|</span><span>${formatAmt(currentShiftPrecip)}<span style="font-size: 1rem; color: var(--text-secondary); display: block; margin-top: 2px;">${label1}</span></span>`;
                    
                    if (showNextShift) {
                        formattedHTML += `<span style="color: rgba(255,255,255,0.2);">|</span><span>${formatAmt(nextShiftPrecip)}<span style="font-size: 1rem; color: var(--text-secondary); display: block; margin-top: 2px;">${label2}</span></span>`;
                    }
                    
                    const precipFormatted = `<span style="font-size: ${showNextShift ? '1.8rem' : '2.2rem'}; display: flex; align-items: center; justify-content: center; gap: 15px;">${formattedHTML}</span>`;
                    
                    let timeSubtext = `Starts: ${startStr} | Ends: ${endStr}`;
                    if (precipStartIdx === 0) {
                        timeSubtext = `Ends: ${endStr}`;
                    }
                    
                    if (isSnow) {
                        addAlert('Snow Forecast', precipFormatted, timeSubtext, '#ffffff');
                    } else {
                        addAlert('Rain Forecast', precipFormatted, timeSubtext, '#4da6ff');
                    }
                }

                // Severity Check Code Array (WMO Standards mapping)
                let severityAlert = "";
                let hasNwsAlert = false;
                let activeAnim = 'none';
                
                // 3. National Weather Service (NWS) Active Alerts
                try {
                    const nwsRes = await fetch(`https://api.weather.gov/alerts/active?point=${siteConfig.latitude},${siteConfig.longitude}`, { cache: 'no-store' });
                    const nwsData = await nwsRes.json();
                    
                    // -- DEV MOCK NWS --
                    if (mock === 'storm' || mock === 'lightning') nwsData.features = [{ properties: { event: 'Severe Thunderstorm Warning', ends: new Date(Date.now() + 2*3600000).toISOString() } }];
                    if (mock === 'tornado') nwsData.features = [{ properties: { event: 'Tornado Warning', ends: new Date(Date.now() + 1*3600000).toISOString() } }];
                    if (mock === 'snow') nwsData.features = [{ properties: { event: 'Blizzard Warning', ends: new Date(Date.now() + 5*3600000).toISOString() } }];
                    if (mock === 'fog') nwsData.features = [{ properties: { event: 'Dense Fog Advisory', ends: new Date(Date.now() + 3*3600000).toISOString() } }];
                    if (mock === 'flood') nwsData.features = [{ properties: { event: 'Flash Flood Warning', ends: new Date(Date.now() + 4*3600000).toISOString() } }];
                    if (mock === 'clear') nwsData.features = [];
                    // ------------------
                    
                    if (nwsData.features && nwsData.features.length > 0) {
                        // Deduplicate overlapping alerts by keeping the highest severity per category
                        let processedAlerts = nwsData.features.map(alert => {
                            const event = alert.properties.event || "Weather Alert";
                            const eventLower = event.toLowerCase();
                            
                            let severityScore = 1;
                            if (eventLower.includes('advisory')) severityScore = 2;
                            else if (eventLower.includes('watch')) severityScore = 3;
                            else if (eventLower.includes('warning') || eventLower.includes('emergency')) severityScore = 4;
                            
                            let category = 'weather';
                            if (eventLower.includes('tornado')) category = 'tornado';
                            else if (eventLower.includes('storm') || eventLower.includes('wind')) category = 'storm';
                            else if (eventLower.includes('blizzard') || eventLower.includes('winter') || eventLower.includes('snow') || eventLower.includes('ice') || eventLower.includes('freeze')) category = 'winter';
                            else if (eventLower.includes('flood')) category = 'flood';
                            
                            return { alert, event, eventLower, severityScore, category };
                        });
                        
                        processedAlerts.sort((a, b) => b.severityScore - a.severityScore);
                        let uniqueAlerts = [];
                        let seenCategories = new Set();
                        processedAlerts.forEach(item => {
                            if (!seenCategories.has(item.category)) {
                                seenCategories.add(item.category);
                                uniqueAlerts.push(item);
                            }
                        });

                        uniqueAlerts.forEach(item => {
                            const { alert, event, eventLower } = item;
                            const endRaw = alert.properties.ends || alert.properties.expires;
                            let ends = "Unknown";
                            if (endRaw) {
                                const endDate = new Date(endRaw);
                                const today = new Date();
                                const isSameDay = endDate.getDate() === today.getDate() && endDate.getMonth() === today.getMonth();
                                const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
                                if (!isSameDay) opts.weekday = 'short';
                                ends = endDate.toLocaleString('en-US', opts);
                            }
                            
                            let alertLevel = 'WARNING';
                            let isHighPriority = true;
                            
                            if (eventLower.includes('advisory')) { alertLevel = 'ADVISORY'; isHighPriority = false; }
                            else if (eventLower.includes('watch')) { alertLevel = 'WATCH'; isHighPriority = false; }
                            else if (eventLower.includes('statement') || eventLower.includes('outlook')) { alertLevel = 'NOTICE'; isHighPriority = false; }
                            
                            if (eventLower.includes('tornado')) {
                                addAlert('🚨 TORNADO 🚨', alertLevel, `Active until ${ends}`, '#ff0033');
                                severityAlert = `⚠️ ${event.toUpperCase()} ⚠️<br>`;
                                hasNwsAlert = true;
                            } else if (eventLower.includes('storm') || eventLower.includes('wind')) {
                                addAlert('SEVERE STORM', alertLevel, `Active until ${ends}`, isHighPriority ? 'var(--neon-amber)' : '#ffcc00');
                                if (isHighPriority) { severityAlert = `⚠️ ${event.toUpperCase()} ⚠️<br>`; hasNwsAlert = true; }
                            } else if (eventLower.includes('blizzard') || eventLower.includes('winter') || eventLower.includes('snow') || eventLower.includes('ice') || eventLower.includes('freeze')) {
                                addAlert('WINTER', alertLevel, `${event} until ${ends}`, '#ffffff');
                                if (isHighPriority) { severityAlert = `❄️ ${event.toUpperCase()} ❄️<br>`; hasNwsAlert = true; }
                            } else if (eventLower.includes('flood')) {
                                addAlert('FLOOD', alertLevel, `${event} until ${ends}`, '#0055ff');
                                if (isHighPriority) { severityAlert = `🌊 ${event.toUpperCase()} 🌊<br>`; hasNwsAlert = true; }
                            } else {
                                const color = isHighPriority ? 'var(--neon-amber)' : '#a855f7';
                                addAlert('WEATHER', alertLevel, `${event} until ${ends}`, color);
                                if (isHighPriority) { severityAlert = `⚠️ ${event.toUpperCase()} ⚠️<br>`; hasNwsAlert = true; }
                            }
                            
                            // Determine weather animation track in background
                            let animPriority = { 'tornado': 5, 'storm': 4, 'snow': 3, 'rain': 2, 'fog': 1, 'none': 0 };
                            let thisAnim = 'none';
                            if (eventLower.includes('tornado')) thisAnim = 'tornado';
                            else if (eventLower.includes('storm') || eventLower.includes('wind')) thisAnim = 'storm';
                            else if (eventLower.includes('blizzard') || eventLower.includes('winter') || eventLower.includes('snow') || eventLower.includes('ice') || eventLower.includes('freeze')) thisAnim = 'snow';
                            else if (eventLower.includes('flood')) thisAnim = 'rain';
                            else if (eventLower.includes('fog') || eventLower.includes('visibility')) thisAnim = 'fog';
                            
                            if (animPriority[thisAnim] > animPriority[activeAnim]) activeAnim = thisAnim;
                        });
                    }
                } catch(e) { console.log('NWS API Error:', e); }
                
                // Intelligently allocate the 4 available slots in the side-stats column
                activeAlertCount = weatherAlertCount + (typeof hasAllocatedLightningSlot !== 'undefined' && hasAllocatedLightningSlot ? 1 : 0);
                allocateSlots(activeAlertCount);

                // Call the daylight rendering engine with the fetched sunrise/sunset times
                if (typeof renderDaylightWidget === 'function') {
                    renderDaylightWidget(data.daily.sunrise, data.daily.sunset);
                }

                // Fallback WMO alerts if NWS doesn't trigger
                if (!hasNwsAlert) {
                    if ([95, 96, 99].includes(weatherCode)) {
                        severityAlert = "⚠️ THUNDERSTORMS IN AREA ⚠️<br>";
                    } else if (currentWind >= 30) {
                        severityAlert = "⚠️ HIGH WIND WARNING ⚠️<br>";
                    }
                }

                // Determine Weather Animation
                if (activeAnim === 'none') {
                    if (severityAlert.includes('TORNADO')) activeAnim = 'tornado';
                    else if (severityAlert.includes('STORM')) activeAnim = 'storm';
                    else if (severityAlert.includes('WINTER') || severityAlert.includes('BLIZZARD')) activeAnim = 'snow';
                    else if (precipStartIdx !== -1) activeAnim = isSnow ? 'snow' : 'rain';
                }
                
                if (typeof startWeatherAnimation === 'function') {
                    startWeatherAnimation(activeAnim);
                }

                // Render dynamic text output block for main header
                document.getElementById('weather-display').innerHTML = `
                    <span style="font-weight: bold; font-size: 1.1rem; color: var(--neon-amber);">${severityAlert}</span>
                    <span style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">${currentTemp}°F</span> <span style="color: var(--text-secondary); font-size: 0.9rem; margin-left: 5px;">| Wind: ${currentWind} mph</span><br>
                    <span style="color: var(--text-muted); font-size: 0.85rem;">${precipStartIdx !== -1 ? (isSnow ? 'Snow expected today.' : 'Rain expected today.') : 'No precipitation forecast.'}</span>
                `;
            } catch (e) { 
                console.log("Weather API Offline:", e);
                document.getElementById('weather-display').innerHTML = `
                    <span style="font-weight: bold; font-size: 1.1rem; color: #ff0033;">⚠️ WEATHER OFFLINE ⚠️</span><br>
                    <span style="color: var(--text-muted); font-size: 0.85rem;">System will automatically reconnect.</span>
                `;
                const alertsContainer = document.getElementById('dynamic-alerts-container');
                if (alertsContainer) alertsContainer.innerHTML = '';
                
                if (typeof startWeatherAnimation === 'function') startWeatherAnimation('none');
                
                // Fallback to allocate 0 alert slots so the base widgets reappear
                try {
                    const filler = document.getElementById('filler-widgets-container');
                    if (filler) filler.style.display = 'flex';
                    const dl = document.getElementById('daylight-widget');
                    if (dl) dl.style.display = 'flex';
                    const sh = document.getElementById('shift-widget');
                    if (sh) sh.style.display = 'flex';
                    const osha = document.getElementById('osha-widget-container');
                    if (osha) osha.style.display = 'flex';
                    const blend = document.getElementById('blend-widget-container');
                    if (blend) blend.style.display = 'flex';
                    
                    document.getElementById('header-osha').style.display = 'none';
                    document.getElementById('header-blend').style.display = 'none';
                } catch(err) {}

                // If it fails (like when booting before the network connects), retry in 30 seconds
                setTimeout(getWeather, 30000);
            }
        }
        getWeather(); setInterval(getWeather, 600000);

        // 3.5 Special Event Logic
        async function fetchSpecialEvent() {
            try {
                const res = await fetch('assets/data/special.json?t=' + new Date().getTime());
                if (!res.ok) throw new Error('No special event');
                const data = await res.json();
                
                // Check end time
                if (data.endTime) {
                    const end = new Date(data.endTime).getTime();
                    const now = new Date().getTime();
                    if (now > end) {
                        throw new Error('Event expired');
                    }
                }
                
                const viewSpecial = document.getElementById('view-special');
                if (viewSpecial) {
                    viewSpecial.setAttribute('data-disabled', 'false');
                    const overrideMs = (parseInt(data.duration) || 20) * 1000;
                    viewSpecial.setAttribute('data-duration', overrideMs);
                    document.getElementById('special-title').innerText = data.title || '';
                    
                    const descText = data.description || '';
                    document.getElementById('special-desc').innerHTML = descText.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
                    
                    if (data.image) {
                        document.getElementById('special-img').src = data.image + '?t=' + new Date().getTime();
                        document.getElementById('special-img').style.display = 'block';
                    } else {
                        document.getElementById('special-img').style.display = 'none';
                    }
                }
            } catch (e) {
                const viewSpecial = document.getElementById('view-special');
                if (viewSpecial) viewSpecial.setAttribute('data-disabled', 'true');
            }
        }
        fetchSpecialEvent(); setInterval(fetchSpecialEvent, 60000);

        // 4. View Swapper Loop Engine
        const views = document.querySelectorAll('.kiosk-view');
        let currentView = 0;
        let panelRotationTimeout = null;

        const isShort = new URLSearchParams(window.location.search).get('short') === 'true';
        
        if (isDesktopMode) {
            // In Desktop Mode: all views are visible simultaneously in one unified scrollable page!
            views.forEach(v => {
                if (v.id !== 'view-special') {
                    v.classList.add('active');
                }
            });
            // Ensure both anniversary and safety panels are visible in standard flow
            const pAnn = document.getElementById('panel-anniversaries');
            const pSaf = document.getElementById('panel-safety');
            if (pAnn) {
                pAnn.style.position = 'relative';
                pAnn.style.transform = 'none';
                pAnn.style.opacity = '1';
            }
            if (pSaf) {
                pSaf.style.position = 'relative';
                pSaf.style.transform = 'none';
                pSaf.style.opacity = '1';
            }
        } else {
            // In Kiosk TV Mode: cycle views on timed slide loop
            function cycleViews() {
                const checkView = views[currentView];
                if (checkView.getAttribute('data-disabled') === 'true') {
                    currentView = (currentView + 1) % views.length;
                    setTimeout(cycleViews, 0);
                    return;
                }

                views.forEach(v => {
                    v.classList.remove('active');
                    if (v.id === 'view-special') v.style.display = 'none';
                });
                checkView.classList.add('active');
                if (checkView.id === 'view-special') checkView.style.display = 'flex';
                
                let ms = parseInt(checkView.getAttribute('data-duration')) || 40000;
                
                if (checkView.id === 'view-announcements') {
                    const overrideMs = advanceReminderSlide();
                    if (overrideMs) ms = overrideMs;
                    
                    // Dynamic Sub-Panel Rotation (Anniversaries -> Safety Videos)
                    const pAnn = document.getElementById('panel-anniversaries');
                    const pSaf = document.getElementById('panel-safety');
                    
                    if (pAnn && pSaf) {
                        if (panelRotationTimeout) clearTimeout(panelRotationTimeout);
                        
                        // Snap panels to starting positions immediately
                        pAnn.style.transition = 'none';
                        pSaf.style.transition = 'none';
                        pAnn.style.transformOrigin = 'top left';
                        pAnn.style.transform = 'translateY(0) translateX(0) rotate(0deg)';
                        pAnn.style.opacity = '1';
                        pSaf.style.transform = 'translateX(120%)';
                        pSaf.style.opacity = '0';
                        
                        // Re-enable smooth transition on the next paint frame
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                pAnn.style.transition = 'transform 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55), opacity 0.8s ease';
                                pSaf.style.transition = 'transform 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55), opacity 0.8s ease';
                                
                                // Trigger the animation exactly halfway through the slide's duration
                                panelRotationTimeout = setTimeout(() => {
                                    if (checkView.classList.contains('active')) {
                                        pAnn.style.transform = 'translateY(120%) rotate(-12deg)';
                                        pAnn.style.opacity = '0';
                                        pSaf.style.transform = 'translateX(0)';
                                        pSaf.style.opacity = '1';
                                        
                                        startSafetyScroll();
                                    }
                                }, ms / 2);
                            });
                        });
                    }
                }
                
                if (isShort) ms = 10000;
                
                currentView = (currentView + 1) % views.length;
                
                setTimeout(cycleViews, ms);
            }
            
            // Start the loop dynamically based on the first view's requested duration
            let initialDelay = parseInt(views[0].getAttribute('data-duration')) || 40000;
            if (isShort) initialDelay = 10000;
            setTimeout(cycleViews, initialDelay);
        }

        // --- Safety Video Scroll State ---
        let safetyScrollPos = 0;
        let safetyScrollDirection = 1;
        let safetyScrollTimeout = null;
        let safetyScrollRaf = null;

        function startSafetyScroll() {
            const list = document.getElementById('safety-list');
            if (!list) return;
            
            // Stop any existing animation
            if (safetyScrollRaf) cancelAnimationFrame(safetyScrollRaf);
            if (safetyScrollTimeout) clearTimeout(safetyScrollTimeout);
            
            // Restore scroll position immediately (handles returning to view)
            list.scrollTop = safetyScrollPos;
            
            // Only scroll if there's actually overflow
            if (list.scrollHeight <= list.clientHeight) return;
            
            // Wait 1.5s after panel slides in before starting the smooth scroll
            safetyScrollTimeout = setTimeout(() => {
                let lastTime = performance.now();
                
                function scrollLoop(time) {
                    const dt = time - lastTime;
                    lastTime = time;
                    
                    // Stop animation if the panel or view rotated away
                    const pSaf = document.getElementById('panel-safety');
                    const viewAnn = document.getElementById('view-announcements');
                    if (list.offsetParent === null || !pSaf || pSaf.style.opacity === '0' || !viewAnn || !viewAnn.classList.contains('active')) {
                        return; 
                    }
                    
                    // Scroll by ~35px per second
                    const delta = (35 * dt) / 1000;
                    safetyScrollPos += delta * safetyScrollDirection;
                    list.scrollTop = safetyScrollPos;
                    
                    // Did we hit the bottom?
                    if (safetyScrollDirection === 1 && safetyScrollPos >= list.scrollHeight - list.clientHeight) {
                        safetyScrollPos = list.scrollHeight - list.clientHeight;
                        safetyScrollDirection = -1;
                        safetyScrollTimeout = setTimeout(() => {
                            lastTime = performance.now();
                            safetyScrollRaf = requestAnimationFrame(scrollLoop);
                        }, 1500);
                        return;
                    }
                    
                    // Did we hit the top?
                    if (safetyScrollDirection === -1 && safetyScrollPos <= 0) {
                        safetyScrollPos = 0;
                        safetyScrollDirection = 1;
                        safetyScrollTimeout = setTimeout(() => {
                            lastTime = performance.now();
                            safetyScrollRaf = requestAnimationFrame(scrollLoop);
                        }, 1500);
                        return;
                    }
                    
                    safetyScrollRaf = requestAnimationFrame(scrollLoop);
                }
                
                safetyScrollRaf = requestAnimationFrame(scrollLoop);
            }, 1500);
        }

        // 5. Slideshow Initialization Profiles
        async function startSlideshow(jsonPath, imgId, ms) {
            const img = document.getElementById(imgId);
            let idx = 0;
            async function loop() {
                try {
                    const res = await fetch(jsonPath + '?t=' + new Date().getTime());
                    const files = await res.json();
                    if (files.length > 0) {
                        const folder = jsonPath.includes('safety') ? 'assets/safety-slides/' : 'assets/metrics/';
                        img.src = folder + files[idx % files.length];
                        idx++;
                    } else {
                        img.src = 'assets/placeholder.jpg';
                    }
                } catch (e) {}
            }
            loop(); setInterval(loop, ms);
        }
        async function updateSafetySlide() {
            try {
                // Shift time forward by 1 hour so the slide automatically rolls over at 11 PM instead of midnight
                const actualNow = new Date();
                const now = new Date(actualNow.getTime() + (60 * 60 * 1000));
                
                const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                
                // Fetch trackers to check for daily override
                const res = await fetch('assets/data/trackers.json?t=' + new Date().getTime());
                const data = await res.json();
                
                const label = document.getElementById('toolbox-slide-number');
                const img = document.getElementById('slow-slide-img');
                
                if (data.toolbox_override_date === todayStr && data.toolbox_override_file) {
                    img.src = `assets/data/${data.toolbox_override_file}?t=${new Date().getTime()}`;
                    if (label) label.innerText = `(Safety Stand-down)`;
                    return;
                }
                
                // Fallback to normal day-of-year calculation
                const start = new Date(Date.UTC(now.getFullYear(), 0, 0));
                const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
                const dayOfYear = Math.round((todayUTC - start) / (1000 * 60 * 60 * 24));
                
                const year = now.getFullYear();
                const isLeap = ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
                
                let slideNum = dayOfYear;
                if (isLeap) {
                    if (dayOfYear === 60) {
                        slideNum = 20; // Feb 29th uses slide 20
                    } else if (dayOfYear > 60) {
                        slideNum = dayOfYear - 1; // March 1st goes back to 60, so Dec 31st is 365
                    }
                }
                
                const paddedNum = slideNum.toString().padStart(3, '0');
                img.onerror = function() {
                    if (!this.src.endsWith('001.png')) {
                        this.src = 'assets/safety-slides/001.png';
                    }
                };
                img.src = `assets/safety-slides/${paddedNum}.png`;
                if (label) label.innerText = `#${paddedNum}`;
            } catch (e) {
                console.log("Error updating safety slide", e);
            }
        }
        updateSafetySlide();
        setInterval(updateSafetySlide, 60000); // Check every minute so it flips instantly at 11 PM
        
        // 5. Setup Equipment Status Polling (Replaces MTD Slideshow)
        let cachedEquipment = { categories: [] };

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
        
        async function fetchEquipmentStatus() {
            try {
                const res = await fetch('assets/data/equipment.json?t=' + new Date().getTime());
                const data = await res.json();
                
                // Prevent unnecessary DOM rebuilds if data hasn't changed (deep comparison)
                if (JSON.stringify(data) !== JSON.stringify(cachedEquipment)) {
                    cachedEquipment = data;
                    renderEquipmentDashboard();
                }
            } catch (e) {
                console.error("Failed to fetch equipment.json", e);
            }
        }
        
        function renderEquipmentDashboard() {
            const container = document.getElementById('equipment-masonry');
            if (!container) return;
            
            container.innerHTML = '';
            const auditIsCurrent = isAuditResetCurrent(cachedEquipment.last_audit_reset);
            
            cachedEquipment.categories.forEach(cat => {
                if (!cat.items || cat.items.length === 0) return;
                
                // Create Category Block
                const block = document.createElement('div');
                block.className = 'equipment-category';
                block.style.background = 'rgba(0,0,0,0.2)';
                block.style.borderRadius = '12px';
                block.style.padding = '15px';
                block.style.border = '1px solid rgba(255,255,255,0.05)';
                block.style.breakInside = 'avoid';
                block.style.marginBottom = '20px';
                
                // Category Title
                const title = document.createElement('h4');
                title.innerText = cat.name.toUpperCase();
                title.style.margin = '0 0 12px 0';
                title.style.fontSize = '1.1rem';
                title.style.letterSpacing = '0.05em';
                title.style.color = 'var(--text-secondary)';
                title.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                title.style.paddingBottom = '5px';
                block.appendChild(title);
                
                // Equipment Pills Grid
                const grid = document.createElement('div');
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = '1fr';
                grid.style.gap = '8px';
                
                const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';

                cat.items.forEach(item => {
                    const pill = document.createElement('div');
                    pill.style.display = 'flex';
                    pill.style.justifyContent = 'space-between';
                    pill.style.alignItems = 'center';
                    pill.style.padding = '8px 12px';
                    pill.style.borderRadius = '6px';
                    pill.style.fontSize = '1rem';
                    pill.style.fontWeight = '500';
                    pill.style.background = 'rgba(255,255,255,0.03)';
                    pill.style.borderLeft = '4px solid transparent';
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.innerText = item.name;
                    nameSpan.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
                    
                    // Container for badges on the right side
                    const badgesContainer = document.createElement('div');
                    badgesContainer.style.display = 'flex';
                    badgesContainer.style.alignItems = 'center';
                    badgesContainer.style.gap = '8px';

                    // Mobile Cranes Specific Badges (Scale & Blend Audit)
                    if (isMobileCranes && item.scale && item.scale !== 'NO' && item.scale !== 'NONE') {
                        if (item.scale === 'OK') {
                            const scaleBadge = document.createElement('span');
                            scaleBadge.className = 'badge-scale badge-scale-ok';
                            scaleBadge.innerText = 'SCALE OK';
                            badgesContainer.appendChild(scaleBadge);

                            const isAudited = !!item.blend_audit;
                            const auditBadge = document.createElement('span');
                            auditBadge.className = `badge-audit ${isAudited ? 'badge-audit-yes' : 'badge-audit-no'}`;
                            auditBadge.innerHTML = `Audit: <i class="fa-solid ${isAudited ? 'fa-check' : 'fa-xmark'}"></i>`;
                            badgesContainer.appendChild(auditBadge);
                        } else if (item.scale === 'OS') {
                            const scaleBadge = document.createElement('span');
                            scaleBadge.className = 'badge-scale badge-scale-os';
                            scaleBadge.innerText = 'SCALE OS';
                            badgesContainer.appendChild(scaleBadge);
                        }
                    }

                    const statusBadge = document.createElement('span');
                    statusBadge.style.padding = '2px 8px';
                    statusBadge.style.borderRadius = '4px';
                    statusBadge.style.fontSize = '0.85rem';
                    statusBadge.style.fontWeight = 'bold';
                    statusBadge.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
                    statusBadge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                    
                    if (item.status === 'OK') {
                        statusBadge.innerText = 'OK';
                        statusBadge.style.background = 'var(--success, #10b981)';
                        pill.style.borderLeftColor = 'var(--success, #10b981)';
                    } else if (item.status === 'OS') {
                        statusBadge.innerText = item.reason ? `OS: ${item.reason.toUpperCase()}` : 'OUT OF SERVICE';
                        statusBadge.style.background = 'var(--danger, #ef4444)';
                        pill.style.borderLeftColor = 'var(--danger, #ef4444)';
                        pill.style.background = 'rgba(239, 68, 68, 0.1)'; // Slight red tint for broken stuff
                    } else if (item.status === 'PM') {
                        statusBadge.innerText = item.reason ? `ISSUE: ${item.reason.toUpperCase()}` : 'ISSUE';
                        statusBadge.style.background = 'var(--warning, #f59e0b)';
                        pill.style.borderLeftColor = 'var(--warning, #f59e0b)';
                        statusBadge.style.color = '#fff';
                    } else {
                        statusBadge.innerText = item.status;
                        statusBadge.style.background = '#6b7280';
                        pill.style.borderLeftColor = '#6b7280';
                    }
                    
                    badgesContainer.appendChild(statusBadge);
                    pill.appendChild(nameSpan);
                    pill.appendChild(badgesContainer);
                    grid.appendChild(pill);
                });
                
                block.appendChild(grid);
                container.appendChild(block);
            });
        }
        
        let equipScrollInterval;
        function startEquipmentAutoscroll() {
            if (equipScrollInterval) clearInterval(equipScrollInterval);
            equipScrollInterval = setInterval(() => {
                const container = document.getElementById('equipment-scroll-wrapper');
                if (!container) return;
                
                // If the container doesn't overflow, do nothing
                if (container.scrollHeight <= container.clientHeight) return;
                
                // Check if we are at the bottom (with a small 10px threshold)
                if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
                    // Smoothly scroll back to top
                    container.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    // Scroll down by 85% of the visible height so there's visual overlap
                    container.scrollBy({ top: container.clientHeight * 0.85, left: 0, behavior: 'smooth' });
                }
            }, 10000); // Scroll every 10 seconds
        }
        
        fetchEquipmentStatus();
        setInterval(fetchEquipmentStatus, 60000);
        
        // Only run auto-scroll on Kiosk TV mode (Desktop has native manual scrollbar)
        if (!isDesktopMode) {
            startEquipmentAutoscroll();
        }

        // 5.5 Safety Videos CSV Parser / API Client
        async function fetchSafetyVideos() {
            const list = document.getElementById('safety-list');
            const titleEl = document.getElementById('safety-title');
            if (!list) return;

            try {
                const apiBase = (siteConfig.vercel_api_url || '').replace(/\/+$/, '');
                const res = await fetch(`${apiBase}/api/novara?t=` + new Date().getTime());
                if (!res.ok) throw new Error("Novara API not available");
                const data = await res.json();
                
                if (!data.success || !data.response || data.response.length === 0) {
                    list.innerHTML = '<li style="grid-column: 1 / -1; color: #4ade80; font-style: italic; padding: 15px; text-align: center;">All employees are 100% up to date! 🎉</li>';
                    if (titleEl) titleEl.innerHTML = 'Action Required: Safety Videos <span style="opacity: 0.7; font-size: 0.85em; font-weight: 400; margin-left: 8px;">(0 This Month • 0 Total)</span>';
                    return;
                }
                
                const totalThisMonth = typeof data.totalExpiring === 'number' ? data.totalExpiring : data.response.reduce((sum, e) => sum + (e.expiringCount || 0), 0);
                const totalOverall = typeof data.totalMissing === 'number' ? data.totalMissing : data.response.reduce((sum, e) => sum + (e.missingCount || 0), 0);

                let html = '';
                data.response.forEach(emp => {
                    let badgesHtml = '';
                    const expCount = emp.expiringCount || 0;
                    const incompCount = emp.incompleteCount || 0;

                    if (expCount > 0) {
                        badgesHtml += `<span class="badge-safety-expiring" title="${expCount} Due This Month"><i class="fa-solid fa-clock"></i> ${expCount}</span>`;
                    }
                    if (incompCount > 0) {
                        badgesHtml += `<span class="badge-safety-incomplete" title="${incompCount} Overdue"><i class="fa-solid fa-triangle-exclamation"></i> ${incompCount}</span>`;
                    }
                    if (!badgesHtml) {
                        badgesHtml = `<span class="badge-safety-incomplete" title="${emp.missingCount} Due"><i class="fa-solid fa-triangle-exclamation"></i> ${emp.missingCount}</span>`;
                    }

                    html += `
                        <li style="padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                                <img src="${emp.photoUrl}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 2px 5px rgba(0,0,0,0.5); flex-shrink: 0;">
                                <strong style="color: white; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emp.name}</strong>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;">
                                ${badgesHtml}
                            </div>
                        </li>
                    `;
                });
                
                list.innerHTML = html;
                if (titleEl) {
                    titleEl.innerHTML = `Action Required: Safety Videos <span style="font-size: 0.8em; font-weight: 500; opacity: 0.85; margin-left: 8px; color: #fca5a5;">(${totalThisMonth} This Month • ${totalOverall} Total)</span>`;
                }
            } catch (err) {
                console.warn("Safety video API not available:", err);
                list.innerHTML = '<li style="grid-column: 1 / -1; color: #94a3b8; font-style: italic; padding: 15px; text-align: center;"><i class="fa-solid fa-circle-info"></i> All safety modules up to date.</li>';
                if (titleEl) titleEl.innerHTML = 'Action Required: Safety Videos <span style="opacity: 0.7; font-size: 0.85em; font-weight: 400; margin-left: 8px;">(0 This Month • 0 Total)</span>';
            }
        }
        
        fetchSafetyVideos();
        setInterval(fetchSafetyVideos, 3600000); // Check every hour

        // 6. Anniversary UI Data Aggregation Link
        let rawAnniversariesData = null;
        let isAnniversariesExpanded = false;

        function renderEmployeeAnniversaryItem(e) {
            const yearStr = e.years === 1 ? 'Year' : 'Years';
            const isToday = e.days_until === 0;
            const daysUntilStr = isToday ? "Today!" : (e.days_until === 1 ? "Tomorrow" : `in ${e.days_until} days`);
            const badgeStyle = isToday 
                ? 'background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; font-weight: 800;' 
                : '';

            return `<li>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <strong>${e.name}</strong> 
                    <span style="background: ${isToday ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)'}; border: 1px solid ${isToday ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)'}; padding: 4px 12px; border-radius: 20px; color: ${isToday ? '#fde68a' : 'var(--text-secondary)'}; font-size: 0.85em; font-weight: ${isToday ? '700' : '400'};">${e.date}</span>
                    <span style="color: ${isToday ? 'var(--neon-amber)' : 'var(--text-muted)'}; font-size: 0.85em; font-style: italic; opacity: ${isToday ? '1' : '0.7'}; font-weight: ${isToday ? '700' : '400'};">${daysUntilStr}</span>
                </div>
                <span class="years-badge" style="${badgeStyle}">${e.years} ${yearStr}${isToday ? '!' : ''}</span>
            </li>`;
        }

        function renderAllAnniversaries(employees) {
            const list = document.getElementById('anniversaries-list');
            if (!list) return;
            list.innerHTML = '';
            
            employees.forEach(e => {
                list.innerHTML += renderEmployeeAnniversaryItem(e);
            });

            // Add collapse toggle button at the bottom (Desktop only)
            if (isDesktopMode) {
                let collapseBtn = document.createElement('li');
                collapseBtn.style = "grid-column: 1 / -1; justify-content: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-weight: 600; font-size: 0.85rem; margin-top: 5px; cursor: pointer; padding: 6px 12px; border-radius: 6px; text-align: center;";
                collapseBtn.innerHTML = `<span><i class="fa-solid fa-chevron-up"></i> Show Less</span>`;
                collapseBtn.onclick = () => {
                    isAnniversariesExpanded = false;
                    getAnniversaries();
                };
                list.appendChild(collapseBtn);
            }
        }

        async function getAnniversaries() {
            try {
                const apiBase = (siteConfig.vercel_api_url || '').replace(/\/+$/, '');
                let data = null;

                try {
                    const res = await fetch(`${apiBase}/api/novara?type=anniversaries&t=` + new Date().getTime());
                    if (res.ok) {
                        data = await res.json();
                    }
                } catch (apiErr) {
                    console.warn('Novara API offline, checking local anniversaries.json fallback:', apiErr);
                }

                if (!data || !data.employees) {
                    const localRes = await fetch('assets/data/anniversaries.json?t=' + new Date().getTime());
                    if (localRes.ok) data = await localRes.json();
                }

                rawAnniversariesData = data;

                const list = document.getElementById('anniversaries-list');
                const title = document.getElementById('anniversary-title');
                if (!list || !title || !data) return;
                list.innerHTML = '';
                
                if (data.employees && data.employees.length > 0) {
                    if (isAnniversariesExpanded) {
                        renderAllAnniversaries(data.employees);
                        return;
                    }

                    const hasTodayCelebration = data.employees.some(e => e.days_until === 0);
                    if (hasTodayCelebration) {
                        title.innerText = "🎉 Milestones & Anniversaries 🎉";
                        title.style.color = "var(--neon-amber)";
                    } else {
                        title.innerText = "Upcoming Anniversaries";
                        title.style.color = "var(--text-primary)";
                    }

                    data.employees.forEach(e => {
                        list.innerHTML += renderEmployeeAnniversaryItem(e);
                    });
                    
                    // Dynamic Truncation for Overflowing Lists on TV Kiosk
                    setTimeout(() => {
                        if (isDesktopMode) return; // Desktop uses scrollable container

                        const panelEl = document.getElementById('panel-anniversaries');
                        const titleEl = document.getElementById('anniversary-title');
                        const titleH = titleEl ? titleEl.offsetHeight : 50;
                        const maxH = panelEl ? (panelEl.clientHeight - titleH - 30) : 390;

                        let items = Array.from(list.children);
                        let hiddenCount = 0;
                        let loops = 0;

                        while (list.scrollHeight > maxH && items.length > 2 && loops < 50) {
                            list.removeChild(items.pop());
                            hiddenCount++;
                            loops++;
                        }

                        if (hiddenCount > 0) {
                            let badge = document.createElement('li');
                            badge.style = "grid-column: 1 / -1; justify-content: center; background: transparent; border: none; color: var(--text-muted); font-style: italic; margin-top: 2px; padding: 4px; text-align: center;";
                            badge.innerText = `+${hiddenCount} more this month`;
                            list.appendChild(badge);
                            
                            // Check if adding the badge pushed it back into overflow
                            while (list.scrollHeight > maxH && items.length > 2 && loops < 50) {
                                list.removeChild(items.pop());
                                hiddenCount++;
                                badge.innerText = `+${hiddenCount} more this month`;
                                loops++;
                            }
                        }
                    }, 100);
                    
                } else {
                    title.innerText = "Upcoming Anniversaries";
                    title.style.color = "var(--text-primary)";
                    list.innerHTML = `<li style="color: var(--text-muted);">No upcoming milestones found.</li>`;
                }
            } catch (e) {}
        }
        getAnniversaries(); setInterval(getAnniversaries, 3600000);
        
        // 7. Markdown Reminders Engine
        let remindersList = [];
        let currentReminderIndex = 0;

        function advanceReminderSlide() {
            if (remindersList.length === 0) return null;
            
            const reminder = remindersList[currentReminderIndex];
            
            // Live expiration check
            if (reminder.expireTime && Date.now() > reminder.expireTime) {
                remindersList.splice(currentReminderIndex, 1);
                if (currentReminderIndex >= remindersList.length) {
                    currentReminderIndex = 0;
                }
                return advanceReminderSlide();
            }
            const container = document.getElementById('reminders-widget-container');
            const titleEl = document.getElementById('reminders-title');
            
            if (titleEl) {
                titleEl.innerText = reminder.title;
            }
            
            if (container) {
                if (reminder.priority === 'critical') {
                    container.style.border = '1px solid #ff0033';
                    container.style.boxShadow = '0 0 20px rgba(255, 0, 51, 0.6)';
                    container.style.animation = 'pulse-border-glow 1.5s infinite alternate';
                    container.style.setProperty('--quote-border-color', '#ff0033');
                } else if (reminder.priority === 'high') {
                    container.style.border = '1px solid var(--neon-amber)';
                    container.style.boxShadow = '0 0 15px rgba(255, 170, 0, 0.4)';
                    container.style.animation = 'pulse-border-glow 2.5s infinite alternate ease-in-out';
                    container.style.setProperty('--quote-border-color', 'var(--neon-amber)');
                } else {
                    container.style.border = '1px solid rgba(255, 255, 255, 0.12)';
                    container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
                    container.style.animation = 'none';
                    container.style.setProperty('--quote-border-color', 'rgba(128, 138, 148, 0.6)');
                }
            }
            
            // Toggle formatting classes
            const contentContainer = document.getElementById('reminders-content');
            
            if (reminder.splitList) contentContainer.classList.add('split-list');
            else contentContainer.classList.remove('split-list');
            
            if (reminder.isLarge) contentContainer.classList.add('large-text');
            else contentContainer.classList.remove('large-text');
            
            if (reminder.isCenter) contentContainer.classList.add('center-text');
            else contentContainer.classList.remove('center-text');
            
            // Parse body text only (title was extracted)
            const htmlContent = marked.parse(reminder.body.trim());
            contentContainer.innerHTML = htmlContent;
            
            currentReminderIndex = (currentReminderIndex + 1) % remindersList.length;
            
            // Return duration override if !LONG is present
            if (reminder.isLong) return 120000;
            return null;
        }

        function renderDesktopReminders() {
            const contentContainer = document.getElementById('reminders-content');
            const titleEl = document.getElementById('reminders-title');
            if (!contentContainer) return;
            
            if (titleEl) titleEl.innerText = "Active Reminders & Notices";
            
            if (remindersList.length === 0) {
                contentContainer.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No active reminders.</span>';
                return;
            }
            
            let fullHtml = '';
            remindersList.forEach((r) => {
                const parsedBody = marked.parse(r.body.trim());
                let priorityBadge = '';
                if (r.priority === 'critical') {
                    priorityBadge = '<span style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">Critical</span>';
                } else if (r.priority === 'high') {
                    priorityBadge = '<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">Important</span>';
                }

                fullHtml += `
                    <div class="desktop-reminder-item">
                        <div class="desktop-reminder-header">
                            <span>${r.title}</span>
                            ${priorityBadge}
                        </div>
                        <div class="desktop-reminder-body ${r.splitList ? 'split-list' : ''} ${r.isLarge ? 'large-text' : ''} ${r.isCenter ? 'center-text' : ''}">
                            ${parsedBody}
                        </div>
                    </div>
                `;
            });
            contentContainer.innerHTML = fullHtml;
        }

        async function fetchReminders() {
            try {
                const res = await fetch('assets/data/reminders.md?t=' + new Date().getTime());
                if (!res.ok) throw new Error('Not found');
                const rawText = await res.text();
                
                // Split by H1 tags (starts with exactly one # and a space)
                const sections = rawText.split(/^# /m).filter(s => s.trim().length > 0);
                
                let parsedReminders = [];
                
                for (let section of sections) {
                    // Extract Title (first line) and Body (the rest)
                    const lines = section.split('\n');
                    let title = lines[0].trim();
                    let body = lines.slice(1).join('\n');
                    
                    let priority = 'normal';
                    let splitList = false;
                    let isLarge = false;
                    let isCenter = false;
                    let isLong = false;
                    let isOnly = false;
                    
                    // Parse Magic Flags from the body
                    if (body.match(/<!--\s*priority:\s*high\s*-->/i) || body.match(/!HIGH/i)) priority = 'high';
                    if (body.match(/<!--\s*priority:\s*critical\s*-->/i) || body.match(/!CRITICAL/i)) priority = 'critical';
                    if (body.match(/<!--\s*format:\s*split\s*-->/i) || body.match(/!SPLIT/i)) splitList = true;
                    if (body.match(/!LARGE/i)) isLarge = true;
                    if (body.match(/!CENTER/i)) isCenter = true;
                    if (body.match(/!LONG/i)) isLong = true;
                    if (body.match(/!ONLY/i)) isOnly = true;
                    
                    // Parse Expire Magic Word: !EXPIRE YYYY-MM-DD-HH
                    let expireTime = null;
                    const expireMatch = body.match(/!EXPIRE\s+([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
                    if (expireMatch) {
                        const parts = expireMatch[1].split('-');
                        const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), parseInt(parts[3]), 0, 0, 0);
                        expireTime = expDate.getTime();
                        if (Date.now() > expireTime) {
                            continue; // Skip this slide completely!
                        }
                        body = body.replace(expireMatch[0], ''); // Clean up text if not expired
                    }
                    
                    // Parse Countdown Magic Word: !COUNTDOWN MM-DD-HH-mm
                    let countdownHtml = "";
                    const cdMatch = body.match(/!COUNTDOWN\s+([0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
                    if (cdMatch) {
                        countdownHtml = `<div class="countdown-timer" data-target="${cdMatch[1]}"></div>`;
                        body = body.replace(cdMatch[0], ''); // Remove magic word
                    }
                    
                    // Parse QR Magic Word: !QR https://...
                    const qrMatch = body.match(/!QR\s+(https?:\/\/[^\s]+)/i);
                    if (qrMatch) {
                        body = body.replace(qrMatch[0], `<div style="text-align:center; margin: 10px 0;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrMatch[1])}" style="border: 4px solid white; border-radius: 8px;"></div>`);
                    }
                    
                    // Strip the rest of the flags from the body
                    body = body.replace(/<!--\s*(priority|format):\s*(high|critical|split)\s*-->/ig, '');
                    body = body.replace(/!(HIGH|CRITICAL|SPLIT|LARGE|CENTER|LONG|ONLY)/ig, '');
                    
                    // Append countdown if exists
                    body += countdownHtml;
                    
                    parsedReminders.push({ 
                        title: title, 
                        body: body, 
                        priority: priority, 
                        splitList: splitList,
                        isLarge: isLarge,
                        isCenter: isCenter,
                        isLong: isLong,
                        isOnly: isOnly,
                        expireTime: expireTime
                    });
                }
                
                // Apply !ONLY filter
                const onlyReminders = parsedReminders.filter(r => r.isOnly);
                if (onlyReminders.length > 0) {
                    parsedReminders = onlyReminders;
                }
                
                if (parsedReminders.length > 0) {
                    remindersList = parsedReminders;
                    // Reset index if it's out of bounds after a file update
                    if (currentReminderIndex >= remindersList.length) currentReminderIndex = 0;
                    
                    if (isDesktopMode) {
                        renderDesktopReminders();
                    } else {
                        // If this is the initial load, render immediately
                        if (document.getElementById('reminders-content').innerHTML === 'Loading...') {
                            advanceReminderSlide();
                        }
                    }
                } else {
                    throw new Error('No valid sections found');
                }
            } catch (e) {
                remindersList = [];
                document.getElementById('reminders-content').innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No active reminders.</span>';
                const container = document.getElementById('reminders-widget-container');
                if (container) {
                    container.style.border = '1px solid rgba(255, 255, 255, 0.12)';
                    container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
                    container.style.animation = 'none';
                }
            }
        }
        fetchReminders(); setInterval(fetchReminders, 3600000);
        
        // 4. Weather Animation Engine
        let weatherAnimFrame = null;
        function startWeatherAnimation(type) {
            const canvas = document.getElementById('weather-canvas');
            const vignette = document.getElementById('vignette-overlay');
            if (!canvas || !vignette) return;
            const ctx = canvas.getContext('2d');
            
            const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
            if (!window.weatherResizeAttached) {
                window.addEventListener('resize', resize);
                window.weatherResizeAttached = true;
                resize();
            }
            
            if (weatherAnimFrame) cancelAnimationFrame(weatherAnimFrame);
            canvas.style.opacity = '1';
            vignette.style.opacity = '0';
            vignette.style.animation = 'none';
            vignette.style.boxShadow = 'none';
            vignette.style.background = 'transparent';

            const darkOverlay = document.getElementById('dark-overlay');
            if (darkOverlay) {
                darkOverlay.style.opacity = '0';
                darkOverlay.style.animation = 'none';
                darkOverlay.style.background = 'rgba(0,10,20,0.5)';
            }
            
            let particles = [];
            
            if (type === 'rain') {
                for(let i=0; i<80; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, l: Math.random()*25+15, s: Math.random()*15+18 });
                function drawRain() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = 'rgba(200, 225, 255, 0.45)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    particles.forEach(p => {
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x - p.l*0.1, p.y + p.l);
                        p.y += p.s; p.x -= p.s*0.1;
                        if(p.y > canvas.height) { p.y = -p.l; p.x = Math.random() * canvas.width; }
                    });
                    ctx.stroke();
                    weatherAnimFrame = requestAnimationFrame(drawRain);
                }
                drawRain();
            } 
            else if (type === 'snow') {
                for(let i=0; i<100; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*2.5+1, s: Math.random()*2+1, a: Math.random()*Math.PI*2 });
                function drawSnow() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.beginPath();
                    particles.forEach(p => {
                        ctx.moveTo(p.x, p.y);
                        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                        p.y += p.s; p.x += Math.sin(p.a) * 0.5; p.a += 0.02;
                        if(p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
                    });
                    ctx.fill();
                    weatherAnimFrame = requestAnimationFrame(drawSnow);
                }
                drawSnow();
            }
            else if (type === 'tornado') {
                canvas.style.opacity = '0';
                vignette.style.boxShadow = 'inset 0 0 250px rgba(255, 0, 51, 0.8)';
                vignette.style.background = 'rgba(255, 0, 51, 0.05)';
                vignette.style.animation = 'pulse-emergency 2s infinite alternate';
            }
            else if (type === 'storm') {
                canvas.style.opacity = '0';
                if (darkOverlay) {
                    darkOverlay.style.opacity = '1';
                    darkOverlay.style.background = 'radial-gradient(circle at 20% 30%, rgba(0,5,15,0.95) 0%, transparent 60%), radial-gradient(circle at 80% 60%, rgba(5,10,20,0.85) 0%, transparent 60%), radial-gradient(circle at 40% 10%, rgba(0,0,5,0.9) 0%, transparent 60%), rgba(10, 15, 25, 0.6)';
                    darkOverlay.style.backgroundSize = '200% 100%';
                    darkOverlay.style.animation = 'fog-drift 25s linear infinite alternate';
                }
                vignette.style.opacity = '1';
                vignette.style.boxShadow = 'inset 0 0 350px rgba(255, 255, 255, 0.4)';
                vignette.style.background = 'transparent';
                vignette.style.animation = 'pulse-lightning 8s infinite';
            }
            else if (type === 'fog') {
                canvas.style.opacity = '0';
                
                if (darkOverlay) {
                    darkOverlay.style.opacity = '1';
                    darkOverlay.style.background = 'radial-gradient(ellipse at 15% 25%, rgba(180,190,200,0.3) 0%, transparent 25%), radial-gradient(ellipse at 75% 65%, rgba(200,210,220,0.25) 0%, transparent 35%), radial-gradient(ellipse at 45% 85%, rgba(180,190,200,0.2) 0%, transparent 20%), rgba(0,0,0,0)';
                    darkOverlay.style.animation = 'fog-drift 12s ease-in-out infinite alternate';
                }
                
                vignette.style.opacity = '1';
                vignette.style.boxShadow = 'none';
                vignette.style.background = 'radial-gradient(ellipse at 85% 15%, rgba(220,230,240,0.35) 0%, transparent 30%), radial-gradient(ellipse at 25% 75%, rgba(180,190,200,0.3) 0%, transparent 40%), radial-gradient(ellipse at 60% 30%, rgba(200,210,220,0.2) 0%, transparent 25%), rgba(200,210,220, 0.05)';
                vignette.style.animation = 'fog-drift-alt 9s ease-in-out infinite alternate';
            }
            else {
                canvas.style.opacity = '0';
            }
        }

        // 8. Daylight Cycle Engine (Half-circle canvas)
        function renderDaylightWidget(sunriseArray, sunsetArray) {
            const canvas = document.getElementById('daylight-canvas');
            const textEl = document.getElementById('daylight-text');
            if (!canvas || !textEl || !sunriseArray || !sunriseArray.length) return;
            const ctx = canvas.getContext('2d');
            
            const now = new Date();
            const todayRise = new Date(sunriseArray[0]);
            const todaySet = new Date(sunsetArray[0]);
            
            let isDaytime = false;
            let startPeriod, endPeriod;
            
            if (now >= todayRise && now < todaySet) {
                // It is daytime today
                isDaytime = true;
                startPeriod = todayRise;
                endPeriod = todaySet;
            } else if (now < todayRise) {
                // It is before sunrise today (night time from yesterday)
                isDaytime = false;
                // Approximate yesterday's sunset by subtracting 24 hours from today's sunset
                startPeriod = new Date(todaySet.getTime() - 24 * 60 * 60 * 1000);
                endPeriod = todayRise;
            } else {
                // It is after sunset today (night time into tomorrow)
                isDaytime = false;
                startPeriod = todaySet;
                // If tomorrow's sunrise is available, use it, else approximate
                endPeriod = sunriseArray.length > 1 ? new Date(sunriseArray[1]) : new Date(todayRise.getTime() + 24 * 60 * 60 * 1000);
            }
            
            const totalDurationMs = endPeriod - startPeriod;
            let progress = (now - startPeriod) / totalDurationMs;
            
            // Clamp progress just in case
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const cx = canvas.width / 2;
            const cy = canvas.height - 10;
            const r = canvas.width / 2 - 20;
            
            // Draw background arc (dark)
            ctx.beginPath();
            ctx.arc(cx, cy, r, Math.PI, 0);
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.stroke();
            
            // Draw progress arc (yellow if daytime, blue-ish if night)
            if (progress > 0) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, Math.PI, Math.PI + (Math.PI * progress));
                ctx.lineWidth = 4;
                ctx.strokeStyle = isDaytime ? '#f59e0b' : '#3b82f6';
                ctx.stroke();
            }
            
            // Draw sun or moon icon at current position
            const angle = Math.PI + (Math.PI * progress);
            const ix = cx + Math.cos(angle) * r;
            const iy = cy + Math.sin(angle) * r;
            
            ctx.beginPath();
            ctx.arc(ix, iy, 12, 0, Math.PI*2);
            ctx.fillStyle = isDaytime ? '#f59e0b' : '#93c5fd';
            ctx.shadowColor = isDaytime ? 'rgba(245, 158, 11, 0.8)' : 'rgba(147, 197, 253, 0.8)';
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0; // reset
            
            // Text logic
            const msLeft = endPeriod - now;
            const hrs = Math.floor(msLeft / 3600000);
            const mins = Math.floor((msLeft % 3600000) / 60000);
            
            if (isDaytime) {
                textEl.innerText = `${hrs}h ${mins}m of daylight remaining`;
            } else {
                textEl.innerText = `Sunrise in ${hrs}h ${mins}m`;
            }
        }

        // 9. Shift Tracker Engine

        function updateShiftTracker() {
            if (!cachedShifts || cachedShifts.length === 0) return;
            try {
                const now = new Date();
                const dayMap = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
                // Calculate precisely down to the second/fraction for ultra-smooth progress bars
                const currentMinsOfWeek = now.getDay() * 24 * 60 + now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60);
                
                let activeShift = null;
                let shiftProgress = 0;
                let timeRemainingStr = "";
                
                for (let shift of cachedShifts) {
                    const processSchedule = (daysArr, startStr, endStr) => {
                        if (!daysArr || !startStr || !endStr) return false;
                        
                        const startParts = startStr.split(':');
                        const endParts = endStr.split(':');
                        const startMinsDay = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                        let endMinsDay = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
                        const isCrossMidnight = endMinsDay <= startMinsDay;
                        
                        for (let day of daysArr) {
                            const dayNum = dayMap[day];
                            if (dayNum === undefined) continue;
                            
                            let startMinsWeek = dayNum * 24 * 60 + startMinsDay;
                            let endMinsWeek = dayNum * 24 * 60 + endMinsDay;
                            
                            if (isCrossMidnight) {
                                endMinsWeek += 24 * 60; // Push end time to the next day
                            }
                            
                            // Handle absolute end-of-week wraparound (e.g., Saturday night extending into Sunday morning)
                            let testMins = currentMinsOfWeek;
                            if (testMins < startMinsWeek && testMins + 10080 <= endMinsWeek) {
                                testMins += 10080; 
                            }
                            
                            if (testMins >= startMinsWeek && testMins <= endMinsWeek) {
                                activeShift = shift;
                                const totalDuration = endMinsWeek - startMinsWeek;
                                const elapsed = testMins - startMinsWeek;
                                shiftProgress = (elapsed / totalDuration) * 100;
                                
                                const minsLeft = endMinsWeek - testMins;
                                const hrs = Math.floor(minsLeft / 60);
                                const mns = Math.floor(minsLeft % 60);
                                timeRemainingStr = `${hrs}h ${mns}m remaining`;
                                
                                window.globalActiveShiftName = activeShift.name.toUpperCase();
                                window.globalActiveShiftMinsLeft = minsLeft;
                                
                                let nextShiftName = "NEXT SHIFT";
                                for (let s of cachedShifts) {
                                    if ((s.start === shift.end || s.start === shift.end2 || s.start2 === shift.end || s.start2 === shift.end2) && s.name !== shift.name) {
                                        nextShiftName = s.name.toUpperCase();
                                        break;
                                    }
                                }
                                window.globalNextShiftName = nextShiftName;
                                
                                return true; // Found active schedule
                            }
                        }
                        return false;
                    };
                    
                    // Check primary schedule
                    if (processSchedule(shift.days, shift.start, shift.end)) break;
                    // Check secondary schedule (if they have weird split days)
                    if (processSchedule(shift.days2, shift.start2, shift.end2)) break;
                }
                
                if (activeShift) {
                    document.getElementById('shift-name').innerText = activeShift.name;
                    document.getElementById('shift-progress').style.width = shiftProgress + '%';
                    document.getElementById('shift-text').innerText = timeRemainingStr;
                } else {
                    document.getElementById('shift-name').innerText = "Shift Change";
                    document.getElementById('shift-progress').style.width = '0%';
                    document.getElementById('shift-text').innerText = "Standby...";
                    window.globalActiveShiftName = null;
                }
            } catch (e) {}
        }
        
        // 10. Lightning Strike Engine (Xweather API)
        let activeLightningStrike = null;
        let lightningDistance = null;
        let hasAllocatedLightningSlot = false;
        let currentWeatherCode = 0;
        let currentPrecipProb = [];
        
        function isLightningConditionsMet() {
            // Only poll lightning API if storm conditions, NWS alerts, or heavy rain are present
            if (activeAlertCount > 0) return true; // NWS warnings active (Storms, Floods, etc)
            if (currentWeatherCode >= 60) return true; // Rain (61+), Showers (80+), Thunderstorms (95+)
            if (currentPrecipProb && currentPrecipProb.slice(0, 3).some(p => p >= 50)) return true; // >=50% rain probability in next 3 hours
            return false;
        }
        
        async function checkLightning() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const mock = urlParams.get('mock');
                
                // If there's no active strike, and no stormy weather, don't query API
                if (!activeLightningStrike && !isLightningConditionsMet() && mock !== 'lightning') {
                    return; 
                }
                
                if (mock === 'lightning') {
                    if (!activeLightningStrike) {
                        activeLightningStrike = new Date(Date.now() - (5 * 60000)); // 5 mins ago
                        lightningDistance = 4.2;
                    }
                } else {
                    const apiBase = siteConfig.vercel_api_url || '';
                    const lat = siteConfig.latitude || 41.6045;
                    const lon = siteConfig.longitude || -87.1311;
                    const fetchRes = await fetch(`${apiBase}/api/lightning?lat=${lat}&lon=${lon}`);
                    const data = await fetchRes.json();
                    
                    if (data && data.success && data.response && data.response.length > 0) {
                        const strike = data.response[0];
                        const strikeTime = new Date(strike.ob.dateTimeISO);
                        
                        if (!activeLightningStrike || strikeTime > activeLightningStrike) {
                            activeLightningStrike = strikeTime;
                            lightningDistance = strike.relativeTo.distanceMI;
                        }
                    }
                }
            } catch (e) { console.log('Lightning API Error:', e); }
        }
        
        // Check API every 2 minutes (Backed by Upstash Redis 2-minute server-side cache)
        setInterval(checkLightning, 120000); 
        setTimeout(checkLightning, 2000);
        
        function updateLightningWidget() {
            const container = document.getElementById('dynamic-alerts-container');
            const existingWidget = document.getElementById('lightning-alert-widget');
            
            if (activeLightningStrike) {
                const now = new Date();
                const msSinceStrike = now - activeLightningStrike;
                const msCooldown = 30 * 60 * 1000; // 30 minutes
                
                if (msSinceStrike >= msCooldown) {
                    activeLightningStrike = null;
                    if (existingWidget) existingWidget.remove();
                    if (hasAllocatedLightningSlot) {
                        activeAlertCount--;
                        hasAllocatedLightningSlot = false;
                        allocateSlots(activeAlertCount);
                    }
                    return;
                }
                
                const msRemaining = msCooldown - msSinceStrike;
                const minLeft = Math.floor(msRemaining / 60000);
                const secLeft = Math.floor((msRemaining % 60000) / 1000);
                const timeStr = `${minLeft.toString().padStart(2, '0')}:${secLeft.toString().padStart(2, '0')}`;
                
                if (!existingWidget) {
                    const lContainer = document.getElementById('lightning-container');
                    if (lContainer) {
                        const div = document.createElement('div');
                        div.id = 'lightning-alert-widget';
                        div.style.background = 'linear-gradient(135deg, rgba(250, 204, 21, 0.15) 0%, rgba(245, 158, 11, 0.45) 100%)';
                        div.style.border = '1px solid rgba(250, 204, 21, 0.5)';
                        div.style.borderLeft = '6px solid #facc15'; // Electric Yellow
                        div.style.padding = '8px 16px';
                        div.style.borderRadius = '12px';
                        div.style.boxShadow = '0 0 20px rgba(250, 204, 21, 0.3), 0 5px 15px rgba(0,0,0,0.3)';
                        div.style.cursor = 'pointer';
                        div.style.transition = 'transform 0.2s';
                        div.style.minWidth = '380px';
                        div.style.marginLeft = '20px';
                        div.onmouseover = () => div.style.transform = 'scale(1.03)';
                        div.onmouseout = () => div.style.transform = 'scale(1)';
                        div.onclick = () => window.open(`https://www.lightningmaps.org/?lang=en#y=${siteConfig.latitude};x=${siteConfig.longitude};z=10;`, '_blank');
                        
                        lContainer.appendChild(div);
                    }
                }
                
                const widget = document.getElementById('lightning-alert-widget');
                if (widget) {
                    widget.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <h3 style="margin: 0; color: #facc15; font-size: clamp(0.9rem, 1vw, 1.1rem); text-shadow: 0 0 10px rgba(250, 204, 21, 0.5); display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 1.2rem; animation: pulse-lightning 2s infinite;">⚡</span> LIGHTNING DETECTED
                                </h3>
                                <span style="color: var(--text-secondary); font-size: clamp(0.7rem, 0.8vw, 0.85rem); margin-top: 2px;">Lightning strike ${lightningDistance.toFixed(1)} miles away</span>
                            </div>
                            <div style="display: flex; flex-direction: column; justify-content: center; min-width: 100px;">
                                <span style="color: rgba(255,255,255,0.7); font-size: clamp(0.55rem, 0.6vw, 0.7rem); text-transform: uppercase; letter-spacing: 0.05em; text-align: right; display: block; width: 100%;">All-Clear Timer</span>
                                <span style="color: #ffffff; font-weight: 800; font-size: clamp(1.2rem, 1.5vw, 1.5rem); font-family: 'Outfit', sans-serif; text-shadow: 0 0 15px rgba(255,255,255,0.4); text-align: right; display: block; width: 100%; font-variant-numeric: tabular-nums;">${timeStr}</span>
                            </div>
                        </div>
                    `;
                }
            }
        }
