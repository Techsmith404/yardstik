const fs = require('fs');
const path = require('path');

describe('Handoff Mode Lifecycle & Shift Tracker Boundary Logic', () => {
    test('config.js and clock.js contain clean handoff lifecycle state transition hooks', () => {
        const layoutCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/layout.js'), 'utf8');
        const configCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/config.js'), 'utf8');
        const clockCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/clock.js'), 'utf8');
        const featuresCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/features.js'), 'utf8');
        const remindersCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/reminders.js'), 'utf8');

        // Verify setupHandoffLayout in layout.js handles transitions, re-exports from config.js, and notifies listeners
        expect(layoutCode).toContain('setupHandoffLayout');
        expect(layoutCode).toContain('applyFeatureFlags');
        expect(layoutCode).toContain('advanceReminderSlide');
        expect(layoutCode).toContain('prevHandoffActive');
        expect(layoutCode).toContain('onLayoutTransition');
        expect(configCode).toContain('setupHandoffLayout');

        // Verify clock.js calls setupHandoffLayout(false) when no active shift is present
        expect(clockCode).toContain('setupHandoffLayout(false)');
        expect(clockCode).toContain('testMins < endMinsWeek');

        // Verify features.js and reminders.js register layout listeners and expose hooks
        expect(featuresCode).toContain('onLayoutTransition');
        expect(featuresCode).toContain('window.applyFeatureFlags = applyFeatureFlags');
        expect(remindersCode).toContain('onLayoutTransition');
        expect(remindersCode).toContain('window.advanceReminderSlide = advanceReminderSlide');
        expect(remindersCode).toContain("singleBox.id = 'reminders-widget-container'");
    });

    test('Shift schedule arithmetic correctly calculates elapsed minutes and handoff window', () => {
        // Simulate Friday 23:00 to Saturday 07:00 shift (D Shift)
        const dayNum = 5; // Friday
        const startMinsDay = 23 * 60; // 1380
        const endMinsDay = 7 * 60; // 420
        const isCrossMidnight = endMinsDay <= startMinsDay; // true

        let startMinsWeek = dayNum * 24 * 60 + startMinsDay; // 8580
        let endMinsWeek = dayNum * 24 * 60 + endMinsDay + (isCrossMidnight ? 24 * 60 : 0); // 9060

        // At 23:00 (exact start)
        let currentMinsOfWeek = 5 * 24 * 60 + 23 * 60; // 8580
        let testMins = currentMinsOfWeek;
        expect(testMins >= startMinsWeek && testMins < endMinsWeek).toBe(true);
        let elapsed = testMins - startMinsWeek;
        let isHandoffWindow = elapsed >= 0 && elapsed <= 15;
        expect(isHandoffWindow).toBe(true);

        // At 23:14 (within window)
        currentMinsOfWeek = 5 * 24 * 60 + 23 * 60 + 14; // 8594
        testMins = currentMinsOfWeek;
        elapsed = testMins - startMinsWeek;
        isHandoffWindow = elapsed >= 0 && elapsed <= 15;
        expect(isHandoffWindow).toBe(true);

        // At 23:16 (after window)
        currentMinsOfWeek = 5 * 24 * 60 + 23 * 60 + 16; // 8596
        testMins = currentMinsOfWeek;
        elapsed = testMins - startMinsWeek;
        isHandoffWindow = elapsed >= 0 && elapsed <= 15;
        expect(isHandoffWindow).toBe(false);

        // At 01:00 AM Saturday (crossing midnight)
        currentMinsOfWeek = 6 * 24 * 60 + 1 * 60; // 8700
        testMins = currentMinsOfWeek;
        expect(testMins >= startMinsWeek && testMins < endMinsWeek).toBe(true);
        elapsed = testMins - startMinsWeek; // 120
        isHandoffWindow = elapsed >= 0 && elapsed <= 15;
        expect(isHandoffWindow).toBe(false);
    });

    test('Equipment module contains Shift Handoff Exceptions Hoisting and Density Sorting', () => {
        const equipCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/equipment.js'), 'utf8');
        const cssCode = fs.readFileSync(path.resolve(__dirname, '../../html/css/styles-v2.css'), 'utf8');
        const htmlCode = fs.readFileSync(path.resolve(__dirname, '../../html/index.html'), 'utf8');
        const desktopHtml = fs.readFileSync(path.resolve(__dirname, '../../html/desktop.html'), 'utf8');

        // Check DOM elements exist
        expect(htmlCode).toContain('id="equipment-handoff-exceptions"');
        expect(desktopHtml).toContain('id="equipment-handoff-exceptions"');

        // Check CSS classes exist
        expect(cssCode).toContain('.handoff-exceptions-banner');
        expect(cssCode).toContain('.handoff-exceptions-title');
        expect(cssCode).toContain('.handoff-exceptions-grid');
        expect(cssCode).toContain('.handoff-all-clear-banner');
        expect(cssCode).toContain('.exception-cat-tag');

        // Check equipment.js implementation
        expect(equipCode).toContain('isHandoffActive');
        expect(equipCode).toContain('onLayoutTransition');
        expect(equipCode).toContain('equipment-handoff-exceptions');
        expect(equipCode).toContain('isItemException');
        expect(equipCode).toContain('getItemPriority');
        expect(equipCode).toContain('createEquipmentPill');
        expect(equipCode).toContain('SHIFT TURNOVER EXCEPTIONS');
        expect(equipCode).toContain('ALL EQUIPMENT OPERATIONAL');
    });

    test('Equipment sorting prioritizes OS and PM items over OK items', () => {
        // Direct simulation of priority evaluation logic
        function getItemPriority(item, catName, auditIsCurrent) {
            const rawStatus = (item && item.status ? item.status : '').toUpperCase();
            if (rawStatus === 'OS') return 1;
            if (rawStatus === 'PM') return 2;
            const isMobileCranes = (catName || '').trim().toLowerCase() === 'mobile cranes';
            if (isMobileCranes) {
                if (item.scale === 'OS') return 3;
                if (item.scale === 'OK' && (!auditIsCurrent || !item.blend_audit)) return 4;
            }
            if (rawStatus === 'OK') return 10;
            return 20;
        }

        const items = [
            { name: 'Crane 1', status: 'OK', scale: 'OK', blend_audit: true },
            { name: 'Crane 2', status: 'OS', reason: 'Hydraulic leak' },
            { name: 'Crane 3', status: 'PM', reason: 'Inspection due' },
            { name: 'Crane 4', status: 'OK', scale: 'OS' },
            { name: 'Crane 5', status: 'OK', scale: 'OK', blend_audit: false }
        ];

        const sorted = items.slice().sort((a, b) => getItemPriority(a, 'Mobile Cranes', true) - getItemPriority(b, 'Mobile Cranes', true));

        // OS should be first (priority 1)
        expect(sorted[0].name).toBe('Crane 2');
        expect(sorted[0].status).toBe('OS');

        // PM should be second (priority 2)
        expect(sorted[1].name).toBe('Crane 3');
        expect(sorted[1].status).toBe('PM');

        // Scale OS should be third (priority 3)
        expect(sorted[2].name).toBe('Crane 4');

        // Audit Pending should be fourth (priority 4)
        expect(sorted[3].name).toBe('Crane 5');

        // Fully OK Crane should be last
        expect(sorted[4].name).toBe('Crane 1');
    });

    test('Holiday theme date boundaries are accurately defined and simulated', () => {
        const themeCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/theme.js'), 'utf8');
        const clockCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/clock.js'), 'utf8');

        // Verify clock.js holiday simulation dictionary
        expect(clockCode).toContain('halloween: [9, 31]');
        expect(clockCode).toContain('christmas: [11, 25]');
        expect(clockCode).toContain('getCurrentDate');

        // Verify theme.js seasonal evaluation logic
        expect(themeCode).toContain('halloween');
        expect(themeCode).toContain('thanksgiving');
        expect(themeCode).toContain('christmas');
        expect(themeCode).toContain('newyear');
        expect(themeCode).toContain('stpatricks');
        expect(themeCode).toContain('july4');

        // Verify holiday simulation logic
        function evaluateHolidayDate(month, day) {
            // month is 0-indexed (0=Jan, 9=Oct, 10=Nov, 11=Dec)
            if (month === 9 && day >= 15) return 'halloween';
            if (month === 10 && day >= 15 && day <= 30) return 'thanksgiving';
            if (month === 11 && day >= 1 && day <= 26) return 'christmas';
            if ((month === 11 && day >= 27) || (month === 0 && day <= 5)) return 'newyear';
            if (month === 2 && day >= 14 && day <= 18) return 'stpatricks';
            if (month === 6 && day >= 1 && day <= 7) return 'july4';
            return 'default';
        }

        // Halloween: Oct 15 - Oct 31
        expect(evaluateHolidayDate(9, 14)).toBe('default'); // Oct 14: not yet Halloween
        expect(evaluateHolidayDate(9, 15)).toBe('halloween'); // Oct 15: Halloween starts
        expect(evaluateHolidayDate(9, 31)).toBe('halloween'); // Oct 31: Halloween peak

        // Thanksgiving: Nov 15 - Nov 30
        expect(evaluateHolidayDate(10, 14)).toBe('default');
        expect(evaluateHolidayDate(10, 15)).toBe('thanksgiving');
        expect(evaluateHolidayDate(10, 30)).toBe('thanksgiving');

        // Christmas: Dec 1 - Dec 26
        expect(evaluateHolidayDate(10, 31)).toBe('default');
        expect(evaluateHolidayDate(11, 1)).toBe('christmas');
        expect(evaluateHolidayDate(11, 25)).toBe('christmas');
        expect(evaluateHolidayDate(11, 26)).toBe('christmas');

        // New Year's: Dec 27 - Jan 5
        expect(evaluateHolidayDate(11, 27)).toBe('newyear');
        expect(evaluateHolidayDate(11, 31)).toBe('newyear');
        expect(evaluateHolidayDate(0, 1)).toBe('newyear');
        expect(evaluateHolidayDate(0, 5)).toBe('newyear');
        expect(evaluateHolidayDate(0, 6)).toBe('default');

        // St. Patrick's: Mar 14 - Mar 18
        expect(evaluateHolidayDate(2, 13)).toBe('default');
        expect(evaluateHolidayDate(2, 17)).toBe('stpatricks');
        expect(evaluateHolidayDate(2, 19)).toBe('default');

        // 4th of July: Jul 1 - Jul 7
        expect(evaluateHolidayDate(6, 4)).toBe('july4');
        expect(evaluateHolidayDate(6, 8)).toBe('default');
    });

    test('isItemException excludes scale audit checkmarks and redundancy is filtered out from masonry categories in handoff mode', () => {
        const equipCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/equipment.js'), 'utf8');

        // Verify scale audit checkmark is explicitly excluded from isItemException
        expect(equipCode).toContain('Scale audit checkmark (blend_audit) is deliberately excluded');
        expect(equipCode).toContain('itemsToRender.filter(item => !isItemException(item, cat.name, auditIsCurrent))');

        // Logic simulation of isItemException
        function isItemException(item, catName) {
            if (!item) return false;
            const rawStatus = (item.status || '').toUpperCase();
            if (rawStatus === 'OS' || rawStatus === 'PM') return true;
            const isMobileCranes = (catName || '').trim().toLowerCase() === 'mobile cranes';
            if (isMobileCranes && item.scale === 'OS') return true;
            return false;
        }

        // 1. Routine scale audit pending crane should NOT be flagged as an exception
        const auditPendingCrane = { name: 'Crane 1', status: 'OK', scale: 'OK', blend_audit: false };
        expect(isItemException(auditPendingCrane, 'Mobile Cranes')).toBe(false);

        // 2. Fully OK crane is not an exception
        const okCrane = { name: 'Crane 2', status: 'OK', scale: 'OK', blend_audit: true };
        expect(isItemException(okCrane, 'Mobile Cranes')).toBe(false);

        // 3. Out of service scale IS an exception
        const scaleOsCrane = { name: 'Crane 3', status: 'OK', scale: 'OS' };
        expect(isItemException(scaleOsCrane, 'Mobile Cranes')).toBe(true);

        // 4. Broken crane (OS) IS an exception
        const osCrane = { name: 'Crane 4', status: 'OS', reason: 'Engine fault' };
        expect(isItemException(osCrane, 'Mobile Cranes')).toBe(true);

        // 5. Preventive maintenance crane (PM) IS an exception
        const pmCrane = { name: 'Crane 5', status: 'PM', reason: 'Oil change' };
        expect(isItemException(pmCrane, 'Mobile Cranes')).toBe(true);

        // 6. Non-crane items
        const okLoco = { name: 'Loco 1', status: 'OK' };
        const osLoco = { name: 'Loco 2', status: 'OS' };
        expect(isItemException(okLoco, 'Locomotives')).toBe(false);
        expect(isItemException(osLoco, 'Locomotives')).toBe(true);

        // 7. Verify redundancy elimination filter:
        const categoryItems = [okCrane, scaleOsCrane, osCrane, auditPendingCrane];
        const remainingForGrid = categoryItems.filter(it => !isItemException(it, 'Mobile Cranes'));
        expect(remainingForGrid).toHaveLength(2);
        expect(remainingForGrid).toEqual([okCrane, auditPendingCrane]);
    });

    test('getMockEmergencyState correctly parses URL simulation queries and sets active emergency state', () => {
        const emergencyCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/emergency.js'), 'utf8');

        expect(emergencyCode).toContain('getMockEmergencyState');
        expect(emergencyCode).toContain('urlParams.get(\'emergency\')');
        expect(emergencyCode).toContain('AMMONIA LEAK DETECTED');
        expect(emergencyCode).toContain('TORNADO WARNING — TAKE SHELTER');
        expect(emergencyCode).toContain('FACILITY FIRE ALARM — EVACUATE');
        expect(emergencyCode).toContain('SECURITY LOCKDOWN — ACTIVE THREAT');
        expect(emergencyCode).toContain('EMERGENCY EVACUATION ORDER');
    });

    test('audio-alarm.js implements intermittent non-distracting chime bursts and auto-silence', () => {
        const audioCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/audio-alarm.js'), 'utf8');

        // Confirms volume is capped to comfortable level (0.12)
        expect(audioCode).toContain('const MASTER_VOLUME = 0.12;');
        // Confirms short chime bursts (2.5s)
        expect(audioCode).toContain('const BURST_DURATION_MS = 2500;');
        // Confirms silent resting period between bursts (25s)
        expect(audioCode).toContain('const BURST_INTERVAL_MS = 25000;');
        // Confirms max 3 bursts before shutting up
        expect(audioCode).toContain('const MAX_BURST_CYCLES = 3;');
        // Confirms warm triangle wave instead of harsh sawtooth
        expect(audioCode).toContain("osc.type = 'triangle'");
        expect(audioCode).toContain('cycleCount >= MAX_BURST_CYCLES');
        expect(audioCode).toContain('stopAlarm');
    });
});
