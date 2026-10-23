/**
 * 🎨 YardStik Brand Identity, Vector SVG System, & Multi-Resolution Icon Suite
 * Test Suite: tests/js/branding_assets.test.js
 *
 * Enforces the Given-When-Then QA contract for:
 * 1. Master & Mirror SVG Vector Marks (root <svg>, viewBox, security attributes)
 * 2. Multi-Resolution Raster Icon Dimensions & PNG IHDR binary chunk integrity
 * 3. Dual-Container Favicon.ico files
 * 4. PWA Web App Manifest (site.webmanifest) schema and icon integrity
 * 5. HTML Document <link> and emblem integrations across viewports
 * 6. Offline-First Service Worker (sw.js) static cache manifest inclusion
 *
 * SSoT §22 / TEC-21 / TEC-22 / TEC-23 / TEC-24
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Parses binary PNG header and IHDR chunk without external native dependencies.
 */
function readPngMetadata(filePath) {
    const absPath = path.resolve(ROOT_DIR, filePath);
    expect(fs.existsSync(absPath)).toBe(true);

    const buf = fs.readFileSync(absPath);
    expect(buf.length).toBeGreaterThan(24);

    // Standard 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    expect(buf.subarray(0, 8).equals(pngSignature)).toBe(true);

    // First chunk immediately following 8-byte signature must be IHDR
    const ihdrChunkType = buf.subarray(12, 16).toString('ascii');
    expect(ihdrChunkType).toBe('IHDR');

    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);

    return { width, height, size: buf.length };
}

/**
 * Parses binary ICO header (reserved 00 00, type 01 00, count >= 1).
 */
function readIcoMetadata(filePath) {
    const absPath = path.resolve(ROOT_DIR, filePath);
    expect(fs.existsSync(absPath)).toBe(true);

    const buf = fs.readFileSync(absPath);
    expect(buf.length).toBeGreaterThan(6);

    // ICO header: 0x00 0x00, 0x01 0x00 (type = 1 for icon)
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(1);
    expect(buf[3]).toBe(0);

    const imageCount = buf.readUInt16LE(4);
    expect(imageCount).toBeGreaterThan(0);

    return { imageCount, size: buf.length };
}

