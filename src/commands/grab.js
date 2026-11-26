'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, formatDuration } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('grab').setDescription('Send the current track link to your DMs'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        const track = player?.queue?.current;
        if (!track) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'No active track to save.')], flags: 64 });
        }
        const embed = createStatusEmbed(
            'info',
            'Saved Track',
            `**[${track.info.title}](${track.info.uri})**\nby **${track.info.author}** • \`${track.info.isStream ? 'LIVE' : formatDuration(track.info.duration)}\`\nFrom **${interaction.guild.name}**`
        );
        try {
            await interaction.user.send({ embeds: [embed] });
            return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Sent to DMs', 'Saved the current track to your direct messages.')], flags: 64 });
        } catch {
            return safeReply(interaction, { embeds: [embed], flags: 64 });
        }
    },
};
