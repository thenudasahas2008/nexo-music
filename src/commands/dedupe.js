'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('dedupe').setDescription('Remove duplicate tracks from the upcoming queue'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.tracks?.length) {
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Queue Empty', 'No queued tracks to check.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const seen = new Set();
        if (player.queue.current?.info?.identifier) {
            seen.add(player.queue.current.info.identifier);
        }
        const unique = [];
        let removed = 0;
        for (const t of player.queue.tracks) {
            const key = t?.info?.identifier || t?.info?.uri || t?.info?.title;
            if (key && seen.has(key)) {
                removed += 1;
            } else {
                if (key) seen.add(key);
                unique.push(t);
            }
        }
        player.queue.tracks.splice(0, player.queue.tracks.length, ...unique);
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Queue Cleaned', `Removed **${removed}** duplicate track(s).`)] });
    },
};
