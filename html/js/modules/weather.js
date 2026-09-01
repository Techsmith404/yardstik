// Advanced Weather Matrix & Dynamic Slot Allocator Module
import { siteConfig } from './config.js';
import { cachedShifts, fetchShifts, updateShiftTracker } from './clock.js';
import { startWeatherAnimation } from './fx.js';
import { hasAllocatedLightningSlot } from './lightning.js';
import { cachedFeatures } from './features.js';

export let activeAlertCount = 0;
export let currentWeatherCode = 0;
export let currentPrecipProb = [];

export function allocateSlots(alertCount) {
    let slots = 4 - alertCount;
    if (hasAllocatedLightningSlot) {
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

    const isOshaEnabled = cachedFeatures.features?.osha_counter !== false;
    const isBlendEnabled = cachedFeatures.features?.production_tracker !== false;
    const isShiftEnabled = cachedFeatures.features?.shift_tracker !== false;

    if (oshaWidget && headerOsha) {
        if (!isOshaEnabled) {
            oshaWidget.style.display = 'none';
            headerOsha.style.display = 'none';
        } else if (slots >= 1) {
            oshaWidget.style.display = 'flex';
            headerOsha.style.display = 'none';
            slots--;
        } else {
            oshaWidget.style.display = 'none';
            headerOsha.style.display = 'flex';
        }
    }

    if (blendWidget && headerBlend) {
        if (!isBlendEnabled) {
            blendWidget.style.display = 'none';
            headerBlend.style.display = 'none';
        } else if (slots >= 1) {
            blendWidget.style.display = 'flex';
            headerBlend.style.display = 'none';
            slots--;
        } else {
            blendWidget.style.display = 'none';
            headerBlend.style.display = 'flex';
        }
    }

    let showDaylight = false;
    let showShift = false;
    
    if (slots >= 1) {
        if (slots === 1 && alertCount === 2 && hasAllocatedLightningSlot) {
            if (isShiftEnabled) { showShift = true; slots--; }
            else { showDaylight = true; slots--; }
        } else {
            showDaylight = true;
            slots--;
        }
    }
    
    if (slots >= 1 && !showShift && isShiftEnabled) {
        showShift = true;
        slots--;
    }

    if (daylightWidget) daylightWidget.style.display = showDaylight ? 'flex' : 'none';
    if (shiftWidget) shiftWidget.style.display = (showShift && isShiftEnabled) ? 'flex' : 'none';

    if (fillerContainer && daylightWidget && shiftWidget) {
        fillerContainer.style.display = (daylightWidget.style.display !== 'none' || shiftWidget.style.display !== 'none') ? 'flex' : 'none';
    }
}

export function renderDaylightWidget(sunriseArray, sunsetArray) {
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

export async function getWeather() {
    try {
        // Ensure shifts are loaded before weather processes them
        if (!cachedShifts || cachedShifts.length === 0) {
            await fetchShifts();
        }
        updateShiftTracker();

        const lat = siteConfig.latitude || 41.600;
        const lon = siteConfig.longitude || -87.100;

        // Request current stats + daily precipitation outlook blocks + hourly conditions + apparent temp + precipitation + snowfall + weathercode + sunrise/sunset
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&current=temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m&hourly=precipitation_probability,windspeed_10m,apparent_temperature,precipitation,snowfall,weathercode&daily=weathercode,sunrise,sunset,precipitation_sum,snowfall_sum&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto&t=` + new Date().getTime();
        const res = await fetch(url);
        const data = await res.json();
        
        let currentTemp = Math.round(data.current_weather ? data.current_weather.temperature : (data.current ? data.current.temperature_2m : 70));
        let currentWind = Math.round(data.current_weather ? data.current_weather.windspeed : (data.current ? data.current.wind_speed_10m : 0));
        let weatherCode = data.current_weather ? data.current_weather.weathercode : (data.current ? data.current.weather_code : 0);
        
        const currentHourIdx = new Date().getHours();
        let apparentTemp = Math.round(data.hourly.apparent_temperature[currentHourIdx]);
        let precipProb = data.hourly.precipitation_probability.slice(currentHourIdx, currentHourIdx + 12);
        let precipAmount = data.hourly.precipitation.slice(currentHourIdx, currentHourIdx + 12);
        let snowAmount = data.hourly.snowfall.slice(currentHourIdx, currentHourIdx + 12);
        let hourlyWeatherCodes = data.hourly.weathercode ? data.hourly.weathercode.slice(currentHourIdx, currentHourIdx + 12) : [];
        
        // If current hour has an active precipitation/storm WMO code, prioritize it over a generic overcast/cloudy code
        if (hourlyWeatherCodes.length > 0) {
            const curCode = hourlyWeatherCodes[0];
            const isPrecipOrStorm = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(curCode);
            if (isPrecipOrStorm && ![95, 96, 99].includes(weatherCode)) {
                weatherCode = curCode;
            }
        }
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
        if (alertsContainer) alertsContainer.innerHTML = '';
        let weatherAlertCount = 0;
        
        function addAlert(title, value, subtext, color) {
            if (!alertsContainer) return;
            weatherAlertCount++;
            const isHighAlert = (value === 'WARNING' || value === 'EMERGENCY');
            let animStyle = '';
            if (value === 'EMERGENCY') animStyle = `animation: pulse-border-glow 2s infinite alternate; box-shadow: 0 0 20px ${color};`;
            else if (value === 'WARNING') animStyle = `animation: pulse-border-glow 1.5s infinite alternate ease-in-out; box-shadow: 0 0 15px ${color};`;
            
            alertsContainer.innerHTML += `
            <div class="widget weather-alert-interactive" style="border: 1px solid ${color}; border-left: 6px solid ${color}; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 25px; border-radius: 20px; background: linear-gradient(145deg, rgba(20,25,30,0.85) 0%, rgba(5,10,15,0.95) 100%); box-shadow: 0 15px 35px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -10px 20px rgba(0,0,0,0.4); cursor: pointer; transition: transform 0.2s; ${animStyle}" onclick="window.open('https://zoom.earth/maps/radar/#view=${lat},${lon},8z', '_blank')" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
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
            const codeAtHour = hourlyWeatherCodes[i] || 0;
            const isRainCode = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(codeAtHour);
            const isSnowCode = [71, 73, 75, 77, 85, 86].includes(codeAtHour);
            const hasPrecipAmt = (precipAmount[i] >= 0.003 || snowAmount[i] > 0);
            const hasPrecipProb = (precipProb[i] >= 15 && (precipAmount[i] > 0 || snowAmount[i] > 0));
            const highProb = (precipProb[i] >= 35);
            
            if (hasPrecipAmt || hasPrecipProb || highProb || isRainCode || isSnowCode) {
                if (precipStartIdx === -1) precipStartIdx = i;
                if (snowAmount[i] > 0 || isSnowCode) isSnow = true;
                
                let amt = (snowAmount[i] > 0 ? snowAmount[i] : precipAmount[i]) || (isRainCode ? 0.01 : 0);
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
                timeSubtext = `Active Now | Ends: ${endStr}`;
            }
            
            if (isSnow) {
                addAlert('Snow Forecast', precipFormatted, timeSubtext, '#ffffff');
            } else if ([95, 96, 99].includes(weatherCode)) {
                addAlert('Thunderstorms', precipFormatted, timeSubtext, '#ffcc00');
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
            const nwsRes = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { cache: 'no-store' });
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
        activeAlertCount = weatherAlertCount + (hasAllocatedLightningSlot ? 1 : 0);
        allocateSlots(activeAlertCount);

        // Call the daylight rendering engine with the fetched sunrise/sunset times
        renderDaylightWidget(data.daily.sunrise, data.daily.sunset);

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
            else if (severityAlert.includes('STORM') || [95, 96, 99].includes(weatherCode)) activeAnim = 'storm';
            else if (severityAlert.includes('WINTER') || severityAlert.includes('BLIZZARD') || [71, 73, 75, 77, 85, 86].includes(weatherCode)) activeAnim = 'snow';
            else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode) || (precipStartIdx === 0 && !isSnow)) activeAnim = 'rain';
            else if (precipStartIdx !== -1) activeAnim = isSnow ? 'snow' : 'rain';
        }
        
        startWeatherAnimation(activeAnim);

        // Render dynamic text output block for main header
        const weatherDisp = document.getElementById('weather-display');
        if (weatherDisp) {
            let conditionText = 'No precipitation forecast.';
            if ([95, 96, 99].includes(weatherCode)) {
                conditionText = '⚡ Thunderstorms in area.';
            } else if (precipStartIdx === 0) {
                conditionText = isSnow ? '❄️ Snowing now.' : '🌧️ Raining now.';
            } else if (precipStartIdx !== -1) {
                conditionText = isSnow ? 'Snow expected today.' : 'Rain expected today.';
            }
            
            weatherDisp.innerHTML = `
                <span style="font-weight: bold; font-size: 1.1rem; color: var(--neon-amber);">${severityAlert}</span>
                <span style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">${currentTemp}°F</span> <span style="color: var(--text-secondary); font-size: 0.9rem; margin-left: 5px;">| Wind: ${currentWind} mph</span><br>
                <span style="color: var(--text-muted); font-size: 0.85rem;">${conditionText}</span>
            `;
        }
    } catch (e) { 
        console.log("Weather API Offline:", e);
        const weatherDisp = document.getElementById('weather-display');
        if (weatherDisp) {
            weatherDisp.innerHTML = `
                <span style="font-weight: bold; font-size: 1.1rem; color: #ff0033;">⚠️ WEATHER OFFLINE ⚠️</span><br>
                <span style="color: var(--text-muted); font-size: 0.85rem;">System will automatically reconnect.</span>
            `;
        }
        const alertsContainer = document.getElementById('dynamic-alerts-container');
        if (alertsContainer) alertsContainer.innerHTML = '';
        
        startWeatherAnimation('none');
        
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
            
            const hOsha = document.getElementById('header-osha');
            const hBlend = document.getElementById('header-blend');
            if (hOsha) hOsha.style.display = 'none';
            if (hBlend) hBlend.style.display = 'none';
        } catch(err) {}

        // If it fails (like when booting before the network connects), retry in 30 seconds
        setTimeout(getWeather, 30000);
    }
}
