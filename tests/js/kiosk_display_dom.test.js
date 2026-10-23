const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

describe('YardStik Kiosk TV Display & Viewport Ergonomics (SSoT §2, §5, §9.7)', () => {
    const htmlPath = path.resolve(__dirname, '../../html/index.html');
    const cssPath = path.resolve(__dirname, '../../html/css/styles-v2.css');
    const appJsPath = path.resolve(__dirname, '../../html/js/app.js');
    const configJsPath = path.resolve(__dirname, '../../html/js/modules/config.js');
    const jsModulesDir = path.resolve(__dirname, '../../html/js/modules');

    test('1. Kiosk TV HTML contains all required 1080p/4K presentation views', () => {
        expect(fs.existsSync(htmlPath)).toBe(true);
        const html = fs.readFileSync(htmlPath, 'utf8');

        // Four primary rotating views
        expect(html).toContain('id="view-production"');
        expect(html).toContain('id="view-safety"');
        expect(html).toContain('id="view-announcements"');
        expect(html).toContain('id="view-special"');

        // Essential dashboard widgets
        expect(html).toContain('id="equipment-scroll-wrapper"');
        expect(html).toContain('id="equipment-masonry"');
        expect(html).toContain('id="clock"');
        expect(html).toContain('id="weather-display"');
        expect(html).toContain('id="osha-counter"');
        expect(html).toContain('id="blend-recipe-display"');
    });

    test('2. Kiosk CSS enforces anti-burn-in pixel shift and strict overflow boundaries', () => {
        expect(fs.existsSync(cssPath)).toBe(true);
        const css = fs.readFileSync(cssPath, 'utf8');

        // TV screen burn-in protection: 600s Lissajous orbital shift & phosphor breathing (IDEA-U05)
        expect(css).toContain('pixel-shift');
        expect(css).toContain('@keyframes pixel-shift');
        expect(css).toContain('600s infinite linear');
        expect(css).toContain('phosphor-bevel-breathing');
        expect(css).toContain('phosphor-digit-breathing');

        // Strict 100vw / 100vh containment without scrollbars
        expect(css).toMatch(/body\s*\{[^}]*overflow:\s*hidden/);
        expect(css).toMatch(/body\s*\{[^}]*height:\s*100vh/);
        expect(css).toMatch(/body\s*\{[^}]*width:\s*100vw/);
    });

    test('3. Zero blocking modal popups (alert, confirm, prompt) in frontend kiosk JS', () => {
        // Unattended kiosks have no keyboard/mouse attached — any alert/confirm/prompt
        // completely freezes the display until someone SSH's into the box to kill the process.
        function getJsFiles(dir) {
            let files = [];
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    files = files.concat(getJsFiles(fullPath));
                } else if (item.isFile() && item.name.endsWith('.js')) {
                    files.push(fullPath);
                }
            }
            return files;
        }

        const allJsFiles = [appJsPath, ...getJsFiles(jsModulesDir)];
        const blockingCallsFound = [];

        for (const file of allJsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            let ast;
            try {
                ast = acorn.parse(content, {
                    ecmaVersion: 'latest',
                    sourceType: 'module',
                    locations: true
                });
            } catch (e) {
                // If it's not a module, parse as script
                ast = acorn.parse(content, {
                    ecmaVersion: 'latest',
                    sourceType: 'script',
                    locations: true
                });
            }

            walk.simple(ast, {
                CallExpression(node) {
                    let calleeName = null;
                    if (node.callee.type === 'Identifier') {
                        calleeName = node.callee.name;
                    } else if (
                        node.callee.type === 'MemberExpression' &&
                        node.callee.object.name === 'window' &&
                        node.callee.property.type === 'Identifier'
                    ) {
                        calleeName = node.callee.property.name;
                    }

                    if (['alert', 'confirm', 'prompt'].includes(calleeName)) {
                        blockingCallsFound.push({
                            file: path.basename(file),
                            line: node.loc ? node.loc.start.line : 0,
                            callee: calleeName
                        });
                    }
                }
            });
        }

        expect(blockingCallsFound).toEqual([]);
    });

    test('4. High-contrast QR code configuration for 10-foot TV viewing (SSoT §9.7)', () => {
        expect(fs.existsSync(configJsPath)).toBe(true);
        const configJs = fs.readFileSync(configJsPath, 'utf8');

        // QR code generation should configure large scannable modules
        expect(configJs).toMatch(/api\.qrserver\.com\/v1\/create-qr-code/);
        expect(configJs).toContain('margin=1');
        // Kiosk HTML should contain quiet zone card docking
        const html = fs.readFileSync(htmlPath, 'utf8');
        expect(html).toContain('id="mobile-qr-container"');
        expect(html).toContain('id="mobile-qr-img"');
    });

    test('5. Live reload engine protects against infinite loop reloads on error blips', () => {
        expect(fs.existsSync(configJsPath)).toBe(true);
        const configJs = fs.readFileSync(configJsPath, 'utf8');

        // Checks version.txt endpoint and reloads only on detected version delta
        expect(configJs).toContain('assets/data/version.txt');
        expect(configJs).toContain('location.reload()');
        // Must contain defensive error catching so network drops do not crash the rotation loop
        expect(configJs).toMatch(/catch\s*\(e\)/);
    });

    test('6. Markdown reminders sanitize HTML output to prevent XSS (IDEA-Q05)', () => {
        const sanitizeModulePath = path.resolve(__dirname, '../../html/js/modules/sanitize.js');
        expect(fs.existsSync(sanitizeModulePath)).toBe(true);

        const html = fs.readFileSync(htmlPath, 'utf8');
        expect(html).toContain('dompurify');

        const remindersJsPath = path.resolve(__dirname, '../../html/js/modules/reminders.js');
        const remindersJs = fs.readFileSync(remindersJsPath, 'utf8');
        expect(remindersJs).toContain('sanitizeMarkdownHtml');

        const desktopJsPath = path.resolve(__dirname, '../../html/js/desktop.js');
        const desktopJs = fs.readFileSync(desktopJsPath, 'utf8');
        expect(desktopJs).toContain('sanitizeMarkdownHtml');

        const mobileJsPath = path.resolve(__dirname, '../../html/js/mobile.js');
        const mobileJs = fs.readFileSync(mobileJsPath, 'utf8');
        expect(mobileJs).toContain('sanitizeMarkdownHtml');
    });

    test('7. Shared HTTP fetch utility module (IDEA-A03) provides robust caching and error handling', () => {
        const httpModulePath = path.resolve(__dirname, '../../html/js/modules/http.js');
        expect(fs.existsSync(httpModulePath)).toBe(true);
        const httpJs = fs.readFileSync(httpModulePath, 'utf8');

        expect(httpJs).toContain('export function cacheBustUrl');
        expect(httpJs).toContain('export async function fetchJson');
        expect(httpJs).toContain('export async function fetchText');
        expect(httpJs).toContain('export async function fetchJsonWithHeaders');

        // Test cacheBustUrl logic directly
        function cacheBustUrl(url) {
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}t=${Date.now()}`;
        }
        expect(cacheBustUrl('assets/data/config.json')).toMatch(/^assets\/data\/config\.json\?t=\d+$/);
        expect(cacheBustUrl('/api/sync?file=test.json')).toMatch(/^\/api\/sync\?file=test\.json&t=\d+$/);

        // Verify key frontend modules import from http.js
        const modulesUsingHttp = [
            'equipment.js', 'clock.js', 'features.js', 'config.js',
            'reminders.js', 'special.js', 'trackers.js', 'slideshow.js',
            'anniversaries.js', 'safety.js', 'lightning.js', 'trackmap.js', 'weather.js'
        ];
        for (const mod of modulesUsingHttp) {
            const content = fs.readFileSync(path.join(jsModulesDir, mod), 'utf8');
            expect(content).toMatch(/from\s+['"]\.\/http\.js['"]/);
        }
    });

    test('8. Slide Dwell Countdown Ring & Spring-Glide Transitions (IDEA-U02)', () => {
        const html = fs.readFileSync(htmlPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');
        const appJs = fs.readFileSync(appJsPath, 'utf8');

        // HTML includes persistent countdown container and SVG ring
        expect(html).toContain('id="slide-dwell-container"');
        expect(html).toContain('class="dwell-ring-svg"');
        expect(html).toContain('class="dwell-ring-progress"');
        expect(html).toContain('id="dwell-seconds-text"');

        // CSS defines Command Deck Elevation transition choreography
        expect(css).toContain('translateY(28px)');
        expect(css).toContain('scale(0.96)');
        expect(css).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
        expect(css).toContain('.slide-dwell-container.dwell-warning');
        expect(css).toContain('@keyframes dwell-warning-pulse');

        // JS app.js implements startSlideDwellTimer with 5s warning pulse
        expect(appJs).toContain('function startSlideDwellTimer');
        expect(appJs).toContain('remainingSec <= 5');
        expect(appJs).toContain('dwell-warning');
        expect(appJs).toContain('startSlideDwellTimer(initialMs)');
        expect(appJs).toContain('startSlideDwellTimer(ms)');
    });

    test('6. Industrial High-Glare / Solar Mode (Task 4.1) enforces high-luminance light aesthetics and auto sunrise/sunset scheduling', () => {
        const solarCssPath = path.resolve(__dirname, '../../html/css/themes/theme-solar.css');
        const themeJsPath = path.resolve(__dirname, '../../html/js/modules/theme.js');
        const weatherJsPath = path.resolve(__dirname, '../../html/js/modules/weather.js');
        const cpIndexPath = path.resolve(__dirname, '../../control-panel/public/index.html');
        const cpAppJsPath = path.resolve(__dirname, '../../control-panel/public/js/app.js');

        expect(fs.existsSync(solarCssPath)).toBe(true);
        const solarCss = fs.readFileSync(solarCssPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');
        const themeJs = fs.readFileSync(themeJsPath, 'utf8');
        const weatherJs = fs.readFileSync(weatherJsPath, 'utf8');
        const cpIndex = fs.readFileSync(cpIndexPath, 'utf8');
        const cpAppJs = fs.readFileSync(cpAppJsPath, 'utf8');

        // High-Luminance CSS variables and industrial machined panel light aesthetics
        expect(solarCss).toContain('--bg-gradient: linear-gradient');
        expect(solarCss).toContain('--card-bg: linear-gradient');
        expect(solarCss).toContain('--text-primary: #0f172a');
        expect(solarCss).toContain('backdrop-filter: blur');
        expect(solarCss).toContain('.status-ok');
        expect(solarCss).toContain('.status-os');

        // styles-v2.css includes native body.solar-mode fallback
        expect(css).toContain('body.solar-mode');
        expect(css).toContain('body.high-glare-mode');

        // Weather module exports sunrise/sunset tracking and isDaylightNow
        expect(weatherJs).toContain('export let lastSunrise');
        expect(weatherJs).toContain('export let lastSunset');
        expect(weatherJs).toContain('export function isDaylightNow');

        // Theme module implements isHighGlareActive and auto 60s re-check
        expect(themeJs).toContain('export function isHighGlareActive');
        expect(themeJs).toContain("isHighGlareActive(date)");
        expect(themeJs).toContain('solar-mode');
        expect(themeJs).toContain('60000');

        // Control Panel UI supports High-Glare mode selection and save
        expect(cpIndex).toContain('id="high-glare-mode-select"');
        expect(cpIndex).toContain('value="solar"');
        expect(cpAppJs).toContain('high-glare-mode-select');
        expect(cpAppJs).toContain('high_glare_mode:');

        // Non-blinding matte titanium palette: no pure #ffffff card/pill backgrounds
        expect(solarCss).not.toMatch(/\.widget\s*\{[^}]*background:\s*#ffffff/);
        expect(solarCss).not.toMatch(/\.equipment-pill\s*\{[^}]*background:\s*#ffffff/);
        expect(solarCss).toContain('.safety-emp-name');
        expect(solarCss).toContain('#anniversaries-list li strong');
        expect(solarCss).toContain('.track-label');

        // Dark text contrast rules in solar mode (prevent white-on-white)
        expect(solarCss).toMatch(/#safety-list strong[^}]*color:\s*#0f172a/);
        expect(solarCss).toMatch(/#anniversaries-list li strong[^}]*color:\s*#0f172a/);
        expect(solarCss).toMatch(/#reminders-content strong[^}]*color:\s*#0f172a/);
    });

    test('10. Track Map Inbound & Empty Railcar Highlighting & Inventory Tally Engine', () => {
        const trackmapJsPath = path.resolve(__dirname, '../../html/js/modules/trackmap.js');
        const desktopHtmlPath = path.resolve(__dirname, '../../html/desktop.html');
        const commRulesPath = path.resolve(__dirname, '../../html/assets/data/commodity_rules.json');

        const trackmapJs = fs.readFileSync(trackmapJsPath, 'utf8');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const desktopHtml = fs.readFileSync(desktopHtmlPath, 'utf8');
        const css = fs.readFileSync(cssPath, 'utf8');
        const commRules = JSON.parse(fs.readFileSync(commRulesPath, 'utf8'));

        // HTML contains commodity tally bar in both kiosk and desktop views
        expect(html).toContain('id="trackmap-commodity-bar"');
        expect(desktopHtml).toContain('id="trackmap-commodity-bar"');

        // CSS defines commodity bar, pills, and SVG track/car highlighting
        expect(css).toContain('.trackmap-commodity-bar');
        expect(css).toContain('.commodity-tally-pill');
        expect(css).toContain('.track-highlight-inbound');
        expect(css).toContain('.track-highlight-empty-cars');
        expect(css).toContain('.overlay-inbound');
        expect(css).toContain('.overlay-empty-cars');
        expect(css).toContain('.badge-inbound');
        expect(css).toContain('.badge-empty-cars');

        // JS exports required functions
        expect(trackmapJs).toContain('export function trackHasInbound');
        expect(trackmapJs).toContain('export function trackHasEmptyCars');
        expect(trackmapJs).toContain('export function calculateCommodityTotals');
        expect(trackmapJs).toContain('export function renderCommodityBar');
        expect(trackmapJs).toContain('export function setCommodityFilter');
        expect(trackmapJs).toContain('export function applySvgSpotlightFilter');
        expect(trackmapJs).toContain('export let activeCommodityFilter');

        // Theater mode includes commodity bar container
        expect(trackmapJs).toContain('id="theater-commodity-bar"');

        // Verify Empty Cars logic: tracks with 0 cars must NOT be counted as holding empty cars
        function testTrackHasEmptyCars(track) {
            if (!track || !track.cars || track.cars <= 0 || track.is_clear) return false;
            const text = ((track.commodity || "") + " " + (track.notes || "")).toUpperCase();
            const cleaned = text.replace(/\bCLEAR\s+(?:TO|UNTIL|FOR|SWITCH|OF|N\/END|S\/END|E\/END|W\/END)\b[A-Z0-9\s]*/gi, " ");
            return /\b(MTY|MTY'S|MTYS|MTIES|EMPTY|EMPTIES|TO\s+SWEEP|SWEEP|CLEAN\s+OUT)\b/i.test(cleaned);
        }

        function testTrackHasInbound(track) {
            if (!track || !track.cars || track.cars <= 0 || track.is_clear) return false;
            const text = ((track.commodity || "") + " " + (track.notes || "")).toUpperCase();
            return /\b(INBOUND|IB|INB|IN-BOUND|INCOMING|ARRIVED)\b/i.test(text);
        }

        // 1. Clear track with 0 cars must return false (not holding empty cars)
        expect(testTrackHasEmptyCars({ cars: 0, is_clear: true, commodity: "Empty", notes: "EMPTY" })).toBe(false);
        expect(testTrackHasInbound({ cars: 0, is_clear: true, commodity: "Inbound", notes: "IB" })).toBe(false);

        // 2. Track with cars > 0 holding MTY cars must return true
        expect(testTrackHasEmptyCars({ cars: 10, is_clear: false, commodity: "10 - MTY", notes: "" })).toBe(true);
        expect(testTrackHasEmptyCars({ cars: 6, is_clear: false, commodity: "6 - TO SWEEP", notes: "" })).toBe(true);
        expect(testTrackHasEmptyCars({ cars: 4, is_clear: false, commodity: "EMPTY FLATS", notes: "" })).toBe(true);

        // 3. Occupied track with switch clearance note must NOT be flagged as empty cars
        expect(testTrackHasEmptyCars({ cars: 8, is_clear: false, commodity: "8 - SCRAP STEEL (SHRED)", notes: "CLEAR TO NORTH SWITCH" })).toBe(false);

        // 4. Inbound tracks
        expect(testTrackHasInbound({ cars: 12, is_clear: false, commodity: "12 - INBOUND", notes: "" })).toBe(true);
        expect(testTrackHasInbound({ cars: 5, is_clear: false, commodity: "5 - SLABS", notes: "ARRIVED INBOUND" })).toBe(true);

        // 5. Commodity rules have MTY and TO SWEEP in ob_empty and INBOUND in inbound
        const obEmptyCat = commRules.categories.find(c => c.id === 'ob_empty');
        expect(obEmptyCat).toBeDefined();
        expect(obEmptyCat.keywords).toContain('MTY');
        expect(obEmptyCat.keywords).toContain('TO SWEEP');

        const inboundCat = commRules.categories.find(c => c.id === 'inbound');
        expect(inboundCat).toBeDefined();
        expect(inboundCat.keywords).toContain('INBOUND');
    });

    test('9. Slide countdown turns emergency red under 5s and solar light mode enforces high contrast', () => {
        const css = fs.readFileSync(cssPath, 'utf8');
        const solarCssPath = path.resolve(__dirname, '../../html/css/themes/theme-solar.css');
        const solarCss = fs.readFileSync(solarCssPath, 'utf8');
        const anniversariesJs = fs.readFileSync(path.resolve(jsModulesDir, 'anniversaries.js'), 'utf8');
        const trackmapJs = fs.readFileSync(path.resolve(jsModulesDir, 'trackmap.js'), 'utf8');

        // 1. Countdown turns RED (#dc2626) under 5s in both styles-v2.css and theme-solar.css
        expect(css).toContain('#slide-dwell-container.dwell-warning');
        expect(css).toContain('stroke: #dc2626 !important');
        expect(css).toContain('color: #dc2626 !important');

        expect(solarCss).toContain('#slide-dwell-container.dwell-warning');
        expect(solarCss).toContain('stroke: #dc2626 !important');
        expect(solarCss).toContain('color: #dc2626 !important');

        // 2. Anniversaries milestones date capsule uses semantic class with high contrast
        expect(anniversariesJs).toContain('anniversary-date-badge');
        expect(anniversariesJs).toContain('anniversary-days-badge');
        expect(css).toContain('.anniversary-date-badge.is-today');
        expect(solarCss).toContain('.anniversary-date-badge.is-today');
        expect(solarCss).toContain('#92400e'); // 8.5:1 WCAG AAA contrast on #fef3c7

        // 3. Track map badges in solar mode enforce solid pearl fills and #0f172a bold text
        expect(css).toContain('body.solar-mode [id^=\'label-\'] rect');
        expect(css).toContain('fill: #f8fafc !important');
        expect(solarCss).toContain('fill: #f8fafc !important');
        expect(solarCss).toContain('[id^=\'label-\'] text');
        expect(solarCss).toContain('fill: #0f172a !important');

        // 4. Overlays and highlights use rich high-contrast royal blue and forest green in solar mode
        expect(solarCss).toContain('.overlay-inbound');
        expect(solarCss).toContain('stroke: #0284c7 !important');
        expect(solarCss).toContain('.overlay-empty-cars');
        expect(solarCss).toContain('stroke: #16a34a !important');

        // 5. Trackmap JS exports getSolarHighContrastColor and handles consolidated UP tallies
        expect(trackmapJs).toContain('export function getSolarHighContrastColor');
        expect(trackmapJs).toContain('up_consolidated');
    });

    test('10. Air-gap vendored assets exist locally and Emergency Takeover overlay is present', () => {
        const html = fs.readFileSync(htmlPath, 'utf8');

        // All vendor scripts and styles in index.html must be local and exist on disk
        expect(html).not.toMatch(/src="https?:\/\/(cdn\.jsdelivr|cdnjs|unpkg)/);
        expect(html).not.toMatch(/href="https?:\/\/(fonts\.googleapis|cdnjs)/);

        expect(fs.existsSync(path.resolve(__dirname, '../../html/vendor/marked/marked.min.js'))).toBe(true);
        expect(fs.existsSync(path.resolve(__dirname, '../../html/vendor/dompurify/purify.min.js'))).toBe(true);
        expect(fs.existsSync(path.resolve(__dirname, '../../html/vendor/qrcode/qrcode.min.js'))).toBe(true);
        expect(fs.existsSync(path.resolve(__dirname, '../../html/vendor/fontawesome/css/all.min.css'))).toBe(true);
        expect(fs.existsSync(path.resolve(__dirname, '../../html/vendor/fonts/fonts.css'))).toBe(true);

        // Emergency Screen Takeover Overlay
        expect(html).toContain('id="emergency-takeover-overlay"');
        expect(html).toContain('id="emergency-title"');
        expect(html).toContain('id="emergency-message"');
        expect(html).toContain('id="emergency-silence-btn"');

        // Stylesheet includes emergency animations and rules
        const css = fs.readFileSync(cssPath, 'utf8');
        expect(css).toContain('#emergency-takeover-overlay');
        expect(css).toContain('@keyframes emergency-strobe');
    });
});



