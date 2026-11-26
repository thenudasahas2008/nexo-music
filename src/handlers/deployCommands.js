'use strict';

const { REST, Routes } = require('discord.js');
const { loadConfig } = require('../config/env');
const { createLogger } = require('../utils/logger');
const { loadCommands } = require('./commandHandler');

const log = createLogger('deploy');

async function deployGlobalCommands(clientId, token, commandsJson) {
    if (!clientId || !token) {
        throw new Error('Missing Discord clientId or token for command deployment');
    }
    const rest = new REST({ version: '10', timeout: 15000 }).setToken(token);
    const result = await rest.put(Routes.applicationCommands(clientId), { body: commandsJson });
    return Array.isArray(result) ? result.length : commandsJson.length;
}

if (require.main === module) {
    (async () => {
        const config = loadConfig();
        if (!config.token) {
            log.error('TOKEN is missing in .env');
            process.exit(1);
        }
        const rest = new REST({ version: '10', timeout: 15000 }).setToken(config.token);
        const app = await rest.get(Routes.oauth2CurrentApplication());
        const dummyClient = {};
        const commandsJson = loadCommands(dummyClient);
        const deployed = await deployGlobalCommands(app.id, config.token, commandsJson);
        log.info(`Successfully deployed ${deployed} global slash commands for ${app.name}`);
    })().catch((err) => {
        log.error('Command deployment failed', { error: err.message });
        process.exit(1);
    });
}

module.exports = { deployGlobalCommands };
