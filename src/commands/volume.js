'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjust playback volume (1 - 150%)')
        .addIntegerOption((opt) =>
            opt.setName('level').setDescription('Volume percentage').setRequired(true).setMinValue(1).setMaxValue(150)
        ),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'No active player in this server.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const level = interaction.options.getInteger('level', true);
        await player.setVolume(level);
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Volume Updated', `Playback volume set to \`${level}%\`.`)] });
    },
};
