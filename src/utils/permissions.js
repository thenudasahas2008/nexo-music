'use strict';

const { PermissionFlagsBits } = require('discord.js');

function checkVoiceAccess(interaction, player) {
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
        return { ok: false, key: 'errors.notInVoice' };
    }

    const botChannelId = player?.voiceChannelId || interaction.guild?.members?.me?.voice?.channelId;
    if (botChannelId && botChannelId !== voiceChannel.id) {
        return { ok: false, key: 'errors.differentVoiceChannel', meta: { channelId: botChannelId } };
    }

    const me = interaction.guild?.members?.me;
    if (me) {
        const perms = voiceChannel.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.Connect)) {
            return { ok: false, key: 'errors.missingConnectPerm' };
        }
        if (!perms?.has(PermissionFlagsBits.Speak)) {
            return { ok: false, key: 'errors.missingSpeakPerm' };
        }
    }

    return { ok: true, voiceChannel };
}

function hasDjAccess(member, guildSettings, config, player) {
    if (!member) return false;
    if (config?.ownerId && member.id === config.ownerId) return true;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;

    const djRoleId = guildSettings?.djRoleId;
    if (djRoleId && member.roles?.cache?.has(djRoleId)) return true;

    const allowedRoles = config?.playback?.allowedRoles || [];
    if (allowedRoles.length > 0 && allowedRoles.some((r) => member.roles?.cache?.has(r))) {
        return true;
    }

    // If no DJ role is configured, any user alone with the bot in VC or any VC member can control playback
    if (!djRoleId && allowedRoles.length === 0) return true;

    const vc = member.voice?.channel;
    if (vc) {
        const humanListeners = vc.members.filter((m) => !m.user.bot).size;
        if (humanListeners <= 1) return true;
    }

    const currentRequesterId = player?.queue?.current?.requester?.id;
    if (currentRequesterId && currentRequesterId === member.id) return true;

    return false;
}

module.exports = {
    checkVoiceAccess,
    hasDjAccess,
};
