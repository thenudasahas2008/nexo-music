'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { applyFilterPreset, listPresets } = require('../audio/filters');
const { createStatusEmbed } = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply } = require('../utils/rest');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Apply a studio EQ / audio DSP preset')
        .addStringOption((opt) =>
            opt
                .setName('preset')
                .setDescription('Audio profile')
                .setRequired(true)
                .addChoices(...listPresets().map((p) => ({ name: p.label, value: p.id })))
        ),
    async execute(interaction, client) {
        const player = client.audio.getPlayer(interaction.guildId);
        if (!player?.queue?.current) {
            return safeReply(interaction, { embeds: [createStatusEmbed('warning', 'Nothing Playing', 'Start a track before applying filters.')], flags: 64 });
        }
        const voiceCheck = checkVoiceAccess(interaction, player);
        if (!voiceCheck.ok) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))], flags: 64 });
        }
        if (!hasDjAccess(interaction.member, client.guildStore.get(interaction.guildId), client.config, player)) {
            return safeReply(interaction, { embeds: [createStatusEmbed('error', 'DJ Required', client.i18n.t(client.config.defaultLanguage, 'errors.noDjPerm'))], flags: 64 });
        }
        const presetId = interaction.options.getString('preset', true);
        const preset = await applyFilterPreset(player, presetId);
        client.guildStore.set(interaction.guildId, { eqPreset: preset.id });
        await client.dashboard.refresh(interaction.guildId, player);
        return safeReply(interaction, { embeds: [createStatusEmbed('success', 'Audio Profile Applied', `${preset.emoji} **${preset.label}** — ${preset.description}`)] });
    },
};
