'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Jump directly to a track in the queue')
        .addIntegerOption((opt) => opt.setName('position').setDescription('Track number in /queue').setRequired(true).setMinValue(1)),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        const len = player?.queue?.tracks?.length || 0;
        if (!len) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Queue Empty', 'No upcoming tracks to jump to.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const pos = interaction.options.getInteger('position', true);
        if (pos > len) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Out of Range', `Choose a position between 1 and ${len}.`)], flags: 64 });
        }
        const target = player.queue.tracks[pos - 1];
        await player.skip(pos, false);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Jumped', `Jumped to **${target?.info?.title || `track #${pos}`}**.`)] });
    },
};
