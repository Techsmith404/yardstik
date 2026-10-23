// 🏛️ YardStik: Synthesized Offline HTML5 Web Audio Alarm Chime
// SSoT §9.1: Zero regex lookbehinds, zero top-level await
// Uses 100% native Web Audio synthesis — zero external audio files required.

let audioCtx = null;
let activeOscillator = null;
let activeGain = null;
let burstIntervalTimer = null;
let cycleCount = 0;
let isAlarmRunning = false;

const MAX_BURST_CYCLES = 3;       // Plays 3 attention bursts then shuts up
const BURST_DURATION_MS = 2500;   // 2.5s gentle chime burst
const BURST_INTERVAL_MS = 25000;  // 25s silent resting period between bursts
const MASTER_VOLUME = 0.12;       // Comfortable, non-piercing volume

function getAudioContext() {
    if (!audioCtx && typeof window !== 'undefined') {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
            audioCtx = new AudioCtxClass();
        }
    }
    return audioCtx;
}

function playSingleBurst() {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    try {
        // Create gain node for this burst with smooth linear ramp
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
        // Gentle ramp up to comfortable volume (0.12) to avoid clicks or blaring
        gainNode.gain.linearRampToValueAtTime(MASTER_VOLUME, ctx.currentTime + 0.08);
        gainNode.connect(ctx.destination);
        activeGain = gainNode;

        // Warm triangle wave: authoritative industrial alert without harsh screeching
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.connect(gainNode);
        osc.start();
        activeOscillator = osc;

        // 2-tone chime cadence (D5 / A5) alternating every 280ms
        let isHigh = false;
        const toneInterval = setInterval(() => {
            if (!activeOscillator || !audioCtx) {
                clearInterval(toneInterval);
                return;
            }
            const now = audioCtx.currentTime;
            const targetFreq = isHigh ? 880.00 : 587.33; // A5 vs D5
            activeOscillator.frequency.cancelScheduledValues(now);
            activeOscillator.frequency.setTargetAtTime(targetFreq, now, 0.03);
            isHigh = !isHigh;
        }, 280);

        // End burst after BURST_DURATION_MS (2.5s) and cleanly fade out
        setTimeout(() => {
            clearInterval(toneInterval);
            if (gainNode && audioCtx) {
                const now = audioCtx.currentTime;
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.15);
            }
            setTimeout(() => {
                if (osc) {
                    try {
                        osc.stop();
                        osc.disconnect();
                    } catch (e) {}
                }
                if (gainNode) {
                    try {
                        gainNode.disconnect();
                    } catch (e) {}
                }
                if (activeOscillator === osc) activeOscillator = null;
                if (activeGain === gainNode) activeGain = null;
            }, 180);
        }, BURST_DURATION_MS);
    } catch (err) {
        console.warn('[AudioAlarm] Error playing chime burst:', err);
    }
}

/**
 * Start the intermittent attention chime sequence.
 * Plays an initial 2.5s chime, then repeats every 25s up to 3 times, then goes completely silent.
 */
export function startAlarm() {
    if (isAlarmRunning) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        // Register gesture listeners to resume if initial autoplay was blocked by browser
        if (typeof window !== 'undefined') {
            const resumeOnGesture = () => {
                if (audioCtx && audioCtx.state === 'suspended' && isAlarmRunning) {
                    audioCtx.resume().then(() => {
                        playSingleBurst();
                    }).catch(() => {});
                }
            };
            window.addEventListener('click', resumeOnGesture, { once: true });
            window.addEventListener('keydown', resumeOnGesture, { once: true });
            window.addEventListener('touchstart', resumeOnGesture, { once: true });
        }
    }

    isAlarmRunning = true;
    cycleCount = 1;

    // 1. Play immediate first attention chime burst
    playSingleBurst();

    // 2. Schedule intermittent reminder bursts every 25s (up to MAX_BURST_CYCLES)
    if (burstIntervalTimer) clearInterval(burstIntervalTimer);
    burstIntervalTimer = setInterval(() => {
        if (!isAlarmRunning) {
            stopAlarm();
            return;
        }
        if (cycleCount >= MAX_BURST_CYCLES) {
            // Reached cycle limit — shut up and go silent!
            if (burstIntervalTimer) {
                clearInterval(burstIntervalTimer);
                burstIntervalTimer = null;
            }
            return;
        }
        cycleCount++;
        playSingleBurst();
    }, BURST_INTERVAL_MS);
}

/**
 * Smoothly stop all alarm chimes, cancel scheduled bursts, and cleanup audio nodes
 */
export function stopAlarm() {
    isAlarmRunning = false;
    cycleCount = 0;

    if (burstIntervalTimer) {
        clearInterval(burstIntervalTimer);
        burstIntervalTimer = null;
    }

    try {
        if (activeGain && audioCtx) {
            const now = audioCtx.currentTime;
            activeGain.gain.cancelScheduledValues(now);
            activeGain.gain.linearRampToValueAtTime(0.0001, now + 0.05);
        }

        setTimeout(() => {
            if (activeOscillator) {
                try {
                    activeOscillator.stop();
                    activeOscillator.disconnect();
                } catch (e) {}
                activeOscillator = null;
            }
            if (activeGain) {
                try {
                    activeGain.disconnect();
                } catch (e) {}
                activeGain = null;
            }
        }, 80);
    } catch (err) {
        console.warn('[AudioAlarm] Error stopping alarm:', err);
    }
}

export function isAlarmActive() {
    return isAlarmRunning;
}