describe('YardStik Branding Assets & Identity Integration (TEC-24)', () => {

    describe('Pillar 1: Master & Control Panel Vector SVG System', () => {
        const svgFiles = [
            { path: 'html/assets/images/logo-mark.svg', expectedViewBox: '0 0 512 512', desc: 'Master Square Icon Mark' },
            { path: 'html/assets/images/logo.svg', expectedViewBox: '0 0 512 512', desc: 'Master Full Logo Mark' },
            { path: 'html/assets/images/logo-wordmark.svg', expectedViewBox: '0 0 800 200', desc: 'Master Horizontal Wordmark' },
            { path: 'control-panel/public/logo-mark.svg', expectedViewBox: '0 0 512 512', desc: 'Control Panel Mirrored Icon Mark' },
            { path: 'control-panel/public/logo-wordmark.svg', expectedViewBox: '0 0 800 200', desc: 'Control Panel Mirrored Wordmark' }
        ];

        test.each(svgFiles)(
            'Given $desc ($path), When verified, Then it exists, has valid <svg> root and viewBox "$expectedViewBox"',
            ({ path: filePath, expectedViewBox }) => {
                const absPath = path.resolve(ROOT_DIR, filePath);
                expect(fs.existsSync(absPath)).toBe(true);

                const rawContent = fs.readFileSync(absPath, 'utf8');
                expect(rawContent.trim().length).toBeGreaterThan(100);

                // Parse as XML / SVG via JSDOM
                const dom = new JSDOM(rawContent, { contentType: 'image/svg+xml' });
                const svgEl = dom.window.document.querySelector('svg');

                expect(svgEl).not.toBeNull();
                expect(svgEl.tagName.toLowerCase()).toBe('svg');

                const viewBox = svgEl.getAttribute('viewBox');
                expect(viewBox).toBe(expectedViewBox);

                // Verify width and height attributes exist and are coherent
                const widthAttr = svgEl.getAttribute('width');
                const heightAttr = svgEl.getAttribute('height');
                expect(widthAttr).toBeTruthy();
                expect(heightAttr).toBeTruthy();

                // Security check: must not contain executable script or dangerous elements
                expect(dom.window.document.querySelector('script')).toBeNull();
                expect(dom.window.document.querySelector('foreignObject')).toBeNull();
                expect(rawContent).not.toMatch(/onload\s*=/i);
                expect(rawContent).not.toMatch(/javascript:/i);
            }
        );
    });

    describe('Pillar 2: Multi-Resolution Raster PNG Icon Suite & Dimensions', () => {
        const rasterIcons = [
            { file: 'html/assets/images/logo.png', width: 512, height: 512, desc: '512x512 Master Logo PNG' },
            { file: 'html/assets/images/icon-512.png', width: 512, height: 512, desc: '512x512 PWA Splash/Store Icon' },
            { file: 'html/assets/images/icon-192.png', width: 192, height: 192, desc: '192x192 PWA Mobile Home Icon' },
            { file: 'html/assets/images/apple-touch-icon.png', width: 180, height: 180, desc: '180x180 iOS Touch Icon' },
            { file: 'html/assets/images/favicon-32x32.png', width: 32, height: 32, desc: '32x32 Desktop Browser Favicon' },
            { file: 'html/assets/images/favicon-16x16.png', width: 16, height: 16, desc: '16x16 Tab / Bookmark Favicon' }
        ];

        test.each(rasterIcons)(
            'Given $desc ($file), When IHDR header is inspected, Then dimensions must be exactly $width x $height',
            ({ file, width, height }) => {
                const meta = readPngMetadata(file);
                expect(meta.width).toBe(width);
                expect(meta.height).toBe(height);
                expect(meta.size).toBeGreaterThan(0);
            }
        );

        test('Given docs/images/logo-hero.png, When inspected, Then it must be a valid, non-empty PNG graphic', () => {
            const meta = readPngMetadata('docs/images/logo-hero.png');
            expect(meta.width).toBeGreaterThanOrEqual(512);
            expect(meta.height).toBeGreaterThanOrEqual(512);
            expect(meta.size).toBeGreaterThan(10000); // Substantial visual image
        });
    });

    describe('Pillar 3: Dual-Container Favicon.ico Files', () => {
        const icoFiles = [
            { file: 'html/favicon.ico', desc: 'Frontend Kiosk Nginx Favicon' },
            { file: 'control-panel/public/favicon.ico', desc: 'Administrative Control Panel Favicon' }
        ];

        test.each(icoFiles)(
            'Given $desc ($file), When validated, Then it exists and contains valid ICO header structures',
            ({ file }) => {
                const meta = readIcoMetadata(file);
                expect(meta.imageCount).toBeGreaterThanOrEqual(1);
                expect(meta.size).toBeGreaterThan(500);
            }
        );
    });

    describe('Pillar 4: PWA Web App Manifest Schema (site.webmanifest)', () => {
        const manifestPath = path.resolve(ROOT_DIR, 'html/site.webmanifest');

        test('Given html/site.webmanifest, When parsed as JSON, Then it adheres to PWA schema with short_name "YardStik"', () => {
            expect(fs.existsSync(manifestPath)).toBe(true);

            const content = fs.readFileSync(manifestPath, 'utf8');
            let manifest;
            expect(() => {
                manifest = JSON.parse(content);
            }).not.toThrow();

            expect(manifest.short_name).toBe('YardStik');
            expect(manifest.name).toBeTruthy();
            expect(manifest.icons).toBeInstanceOf(Array);
            expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

            // Verify icon items in manifest point to real files
            for (const icon of manifest.icons) {
                expect(icon.src).toBeTruthy();
                expect(icon.sizes).toBeTruthy();
                expect(icon.type).toBeTruthy();

                const iconDiskPath = path.resolve(ROOT_DIR, 'html', icon.src);
                expect(fs.existsSync(iconDiskPath)).toBe(true);
            }
        });
    });

    describe('Pillar 5: HTML Viewports & Favicon <link> Integrations', () => {
        const htmlFiles = [
            { file: 'html/index.html', desc: 'TV Kiosk Presentation Viewport' },
            { file: 'html/desktop.html', desc: 'Desktop Supervisor Portal' },
            { file: 'html/mobile.html', desc: 'Mobile Web App Companion' },
            { file: 'html/login.html', desc: 'Plant Authentication Login' },
            { file: 'html/register.html', desc: 'User Registration' },
            { file: 'control-panel/public/index.html', desc: 'Administrative Control Panel Hub' }
        ];

        test.each(htmlFiles)(
            'Given $desc ($file), When parsed, Then it contains a valid <link> referencing logo-mark.svg',
            ({ file }) => {
                const absPath = path.resolve(ROOT_DIR, file);
                expect(fs.existsSync(absPath)).toBe(true);

                const html = fs.readFileSync(absPath, 'utf8');
                const dom = new JSDOM(html);
                const document = dom.window.document;

                // Match link tag with rel containing 'icon' and href referencing 'logo-mark.svg'
                const links = Array.from(document.querySelectorAll('link[rel~="icon"]'));
                expect(links.length).toBeGreaterThan(0);

                const svgFaviconLink = links.find(l => {
                    const href = l.getAttribute('href') || '';
                    return href.includes('logo-mark.svg');
                });

                expect(svgFaviconLink).toBeDefined();
                expect(svgFaviconLink.getAttribute('type')).toBe('image/svg+xml');
            }
        );
    });

    describe('Pillar 6: Offline Service Worker Pre-Cache Manifest (sw.js)', () => {
        const swPath = path.resolve(ROOT_DIR, 'html/sw.js');

        test('Given html/sw.js, When inspected, Then STATIC_ASSETS pre-caches logo-mark.svg and site.webmanifest', () => {
            expect(fs.existsSync(swPath)).toBe(true);
            const swContent = fs.readFileSync(swPath, 'utf8');

            // Must contain logo-mark.svg in pre-cache array
            expect(swContent).toContain('/assets/images/logo-mark.svg');

            // Must contain site.webmanifest in pre-cache array
            expect(swContent).toContain('/site.webmanifest');

            // Must also include raster icons for 100% offline mobile PWA fidelity
            expect(swContent).toContain('/assets/images/logo.png');
            expect(swContent).toContain('/assets/images/icon-192.png');
            expect(swContent).toContain('/assets/images/icon-512.png');
            expect(swContent).toContain('/favicon.ico');
        });
    });
});
