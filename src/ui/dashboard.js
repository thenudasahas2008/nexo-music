'use strict';

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const { listPresets, getPreset } = require('../audio/filters');

const COLORS = Object.freeze({
    PLAYING: 0x7c5cff,
    PAUSED: 0xf59e0b,
    SUCCESS: 0x10b981,
    INFO: 0x38bdf8,
    WARNING: 0xf59e0b,
    ERROR: 0xef4444,
    IDLE: 0x2b2d31,
});

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function createProgressBar(currentMs, totalMs, isStream = false, isPaused = false, segments = 12) {
    if (isStream) {
        return `${isPaused ? '⏸' : '🔴'}  \`LIVE STREAM\`  ${'▰'.repeat(segments)}`;
    }
    const safeTotal = Math.max(1000, Number(totalMs) || 1000);
    const clampedCurrent = Math.max(0, Math.min(safeTotal, Number(currentMs) || 0));
    const ratio = clampedCurrent / safeTotal;
    const filled = Math.max(0, Math.min(segments, Math.round(ratio * segments)));
    const bar = `${'▰'.repeat(filled)}${'▱'.repeat(Math.max(0, segments - filled))}`;
    const icon = isPaused ? '⏸' : '▶';
    return `${icon}  \`${formatDuration(clampedCurrent)}\`  ${bar}  \`${formatDuration(safeTotal)}\``;
}

function formatSourceLabel(sourceName = '') {
    const src = String(sourceName).toLowerCase();
    if (src.includes('youtube')) return 'YouTube';
    if (src.includes('spotify')) return 'Spotify';
    if (src.includes('soundcloud')) return 'SoundCloud';
    if (src.includes('deezer')) return 'Deezer';
    if (src.includes('apple')) return 'Apple Music';
    if (src.includes('twitch')) return 'Twitch';
    return 'Direct Audio';
}

function truncate(text, max = 64) {
    const str = String(text || '').trim();
    if (str.length <= max) return str;
    return `${str.slice(0, Math.max(0, max - 1))}…`;
}

function createStatusEmbed(type, title, description, fields = []) {
    const colorMap = {
        success: COLORS.SUCCESS,
        info: COLORS.INFO,
        warning: COLORS.WARNING,
        error: COLORS.ERROR,
    };
    const iconMap = {
        success: '✦',
        info: '◈',
        warning: '▲',
        error: '✕',
    };

    const embed = new EmbedBuilder()
        .setColor(colorMap[type] || COLORS.INFO)
        .setTitle(`${iconMap[type] || '◈'}  ${truncate(title, 200)}`)
        .setTimestamp();

    if (description) {
        embed.setDescription(String(description).slice(0, 4000));
    }
    if (Array.isArray(fields) && fields.length > 0) {
        embed.addFields(fields.slice(0, 25));
    }
    return embed;
}

function buildNowPlayingEmbed(player, track, client, options = {}) {
    if (!player || !track?.info) {
        return new EmbedBuilder()
            .setColor(COLORS.IDLE)
            .setAuthor({
                name: `${options.botName || 'Kairo'} Studio  •  Session Ended`,
                iconURL: client?.user?.displayAvatarURL?.() || undefined,
            })
            .setDescription('Queue finished. Use `/play` anytime to start a new listening session.');
    }

    const info = track.info;
    const isPaused = Boolean(player.paused);
    const isStream = Boolean(info.isStream);
    const position = Number(player.position || 0);
    const duration = Number(info.duration || 0);
    const volume = Number(player.volume ?? 80);
    const repeatMode = player.repeatMode || 'off';
    const loopLabel = repeatMode === 'track' ? 'Track' : repeatMode === 'queue' ? 'Queue' : 'Off';
    const preset = getPreset(player.get?.('eqPreset') || options.eqPreset || 'flat');
    const is247 = Boolean(options.twentyFourSeven);
    const isAutoplay = Boolean(options.autoplay ?? player.get?.('autoplay'));
    const nodeLatency = Number(player.ping?.lavalink || player.node?.ping || options.nodeLatencyMs);
    const latencyLabel = Number.isFinite(nodeLatency) && nodeLatency > 0 ? `${Math.round(nodeLatency)}ms` : 'Active';

    const titleText = truncate(info.title || 'Unknown Track', 80);
    const titleLine = info.uri ? `**[${titleText}](${info.uri})**` : `**${titleText}**`;
    const artistText = truncate(info.author || 'Unknown Artist', 50);
    const sourceBadge = formatSourceLabel(info.sourceName);
    const progress = createProgressBar(position, duration, isStream, isPaused);

    const nextTrack = player.queue?.tracks?.[0];
    const remaining = player.queue?.tracks?.length || 0;
    const upNextValue = nextTrack?.info
        ? `**${truncate(nextTrack.info.title, 48)}** — ${truncate(nextTrack.info.author || 'Unknown', 28)} \`[${nextTrack.info.isStream ? 'LIVE' : formatDuration(nextTrack.info.duration)}]\`${remaining > 1 ? ` *(+${remaining - 1} more)*` : ''}`
        : isAutoplay
          ? '*Autoplay will queue a matching track next*'
          : '*Queue is empty — add tracks with `/play`*';

    const requesterId = track.requester?.id;
    const requesterDisplay = requesterId ? `<@${requesterId}>` : 'Autoplay';

    const statusBadge = isPaused ? 'PAUSED' : isStream ? 'LIVE STREAM' : 'NOW PLAYING';
    const footerParts = [`${options.botName || 'Kairo'} Zero-Drop Audio`];
    if (is247) footerParts.push('24/7 On');
    if (isAutoplay) footerParts.push('Autoplay On');
    if (player.node?.id) footerParts.push(`Node ${player.node.id.slice(0, 22)}`);

    const embed = new EmbedBuilder()
        .setColor(isPaused ? COLORS.PAUSED : isStream ? 0xf43f5e : COLORS.PLAYING)
        .setAuthor({
            name: `${options.botName || 'Kairo'} Studio  •  ${statusBadge}`,
            iconURL: client?.user?.displayAvatarURL?.() || undefined,
        })
        .setDescription(`${titleLine}\nby **${artistText}**  •  \`${sourceBadge}\`\n\n${progress}`)
        .addFields(
            {
                name: '🎚️ Audio',
                value: `\`${volume}%\`  •  EQ: \`${preset?.label || 'Flat'}\`\nLoop: \`${loopLabel}\``,
                inline: true,
            },
            {
                name: '⚡ Engine',
                value: `Ping: \`${latencyLabel}\`\nMode: \`${is247 ? '24/7 Locked' : 'HD Relay'}\``,
                inline: true,
            },
            {
                name: '🎧 Requested',
                value: requesterDisplay,
                inline: true,
            },
            {
                name: '⏭️ Up Next',
                value: upNextValue,
                inline: false,
            }
        )
        .setFooter({ text: footerParts.join('  •  ') })
        .setTimestamp();

    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    return embed;
}

