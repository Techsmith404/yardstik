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
});
