'use strict';

const fs = require('node:fs');
const path = require('node:path');

class I18n {
    constructor(localesDir, defaultLang = 'en') {
        this.localesDir = localesDir;
        this.defaultLang = defaultLang;
        this.locales = new Map();
        this.loadAll();
    }

    loadAll() {
        if (!fs.existsSync(this.localesDir)) return;
        for (const file of fs.readdirSync(this.localesDir)) {
            if (!file.endsWith('.json')) continue;
            const lang = file.slice(0, -5);
            try {
                const raw = fs.readFileSync(path.join(this.localesDir, file), 'utf8');
                this.locales.set(lang, JSON.parse(raw));
            } catch {
                // Ignore malformed locale file
            }
        }
    }

    t(lang, key, vars = {}) {
        const dict = this.locales.get(lang) || this.locales.get(this.defaultLang) || {};
        const fallbackDict = this.locales.get(this.defaultLang) || {};
        const value = this._resolveKey(dict, key) ?? this._resolveKey(fallbackDict, key) ?? key;
        if (typeof value !== 'string') return key;
        return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) =>
            vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : `{${k}}`
        );
    }

    _resolveKey(obj, key) {
        return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
    }

    availableLanguages() {
        return Array.from(this.locales.keys());
    }
}

module.exports = { I18n };
