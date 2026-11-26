'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createLogger } = require('./logger');

const log = createLogger('guildStore');

const DEFAULT_GUILD_SETTINGS = Object.freeze({
    twentyFourSeven: false,
    voiceChannelId: null,
    textChannelId: null,
    autoplay: false,
    defaultVolume: 80,
    language: 'en',
    djRoleId: null,
    eqPreset: 'flat',
});

class GuildStore {
    constructor(filePath, defaults = {}) {
        this.filePath = filePath;
        this.defaults = { ...DEFAULT_GUILD_SETTINGS, ...defaults };
        this.data = new Map();
        this._saveTimer = null;
        this._writing = false;
        this._pendingWrite = false;
        this._loaded = false;
    }

    loadSync() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [guildId, settings] of Object.entries(parsed)) {
                    if (settings && typeof settings === 'object') {
                        this.data.set(guildId, { ...this.defaults, ...settings });
                    }
                }
            }
        } catch (err) {
            if (err?.code !== 'ENOENT') {
                log.warn('Failed to parse guild store, starting clean', { error: err.message });
            }
        }
        this._loaded = true;
        return this;
    }

    get(guildId) {
        if (!this._loaded) this.loadSync();
        const existing = this.data.get(guildId);
        return existing ? { ...this.defaults, ...existing } : { ...this.defaults };
    }

    set(guildId, patch) {
        if (!this._loaded) this.loadSync();
        const next = { ...this.get(guildId), ...patch };
        this.data.set(guildId, next);
        this.scheduleSave();
        return next;
    }

    entries() {
        if (!this._loaded) this.loadSync();
        return Array.from(this.data.entries());
    }

    scheduleSave(delayMs = 150) {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            void this.flush();
        }, delayMs);
        this._saveTimer.unref?.();
    }

    async flush() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        if (this._writing) {
            this._pendingWrite = true;
            return;
        }
        this._writing = true;
        try {
            const dir = path.dirname(this.filePath);
            await fsp.mkdir(dir, { recursive: true });
            const payload = JSON.stringify(Object.fromEntries(this.data.entries()), null, 2);
            const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
            await fsp.writeFile(tmpPath, payload, 'utf8');
            await fsp.rename(tmpPath, this.filePath);
        } catch (err) {
            log.error('Atomic guild store write failed', { error: err.message });
        } finally {
            this._writing = false;
            if (this._pendingWrite) {
                this._pendingWrite = false;
                await this.flush();
            }
        }
    }
}

module.exports = {
    GuildStore,
    DEFAULT_GUILD_SETTINGS,
};
