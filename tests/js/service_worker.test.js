const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

describe('Offline-First Service Worker Architecture (IDEA-F03)', () => {
    const swPath = path.resolve(__dirname, '../../html/sw.js');
    const swRegisterPath = path.resolve(__dirname, '../../html/js/modules/sw-register.js');
    const nginxPath = path.resolve(__dirname, '../../nginx.conf');
    const vercelPath = path.resolve(__dirname, '../../vercel.json');

    test('1. html/sw.js exists and parses without AST or SSoT §9.1 violations', () => {
        expect(fs.existsSync(swPath)).toBe(true);
        const swContent = fs.readFileSync(swPath, 'utf8');

        // Check for regex lookbehinds
        expect(swContent).not.toMatch(/\(\?<[!=]/);

        // Check AST parsing and top-level await
        const ast = acorn.parse(swContent, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true
        });

        let topLevelAwaitFound = false;
        walk.ancestor(ast, {
            AwaitExpression(node, ancestors) {
                const hasFunctionAncestor = ancestors.some(a =>
                    a.type === 'FunctionDeclaration' ||
                    a.type === 'FunctionExpression' ||
                    a.type === 'ArrowFunctionExpression'
                );
                if (!hasFunctionAncestor) topLevelAwaitFound = true;
            }
        });
        expect(topLevelAwaitFound).toBe(false);
    });

    test('2. sw.js defines essential static assets and life-cycle events', () => {
        const swContent = fs.readFileSync(swPath, 'utf8');

        // Essential cache targets
        expect(swContent).toContain('/index.html');
        expect(swContent).toContain('/mobile.html');
        expect(swContent).toContain('/desktop.html');
        expect(swContent).toContain('equipment.json');
        expect(swContent).toContain('tracks.json');

        // Essential service worker events
        expect(swContent).toContain("addEventListener('install'");
        expect(swContent).toContain("addEventListener('activate'");
        expect(swContent).toContain("addEventListener('fetch'");
        expect(swContent).toContain("addEventListener('message'");
    });

    test('3. sw.js excludes version.txt and SSE runner streams from cache', () => {
        const swContent = fs.readFileSync(swPath, 'utf8');

        // Network-only exclusions
        expect(swContent).toContain('version.txt');
        expect(swContent).toContain('/api/runners/');
        expect(swContent).toContain('/api/auth/');
    });

    test('4. sw-register.js safely gates on secure context (HTTPS / localhost)', () => {
        expect(fs.existsSync(swRegisterPath)).toBe(true);
        const registerContent = fs.readFileSync(swRegisterPath, 'utf8');

        expect(registerContent).toContain('registerServiceWorker');
        expect(registerContent).toContain('localhost');
        expect(registerContent).toContain('127.0.0.1');
        expect(registerContent).toContain('https:');
        expect(registerContent).toContain('serviceWorker');
    });

    test('5. nginx.conf and vercel.json configure /sw.js routing with proper cache control', () => {
        const nginxConf = fs.readFileSync(nginxPath, 'utf8');
        expect(nginxConf).toContain('location = /sw.js');
        expect(nginxConf).toContain('Service-Worker-Allowed');

        const vercelJson = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
        const swRewrite = vercelJson.rewrites.find(r => r.source === '/sw.js');
        expect(swRewrite).toBeDefined();
        expect(swRewrite.destination).toBe('/html/sw.js');
    });

    test('6. Client checkVersion routines post skipWaiting messages on version upgrade', () => {
        const configCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/modules/config.js'), 'utf8');
        const mobileCode = fs.readFileSync(path.resolve(__dirname, '../../html/js/mobile.js'), 'utf8');

        expect(configCode).toContain("action: 'skipWaiting'");
        expect(mobileCode).toContain("action: 'skipWaiting'");
    });
});
