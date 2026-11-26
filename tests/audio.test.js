'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig } = require('../src/config/env');
const { NodeRegistry } = require('../src/audio/NodeRegistry');
const { LavalinkEngine } = require('../src/audio/LavalinkEngine');
const { classifyQuery, buildFallbackQueries } = require('../src/audio/queryGuard');
const { getPreset, listPresets, applyFilterPreset } = require('../src/audio/filters');

describe('queryGuard', () => {
    it('classifies URLs and search queries safely', () => {
        const yt = classifyQuery('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        assert.equal(yt.valid, true);
        assert.equal(yt.isUrl, true);
        assert.equal(yt.source, 'youtube');

        const local = classifyQuery('http://localhost:2333/secret');
        assert.equal(local.valid, false);

        const text = classifyQuery('Daft Punk Instant Crush', 'ytmsearch');
        assert.equal(text.valid, true);
        assert.equal(text.isUrl, false);
        assert.equal(text.source, 'ytmsearch');
    });

    it('builds multi-source fallback queries without duplicate brackets', () => {
        const fallbacks = buildFallbackQueries({
            info: { title: 'Starboy [Official Video]', author: 'The Weeknd' },
        });
        assert.equal(fallbacks.length, 4);
        assert.equal(fallbacks[0].query, 'Starboy The Weeknd');
        assert.deepEqual(
            fallbacks.map((f) => f.source),
            ['ytmsearch', 'scsearch', 'dzsearch', 'ytsearch']
        );
    });
});

describe('NodeRegistry scoring', () => {
    it('penalizes high CPU load, dropped frames, and cooldowns', () => {
        const cfg = loadConfig({});
        const reg = new NodeRegistry(cfg);

        reg.updateLatency('n1', 30);
        reg.updateStats('n1', { cpu: { systemLoad: 0.15, lavalinkLoad: 0.1 }, frameStats: { deficit: 0, nulled: 0 } });
        reg.recordSuccess('n1');

        reg.updateLatency('n2', 200);
        reg.updateStats('n2', { cpu: { systemLoad: 0.92, lavalinkLoad: 0.9 }, frameStats: { deficit: 30, nulled: 15 } });
        reg.recordFailure('n2', 'STALL', 'high_drop');

        const s1 = reg.scoreNode('n1', { secure: true, hasYoutube: true });
        const s2 = reg.scoreNode('n2', { secure: false, hasYoutube: true });
        assert.ok(s1 > s2);
    });

    it('prioritizes private node above public nodes', () => {
        const cfg = loadConfig({
            LAVALINK_HOST: 'lava.myserver.com',
            LAVALINK_PORT: '2333',
            LAVALINK_PASSWORD: 'secret',
        });
        const reg = new NodeRegistry(cfg);
        const priv = reg.getPrivateNodeOption();
        assert.ok(priv);
        assert.ok(reg.scoreNode(priv.id, priv) > reg.scoreNode('pub-1', { secure: true }));
    });
});

describe('filters', () => {
    it('exposes studio presets and applies them cleanly', async () => {
        assert.ok(listPresets().length >= 6);
        assert.ok(getPreset('bassboost'));

        const calls = [];
        const mockPlayer = {
            state: new Map(),
            set(k, v) {
                this.state.set(k, v);
            },
            filterManager: {
                clearEQ: async () => calls.push('clearEQ'),
                resetFilters: async () => calls.push('reset'),
                setEQ: async (bands) => calls.push(`eq:${bands.length}`),
                toggleNightcore: async () => calls.push('nightcore'),
                toggleVaporwave: async () => calls.push('vaporwave'),
                toggleRotation: async () => calls.push('rotation'),
                toggleKaraoke: async () => calls.push('karaoke'),
                toggleLowPass: async () => calls.push('lowpass'),
            },
        };

        const preset = await applyFilterPreset(mockPlayer, 'bassboost');
        assert.equal(preset.id, 'bassboost');
        assert.equal(mockPlayer.state.get('eqPreset'), 'bassboost');
        assert.ok(calls.includes('clearEQ'));
        assert.ok(calls.includes('reset'));
        assert.ok(calls.some((c) => c.startsWith('eq:')));

        await applyFilterPreset(mockPlayer, 'nightcore');
        assert.ok(calls.includes('nightcore'));
        await applyFilterPreset(mockPlayer, '8d');
        assert.ok(calls.includes('rotation'));
    });
});

describe('LavalinkEngine anti-stall watchdog', () => {
    it('triggers stream recovery after consecutive frozen position checks', async () => {
        const cfg = loadConfig({});
        const engine = new LavalinkEngine({}, cfg, { get: () => ({}) });
        let recoveredAt = null;
        engine._attemptTrackRecovery = async (_player, _track, pos) => {
            recoveredAt = pos;
            return true;
        };
        const fakePlayer = {
            guildId: 'g-1',
            playing: true,
            paused: false,
            position: 42000,
            node: { id: 'node-a' },
            queue: { current: { info: { identifier: 'id-1', title: 'Test', isStream: false } } },
        };
        engine.manager = { players: new Map([['g-1', fakePlayer]]) };

        await engine.checkPlaybackWatchdog();
        assert.equal(recoveredAt, null);
        await engine.checkPlaybackWatchdog();
        assert.equal(recoveredAt, null);
        await engine.checkPlaybackWatchdog();
        assert.equal(recoveredAt, 42000);
    });
});
