'use strict';

const { buildNowPlayingEmbed, buildDashboardComponents } = require('./dashboard');
const { withTimeout } = require('../utils/rest');

const PROGRESS_INTERVAL_MS = 12000;

class DashboardManager {
    constructor(client, config, guildStore) {
        this.client = client;
        this.config = config;
        this.guildStore = guildStore;
        this.messages = new Map(); // guildId -> { channelId, messageId, lastUpdatedAt }
        this.timers = new Map(); // guildId -> Interval
    }

    buildEmbed(player, track) {
        const settings = this.guildStore.get(player.guildId);
        const nodeLatencyMs = player.node?.id ? this.client.audio?.registry?.getHealth(player.node.id)?.latencyMs : undefined;
        return buildNowPlayingEmbed(player, track, this.client, {
            botName: this.config.botName,
            twentyFourSeven: settings.twentyFourSeven,
            autoplay: settings.autoplay,
            eqPreset: settings.eqPreset,
            nodeLatencyMs,
        });
    }

    buildComponents(player) {
        const settings = this.guildStore.get(player.guildId);
        return buildDashboardComponents(player, {
            autoplay: settings.autoplay,
            eqPreset: settings.eqPreset,
        });
    }

    async sendOrReplace(player, channel, track) {
        if (!player || !channel?.send) return null;
        await this.deleteOld(player.guildId);

        const embed = this.buildEmbed(player, track);
        const components = this.buildComponents(player);

        try {
            const msg = await withTimeout(() => channel.send({ embeds: [embed], components }), 6000);
            this.messages.set(player.guildId, {
                channelId: channel.id,
                messageId: msg.id,
                lastUpdatedAt: Date.now(),
            });
            this.startTicker(player.guildId);
            return msg;
        } catch {
            return null;
        }
    }

    async refresh(guildId, player) {
        const ref = this.messages.get(guildId);
        if (!ref || !player?.queue?.current) return;

        try {
            const channel = await this.client.channels.fetch(ref.channelId).catch(() => null);
            if (!channel?.messages) return;
            const msg = await channel.messages.fetch(ref.messageId).catch(() => null);
            if (!msg) {
                this.clear(guildId);
                return;
            }

            const embed = this.buildEmbed(player, player.queue.current);
            const components = this.buildComponents(player);

            await withTimeout(() => msg.edit({ embeds: [embed], components }), 5000);
            ref.lastUpdatedAt = Date.now();
        } catch {
            // Ignore transient message edit errors
        }
    }

    async markStopped(guildId) {
        this.stopTicker(guildId);
        const ref = this.messages.get(guildId);
        if (!ref) return;
        this.messages.delete(guildId);

        try {
            const channel = await this.client.channels.fetch(ref.channelId).catch(() => null);
            const msg = await channel?.messages?.fetch(ref.messageId).catch(() => null);
            if (!msg) return;
            const embed = buildNowPlayingEmbed(null, null, this.client, { botName: this.config.botName });
            await withTimeout(() => msg.edit({ embeds: [embed], components: [] }), 5000);
        } catch {
            // Ignore cleanup errors
        }
    }

    async deleteOld(guildId) {
        this.stopTicker(guildId);
        const ref = this.messages.get(guildId);
        if (!ref) return;
        this.messages.delete(guildId);

        try {
            const channel = await this.client.channels.fetch(ref.channelId).catch(() => null);
            const msg = await channel?.messages?.fetch(ref.messageId).catch(() => null);
            if (msg?.deletable) {
                await withTimeout(() => msg.delete(), 4000).catch(() => {});
            }
        } catch {
            // Ignore
        }
    }

    startTicker(guildId) {
        this.stopTicker(guildId);
        const timer = setInterval(() => {
            const player = this.client.audio?.getPlayer(guildId);
            if (!player || !player.queue?.current) {
                this.stopTicker(guildId);
                return;
            }
            if (player.paused) return;
            void this.refresh(guildId, player);
        }, PROGRESS_INTERVAL_MS);
        timer.unref?.();
        this.timers.set(guildId, timer);
    }

    stopTicker(guildId) {
        const timer = this.timers.get(guildId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(guildId);
        }
    }

    clear(guildId) {
        this.stopTicker(guildId);
        this.messages.delete(guildId);
    }
}

module.exports = { DashboardManager };
