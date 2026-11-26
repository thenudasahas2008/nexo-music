'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('autoplay').setDescription('Toggle smart autoplay when the queue finishes'),
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
        const next = !Boolean(settings.autoplay);
        client.guildStore.set(interaction.guildId, { autoplay: next });
        if (player) {
            player.set('autoplay', next);
            await client.dashboard.refresh(interaction.guildId, player);
        }
        return safeReply(interaction, {
            embeds: [
                createStatusEmbed(
                    'success',
                    `Autoplay ${next ? 'Enabled' : 'Disabled'}`,
                    next ? `${client.config.botName} will automatically queue similar tracks when your queue ends.` : 'Playback will stop normally after the last track.'
                ),
            ],
        });
    },
};
