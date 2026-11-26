'use strict';

const { createLogger } = require('../utils/logger');

const log = createLogger('guilds');

module.exports = {
    name: 'guildCreate',
    once: false,
    execute(guild) {
        log.info(`Joined server: ${guild.name} (${guild.id}) • ${guild.memberCount} members`);
    },
};
