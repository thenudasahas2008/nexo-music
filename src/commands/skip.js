'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('skip').setDescription('Skip to the next track in the queue'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.current) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'No track is currently active.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        const settings = client.guildStore.get(interaction.guildId);
        if (!hasDjAccess(interaction.member, settings, client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const skippedTitle = player.queue.current.info.title;
        if (!player.queue.tracks.length && !settings.autoplay) {
            await player.stopPlaying(true, false);
            await client.dashboard.markStopped(interaction.guildId);
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Skipped', `Skipped **${skippedTitle}**. Queue is now empty.`)] });
        }
        await player.skip(0, false);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Skipped Track', `Skipped **${skippedTitle}**.`)] });
    },
};
