'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('back').setDescription('Play the previous track from history'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'No Session', 'No active audio session.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const prev = player.queue?.previous?.[0];
        if (!prev) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'No History', 'There is no previous track to return to.')], flags: 64 });
        }
        await player.play({ clientTrack: prev });
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Playing Previous', `Now playing **${prev.info.title}**.`)] });
    },
};
