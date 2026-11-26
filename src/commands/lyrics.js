'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, truncate } = require('../ui/dashboard');
const { ensureDeferred, safeReply } = require('../utils/rest');
const { readResponseTextWithLimit } = require('../utils/networkGuard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Fetch synced or plain lyrics for the current or specified song')
        .addStringOption((opt) => opt.setName('query').setDescription('Optional song title / artist')),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        const current = player?.queue?.current;
        const rawQuery = interaction.options.getString('query') || (current ? `${current.info.title} ${current.info.author}` : '');
        if (!rawQuery.trim()) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'No Song Specified', 'Play a song or provide a query to look up lyrics.')], flags: 64 });
        }

        await ensureDeferred(interaction);

        try {
            const url = `https://lrclib.net/api/search?q=${encodeURIComponent(rawQuery.trim())}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5500);
            timer.unref?.();
            const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'KairoMusic/1.1' } });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await readResponseTextWithLimit(res, 131072);
            const list = JSON.parse(text);
            const match = Array.isArray(list) ? list.find((x) => x.plainLyrics || x.syncedLyrics) : null;
            if (!match) {
                return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Lyrics Not Found', `No lyrics found for **${truncate(rawQuery, 80)}**.`)] });
            }
            const rawLyrics = (match.plainLyrics || match.syncedLyrics.replace(/\[\d+:\d+\.\d+\]\s*/g, '')).trim();
            return safeReply(interaction, {
                embeds: [createStatusEmbed('info', `${match.trackName} — ${match.artistName}`, rawLyrics.slice(0, 3900))],
            });
        } catch {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Lyrics Unavailable', 'Could not fetch lyrics right now. Please try again shortly.')] });
        }
    },
};
