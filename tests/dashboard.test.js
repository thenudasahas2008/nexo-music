'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    formatDuration,
    createProgressBar,
    buildNowPlayingEmbed,
    buildDashboardComponents,
    buildQueueEmbed,
} = require('../src/ui/dashboard');
const { loadCommands } = require('../src/handlers/commandHandler');

describe('dashboard UI', () => {
    it('formats durations and progress bars cleanly', () => {
        assert.equal(formatDuration(95000), '01:35');
        assert.equal(formatDuration(3661000), '1:01:01');
        const bar = createProgressBar(60000, 120000, false, false, 10);
        assert.ok(bar.includes('01:00'));
        assert.ok(bar.includes('02:00'));
        assert.ok(bar.includes('▶'));
    });

    it('builds Now Playing embed and 3 interactive component rows', () => {
        const fakePlayer = {
            guildId: '1',
            paused: false,
            position: 45000,
            volume: 85,
            repeatMode: 'queue',
            node: { id: 'lava-tls-1', ping: 24 },
            get: (k) => (k === 'eqPreset' ? 'bassboost' : k === 'autoplay' ? true : null),
            queue: {
                current: {
                    info: {
                        title: 'Midnight City',
                        author: 'M83',
                        duration: 243000,
                        uri: 'https://youtube.com/watch?v=test',
                        sourceName: 'youtube',
                        isStream: false,
                    },
                    requester: { id: '42' },
                },
                tracks: [
                    {
                        info: { title: 'Outro', author: 'M83', duration: 247000, isStream: false },
                        requester: { id: '42' },
                    },
                ],
                previous: [],
            },
        };

        const embed = buildNowPlayingEmbed(fakePlayer, fakePlayer.queue.current, null, {
            botName: 'Kairo',
            twentyFourSeven: true,
            autoplay: true,
        });
        assert.equal(embed.data.title, 'Midnight City');
        assert.equal(embed.data.url, 'https://youtube.com/watch?v=test');
        assert.ok(embed.data.author.name.includes('Kairo'));
        assert.ok(embed.data.description.includes('◉'));

        const rows = buildDashboardComponents(fakePlayer, { autoplay: true });
        assert.equal(rows.length, 2);
        assert.equal(rows[0].components.length, 5);
        assert.equal(rows[1].components.length, 5);

        const qEmbed = buildQueueEmbed(fakePlayer, 1, 10);
        assert.ok(qEmbed.data.description.includes('Outro'));
    });

    it('loads all 36 slash commands without schema errors', () => {
        const dummy = {};
        const cmds = loadCommands(dummy, path.join(__dirname, '..', 'src', 'commands'));
        assert.equal(cmds.length, 36);
        for (const cmd of cmds) {
            assert.ok(cmd.name);
            assert.ok(cmd.description);
        }
    });
});
