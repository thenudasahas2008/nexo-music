'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the interactive Nexo audio dashboard'),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.current) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'Start a song with `/play`.')], flags: 64 });
        }
        return safeReply(interaction, {
            embeds: [client.dashboard.buildEmbed(player, player.queue.current)],
            components: client.dashboard.buildComponents(player),
        });
    },
};
