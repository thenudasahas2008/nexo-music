'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { loadConfig } = require('../src/config/env');
const { isSafePublicHost, isSafeHttpUrl, readResponseTextWithLimit } = require('../src/utils/networkGuard');
const { GuildStore } = require('../src/utils/guildStore');
const { GuildLock } = require('../src/utils/guildLock');
const { safeReply, ensureDeferred } = require('../src/utils/rest');
const { redactSecrets } = require('../src/utils/logger');

describe('networkGuard', () => {
    it('blocks private IPv4, IPv6 loopback, and internal hostnames', () => {
        assert.equal(isSafePublicHost('127.0.0.1'), false);
        assert.equal(isSafePublicHost('10.0.0.5'), false);
        assert.equal(isSafePublicHost('192.168.1.10'), false);
        assert.equal(isSafePublicHost('169.254.169.254'), false);
        assert.equal(isSafePublicHost('::1'), false);
        assert.equal(isSafePublicHost('localhost'), false);
        assert.equal(isSafePublicHost('redis.internal'), false);
        assert.equal(isSafePublicHost('lava.example.com'), true);
    });

    it('enforces allowlist and https scheme', () => {
        assert.equal(isSafeHttpUrl('https://lavalink-list.ajieblogs.eu.org/All'), true);
        assert.equal(isSafeHttpUrl('http://127.0.0.1:2333/v4/info', { allowHttp: true }), false);
        assert.equal(isSafePublicHost('node1.good.com', ['node2.good.com']), false);
        assert.equal(isSafePublicHost('node2.good.com', ['node2.good.com']), true);
    });

    it('enforces response byte limit', async () => {
        const res = new Response('a'.repeat(500));
        await assert.rejects(() => readResponseTextWithLimit(res, 100), /exceeded 100 byte limit/);
    });
});

describe('GuildStore', () => {
    it('writes settings atomically and reloads cleanly', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonara-store-'));
        const filePath = path.join(tmpDir, 'guild-settings.json');
        try {
            const store = new GuildStore(filePath);
            store.set('12345', { twentyFourSeven: true, voiceChannelId: '999', eqPreset: 'bassboost' });
            await store.flush();

            const reloaded = new GuildStore(filePath).loadSync();
            const g = reloaded.get('12345');
            assert.equal(g.twentyFourSeven, true);
            assert.equal(g.voiceChannelId, '999');
            assert.equal(g.eqPreset, 'bassboost');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

describe('GuildLock', () => {
    it('serializes concurrent operations per guild', async () => {
        const lock = new GuildLock();
        const order = [];
        await Promise.all([
            lock.run('g1', async () => {
                await new Promise((r) => setTimeout(r, 25));
                order.push(1);
            }),
            lock.run('g1', async () => {
                order.push(2);
            }),
        ]);
        assert.deepEqual(order, [1, 2]);
    });
});

describe('rest & logger', () => {
    it('handles 40060 acknowledged error with bounded editReply fallback', async () => {
        let edited = false;
        const fakeInteraction = {
            deferred: false,
            replied: false,
            async reply() {
                const err = new Error('Already acknowledged');
                err.code = 40060;
                throw err;
            },
            async editReply(payload) {
                edited = true;
                return payload;
            },
        };
        const res = await safeReply(fakeInteraction, { content: 'hi', flags: 64 });
        assert.equal(edited, true);
        assert.deepEqual(res, { content: 'hi' });
    });

    it('ensureDeferred returns false instead of hanging on timeout', async () => {
        const slowInteraction = {
            deferred: false,
            replied: false,
            deferReply: () => new Promise(() => {}),
        };
        const ok = await ensureDeferred(slowInteraction, { timeoutMs: 50 });
        assert.equal(ok, false);
    });

    it('redacts token-like strings in logs', () => {
        const sample = 'Authorization: Bot abcdefghijklmnopqrstuvwx.yz1234.abcdefghijklmnop';
        assert.equal(redactSecrets(sample).includes('abcdefghijklmnop'), false);
    });

    it('loads config defaults safely', () => {
        const cfg = loadConfig({});
        assert.equal(cfg.botName, 'Nexo');
        assert.equal(cfg.lavalink.publicNodeEnabled, true);
        assert.equal(cfg.playback.defaultVolume, 80);
    });
});
