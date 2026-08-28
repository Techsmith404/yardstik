// Lightning Strike Detection & All-Clear Countdown Engine Module
import { siteConfig } from './config.js';
import { activeAlertCount, currentWeatherCode, currentPrecipProb, allocateSlots } from './weather.js';
import { cachedFeatures } from './features.js';

export let activeLightningStrike = null;
export let lightningDistance = null;
export let hasAllocatedLightningSlot = false;

export function isLightningConditionsMet() {
    // Only poll lightning API if storm conditions, NWS alerts, or heavy rain are present
    if (activeAlertCount > 0) return true; // NWS warnings active (Storms, Floods, etc)
    if (currentWeatherCode >= 60) return true; // Rain (61+), Showers (80+), Thunderstorms (95+)
    if (currentPrecipProb && currentPrecipProb.slice(0, 3).some(p => p >= 50)) return true; // >=50% rain probability in next 3 hours
    return false;
}

export async function checkLightning() {
    if (cachedFeatures.features?.lightning_radar === false) {
        return;
    }
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
            const apiBase = (siteConfig.vercel_api_url || '').replace(/\/+$/, '');
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

export function updateLightningWidget() {
    const existingWidget = document.getElementById('lightning-alert-widget');
    
    if (cachedFeatures.features?.lightning_radar === false) {
        if (existingWidget) existingWidget.remove();
        activeLightningStrike = null;
        if (hasAllocatedLightningSlot) {
            hasAllocatedLightningSlot = false;
            allocateSlots(activeAlertCount);
        }
        return;
    }
    
    if (activeLightningStrike) {
        const now = new Date();
        const msSinceStrike = now - activeLightningStrike;
        const msCooldown = 30 * 60 * 1000; // 30 minutes
        
        if (msSinceStrike >= msCooldown) {
            activeLightningStrike = null;
            if (existingWidget) existingWidget.remove();
            if (hasAllocatedLightningSlot) {
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
                hasAllocatedLightningSlot = true;
                allocateSlots(activeAlertCount);
            }
        }
        
        const widget = document.getElementById('lightning-alert-widget');
        if (widget && lightningDistance !== null) {
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
