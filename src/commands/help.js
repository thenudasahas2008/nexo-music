'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Explore Nexo commands and audio features'),
    async execute(interaction, client) {
        return safeReply(interaction, {
            embeds: [
                createStatusEmbed('info', `${client.config.botName} Studio — Command Guide`, 'Zero-drop multi-node Discord audio engine:', [
                    {
                        name: '🎵 Playback',
                        value: '`/play` `/playnext` `/search` `/pause` `/resume` `/skip` `/back` `/seek` `/replay` `/stop`',
                        inline: false,
                    },
                    {
                        name: '📜 Queue & History',
                        value: '`/nowplaying` `/queue` `/history` `/remove` `/move` `/jump` `/clear` `/shuffle` `/dedupe` `/loop` `/grab`',
                        inline: false,
                    },
                    {
                        name: '🎛️ Studio DSP & Automation',
                        value: '`/filter` `/bassboost` `/speed` `/pitch` `/volume` `/247` `/autoplay` `/lyrics`',
                        inline: false,
                    },
                    {
                        name: '⚙️ Utility & Diagnostics',
                        value: '`/join` `/leave` `/nodes` `/settings` `/stats` `/invite`',
                        inline: false,
                    },
                ]),
            ],
            flags: 64,
        });
    },
};
