'use strict';

const crypto = require('node:crypto');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { createStatusEmbed, formatDuration, truncate } = require('../ui/dashboard');
const { checkVoiceAccess } = require('../utils/permissions');
const { ensureDeferred, safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search and pick a specific track from top results')
        .addStringOption((opt) =>
            opt.setName('query').setDescription('Song or artist to search').setRequired(true)
        ),

    async execute(interaction, client) {
        const query = interaction.options.getString('query', true);
        const voiceCheck = checkVoiceAccess(interaction, client.audio.getPlayer(interaction.guildId));
        if (!voiceCheck.ok) {
            await safeReply(interaction, {
                embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))],
                flags: 64,
            });
            return;
        }

        await ensureDeferred(interaction, { ephemeral: true });

        const search = await client.audio.searchTracks(query, interaction.user, interaction.guildId);
        if (!search.ok || !search.result?.tracks?.length) {
            await safeReply(interaction, {
                embeds: [createStatusEmbed('warning', 'No Matches', client.i18n.t(client.config.defaultLanguage, 'errors.noResults'))],
            });
            return;
        }

        const tracks = search.result.tracks.slice(0, 8);
        const sessionId = crypto.randomBytes(6).toString('hex');
        client.searchSessions.set(sessionId, {
            userId: interaction.user.id,
            tracks,
            createdAt: Date.now(),
        });
        setTimeout(() => client.searchSessions.delete(sessionId), 60000).unref?.();

        const lines = tracks.map((t, idx) => {
            const dur = t.info.isStream ? 'LIVE' : formatDuration(t.info.duration);
            return `\`${idx + 1}.\` **${truncate(t.info.title, 52)}** — ${truncate(t.info.author, 28)} \`[${dur}]\``;
        });

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`nexo:search:${sessionId}`)
            .setPlaceholder('Choose a track to play...')
            .addOptions(
                tracks.map((t, idx) => ({
                    label: truncate(t.info.title, 95),
                    description: truncate(`${t.info.author} • ${t.info.isStream ? 'LIVE' : formatDuration(t.info.duration)}`, 95),
                    value: String(idx),
                }))
            );

        await safeReply(interaction, {
            embeds: [createStatusEmbed('info', `Search Results: ${truncate(query, 45)}`, lines.join('\n'))],
            components: [new ActionRowBuilder().addComponents(menu)],
        });
    },
};
