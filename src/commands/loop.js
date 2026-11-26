'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set repeat mode for track or queue')
        .addStringOption((opt) =>
            opt
                .setName('mode')
                .setDescription('Repeat mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Current Track', value: 'track' },
                    { name: 'Entire Queue', value: 'queue' }
                )
        ),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'Start playback before setting loop mode.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const mode = interaction.options.getString('mode', true);
        await player.setRepeatMode(mode);
        await client.dashboard.refresh(interaction.guildId, player);
        const labels = { off: 'Off', track: 'Current Track', queue: 'Entire Queue' };
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Loop Updated', `Repeat mode set to **${labels[mode]}**.`)] });
    },
};
