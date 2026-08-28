// Clock, Shift Tracker & Countdown Engine Module
export let cachedShifts = [];

export async function fetchShifts() {
    try {
        const res = await fetch('assets/data/shifts.json?t=' + new Date().getTime());
        const data = await res.json();
        cachedShifts = data.shifts || [];
    } catch (e) {
        console.warn('Error loading shifts.json:', e);
    }
}

export function updateShiftTracker() {
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
            const sName = document.getElementById('shift-name');
            const sProg = document.getElementById('shift-progress');
            const sText = document.getElementById('shift-text');
            if (sName) sName.innerText = activeShift.name;
            if (sProg) sProg.style.width = shiftProgress + '%';
            if (sText) sText.innerText = timeRemainingStr;
        } else {
            const sName = document.getElementById('shift-name');
            const sProg = document.getElementById('shift-progress');
            const sText = document.getElementById('shift-text');
            if (sName) sName.innerText = "Shift Change";
            if (sProg) sProg.style.width = '0%';
            if (sText) sText.innerText = "Standby...";
            window.globalActiveShiftName = null;
        }
    } catch (e) {}
}

export function updateCountdownTimers() {
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
}

export function startClockLoop(syncCallbacks = []) {
    setInterval(() => {
        const clockEl = document.getElementById('clock');
        if (clockEl) {
            clockEl.innerText = new Date().toLocaleString('en-US', { 
                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
        }
        updateShiftTracker();
        updateCountdownTimers();
        
        syncCallbacks.forEach(cb => {
            if (typeof cb === 'function') cb();
        });
    }, 1000);
}
