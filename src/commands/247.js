'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('247').setDescription('Toggle 24/7 voice connection persistence in this server'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        const settings = client.guildStore.get(interaction.guildId);
        if (!hasDjAccess(interaction.member, settings, client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const next = !Boolean(settings.twentyFourSeven);
        client.guildStore.set(interaction.guildId, {
            twentyFourSeven: next,
            voiceChannelId: next ? voiceCheck.voiceChannel.id : null,
            textChannelId: next ? interaction.channelId : null,
        });
        if (next) {
            await client.audio.ensurePlayer({
                guildId: interaction.guildId,
                voiceChannelId: voiceCheck.voiceChannel.id,
                textChannelId: interaction.channelId,
            });
            client.audio.cancelEmptyChannelLeave(interaction.guildId);
            client.audio.cancelEmptyQueueLeave(interaction.guildId);
        }
        if (player) await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, {
            embeds: [
                createStatusEmbed(
                    'success',
                    `24/7 Mode ${next ? 'Enabled' : 'Disabled'}`,
                    next
                        ? `Sonara will stay connected to <#${voiceCheck.voiceChannel.id}> and automatically recover if disconnected.`
                        : 'Sonara will now leave automatically when the voice channel or queue becomes idle.'
                ),
            ],
        });
    },
};
