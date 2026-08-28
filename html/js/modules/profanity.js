// Robust Profanity & Content Sanitization Filter
// Detects direct matches, leetspeak, spacing tricks, and offensive slur patterns

const BANNED_PATTERNS = [
    // Profanities & slurs (with flexible character boundaries)
    /\bf+u+c+k+/i,
    /\bs+h+i+t+/i,
    /\bb+i+t+c+h+/i,
    /\ba+s+s+h+o+l+e+/i,
    /\bd+i+c+k+/i,
    /\bc+u+n+t+/i,
    /\bp+u+s+s+y+/i,
    /\bb+a+s+t+a+r+d+/i,
    /\bw+h+o+r+e+/i,
    /\bs+l+u+t+/i,
    /\bf+a+g+/i,
    /\bn+i+g+g+/i,
    /\bn+i+g+a+/i,
    /\br+e+t+a+r+d+/i,
    /\bk+i+k+e+/i,
    /\bc+h+i+n+k+/i,
    /\bs+p+i+c+/i,
    /\bw+t+f\b/i,
    /\bs+t+f+u\b/i
];

// Normalize leetspeak and special character obfuscation
export function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/0/g, 'o')
        .replace(/1|!|\|/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4|@/g, 'a')
        .replace(/5|\$/g, 's')
        .replace(/7/g, 't')
        .replace(/8/g, 'b')
        .replace(/[^a-z0-9\s]/g, '') // remove symbols
        .replace(/\s+/g, ' ')
        .trim();
}

export function containsProfanity(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Check raw text
    for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(text)) return true;
    }

    // Check normalized leetspeak
    const normalized = normalizeText(text);
    for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(normalized)) return true;
    }

    // Check collapsed text without any spaces (e.g. "f u c k")
    const collapsed = normalized.replace(/\s+/g, '');
    for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(collapsed)) return true;
    }

    return false;
}

export function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .trim();
}
