'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('../utils/logger');

const log = createLogger('events');

function loadEvents(client, eventsDir = path.join(__dirname, '..', 'events')) {
    if (!fs.existsSync(eventsDir)) return 0;
    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js')).sort();
    let count = 0;

    for (const file of files) {
        const mod = require(path.join(eventsDir, file));
        if (!mod?.name || typeof mod.execute !== 'function') {
            log.warn('Skipping invalid event module', { file });
            continue;
        }
        if (mod.once) {
            client.once(mod.name, (...args) => mod.execute(...args, client));
        } else {
            client.on(mod.name, (...args) => mod.execute(...args, client));
        }
        count += 1;
    }

    log.info(`Registered ${count} Discord event handlers`);
    return count;
}

module.exports = { loadEvents };
