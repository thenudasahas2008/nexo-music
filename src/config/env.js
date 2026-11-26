'use strict';

require('dotenv').config();

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function parseIntClamped(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseCsv(value) {
    if (!value || typeof value !== 'string') return [];
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function loadConfig(env = process.env) {
    const token = String(env.TOKEN || env.DISCORD_TOKEN || '').trim();
    const lavalinkHost = String(env.LAVALINK_HOST || '').trim();
    const lavalinkPassword = String(env.LAVALINK_PASSWORD || '').trim();
    const hasPrivateNode = Boolean(lavalinkHost && lavalinkPassword);

    return Object.freeze({
        botName: String(env.BOT_NAME || 'Nexo').trim() || 'Nexo',
        token,
        defaultLanguage: String(env.DEFAULT_LANGUAGE || 'en').trim() || 'en',
        logLevel: String(env.LOG_LEVEL || 'info').trim().toLowerCase(),
        ownerId: String(env.OWNER_DISCORD_ID || '').trim(),
        supportInvite: String(env.SUPPORT_SERVER_INVITE || '').trim(),
        supportGuildId: String(env.SUPPORT_GUILD_ID || '').trim(),

        lavalink: Object.freeze({
            hasPrivateNode,
            host: lavalinkHost,
            port: parseIntClamped(env.LAVALINK_PORT, 2333, 1, 65535),
            password: lavalinkPassword,
            secure: parseBoolean(env.LAVALINK_SECURE, false),
            publicNodeEnabled: parseBoolean(env.PUBLIC_NODE_ENABLED, !hasPrivateNode),
            publicNodeAllowlist: parseCsv(env.PUBLIC_NODE_HOST_ALLOWLIST).map((h) => h.toLowerCase()),
            maxActiveNodes: parseIntClamped(env.MAX_ACTIVE_NODES, 3, 1, 6),
            healthCheckIntervalMs: parseIntClamped(env.LAVALINK_HEALTH_CHECK_INTERVAL_MS, 25000, 5000, 120000),
            maxReconnectAttempts: parseIntClamped(env.LAVALINK_MAX_RECONNECT_ATTEMPTS, 15, 3, 50),
            baseDelayMs: parseIntClamped(env.LAVALINK_BASE_DELAY_MS, 1000, 250, 10000),
            maxDelayMs: parseIntClamped(env.LAVALINK_MAX_DELAY_MS, 15000, 2000, 60000),
        }),

        playback: Object.freeze({
            defaultVolume: parseIntClamped(env.DEFAULT_VOLUME, 80, 1, 150),
            defaultSearchPlatform: String(env.DEFAULT_SEARCH_PLATFORM || 'ytmsearch').trim() || 'ytmsearch',
            autoplayDefault: parseBoolean(env.AUTOPLAY_DEFAULT, false),
            autoplayTargetCount: parseIntClamped(env.AUTOPLAY_TARGET_COUNT, 20, 5, 50),
            queueEmptyDestroyMs: parseIntClamped(env.QUEUE_EMPTY_DESTROY_MS, 45000, 5000, 300000),
            emptyChannelDestroyMs: parseIntClamped(env.EMPTY_CHANNEL_DESTROY_MS, 60000, 5000, 600000),
            allowedRoles: parseCsv(env.ALLOWED_ROLES),
        }),

        spotify: Object.freeze({
            enabled: parseBoolean(env.SPOTIFY_ENABLED, false),
            clientId: String(env.SPOTIFY_CLIENT_ID || '').trim(),
            clientSecret: String(env.SPOTIFY_CLIENT_SECRET || '').trim(),
        }),
    });
}

module.exports = {
    loadConfig,
    parseBoolean,
    parseIntClamped,
    parseCsv,
};
