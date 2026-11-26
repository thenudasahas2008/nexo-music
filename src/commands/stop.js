'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'No active player in this server.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        const settings = client.guildStore.get(interaction.guildId);
        if (!hasDjAccess(interaction.member, settings, client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        await client.audio.stopAndLeave(interaction.guildId, { keep247: settings.twentyFourSeven });
        return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Stopped', 'Cleared the queue and stopped playback.')] });
    },
};
