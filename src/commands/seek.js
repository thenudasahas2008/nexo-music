'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, formatDuration } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

function parseTimestamp(raw) {
    const str = String(raw || '').trim();
    if (/^\d+$/.test(str)) return Number(str) * 1000;
    const parts = str.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Jump to a specific timestamp in the current track')
        .addStringOption((opt) =>
            opt.setName('time').setDescription('Timestamp like 1:30 or seconds like 90').setRequired(true)
        ),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        const track = player?.queue?.current;
        if (!track) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'No track is currently active.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        if (track.info.isStream || !track.info.isSeekable) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Cannot Seek', 'Live streams or non-seekable tracks cannot be scrubbed.')], flags: 64 });
        }
        const ms = parseTimestamp(interaction.options.getString('time', true));
        if (ms === null || ms > track.info.duration) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Invalid Timestamp', `Enter a time between \`0:00\` and \`${formatDuration(track.info.duration)}\`.`)], flags: 64 });
        }
        await player.seek(ms);
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Seeked', `Jumped to \`${formatDuration(ms)}\`.`)] });
    },
};
