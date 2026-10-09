/**
 * 🔒 SVG Sanitizer & Security Validator Module (SSoT §8 & §9.13 / IDEA-S03)
 * Server-side vector validation and sanitization using DOMPurify + JSDOM.
 * Rejects malicious vectors (scripts, foreignObjects, event handlers, javascript: URIs,
 * external references, beacon images, external CSS urls) and sanitizes clean SVGs.
 */

const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

let dompurifyInstance = null;

function getDOMPurify() {
    if (!dompurifyInstance) {
        const { window } = new JSDOM('');
        dompurifyInstance = createDOMPurify(window);
    }
    return dompurifyInstance;
}

function validateAndSanitizeSvg(content) {
    if (typeof content !== 'string') {
        return { valid: false, error: 'File content must be a string' };
    }

    if (!content.includes('<svg') && !content.includes('</svg>')) {
        return { valid: false, error: 'File is not a valid SVG drawing' };
    }

    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('<script')) {
        return { valid: false, error: 'SVG contains script tags which are not allowed' };
    }

    if (lowerContent.includes('<foreignobject')) {
        return { valid: false, error: 'SVG contains foreignObject elements which are not allowed' };
    }

    if (/\bon\w+\s*=/.test(lowerContent)) {
        return { valid: false, error: 'SVG contains event handler attributes which are not allowed' };
    }

    if (/\bhref\s*=\s*["']?\s*javascript:/i.test(content) || /xlink:href\s*=\s*["']?\s*javascript:/i.test(content)) {
        return { valid: false, error: 'SVG contains javascript: URIs which are not allowed' };
    }

    if (/(?:href|xlink:href)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(content)) {
        return { valid: false, error: 'SVG contains external references or network URLs which are not allowed' };
    }

    if (/<style[^>]*>[\s\S]*?url\s*\(\s*["']?(?:https?:)?\/\/[\s\S]*?<\/style>/i.test(content)) {
        return { valid: false, error: 'SVG contains external CSS URL references which are not allowed' };
    }

    const purify = getDOMPurify();
    const cleanSvg = purify.sanitize(content, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['script', 'foreignobject', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
        FORCE_BODY: false
    });

    if (!cleanSvg || !cleanSvg.includes('<svg')) {
        return { valid: false, error: 'File is not a valid SVG drawing after sanitization' };
    }

    return { valid: true, cleanSvg };
}

module.exports = {
    validateAndSanitizeSvg,
    getDOMPurify
};
