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
            botName: 'Sonara',
            twentyFourSeven: true,
            autoplay: true,
        });
        assert.ok(embed.data.description.includes('Midnight City'));
        assert.ok(embed.data.author.name.includes('Sonara Studio'));

        const rows = buildDashboardComponents(fakePlayer, { autoplay: true });
        assert.equal(rows.length, 3);
        assert.equal(rows[0].components.length, 5);
        assert.equal(rows[1].components.length, 5);
        assert.equal(rows[2].components.length, 1);

        const qEmbed = buildQueueEmbed(fakePlayer, 1, 10);
        assert.ok(qEmbed.data.description.includes('Outro'));
    });

    it('loads all slash commands without schema errors', () => {
        const dummy = {};
        const cmds = loadCommands(dummy, path.join(__dirname, '..', 'src', 'commands'));
        assert.ok(cmds.length >= 25);
        for (const cmd of cmds) {
            assert.ok(cmd.name);
            assert.ok(cmd.description);
        }
    });
});