function buildDashboardComponents(player, options = {}) {
    const isPaused = Boolean(player?.paused);
    const repeatMode = player?.repeatMode || 'off';
    const isAutoplay = Boolean(options.autoplay ?? player?.get?.('autoplay'));
    const hasPrev = Boolean(player?.queue?.previous?.length);
    const hasQueue = Boolean(player?.queue?.tracks?.length);
    const currentPreset = player?.get?.('eqPreset') || options.eqPreset || 'flat';

    const transportRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('kairo:prev')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasPrev),
        new ButtonBuilder()
            .setCustomId('kairo:toggle')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setLabel(isPaused ? 'Resume' : 'Pause')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('kairo:skip')
            .setEmoji('⏭️')
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('kairo:stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('kairo:loop')
            .setEmoji('🔁')
            .setLabel(repeatMode === 'off' ? 'Loop' : repeatMode === 'track' ? 'Track' : 'Queue')
            .setStyle(repeatMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success)
    );

    const utilityRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('kairo:shuffle')
            .setEmoji('🔀')
            .setLabel('Shuffle')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasQueue),
        new ButtonBuilder()
            .setCustomId('kairo:voldown')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('kairo:volup')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('kairo:autoplay')
            .setEmoji('✨')
            .setLabel('Autoplay')
            .setStyle(isAutoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('kairo:queue')
            .setEmoji('📜')
            .setLabel(`Queue (${player?.queue?.tracks?.length || 0})`)
            .setStyle(ButtonStyle.Secondary)
    );

    const eqMenu = new StringSelectMenuBuilder()
        .setCustomId('kairo:eq')
        .setPlaceholder('🎛️ Select Studio EQ / Audio Preset')
        .addOptions(
            listPresets().map((preset) => ({
                label: preset.label,
                description: preset.description,
                value: preset.id,
                emoji: preset.emoji,
                default: preset.id === currentPreset,
            }))
        );

    const filterRow = new ActionRowBuilder().addComponents(eqMenu);

    return [transportRow, utilityRow, filterRow];
}

function buildQueueEmbed(player, page = 1, pageSize = 10) {
    const current = player?.queue?.current;
    const tracks = player?.queue?.tracks || [];
    const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
    const safePage = Math.max(1, Math.min(totalPages, page));
    const start = (safePage - 1) * pageSize;
    const slice = tracks.slice(start, start + pageSize);

    const totalMs = tracks.reduce((sum, t) => sum + (t?.info?.isStream ? 0 : Number(t?.info?.duration || 0)), 0);

    const lines = [];
    if (current?.info) {
        lines.push(
            `**Now Playing:** [${truncate(current.info.title, 60)}](${current.info.uri || 'https://discord.com'}) \`[${current.info.isStream ? 'LIVE' : formatDuration(current.info.duration)}]\``
        );
        lines.push('');
    }

    if (slice.length === 0) {
        lines.push('*No upcoming tracks in queue.*');
    } else {
        slice.forEach((track, idx) => {
            const num = start + idx + 1;
            const title = truncate(track.info?.title || 'Unknown', 52);
            const dur = track.info?.isStream ? 'LIVE' : formatDuration(track.info?.duration || 0);
            const req = track.requester?.id ? `<@${track.requester.id}>` : 'Auto';
            lines.push(`\`${String(num).padStart(2, '0')}.\` **${title}** \`[${dur}]\` • ${req}`);
        });
    }

    return new EmbedBuilder()
        .setColor(COLORS.PLAYING)
        .setTitle('📜  Kairo Playback Queue')
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({
            text: `Page ${safePage}/${totalPages}  •  ${tracks.length} queued  •  Total ${formatDuration(totalMs)}`,
        })
        .setTimestamp();
}

function buildQueueComponents(page, totalPages) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`kairo:qpage:${Math.max(1, page - 1)}`)
                .setEmoji('◀️')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`kairo:qpage:${Math.min(totalPages, page + 1)}`)
                .setEmoji('▶️')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
        ),
    ];
}

module.exports = {
    COLORS,
    formatDuration,
    createProgressBar,
    formatSourceLabel,
    truncate,
    createStatusEmbed,
    buildNowPlayingEmbed,
    buildDashboardComponents,
    buildQueueEmbed,
    buildQueueComponents,
};
