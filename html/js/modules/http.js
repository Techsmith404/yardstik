/**
 * Shared HTTP and Fetch utilities for YardStik frontend modules
 * Strictly upholds SSoT §9.1: Zero regex lookbehinds, zero top-level await.
 */

/**
 * Appends a cache-busting timestamp parameter to a URL
 * @param {string} url 
 * @returns {string}
 */
export function cacheBustUrl(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Date.now()}`;
}

/**
 * Performs a fetch request and parses the JSON response, verifying res.ok
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<any>}
 */
export async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.json();
}

/**
 * Performs a fetch request and returns the raw text response, verifying res.ok
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<string>}
 */
export async function fetchText(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.text();
}

/**
 * Performs a fetch request, verifying res.ok, and returns both parsed JSON and response headers
 * @param {string} url 
 * @param {RequestInit} [options={}] 
 * @returns {Promise<{ data: any, headers: Headers, status: number }>}
 */
export async function fetchJsonWithHeaders(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const data = await res.json();
    return { data, headers: res.headers, status: res.status };
}
