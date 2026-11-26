'use strict';

const path = require('node:path');
const { Client, GatewayIntentBits, Options, Collection } = require('discord.js');
const { Agent, setGlobalDispatcher } = require('undici');
const { loadConfig } = require('./config/env');
const { createLogger, setLogLevel } = require('./utils/logger');
const { GuildStore } = require('./utils/guildStore');
const { I18n } = require('./i18n');
const { LavalinkEngine } = require('./audio/LavalinkEngine');
const { DashboardManager } = require('./ui/DashboardManager');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

const config = loadConfig();
setLogLevel(config.logLevel);
const log = createLogger('boot');

if (!config.token) {
    log.error('Missing TOKEN in environment. Set TOKEN in .env and restart.');
    process.exit(1);
}

// Bounded HTTP connection pooling for low-RAM containers (256 MiB safe)
setGlobalDispatcher(
    new Agent({
        keepAliveTimeout: 10000,
        keepAliveMaxTimeout: 30000,
        pipelining: 0,
        connections: 25,
        connectTimeout: 6000,
        headersTimeout: 8000,
        bodyTimeout: 10000,
    })
);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 25,
        GuildMemberManager: {
            maxSize: 150,
            keepOverLimit: (member) => member.id === client.user?.id,
        },
        UserManager: {
            maxSize: 200,
            keepOverLimit: (user) => user.id === client.user?.id,
        },
        ThreadManager: 0,
        GuildEmojiManager: 0,
        GuildStickerManager: 0,
        GuildScheduledEventManager: 0,
        PresenceManager: 0,
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: 300,
            lifetime: 600,
        },
        users: {
            interval: 600,
            filter: () => (user) => user.id !== client.user?.id,
        },
    },
    rest: {
        timeout: 8000,
        retries: 2,
    },
});

client.config = config;
client.guildStore = new GuildStore(path.join(__dirname, '..', 'data', 'guild-settings.json'), {
    defaultVolume: config.playback.defaultVolume,
    autoplay: config.playback.autoplayDefault,
    language: config.defaultLanguage,
});
client.guildStore.loadSync();

client.i18n = new I18n(path.join(__dirname, 'i18n'), config.defaultLanguage);
client.searchSessions = new Collection();
client.audio = new LavalinkEngine(client, config, client.guildStore);
client.dashboard = new DashboardManager(client, config, client.guildStore);

client.pendingCommandsJson = loadCommands(client);
loadEvents(client);

async function gracefulShutdown(signal) {
    log.info(`Received ${signal}, flushing state and shutting down cleanly...`);
    try {
        await client.audio.shutdown();
        await client.guildStore.flush();
        await client.destroy();
    } catch (err) {
        log.error('Error during shutdown', { error: err.message });
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
    log.error('Unhandled rejection', { error: err?.message || String(err) });
});
process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', { error: err?.message || String(err) });
});

client.login(config.token).catch((err) => {
    log.error('Discord login failed', { error: err.message });
    process.exit(1);
});
