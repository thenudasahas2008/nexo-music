'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('clear').setDescription('Clear all upcoming tracks from the queue'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.tracks?.length) {
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Already Empty', 'There are no upcoming tracks in the queue.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const count = player.queue.tracks.length;
        player.queue.tracks.splice(0);
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Queue Cleared', `Removed **${count}** upcoming track(s).`)] });
    },
};
