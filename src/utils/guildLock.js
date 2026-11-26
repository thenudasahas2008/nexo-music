'use strict';

class GuildLock {
    constructor() {
        this.chains = new Map();
    }

    async run(guildId, fn) {
        const key = String(guildId || 'global');
        const prev = this.chains.get(key) || Promise.resolve();
        let release;
        const current = new Promise((resolve) => {
            release = resolve;
        });
        const nextChain = prev.then(() => current);
        this.chains.set(key, nextChain);

        await prev;
        try {
            return await fn();
        } finally {
            release();
            if (this.chains.get(key) === nextChain) {
                this.chains.delete(key);
            }
        }
    }
}

module.exports = { GuildLock };
