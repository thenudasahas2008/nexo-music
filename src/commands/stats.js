'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, formatDuration } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('stats').setDescription('View Kairo uptime, memory footprint, and stream metrics'),
    async execute(interaction, client) {
        const memMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);
        const uptime = formatDuration(client.uptime || 0);
        const activePlayers = client.audio.manager?.players?.size || 0;
        const onlineNodes = client.audio.getConnectedNodes().length;

        return safeReply(interaction, {
            embeds: [
                createStatusEmbed('info', `${client.config.botName} System Telemetry`, 'Real-time health & resource usage:', [
                    { name: '⚡ Gateway Ping', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
                    { name: '🔊 Active Streams', value: `\`${activePlayers}\``, inline: true },
                    { name: '🌐 Audio Nodes', value: `\`${onlineNodes} online\``, inline: true },
                    { name: '💾 Memory (RSS)', value: `\`${memMb} MiB\``, inline: true },
                    { name: '🏠 Servers', value: `\`${client.guilds.cache.size}\``, inline: true },
                    { name: '⏱️ Uptime', value: `\`${uptime}\``, inline: true },
                ]),
            ],
        });
    },
};
