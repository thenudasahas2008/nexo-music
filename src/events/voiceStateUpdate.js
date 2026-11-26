'use strict';

const { createLogger } = require('../utils/logger');

const log = createLogger('voice');

module.exports = {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState, newState, client) {
        const guildId = newState.guild?.id || oldState.guild?.id;
        if (!guildId || !client.audio) return;

        // Auto-unsuppress if bot is moved into a Stage channel
        if (newState.id === client.user?.id && newState.channelId && newState.suppress) {
            newState.setSuppressed(false).catch(() => {
                newState.setRequestToSpeak(true).catch(() => {});
            });
        }

        // Bot was disconnected from voice
        if (oldState.id === client.user?.id && oldState.channelId && !newState.channelId) {
            const settings = client.guildStore.get(guildId);
            if (settings.twentyFourSeven && settings.voiceChannelId) {
                setTimeout(() => {
                    client.audio.ensure247Reconnect(guildId).catch((err) =>
                        log.warn('24/7 voice rejoin failed', { guildId, error: err.message })
                    );
                }, 2500).unref?.();
            } else {
                await client.audio.handleBotDisconnected(guildId);
            }
            return;
        }

        // Check empty channel idle timer
        const player = client.audio.getPlayer(guildId);
        if (!player?.voiceChannelId) return;

        const botVc = newState.guild.channels.cache.get(player.voiceChannelId);
        if (!botVc) return;

        const humans = botVc.members.filter((m) => !m.user.bot).size;
        if (humans === 0) {
            client.audio.scheduleEmptyChannelLeave(guildId);
        } else {
            client.audio.cancelEmptyChannelLeave(guildId);
        }
    },
};
