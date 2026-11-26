'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a track from the queue by its position')
        .addIntegerOption((opt) => opt.setName('position').setDescription('Track number in /queue').setRequired(true).setMinValue(1)),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.tracks?.length) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Queue Empty', 'No upcoming tracks to remove.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const pos = interaction.options.getInteger('position', true);
        if (pos > player.queue.tracks.length) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Out of Range', `Choose a position between 1 and ${player.queue.tracks.length}.`)], flags: 64 });
        }
        const [removed] = player.queue.tracks.splice(pos - 1, 1);
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Removed Track', `Removed **${removed?.info?.title || 'track'}** from position \`#${pos}\`.`)] });
    },
};
