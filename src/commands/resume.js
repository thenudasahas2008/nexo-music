'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('resume').setDescription('Resume paused playback'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.current) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'No track is currently active.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        if (!player.paused) {
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Already Playing', 'Audio playback is already running.')], flags: 64 });
        }
        await player.resume();
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Resumed', `Resumed **${player.queue.current.info.title}**.`)] });
    },
};
