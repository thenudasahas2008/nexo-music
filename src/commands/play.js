'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { createStatusEmbed, formatDuration, truncate } = require('../ui/dashboard');
const { checkVoiceAccess } = require('../utils/permissions');
const { ensureDeferred, safeReply } = require('../utils/rest');
const { sanitizeQuery, isUrl } = require('../audio/queryGuard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Stream a song, playlist, or URL in studio quality')
        .addStringOption((opt) =>
            opt
                .setName('query')
                .setDescription('Song title, artist, YouTube / Spotify / SoundCloud link')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, client) {
        const focused = sanitizeQuery(interaction.options.getFocused() || '');
        if (!focused || focused.length < 2 || isUrl(focused)) {
            await interaction.respond([]);
            return;
        }
        const search = await client.audio.searchTracks(focused, interaction.user, interaction.guildId);
        if (!search.ok || !search.result?.tracks?.length) {
            await interaction.respond([]);
            return;
        }
        const choices = search.result.tracks.slice(0, 8).map((t) => ({
            name: truncate(`${t.info.title} — ${t.info.author} [${t.info.isStream ? 'LIVE' : formatDuration(t.info.duration)}]`, 100),
            value: (t.info.uri || `${t.info.title} ${t.info.author}`).slice(0, 100),
        }));
        await interaction.respond(choices).catch(() => {});
    },

    async execute(interaction, client) {
        const query = interaction.options.getString('query', true);
        const existingPlayer = client.audio.getPlayer(interaction.guildId);
        const voiceCheck = checkVoiceAccess(interaction, existingPlayer);
        if (!voiceCheck.ok) {
            await safeReply(interaction, {
                embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))],
                flags: 64,
            });
            return;
        }

        await ensureDeferred(interaction);

        const result = await client.audio.playQuery({
            guildId: interaction.guildId,
            voiceChannelId: voiceCheck.voiceChannel.id,
            textChannelId: interaction.channelId,
            query,
            requester: interaction.user,
        });

        if (!result.ok) {
            const msg =
                result.reason === 'NO_NODES'
                    ? client.i18n.t(client.config.defaultLanguage, 'errors.noNodes')
                    : client.i18n.t(client.config.defaultLanguage, 'errors.noResults');
            await safeReply(interaction, {
                embeds: [createStatusEmbed('warning', 'Playback Unavailable', msg)],
            });
            return;
        }

        if (result.isPlaylist) {
            await safeReply(interaction, {
                embeds: [
                    createStatusEmbed(
                        'success',
                        'Playlist Queued',
                        `Added **${result.addedCount}** tracks from **${truncate(result.playlistName || 'Playlist', 80)}** to the queue.`
                    ),
                ],
            });
            return;
        }

        const track = result.firstTrack;
        const dur = track.info.isStream ? 'LIVE' : formatDuration(track.info.duration);
        await safeReply(interaction, {
            embeds: [
                createStatusEmbed(
                    'success',
                    result.started ? 'Starting Stream' : 'Queued Track',
                    `**[${truncate(track.info.title, 75)}](${track.info.uri})**\nby **${truncate(track.info.author, 50)}**  •  \`${dur}\``
                ),
            ],
        });
    },
};
