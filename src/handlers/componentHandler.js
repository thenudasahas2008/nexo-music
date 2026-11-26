'use strict';

const { applyFilterPreset } = require('../audio/filters');
const {
    createStatusEmbed,
    buildQueueEmbed,
    buildQueueComponents,
} = require('../ui/dashboard');
const { checkVoiceAccess, hasDjAccess } = require('../utils/permissions');
const { safeReply, safeUpdate } = require('../utils/rest');

async function handleComponentInteraction(interaction, client) {
    const id = interaction.customId || '';
    if (!id.startsWith('nexo:')) return false;

    if (id.startsWith('nexo:search:')) {
        const sessionId = id.slice('nexo:search:'.length);
        await handleSearchSelection(interaction, client, sessionId);
        return true;
    }

    const player = client.audio?.getPlayer(interaction.guildId);
    if (!player) {
        await safeReply(interaction, {
            embeds: [createStatusEmbed('warning', 'Session Ended', 'Nothing is currently playing in this server.')],
            flags: 64,
        });
        return true;
    }

    if (id.startsWith('nexo:qpage:')) {
        const page = Number.parseInt(id.slice('nexo:qpage:'.length), 10) || 1;
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil((player.queue?.tracks?.length || 0) / pageSize));
        const safePage = Math.max(1, Math.min(totalPages, page));
        await safeUpdate(interaction, {
            embeds: [buildQueueEmbed(player, safePage, pageSize)],
            components: buildQueueComponents(safePage, totalPages),
        });
        return true;
    }

    if (id === 'nexo:queue') {
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil((player.queue?.tracks?.length || 0) / pageSize));
        await safeReply(interaction, {
            embeds: [buildQueueEmbed(player, 1, pageSize)],
            components: totalPages > 1 ? buildQueueComponents(1, totalPages) : [],
            flags: 64,
        });
        return true;
    }

    const voiceCheck = checkVoiceAccess(interaction, player);
    if (!voiceCheck.ok) {
        await safeReply(interaction, {
            embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))],
            flags: 64,
        });
        return true;
    }

    const settings = client.guildStore.get(interaction.guildId);
    if (!hasDjAccess(interaction.member, settings, client.config, player)) {
        await safeReply(interaction, {
            embeds: [createStatusEmbed('error', 'DJ Access Required', 'Only DJs, admins, or solo listeners can use player controls.')],
            flags: 64,
        });
        return true;
    }

    if (id === 'nexo:eq' && interaction.isStringSelectMenu()) {
        const presetId = interaction.values?.[0] || 'flat';
        const preset = await applyFilterPreset(player, presetId);
        client.guildStore.set(interaction.guildId, { eqPreset: preset.id });
        await safeUpdate(interaction, {
            embeds: [client.dashboard.buildEmbed(player, player.queue.current)],
            components: client.dashboard.buildComponents(player),
        });
        return true;
    }

    switch (id) {
        case 'nexo:toggle': {
            if (player.paused) {
                await player.resume();
            } else {
                await player.pause();
            }
            break;
        }
        case 'nexo:skip': {
            if (!player.queue?.tracks?.length && !settings.autoplay) {
                await player.stopPlaying(true, false);
                await client.dashboard.markStopped(interaction.guildId);
                await safeReply(interaction, {
                    embeds: [createStatusEmbed('info', 'Skipped', 'No more tracks in queue — playback stopped.')],
                    flags: 64,
                });
                return true;
            }
            await player.skip(0, false);
            break;
        }
        case 'nexo:prev': {
            const prev = player.queue?.previous?.[0];
            if (!prev) {
                await safeReply(interaction, {
                    embeds: [createStatusEmbed('warning', 'No Previous Track', 'There is no previous track in history yet.')],
                    flags: 64,
                });
                return true;
            }
            await player.play({ clientTrack: prev });
            break;
        }
        case 'nexo:stop': {
            await client.audio.stopAndLeave(interaction.guildId, { keep247: settings.twentyFourSeven });
            await safeReply(interaction, {
                embeds: [createStatusEmbed('info', 'Playback Stopped', 'Cleared the queue and stopped the audio stream.')],
                flags: 64,
            });
            return true;
        }
        case 'nexo:loop': {
            const order = ['off', 'track', 'queue'];
            const nextMode = order[(order.indexOf(player.repeatMode || 'off') + 1) % order.length];
            await player.setRepeatMode(nextMode);
            break;
        }
        case 'nexo:shuffle': {
            if (player.queue?.tracks?.length > 1) {
                await player.queue.shuffle();
            }
            break;
        }
        case 'nexo:voldown': {
            const nextVol = Math.max(5, (player.volume ?? 80) - 10);
            await player.setVolume(nextVol);
            break;
        }
        case 'nexo:volup': {
            const nextVol = Math.min(100, (player.volume ?? 80) + 10);
            await player.setVolume(nextVol);
            break;
        }
        case 'nexo:autoplay': {
            const nextAutoplay = !Boolean(settings.autoplay);
            client.guildStore.set(interaction.guildId, { autoplay: nextAutoplay });
            player.set('autoplay', nextAutoplay);
            break;
        }
        default:
            return false;
    }

    await safeUpdate(interaction, {
        embeds: [client.dashboard.buildEmbed(player, player.queue.current)],
        components: client.dashboard.buildComponents(player),
    });
    return true;
}

async function handleSearchSelection(interaction, client, sessionId) {
    const session = client.searchSessions?.get(sessionId);
    if (!session || session.userId !== interaction.user.id) {
        await safeReply(interaction, {
            embeds: [createStatusEmbed('warning', 'Selection Expired', 'Run `/search` again to pick a track.')],
            flags: 64,
        });
        return;
    }

    const index = Number.parseInt(interaction.values?.[0], 10);
    const track = session.tracks?.[index];
    if (!track) {
        await safeReply(interaction, {
            embeds: [createStatusEmbed('error', 'Track Unavailable', 'That selection is no longer valid.')],
            flags: 64,
        });
        return;
    }

    client.searchSessions.delete(sessionId);
    const voiceCheck = checkVoiceAccess(interaction, client.audio.getPlayer(interaction.guildId));
    if (!voiceCheck.ok) {
        await safeReply(interaction, {
            embeds: [createStatusEmbed('error', 'Voice Required', client.i18n.t(client.config.defaultLanguage, voiceCheck.key, voiceCheck.meta))],
            flags: 64,
        });
        return;
    }

    const result = await client.audio.enqueueTrack({
        guildId: interaction.guildId,
        voiceChannelId: voiceCheck.voiceChannel.id,
        textChannelId: interaction.channelId,
        track,
        requester: interaction.user,
    });

    await safeUpdate(interaction, {
        embeds: [
            createStatusEmbed(
                'success',
                result.started ? 'Now Streaming' : 'Added to Queue',
                `**[${track.info.title}](${track.info.uri})** by **${track.info.author}**`
            ),
        ],
        components: [],
    });
}

module.exports = { handleComponentInteraction };
