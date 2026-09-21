const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

function getJsFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getJsFiles(fullPath));
        } else if (file.endsWith('.js')) {
            results.push(fullPath);
        }
    });
    return results;
}

function checkCodeForViolations(code, filename = 'test.js') {
    const violations = [];
    const ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true
    });

    walk.simple(ast, {
        Literal(node) {
            // Check literal regex: /(?<=...)/ or /(?<!...)/
            if (node.regex && /\(\?<[!=]/.test(node.regex.pattern)) {
                violations.push({
                    file: filename,
                    line: node.loc ? node.loc.start.line : 0,
                    type: 'RegExp Lookbehind'
                });
            }
        },
        NewExpression(node) {
            // Check dynamic regex: new RegExp("(?<=...)")
            if (node.callee && node.callee.name === 'RegExp') {
                const arg = node.arguments[0];
                if (arg && arg.type === 'Literal' && typeof arg.value === 'string' && /\(\?<[!=]/.test(arg.value)) {
                    violations.push({
                        file: filename,
                        line: node.loc ? node.loc.start.line : 0,
                        type: 'RegExp Lookbehind (Dynamic)'
                    });
                }
            }
        }
    });

    walk.ancestor(ast, {
        AwaitExpression(node, ancestors) {
            const hasFunctionAncestor = ancestors.some(a =>
                a.type === 'FunctionDeclaration' ||
                a.type === 'FunctionExpression' ||
                a.type === 'ArrowFunctionExpression'
            );
            if (!hasFunctionAncestor) {
                violations.push({
                    file: filename,
                    line: node.loc ? node.loc.start.line : 0,
                    type: 'Top-Level Await'
                });
            }
        }
    });

    return violations;
}

describe('SSoT §9.1 Architectural AST Compliance: Zero Lookbehinds & Zero Top-Level Await', () => {
    test('Positive control: Detector correctly flags synthetic lookbehind and top-level await', () => {
        const badCode = `
            const re = /(?<=prefix)content/;
            const data = await fetch('/api/data');
            async function valid() {
                const ok = await fetch('/api/ok');
            }
        `;
        const violations = checkCodeForViolations(badCode, 'synthetic_test.js');
        expect(violations.length).toBe(2);
        expect(violations.some(v => v.type === 'RegExp Lookbehind')).toBe(true);
        expect(violations.some(v => v.type === 'Top-Level Await')).toBe(true);
    });

    test('All frontend JS files in html/js/ are 100% compliant with embedded browser constraints', () => {
        const jsDir = path.resolve(__dirname, '../../html/js');
        const files = getJsFiles(jsDir);
        expect(files.length).toBeGreaterThan(10);

        const allViolations = [];
        files.forEach(file => {
            const relativePath = path.relative(path.resolve(__dirname, '../..'), file);
            const code = fs.readFileSync(file, 'utf8');
            try {
                const violations = checkCodeForViolations(code, relativePath);
                allViolations.push(...violations);
            } catch (err) {
                throw new Error(`Failed to parse ${relativePath}: ${err.message}`);
            }
        });

        expect(allViolations).toEqual([]);
    });

    test('Daily toolbox talk slide enforces mandatory +1h offset for 11:00 PM rollover (SSoT §9.3)', () => {
        const slideshowPath = path.resolve(__dirname, '../../html/js/modules/slideshow.js');
        expect(fs.existsSync(slideshowPath)).toBe(true);
        const code = fs.readFileSync(slideshowPath, 'utf8');
        expect(code).toMatch(/60\s*\*\s*60\s*\*\s*1000/);
    });

    test('Nginx configuration enforces strict cache-control and SSE streaming proxy timeouts (SSoT §9.2, §9.11)', () => {
        const nginxPath = path.resolve(__dirname, '../../nginx.conf');
        expect(fs.existsSync(nginxPath)).toBe(true);
        const nginxConf = fs.readFileSync(nginxPath, 'utf8');

        // §9.2: No-store cache-control on dynamic data
        expect(nginxConf).toContain('no-store, no-cache, must-revalidate');

        // §9.11 & IDEA-I03: SSE runner proxy streaming settings
        expect(nginxConf).toContain('proxy_read_timeout 3600;');
        expect(nginxConf).toContain('proxy_buffering off;');

        // IDEA-I04: Gzip compression enabled for json and svg
        expect(nginxConf).toContain('gzip on;');
        expect(nginxConf).toContain('application/json');
        expect(nginxConf).toContain('image/svg+xml');
    });

    describe('Fetch Guard & res.ok AST Lint Rule (IDEA-T01)', () => {
        function checkFetchGuards(code, filename = 'test.js') {
            const violations = [];
            let ast;
            try {
                ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
            } catch (e) {
                ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
            }

            // In frontend ES modules, direct res.json() is prohibited outside of modules/http.js
            if (filename.includes('modules') && !filename.endsWith('http.js')) {
                walk.simple(ast, {
                    CallExpression(node) {
                        if (node.callee && node.callee.type === 'MemberExpression' && node.callee.property.name === 'json') {
                            violations.push({
                                file: filename,
                                line: node.loc ? node.loc.start.line : 0,
                                type: 'Ungoverned direct .json() in ES module (must use http.js fetchJson)'
                            });
                        }
                    }
                });
                return violations;
            }

            // In http.js or scripts like mobile.js, any function containing .json() must also inspect .ok
            walk.ancestor(ast, {
                CallExpression(node, ancestors) {
                    if (node.callee && node.callee.type === 'MemberExpression' && node.callee.property.name === 'json') {
                        const fnScope = [...ancestors].reverse().find(a =>
                            a.type === 'FunctionDeclaration' ||
                            a.type === 'FunctionExpression' ||
                            a.type === 'ArrowFunctionExpression'
                        );
                        if (fnScope) {
                            let hasOkCheck = false;
                            walk.simple(fnScope, {
                                MemberExpression(mNode) {
                                    if (mNode.property && mNode.property.name === 'ok') {
                                        hasOkCheck = true;
                                    }
                                }
                            });
                            if (!hasOkCheck) {
                                violations.push({
                                    file: filename,
                                    line: node.loc ? node.loc.start.line : 0,
                                    type: 'Unchecked .json() call without intervening res.ok check (IDEA-T01)'
                                });
                            }
                        }
                    }
                }
            });

            return violations;
        }

        test('Positive control: Detector flags unguarded .json() calls without res.ok check', () => {
            const badCode = 'fetch("/api/data").then(res => res.json());';
            const violations = checkFetchGuards(badCode, 'test.js');
            expect(violations.length).toBe(1);
            expect(violations[0].type).toContain('res.ok');

            const badModule = 'export async function get() { const r = await fetch("/api"); return r.json(); }';
            const moduleViolations = checkFetchGuards(badModule, 'modules/example.js');
            expect(moduleViolations.length).toBe(1);
            expect(moduleViolations[0].type).toContain('must use http.js');
        });

        test('Positive control: Detector passes properly guarded .json() calls with res.ok', () => {
            const goodCode = 'fetch("/api/data").then(res => { if (res.ok) return res.json(); throw new Error(); });';
            expect(checkFetchGuards(goodCode, 'test.js')).toEqual([]);
        });

        test('All frontend JavaScript files in html/js/ strictly enforce res.ok guards before parsing JSON', () => {
            const jsDir = path.resolve(__dirname, '../../html/js');
            const files = getJsFiles(jsDir);
            expect(files.length).toBeGreaterThan(10);

            const allViolations = [];
            files.forEach(file => {
                const relativePath = path.relative(path.resolve(__dirname, '../..'), file);
                const code = fs.readFileSync(file, 'utf8');
                try {
                    const violations = checkFetchGuards(code, relativePath);
                    allViolations.push(...violations);
                } catch (err) {
                    throw new Error(`Failed to parse ${relativePath}: ${err.message}`);
                }
            });

            expect(allViolations).toEqual([]);
        });
    });
});

