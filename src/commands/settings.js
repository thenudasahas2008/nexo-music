'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createStatusEmbed } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Configure Kairo server defaults (Admin / Manage Server)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption((opt) => opt.setName('default_volume').setDescription('Default server volume (1-100)').setMinValue(1).setMaxValue(100))
        .addRoleOption((opt) => opt.setName('dj_role').setDescription('Role allowed to control playback'))
        .addBooleanOption((opt) => opt.setName('clear_dj_role').setDescription('Allow everyone in voice channel to control playback')),
    async execute(interaction, client) {
        const patch = {};
        const vol = interaction.options.getInteger('default_volume');
        const djRole = interaction.options.getRole('dj_role');
        const clearDj = interaction.options.getBoolean('clear_dj_role');

        if (vol !== null) patch.defaultVolume = vol;
        if (djRole) patch.djRoleId = djRole.id;
        if (clearDj) patch.djRoleId = null;

        const updated = Object.keys(patch).length > 0 ? client.guildStore.set(interaction.guildId, patch) : client.guildStore.get(interaction.guildId);
        return safeReply(interaction, {
            embeds: [
                createStatusEmbed('info', 'Server Settings', 'Current audio configuration for this server:', [
                    { name: 'Default Volume', value: `\`${updated.defaultVolume}%\``, inline: true },
                    { name: 'DJ Role', value: updated.djRoleId ? `<@&${updated.djRoleId}>` : '`Everyone in VC`', inline: true },
                    { name: '24/7 Mode', value: updated.twentyFourSeven ? '`Enabled`' : '`Disabled`', inline: true },
                    { name: 'Autoplay', value: updated.autoplay ? '`Enabled`' : '`Disabled`', inline: true },
                    { name: 'EQ Preset', value: `\`${updated.eqPreset}\``, inline: true },
                ]),
            ],
            flags: 64,
        });
    },
};
