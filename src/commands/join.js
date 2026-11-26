'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('join').setDescription('Connect Sonara to your current voice channel'),
    async execute(interaction, client) {
        const voiceCheck = checkVoiceAccess(interaction, client.audio.getPlayer(interaction.guildId));
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        await client.audio.ensurePlayer({
            guildId: interaction.guildId,
            voiceChannelId: voiceCheck.voiceChannel.id,
            textChannelId: interaction.channelId,
        });
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Connected', `Joined <#${voiceCheck.voiceChannel.id}> and ready to stream.`)] });
    },
};
