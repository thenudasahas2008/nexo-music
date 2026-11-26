'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('nodes').setDescription('Inspect live Lavalink audio node health, latency, and load'),
    async execute(interaction, client) {
        const nodes = Array.from(client.audio.manager?.nodeManager?.nodes?.values() || []);
        if (nodes.length === 0) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'No Audio Nodes', 'No Lavalink nodes are currently attached.')] });
        }

        const fields = nodes.map((node) => {
            const h = client.audio.registry.getHealth(node.id);
            const status = node.connected ? '🟢 Online' : '🔴 Reconnecting';
            const ping = Number.isFinite(node.ping) && node.ping > 0 ? `${Math.round(node.ping)}ms` : `${Math.round(h.latencyMs)}ms`;
            const cpu = `${Math.round((h.cpuLoad || 0) * 100)}%`;
            const score = client.audio.registry.scoreNode(node.id, node.options);
            return {
                name: `${status} • ${node.id}`,
                value: `Ping: \`${ping}\` • CPU: \`${cpu}\` • Players: \`${h.playingPlayers}\` • Score: \`${score}\``,
                inline: false,
            };
        });

        return safeReply(interaction, {
            embeds: [createStatusEmbed('info', `${client.config.botName} Audio Node Pool`, `Active multi-node failover pool (${nodes.filter((n) => n.connected).length}/${nodes.length} online).`, fields)],
        });
    },
};
