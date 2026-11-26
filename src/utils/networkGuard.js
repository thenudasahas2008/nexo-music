'use strict';

const net = require('node:net');

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'ip6-localhost',
    'ip6-loopback',
    'metadata.google.internal',
    'metadata',
]);

function isPrivateIpv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
}

function isPrivateIpv6(ip) {
    const normalized = ip.toLowerCase().split('%')[0];
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice(7);
        if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('ff')) return true;
    return false;
}

function isSafePublicHost(rawHost, allowlist = []) {
    if (!rawHost || typeof rawHost !== 'string') return false;
    const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host.length > 253) return false;
    if (BLOCKED_HOSTNAMES.has(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false;
    if (/[\s/\\@?#]/.test(host)) return false;

    if (allowlist.length > 0 && !allowlist.includes(host)) {
        return false;
    }

    const ipType = net.isIP(host);
    if (ipType === 4) return !isPrivateIpv4(host);
    if (ipType === 6) return !isPrivateIpv6(host);

    return /^[a-z0-9.-]+$/.test(host) && host.includes('.');
}

function isSafeHttpUrl(rawUrl, options = {}) {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:' && !(options.allowHttp && parsed.protocol === 'http:')) {
            return false;
        }
        if (parsed.username || parsed.password) return false;
        return isSafePublicHost(parsed.hostname, options.allowlist || []);
    } catch {
        return false;
    }
}

async function readResponseTextWithLimit(response, maxBytes = 262144) {
    if (!response?.body) {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            throw new Error(`Response exceeded ${maxBytes} byte limit`);
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(`Response exceeded ${maxBytes} byte limit`);
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, total).toString('utf8');
}

module.exports = {
    isPrivateIpv4,
    isPrivateIpv6,
    isSafePublicHost,
    isSafeHttpUrl,
    readResponseTextWithLimit,
};
