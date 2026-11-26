'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('speed')
        .setDescription('Set custom playback speed (0.5x - 2.0x)')
        .addNumberOption((opt) =>
            opt.setName('rate').setDescription('Speed multiplier (e.g. 1.0 = normal, 1.25 = faster)').setRequired(true).setMinValue(0.5).setMaxValue(2.0)
        ),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.current) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'Start a track first.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const rate = Number(interaction.options.getNumber('rate', true).toFixed(2));
        await player.filterManager.setSpeed(rate);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Speed Updated', `Playback speed set to \`${rate}x\`.`)] });
    },
};
