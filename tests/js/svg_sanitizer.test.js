/**
 * 🔒 SVG Sanitizer Unit Tests (SSoT §8 / Security Hardening / IDEA-S03)
 * Validates DOMPurify + JSDOM vector sanitization and security defenses.
 */

const { validateAndSanitizeSvg, getDOMPurify } = require('../../control-panel/lib/svg-sanitizer');

describe('SVG Sanitizer & Security Hardening Unit Tests (IDEA-S03)', () => {
    test('DOMPurify instance is initialized correctly', () => {
        const purify = getDOMPurify();
        expect(purify).toBeDefined();
        expect(typeof purify.sanitize).toBe('function');
    });

    test('Rejects non-string inputs', () => {
        expect(validateAndSanitizeSvg(null).valid).toBe(false);
        expect(validateAndSanitizeSvg(undefined).valid).toBe(false);
        expect(validateAndSanitizeSvg(12345).valid).toBe(false);
    });

    test('Rejects content lacking SVG tags', () => {
        const result = validateAndSanitizeSvg('<html><body>Not SVG</body></html>');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('valid SVG');
    });

    test('Rejects script tags', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>';
        const result = validateAndSanitizeSvg(svg);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('script tags');
    });

    test('Rejects foreignObject elements', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe></iframe></foreignObject></svg>';
        const result = validateAndSanitizeSvg(svg);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('foreignObject');
    });

    test('Rejects event handler attributes', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>';
        const result = validateAndSanitizeSvg(svg);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('event handler attributes');
    });

    test('Rejects javascript: URIs in href and xlink:href', () => {
        const svg1 = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click</text></a></svg>';
        const result1 = validateAndSanitizeSvg(svg1);
        expect(result1.valid).toBe(false);
        expect(result1.error).toContain('javascript: URIs');

        const svg2 = '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"><text>Click</text></a></svg>';
        const result2 = validateAndSanitizeSvg(svg2);
        expect(result2.valid).toBe(false);
        expect(result2.error).toContain('javascript: URIs');
    });

    test('Rejects external URLs in href and xlink:href (beacons and external symbols)', () => {
        const svg1 = '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="https://evil.com/icon.svg#test"/></svg>';
        expect(validateAndSanitizeSvg(svg1).valid).toBe(false);

        const svg2 = '<svg xmlns="http://www.w3.org/2000/svg"><use href="//evil.com/icon.svg#test"/></svg>';
        expect(validateAndSanitizeSvg(svg2).valid).toBe(false);

        const svg3 = '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://evil.com/leak.jpg"/></svg>';
        expect(validateAndSanitizeSvg(svg3).valid).toBe(false);
    });

    test('Rejects external CSS URLs in style blocks', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style>rect { background: url(https://evil.com/leak.png); }</style></svg>';
        const result = validateAndSanitizeSvg(svg);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('external CSS URL');
    });

    test('Sanitizes and preserves valid SVG geometry and styles', () => {
        const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><style>.cls-1 { fill: #00f0ff; }</style></defs><g id="layer-1"><rect class="cls-1" x="10" y="10" width="80" height="80" id="track-01" data-capacity="20"/></g></svg>';
        const result = validateAndSanitizeSvg(validSvg);
        expect(result.valid).toBe(true);
        expect(result.cleanSvg).toContain('<svg');
        expect(result.cleanSvg).toContain('track-01');
        expect(result.cleanSvg).toContain('rect');
    });
});
