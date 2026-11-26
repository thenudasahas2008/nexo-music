'use strict';

const { SlashCommandBuilder, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder().setName('invite').setDescription('Get the invite link for Kairo Music'),
    async execute(interaction, client) {
        const inviteUrl = client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.UseVAD,
            ],
        });
        const supportLine = client.config.supportInvite ? `\nSupport Server: ${client.config.supportInvite}` : '';
        return safeReply(interaction, {
            embeds: [
                createStatusEmbed(
                    'info',
                    `Invite ${client.config.botName}`,
                    `**[Add ${client.config.botName} to your server](${inviteUrl})**${supportLine}`
                ),
            ],
        });
    },
};
