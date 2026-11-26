'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, buildQueueEmbed, buildQueueComponents } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the upcoming track queue')
        .addIntegerOption((opt) => opt.setName('page').setDescription('Queue page number').setMinValue(1)),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.current && !player?.queue?.tracks?.length) {
            return safeReply(interaction, { embeds: [createStatusEmbed('info', 'Queue Empty', 'Nothing is queued right now.')], flags: 64 });
        }
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil((player.queue.tracks?.length || 0) / pageSize));
        const page = Math.min(totalPages, Math.max(1, interaction.options.getInteger('page') || 1));
        return safeReply(interaction, {
            embeds: [buildQueueEmbed(player, page, pageSize)],
            components: totalPages > 1 ? buildQueueComponents(page, totalPages) : [],
        });
    },
};
