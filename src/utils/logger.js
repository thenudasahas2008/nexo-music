'use strict';

const pc = require('picocolors');

const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

let currentLevel = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function setLogLevel(level) {
    const normalized = String(level || 'info').toLowerCase();
    if (LEVELS[normalized] !== undefined) {
        currentLevel = LEVELS[normalized];
    }
}

function redactSecrets(input) {
    if (typeof input !== 'string') return input;
    return input
        .replace(/([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{15,})/g, '[REDACTED_TOKEN]')
        .replace(/(Authorization:\s*(?:Bot|Bearer)?\s*)[^\s"']+/gi, '$1[REDACTED]')
        .replace(/(password\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]');
}

function formatMeta(meta) {
    if (!meta || typeof meta !== 'object') return '';
    const entries = Object.entries(meta).filter(([, v]) => v !== undefined);
    if (!entries.length) return '';
    return (
        ' ' +
        entries
            .map(([k, v]) => {
                const raw = v instanceof Error ? v.message : typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `${k}=${redactSecrets(raw)}`;
            })
            .join(' ')
    );
}

function writeLog(levelName, colorFn, scope, message, meta) {
    if (LEVELS[levelName] < currentLevel) return;
    const timestamp = new Date().toISOString().slice(11, 19);
    const tag = colorFn(levelName.toUpperCase().padEnd(5));
    const scopeText = scope ? pc.cyan(`[${scope}] `) : '';
    const text = redactSecrets(String(message || ''));
    const suffix = formatMeta(meta);
    const line = `${pc.dim(timestamp)} ${tag} ${scopeText}${text}${suffix ? pc.dim(suffix) : ''}`;
    if (levelName === 'error') {
        console.error(line);
    } else if (levelName === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

function createLogger(scope = 'core') {
    return {
        debug: (msg, meta) => writeLog('debug', pc.gray, scope, msg, meta),
        info: (msg, meta) => writeLog('info', pc.green, scope, msg, meta),
        warn: (msg, meta) => writeLog('warn', pc.yellow, scope, msg, meta),
        error: (msg, meta) => writeLog('error', pc.red, scope, msg, meta),
    };
}

module.exports = {
    createLogger,
    setLogLevel,
    redactSecrets,
};
