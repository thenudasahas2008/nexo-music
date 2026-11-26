'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');
const { createLogger } = require('../utils/logger');

const log = createLogger('commands');

function loadCommands(client, commandsDir = path.join(__dirname, '..', 'commands')) {
    client.commands = new Collection();
    if (!fs.existsSync(commandsDir)) return [];

    const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js')).sort();
    const jsonList = [];

    for (const file of files) {
        const fullPath = path.join(commandsDir, file);
        const mod = require(fullPath);
        if (!mod?.data?.name || typeof mod.execute !== 'function') {
            log.warn('Skipping invalid command module', { file });
            continue;
        }
        client.commands.set(mod.data.name, mod);
        jsonList.push(mod.data.toJSON());
    }

    log.info(`Loaded ${client.commands.size} slash commands`);
    return jsonList;
}

module.exports = { loadCommands };
