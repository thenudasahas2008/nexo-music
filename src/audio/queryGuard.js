'use strict';

const ALLOWED_PLATFORMS = Object.freeze({
    ytmsearch: 'ytmsearch',
    ytsearch: 'ytsearch',
    scsearch: 'scsearch',
    dzsearch: 'dzsearch',
    spsearch: 'spsearch',
    amsearch: 'amsearch',
});

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

function sanitizeQuery(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function isUrl(input) {
    return /^https?:\/\/\S+$/i.test(String(input || '').trim());
}

function classifyQuery(rawQuery, defaultPlatform = 'ytmsearch') {
    const query = sanitizeQuery(rawQuery);
    if (!query) return { valid: false, reason: 'Empty query' };

    if (isUrl(query)) {
        try {
            const parsed = new URL(query);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return { valid: false, reason: 'Unsupported URL scheme' };
            }
            if (parsed.username || parsed.password) {
                return { valid: false, reason: 'Credentials in URL are not allowed' };
            }
            const host = parsed.hostname.toLowerCase();
            if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
                return { valid: false, reason: 'Private URL targets are blocked' };
            }
            return {
                valid: true,
                isUrl: true,
                query,
                source: detectUrlSource(host),
            };
        } catch {
            return { valid: false, reason: 'Malformed URL' };
        }
    }

    const prefixMatch = query.match(/^([a-z]{2,8}search):(.*)$/i);
    if (prefixMatch) {
        const prefix = prefixMatch[1].toLowerCase();
        const term = prefixMatch[2].trim();
        if (!term) return { valid: false, reason: 'Empty search term' };
        return {
            valid: true,
            isUrl: false,
            query: term,
            source: ALLOWED_PLATFORMS[prefix] || defaultPlatform,
        };
    }

    return {
        valid: true,
        isUrl: false,
        query,
        source: ALLOWED_PLATFORMS[defaultPlatform] || 'ytmsearch',
    };
}

function detectUrlSource(hostname) {
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('spotify.com') || hostname === 'spoti.fi') return 'spotify';
    if (hostname.includes('soundcloud.com') || hostname === 'on.soundcloud.com') return 'soundcloud';
    if (hostname.includes('deezer.com') || hostname === 'dzr.page.link') return 'deezer';
    if (hostname.includes('music.apple.com')) return 'applemusic';
    if (hostname.includes('twitch.tv')) return 'twitch';
    return 'http';
}

function buildFallbackQueries(track) {
    const title = sanitizeQuery(track?.info?.title || '');
    const author = sanitizeQuery(track?.info?.author || '');
    const cleanTitle = title
        .replace(/\(official.*?\)/gi, '')
        .replace(/\[official.*?\]/gi, '')
        .replace(/\(lyrics?\)/gi, '')
        .replace(/\[lyrics?\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    const searchPhrase = author && !cleanTitle.toLowerCase().includes(author.toLowerCase())
        ? `${cleanTitle} ${author}`
        : cleanTitle || title;

    if (!searchPhrase) return [];

    return [
        { query: searchPhrase, source: 'ytmsearch' },
        { query: searchPhrase, source: 'scsearch' },
        { query: searchPhrase, source: 'dzsearch' },
        { query: searchPhrase, source: 'ytsearch' },
    ];
}

module.exports = {
    sanitizeQuery,
    isUrl,
    classifyQuery,
    detectUrlSource,
    buildFallbackQueries,
};
