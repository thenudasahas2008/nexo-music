'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle all upcoming tracks in the queue'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if ((player?.queue?.tracks?.length || 0) < 2) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing to Shuffle', 'Need at least 2 queued tracks to shuffle.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        await player.queue.shuffle();
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Shuffled Queue', `Shuffled **${player.queue.tracks.length}** tracks.`)] });
    },
};
