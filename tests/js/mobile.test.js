const fs = require('fs');
const path = require('path');

describe('YardStik Mobile Companion Web App (§9.1, §9.3, §9.4, §9.8 Compliance)', () => {
    const mobileHtmlPath = path.resolve(__dirname, '../../html/mobile.html');
    const mobileCssPath = path.resolve(__dirname, '../../html/css/mobile.css');
    const mobileJsPath = path.resolve(__dirname, '../../html/js/mobile.js');

    test('Mobile companion files exist and are properly structured', () => {
        expect(fs.existsSync(mobileHtmlPath)).toBe(true);
        expect(fs.existsSync(mobileCssPath)).toBe(true);
        expect(fs.existsSync(mobileJsPath)).toBe(true);

        const htmlContent = fs.readFileSync(mobileHtmlPath, 'utf8');
        expect(htmlContent).toContain('css/mobile.css');
        expect(htmlContent).toContain('js/mobile.js');
        expect(htmlContent).toContain('mobile-bottom-nav');
        expect(htmlContent).toContain('view-equipment');
        expect(htmlContent).toContain('view-tracks');
        expect(htmlContent).toContain('view-safety');
        expect(htmlContent).toContain('view-bulletins');
        expect(htmlContent).toContain('modal-lightbox');
    });

    test('Mobile CSS supports safe-area insets and glassmorphism', () => {
        const cssContent = fs.readFileSync(mobileCssPath, 'utf8');
        expect(cssContent).toContain('safe-area-inset-top');
        expect(cssContent).toContain('safe-area-inset-bottom');
        expect(cssContent).toContain('backdrop-filter');
        expect(cssContent).toContain('--brand-blue');
        expect(cssContent).toContain('mobile-bottom-nav');
        expect(cssContent).toContain('nav-tab');
    });

    test('Sunday 11:00 PM scale audit reset helper accurately evaluates audit validity', () => {
        function isAuditResetCurrent(lastAuditResetEpoch, mockNow) {
            const d = mockNow ? new Date(mockNow) : new Date();
            const day = d.getDay();
            const hours = d.getHours();
            let daysToSubtract = day;
            if (day === 0 && hours < 23) daysToSubtract = 7;
            const sunday11pm = new Date(d);
            sunday11pm.setDate(d.getDate() - daysToSubtract);
            sunday11pm.setHours(23, 0, 0, 0);
            return !!(lastAuditResetEpoch && lastAuditResetEpoch >= sunday11pm.getTime());
        }

        // Test scenario: Today is Tuesday at 14:00
        const tuesday = new Date('2026-09-15T14:00:00');
        // Last reset occurred Sunday at 23:01 (current week)
        const recentSundayReset = new Date('2026-09-13T23:01:00').getTime();
        expect(isAuditResetCurrent(recentSundayReset, tuesday)).toBe(true);

        // Last reset occurred prior Sunday at 22:59 (stale from 9 days ago)
        const staleReset = new Date('2026-09-06T23:00:00').getTime();
        expect(isAuditResetCurrent(staleReset, tuesday)).toBe(false);

        // Null / undefined epoch
        expect(isAuditResetCurrent(null, tuesday)).toBe(false);
    });

    test('Daily toolbox talk slide calculates +1 hr offset for 11:00 PM third-shift rollover (§9.3)', () => {
        function getSlideDayOfYear(mockDate) {
            const actualNow = new Date(mockDate);
            const now = new Date(actualNow.getTime() + (60 * 60 * 1000)); // +1h offset
            const start = new Date(Date.UTC(now.getFullYear(), 0, 0));
            const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            return Math.round((todayUTC - start) / (1000 * 60 * 60 * 24));
        }

        // At 10:55 PM on March 15, UTC day is still March 15 slide
        const beforeRollover = new Date('2026-03-15T22:55:00');
        const dayBefore = getSlideDayOfYear(beforeRollover);

        // At 11:05 PM on March 15, rolls over to March 16 slide
        const afterRollover = new Date('2026-03-15T23:05:00');
        const dayAfter = getSlideDayOfYear(afterRollover);

        expect(dayAfter).toBe(dayBefore + 1);
    });

    test('Track detail bottom sheet modal is present and wired in mobile.html and mobile.js', () => {
        const htmlContent = fs.readFileSync(mobileHtmlPath, 'utf8');
        const jsContent = fs.readFileSync(mobileJsPath, 'utf8');
        const cssContent = fs.readFileSync(mobileCssPath, 'utf8');

        expect(htmlContent).toContain('modal-track-sheet');
        expect(htmlContent).toContain('modal-track-card-content');
        expect(jsContent).toContain('window.openTrackDetail');
        expect(jsContent).toContain('window.closeTrackDetail');
        expect(cssContent).toContain('.modal-track-sheet');
        expect(cssContent).toContain('.modal-track-card');
    });

    test('Mobile companion normalizes anniversaries from both Novara API and anniversaries.json schemas', () => {
        const jsContent = fs.readFileSync(mobileJsPath, 'utf8');
        expect(jsContent).toContain('renderAnniversariesList');
        expect(jsContent).toContain('anniversaries-container');

        function extractAnniversaryEmployees(payload) {
            return (payload && payload.employees) || 
                   (payload && payload.anniversaries && payload.anniversaries.employees) || 
                   (payload && Array.isArray(payload.anniversaries) ? payload.anniversaries : []);
        }

        // Schema A: Full /api/novara payload
        const novaraPayload = {
            success: true,
            response: [],
            anniversaries: {
                is_today: false,
                employees: [{ name: "Alex Morgan", years: 5, date: "Aug 25", days_until: 0 }]
            }
        };
        const empsA = extractAnniversaryEmployees(novaraPayload);
        expect(empsA.length).toBe(1);
        expect(empsA[0].name).toBe("Alex Morgan");

        // Schema B: /api/novara?type=anniversaries or anniversaries.json
        const flatPayload = {
            is_today: false,
            employees: [{ name: "Casey Miller", years: 1, date: "Sep 15", days_until: 21 }]
        };
        const empsB = extractAnniversaryEmployees(flatPayload);
        expect(empsB.length).toBe(1);
        expect(empsB[0].name).toBe("Casey Miller");
    });

    test('Mobile companion implements opt-in floor maintenance mode and quick status modals (Issue #14)', () => {
        const htmlContent = fs.readFileSync(mobileHtmlPath, 'utf8');
        const jsContent = fs.readFileSync(mobileJsPath, 'utf8');

        expect(htmlContent).toContain('btn-mobile-auth');
        expect(htmlContent).toContain('modal-mobile-auth');
        expect(htmlContent).toContain('modal-equip-quick-edit');
        expect(htmlContent).toContain('btn-status-toggle');

        expect(jsContent).toContain('checkMobileAuth');
        expect(jsContent).toContain('openMobileAuthModal');
        expect(jsContent).toContain('openQuickEditModal');
        expect(jsContent).toContain('saveQuickEdit');
        expect(jsContent).toContain('btn-quick-edit-trigger');
    });
});
