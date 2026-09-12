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
});
