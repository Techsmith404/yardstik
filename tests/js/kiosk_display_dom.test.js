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

        // TV screen burn-in protection
        expect(css).toContain('pixel-shift');
        expect(css).toContain('@keyframes pixel-shift');

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
});
