'use strict';

const { createLogger } = require('../utils/logger');
const { createStatusEmbed } = require('../ui/dashboard');
const { safeReply } = require('../utils/rest');
const { handleComponentInteraction } = require('../handlers/componentHandler');

const log = createLogger('interactions');
const COMMAND_TIMEOUT_MS = 20000;

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command?.autocomplete) return;
            try {
                await command.autocomplete(interaction, client);
            } catch {
                await interaction.respond([]).catch(() => {});
            }
            return;
        }

        const abortController = new AbortController();
        interaction._abortSignal = abortController.signal;
        const timeoutTimer = setTimeout(() => {
            abortController.abort(new Error('Interaction execution timeout'));
        }, COMMAND_TIMEOUT_MS);
        timeoutTimer.unref?.();

        try {
            if (interaction.isButton() || interaction.isStringSelectMenu()) {
                await handleComponentInteraction(interaction, client);
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            if (!interaction.inGuild()) {
                await safeReply(interaction, {
                    embeds: [createStatusEmbed('warning', 'Server Only', `Please use ${client.config.botName} commands inside a Discord server.`)],
                    flags: 64,
                });
                return;
            }

            await Promise.race([
                command.execute(interaction, client),
                new Promise((_, reject) => {
                    abortController.signal.addEventListener(
                        'abort',
                        () => reject(new Error('Command exceeded 20s timeout')),
                        { once: true }
                    );
                }),
            ]);
        } catch (err) {
            log.error(`Interaction failed (${interaction.commandName || interaction.customId || 'unknown'})`, {
                error: err.message,
                guildId: interaction.guildId,
            });
            await safeReply(interaction, {
                embeds: [
                    createStatusEmbed(
                        'error',
                        'Action Failed',
                        err.message?.includes('timeout')
                            ? 'That request took too long to respond. Please try again.'
                            : 'Something went wrong while executing that action.'
                    ),
                ],
                flags: 64,
            }).catch(() => {});
        } finally {
            clearTimeout(timeoutTimer);
        }
    },
};
