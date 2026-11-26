'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('leave').setDescription('Disconnect Kairo from the voice channel'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player) {
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Not Connected', `${client.config.botName} is not currently in a voice channel.`)], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        client.guildStore.set(interaction.guildId, { twentyFourSeven: false, voiceChannelId: null });
        await client.audio.stopAndLeave(interaction.guildId, { keep247: false });
        return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Disconnected', 'Left the voice channel.')] });
    },
};
