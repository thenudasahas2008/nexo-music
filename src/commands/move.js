'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move a queued track to a new position')
        .addIntegerOption((opt) => opt.setName('from').setDescription('Current position').setRequired(true).setMinValue(1))
        .addIntegerOption((opt) => opt.setName('to').setDescription('New position').setRequired(true).setMinValue(1)),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        const len = player?.queue?.tracks?.length || 0;
        if (len < 2) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Not Enough Tracks', 'Need at least 2 queued tracks to reorder.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const from = interaction.options.getInteger('from', true);
        const to = interaction.options.getInteger('to', true);
        if (from > len || to > len) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Out of Range', `Positions must be between 1 and ${len}.`)], flags: 64 });
        }
        const [track] = player.queue.tracks.splice(from - 1, 1);
        player.queue.tracks.splice(to - 1, 0, track);
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Moved Track', `Moved **${track.info.title}** from \`#${from}\` to \`#${to}\`.`)] });
    },
};
