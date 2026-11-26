'use strict';

const { createLogger } = require('../utils/logger');

const log = createLogger('guilds');

module.exports = {
    name: 'guildDelete',
    once: false,
    async execute(guild, client) {
        log.info(`Removed from server: ${guild.name || guild.id}`);
        if (client.audio) {
            await client.audio.stopAndLeave(guild.id, { keep247: false }).catch(() => {});
        }
    },
};
