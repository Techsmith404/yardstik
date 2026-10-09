/**
 * Shared HTML Sanitization Utility (IDEA-Q05)
 * Sanitizes markdown-rendered HTML using DOMPurify with safe tag allowlists,
 * defending against XSS in reminder cards and supervisor portal displays.
 */

export function sanitizeMarkdownHtml(dirtyHtml) {
    if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
    if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(dirtyHtml, {
            ALLOWED_TAGS: [
                'b', 'i', 'em', 'strong', 'u', 's', 'ul', 'ol', 'li', 'p', 'br',
                'a', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span',
                'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
            ],
            ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style']
        });
    }
    // Fallback: Strip dangerous script/iframe tags and inline event attributes
    return dirtyHtml
        .replace(/<\/?(?:script|object|embed|iframe|form|input|button|link|meta)\b[^>]*>/gi, '')
        .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}
