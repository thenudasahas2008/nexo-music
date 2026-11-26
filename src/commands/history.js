'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, formatDuration, truncate } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('history').setDescription('View recently played tracks in this server'),
    async execute(interaction, client) {
        const history = client.audio.getHistory(interaction.guildId);
        if (!history.length) {
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'No History Yet', 'Play some tracks first to build session history.')], flags: 64 });
        }

        const lines = history.slice(0, 12).map((t, idx) => {
            const dur = t.isStream ? 'LIVE' : formatDuration(t.duration);
            const title = truncate(t.title, 48);
            const linked = t.uri ? `[${title}](${t.uri})` : title;
            return `\`${String(idx + 1).padStart(2, '0')}.\` **${linked}** — ${truncate(t.author, 24)} \`[${dur}]\``;
        });

        return safeReply(interaction, {
            embeds: [createStatusEmbed('info', `${client.config.botName} Session History`, lines.join('\n'))],
        });
    },
};
