'use strict';

const { ActivityType } = require('discord.js');
const { createLogger } = require('../utils/logger');
const { deployGlobalCommands } = require('../handlers/deployCommands');

const log = createLogger('ready');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        log.info(`Logged in as ${client.user.tag} (${client.user.id}) across ${client.guilds.cache.size} guilds`);

        try {
            await client.audio.init();
            await client.audio.restore247Players();
        } catch (err) {
            log.error('Audio engine startup encountered an error', { error: err.message });
        }

        if (client.pendingCommandsJson?.length) {
            deployGlobalCommands(client.user.id, client.config.token, client.pendingCommandsJson)
                .then((count) => log.info(`Synchronized ${count} global slash commands`))
                .catch((err) => log.warn('Automatic command sync failed', { error: err.message }));
        }

        let tick = 0;
        const updatePresence = () => {
            if (!client.user) return;
            const activePlayers = client.audio?.manager?.players?.size || 0;
            const guildCount = client.guilds.cache.size;
            const statuses = [
                { name: `/play • ${client.config.botName} Studio`, type: ActivityType.Listening },
                { name: `${activePlayers} live streams • ${guildCount} servers`, type: ActivityType.Watching },
                { name: `Zero-Drop HD Audio • /help`, type: ActivityType.Listening },
            ];
            const choice = statuses[tick % statuses.length];
            tick += 1;
            client.user.setPresence({
                status: 'online',
                activities: [choice],
            });
        };

        updatePresence();
        const interval = setInterval(updatePresence, 30000);
        interval.unref?.();
    },
};
