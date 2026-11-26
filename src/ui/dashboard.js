'use strict';

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { getPreset } = require('../audio/filters');

const COLORS = Object.freeze({
    PLAYING: 0x6c5ce7,
    PAUSED: 0xf59e0b,
    LIVE: 0xf43f5e,
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

function createProgressBar(currentMs, totalMs, isStream = false, isPaused = false, segments = 10) {
    if (isStream) {
        return `${isPaused ? '⏸' : '🔴'}  \`LIVE\`  ${'━'.repeat(segments)}`;
    }
    const safeTotal = Math.max(1000, Number(totalMs) || 1000);
    const clampedCurrent = Math.max(0, Math.min(safeTotal, Number(currentMs) || 0));
    const ratio = clampedCurrent / safeTotal;
    const pos = Math.max(0, Math.min(segments - 1, Math.round(ratio * (segments - 1))));
    const bar = `${'━'.repeat(pos)}◉${'─'.repeat(Math.max(0, segments - 1 - pos))}`;
    const icon = isPaused ? '⏸' : '▶';
    return `${icon} \`${formatDuration(clampedCurrent)}\` ${bar} \`${formatDuration(safeTotal)}\``;
}

function getSourceAccentColor(sourceName = '') {
    const src = String(sourceName).toLowerCase();
    if (src.includes('spotify')) return 0x1db954;
    if (src.includes('soundcloud')) return 0xff5500;
    if (src.includes('youtube')) return 0x6c5ce7;
    if (src.includes('deezer')) return 0xa238ff;
    return COLORS.PLAYING;
}

function formatSourceLabel(sourceName = '') {
    const src = String(sourceName).toLowerCase();
    if (src.includes('youtube')) return 'YouTube';
    if (src.includes('spotify')) return 'Spotify';
    if (src.includes('soundcloud')) return 'SoundCloud';
    if (src.includes('deezer')) return 'Deezer';
    if (src.includes('apple')) return 'Apple Music';
    if (src.includes('twitch')) return 'Twitch';
    return 'Audio';
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
        .setTitle(`${iconMap[type] || '◈'}  ${truncate(title, 200)}`);

    if (description) {
        embed.setDescription(String(description).slice(0, 4000));
    }
    if (Array.isArray(fields) && fields.length > 0) {
        embed.addFields(fields.slice(0, 25));
    }
    return embed;
}

function buildNowPlayingEmbed(player, track, client, options = {}) {
    const botName = options.botName || 'Nexo';
    const avatarUrl = client?.user?.displayAvatarURL?.() || undefined;

    if (!player || !track?.info) {
        return new EmbedBuilder()
            .setColor(COLORS.IDLE)
            .setAuthor({ name: `${botName}  •  Session Ended`, iconURL: avatarUrl })
            .setDescription('Queue finished. Use `/play` anytime to queue more music.');
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

    const titleText = truncate(info.title || 'Unknown Track', 72);
    const artistText = truncate(info.author || 'Unknown Artist', 44);
    const sourceBadge = formatSourceLabel(info.sourceName);
    const requesterDisplay = track.requester?.id ? `<@${track.requester.id}>` : 'Autoplay';
    const progress = createProgressBar(position, duration, isStream, isPaused);

    const statusLabel = isPaused ? 'Paused' : isStream ? 'Live' : 'Now Playing';
    const embedColor = isPaused ? COLORS.PAUSED : isStream ? COLORS.LIVE : getSourceAccentColor(info.sourceName);

    const footerParts = [`🔊 ${volume}%`, `🔁 ${loopLabel}`];
    if (preset && preset.id !== 'flat') footerParts.push(`🎛️ ${preset.label}`);
    if (isAutoplay) footerParts.push('✨ Autoplay');
    if (is247) footerParts.push('♾️ 24/7');

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({
            name: `${botName}  •  ${statusLabel}`,
            iconURL: avatarUrl,
        })
        .setTitle(titleText)
        .setDescription(`**${artistText}**  •  ${sourceBadge}  •  ${requesterDisplay}\n\n${progress}`)
        .setFooter({ text: footerParts.join('   •   ') });

    if (info.uri && /^https?:\/\//i.test(info.uri)) {
        embed.setURL(info.uri);
    }

    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    const nextTrack = player.queue?.tracks?.[0];
    const remaining = player.queue?.tracks?.length || 0;
    if (nextTrack?.info) {
        const nextDur = nextTrack.info.isStream ? 'LIVE' : formatDuration(nextTrack.info.duration);
        const moreText = remaining > 1 ? `  *(+${remaining - 1} more)*` : '';
        embed.addFields({
            name: 'Up Next',
            value: `**${truncate(nextTrack.info.title, 48)}** — ${truncate(nextTrack.info.author || 'Unknown', 26)} \`[${nextDur}]\`${moreText}`,
            inline: false,
        });
    }

    return embed;
}

function buildDashboardComponents(player, options = {}) {
    const isPaused = Boolean(player?.paused);
    const repeatMode = player?.repeatMode || 'off';
    const isAutoplay = Boolean(options.autoplay ?? player?.get?.('autoplay'));
    const hasPrev = Boolean(player?.queue?.previous?.length);
    const hasQueue = Boolean(player?.queue?.tracks?.length);
    const queueCount = player?.queue?.tracks?.length || 0;

    const transportRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('nexo:prev')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasPrev),
        new ButtonBuilder()
            .setCustomId('nexo:toggle')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('nexo:skip')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('nexo:loop')
            .setEmoji(repeatMode === 'track' ? '🔂' : '🔁')
            .setStyle(repeatMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('nexo:stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger)
    );

    const queueButton = new ButtonBuilder()
        .setCustomId('nexo:queue')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary);
    if (queueCount > 0) {
        queueButton.setLabel(String(queueCount));
    }

    const utilityRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('nexo:voldown')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('nexo:volup')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('nexo:shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasQueue),
        new ButtonBuilder()
            .setCustomId('nexo:autoplay')
            .setEmoji('✨')
            .setStyle(isAutoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
        queueButton
    );

    return [transportRow, utilityRow];
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
        .setTitle('📜  Nexo Playback Queue')
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({
            text: `Page ${safePage}/${totalPages}  •  ${tracks.length} queued  •  Total ${formatDuration(totalMs)}`,
        });
}

function buildQueueComponents(page, totalPages) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`nexo:qpage:${Math.max(1, page - 1)}`)
                .setEmoji('◀️')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`nexo:qpage:${Math.min(totalPages, page + 1)}`)
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
