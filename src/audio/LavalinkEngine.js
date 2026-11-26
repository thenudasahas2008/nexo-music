'use strict';

const { LavalinkManager } = require('lavalink-client');
const { createLogger } = require('../utils/logger');
const { GuildLock } = require('../utils/guildLock');
const { NodeRegistry } = require('./NodeRegistry');
const { classifyQuery, buildFallbackQueries } = require('./queryGuard');
const { applyFilterPreset } = require('./filters');
const { createStatusEmbed } = require('../ui/dashboard');

const log = createLogger('audio');

class LavalinkEngine {
    constructor(client, config, guildStore) {
        this.client = client;
        this.config = config;
        this.guildStore = guildStore;
        this.registry = new NodeRegistry(config);
        this.lock = new GuildLock();
        this.manager = null;

        this.emptyChannelTimers = new Map();
        this.emptyQueueTimers = new Map();
        this.recentHistory = new Map(); // guildId -> Array<{ identifier, title, author, uri, duration, isStream }>
        this.trackRetries = new Map(); // guildId -> { key, count }
        this.stallWatchdog = new Map(); // guildId -> { trackId, lastPosition, strikes }
        this.migratingGuilds = new Set();
        this._healthTimer = null;
        this._watchdogTimer = null;
        this._initialized = false;
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        if (this.config.lavalink.publicNodeEnabled) {
            await this.registry.refreshPublicNodes(true);
        }

        const initialNodes = this.registry.pickTopNodes(this.config.lavalink.maxActiveNodes);
        if (initialNodes.length === 0) {
            log.warn('No initial Lavalink nodes available at startup; health loop will keep retrying');
        }

        this.manager = new LavalinkManager({
            nodes: initialNodes.map((n) => this._toLavalinkNodeOptions(n)),
            sendToShard: (guildId, payload) => {
                const guild = this.client.guilds.cache.get(guildId);
                guild?.shard?.send(payload);
            },
            autoSkip: true,
            autoSkipOnResolveError: false, // We handle fallback & cross-node recovery ourselves
            client: {
                id: this.client.user.id,
                username: this.client.user.username || this.config.botName,
            },
            playerOptions: {
                clientBasedPositionUpdateInterval: 500,
                defaultSearchPlatform: this.config.playback.defaultSearchPlatform,
                volumeDecrementer: 1.0,
                onDisconnect: {
                    autoReconnect: false,
                    destroyPlayer: false,
                },
                onEmptyQueue: {
                    destroyAfterMs: null, // Managed explicitly so autoplay & 24/7 work cleanly
                },
                useUnresolvedData: true,
            },
            queueOptions: {
                maxPreviousTracks: 25,
            },
        });

        this._bindNodeEvents();
        this._bindPlayerEvents();

        this.client.on('raw', (packet) => {
            if (packet?.t === 'VOICE_STATE_UPDATE' || packet?.t === 'VOICE_SERVER_UPDATE') {
                this.manager.sendRawData(packet);
            }
        });

        await this.manager.init({
            id: this.client.user.id,
            username: this.client.user.username || this.config.botName,
        });

        this._startHealthLoop();
        this._startWatchdogLoop();
        log.info(`Lavalink audio engine initialized with ${initialNodes.length} active node(s)`);
    }

    _toLavalinkNodeOptions(node) {
        return {
            id: node.id,
            host: node.host,
            port: node.port,
            authorization: node.authorization,
            secure: Boolean(node.secure),
            retryAmount: node.retryAmount ?? 5,
            retryDelay: node.retryDelay ?? 2000,
            requestSignalTimeoutMS: node.requestSignalTimeoutMS ?? 8000,
        };
    }

    _bindNodeEvents() {
        const nm = this.manager.nodeManager;

        nm.on('connect', (node) => {
            log.info(`Node connected: ${node.id}`);
            this.registry.recordSuccess(node.id);
        });

        nm.on('disconnect', (node, reason) => {
            log.warn(`Node disconnected: ${node.id}`, { code: reason?.code, reason: reason?.reason });
            this.registry.recordFailure(node.id, 'TRANSIENT', 'ws_disconnect');
            void this._migratePlayersFromNode(node.id, 'disconnect');
        });

        nm.on('error', (node, error) => {
            const msg = error?.message || 'unknown';
            const category = /401|403|unauthorized/i.test(msg)
                ? 'AUTH_FAILED'
                : /429|rate/i.test(msg)
                  ? 'RATE_LIMITED'
                  : 'TRANSIENT';
            log.warn(`Node error on ${node.id}`, { error: msg });
            this.registry.recordFailure(node.id, category, msg);
        });

        nm.on('raw', (node, payload) => {
            if (payload?.op === 'stats') {
                this.registry.updateStats(node.id, payload);
                // Proactive stutter prevention: migrate active streams if frame drops or severe CPU saturation occur
                const deficit = Number(payload.frameStats?.deficit ?? 0);
                const nulled = Number(payload.frameStats?.nulled ?? 0);
                const load = Math.max(Number(payload.cpu?.systemLoad ?? 0), Number(payload.cpu?.lavalinkLoad ?? 0));
                if (deficit > 20 || nulled > 12 || load > 0.92) {
                    this.registry.recordFailure(node.id, 'STALL', `load=${load.toFixed(2)},nulled=${nulled}`);
                    void this._migratePlayersFromNode(node.id, 'frame_saturation');
                }
            }
        });
    }

    _bindPlayerEvents() {
        this.manager.on('trackStart', async (player, track) => {
            this.cancelEmptyQueueLeave(player.guildId);
            if (player.node?.id) {
                this.registry.recordSuccess(player.node.id);
            }
            this._pushHistory(player.guildId, track);

            const settings = this.guildStore.get(player.guildId);
            if (settings.eqPreset && settings.eqPreset !== 'flat' && !player.get('eqApplied')) {
                player.set('eqApplied', true);
                applyFilterPreset(player, settings.eqPreset).catch(() => {});
            }

            const channel = await this.client.channels.fetch(player.textChannelId).catch(() => null);
            if (channel) {
                await this.client.dashboard?.sendOrReplace(player, channel, track);
            }
        });

        this.manager.on('trackEnd', (player, track, payload) => {
            const reason = payload?.reason;
            if (reason === 'finished' || reason === 'loadFailed') {
                // Keep track retry counter tidy
                if (reason === 'finished') this.trackRetries.delete(player.guildId);
            }
        });

        this.manager.on('trackError', async (player, track, payload) => {
            const errMsg = payload?.exception?.message || payload?.error || 'Stream error';
            log.warn('Track playback error', { guildId: player.guildId, node: player.node?.id, error: errMsg });

            if (player.node?.id) {
                const isBotCheck = /sign in|bot|unavailable|timeout|403|429/i.test(errMsg);
                this.registry.recordFailure(player.node.id, isBotCheck ? 'RATE_LIMITED' : 'TRANSIENT', errMsg);
            }

            const recovered = await this._attemptTrackRecovery(player, track, player.position || 0);
            if (!recovered) {
                const channel = await this.client.channels.fetch(player.textChannelId).catch(() => null);
                channel
                    ?.send({
                        embeds: [
                            createStatusEmbed(
                                'warning',
                                'Track Skipped',
                                `Could not stream **${track?.info?.title || 'track'}** on current sources. Moving to the next track.`
                            ),
                        ],
                    })
                    .catch(() => {});
                if (player.queue?.tracks?.length > 0) {
                    await player.skip(0, false).catch(() => {});
                } else {
                    await this._handleQueueDepleted(player, track);
                }
            }
        });

        this.manager.on('trackStuck', async (player, track, payload) => {
            log.warn('Track stuck detected', {
                guildId: player.guildId,
                node: player.node?.id,
                thresholdMs: payload?.thresholdMs,
            });
            if (player.node?.id) {
                this.registry.recordFailure(player.node.id, 'STALL', 'track_stuck');
            }
            const recovered = await this._attemptTrackRecovery(player, track, player.position || 0);
            if (!recovered && player.queue?.tracks?.length > 0) {
                await player.skip(0, false).catch(() => {});
            }
        });

        this.manager.on('queueEnd', async (player, track) => {
            await this._handleQueueDepleted(player, track);
        });

        this.manager.on('playerDestroy', (player) => {
            this.cancelEmptyChannelLeave(player.guildId);
            this.cancelEmptyQueueLeave(player.guildId);
            void this.client.dashboard?.markStopped(player.guildId);
        });
    }

    async _attemptTrackRecovery(player, track, resumePosMs = 0) {
        if (!player || !track?.info) return false;
        const guildId = player.guildId;
        const trackKey = `${track.info.title || ''}:${track.info.author || ''}`;
        const prev = this.trackRetries.get(guildId);
        const attempts = prev && prev.key === trackKey ? prev.count : 0;
        if (attempts >= 2) return false;

        this.trackRetries.set(guildId, { key: trackKey, count: attempts + 1 });

        const queries = buildFallbackQueries(track);
        const otherNodes = this.getHealthyConnectedNodes(player.node?.id);
        const candidateNodes = [...otherNodes, ...(player.node?.connected ? [player.node] : [])];

        for (const node of candidateNodes) {
            for (const q of queries) {
                try {
                    const res = await node.search({ query: q.query, source: q.source }, track.requester);
                    const candidate = res?.tracks?.find((t) => t?.info?.uri !== track.info.uri) || res?.tracks?.[0];
                    if (!candidate) continue;

                    if (player.node?.id !== node.id && typeof player.changeNode === 'function') {
                        await player.changeNode(node.id, false).catch(() => {});
                    }
                    const startTime = resumePosMs > 4000 && !candidate.info.isStream ? resumePosMs : 0;
                    await player.play({ clientTrack: candidate, startTime });
                    log.info('Recovered playback via fallback source/node', {
                        guildId,
                        source: q.source,
                        node: node.id,
                        resumeMs: startTime,
                    });
                    return true;
                } catch {
                    // Try next fallback
                }
            }
        }
        return false;
    }

    async _handleQueueDepleted(player, lastTrack) {
        const guildId = player.guildId;
        const settings = this.guildStore.get(guildId);

        if (settings.autoplay && lastTrack?.info) {
            const added = await this._queueAutoplayTrack(player, lastTrack).catch(() => false);
            if (added) return;
        }

        await this.client.dashboard?.markStopped(guildId);

        if (settings.twentyFourSeven) {
            return;
        }

        this.scheduleEmptyQueueLeave(guildId);
    }

    async _queueAutoplayTrack(player, seedTrack) {
        const history = (this.recentHistory.get(player.guildId) || []).map((h) => h.identifier);
        const queries = [];

        if (seedTrack.info.sourceName?.toLowerCase().includes('youtube') && seedTrack.info.identifier) {
            queries.push({
                query: `https://www.youtube.com/watch?v=${seedTrack.info.identifier}&list=RD${seedTrack.info.identifier}`,
                source: undefined,
            });
        }
        if (seedTrack.info.author) {
            queries.push({ query: `${seedTrack.info.author} top hits`, source: 'ytmsearch' });
            queries.push({ query: `${seedTrack.info.author}`, source: 'scsearch' });
        }

        for (const item of queries) {
            try {
                const res = await player.search(
                    item.source ? { query: item.query, source: item.source } : { query: item.query },
                    this.client.user
                );
                const next = res?.tracks?.find(
                    (t) => t?.info?.identifier && !history.includes(t.info.identifier) && t.info.identifier !== seedTrack.info.identifier
                );
                if (next) {
                    await player.queue.add(next);
                    if (!player.playing && !player.paused) {
                        await player.play();
                    }
                    return true;
                }
            } catch {
                // Try next autoplay seed
            }
        }
        return false;
    }

    _pushHistory(guildId, track) {
        const info = track?.info;
        if (!info?.identifier) return;
        const arr = this.recentHistory.get(guildId) || [];
        arr.unshift({
            identifier: info.identifier,
            title: info.title || 'Unknown Track',
            author: info.author || 'Unknown Artist',
            uri: info.uri || null,
            duration: Number(info.duration || 0),
            isStream: Boolean(info.isStream),
        });
        if (arr.length > 25) arr.length = 25;
        this.recentHistory.set(guildId, arr);
    }

    getHistory(guildId) {
        return this.recentHistory.get(guildId) || [];
    }

    getPlayer(guildId) {
        return this.manager?.getPlayer(guildId) || null;
    }

    getConnectedNodes() {
        if (!this.manager) return [];
        return Array.from(this.manager.nodeManager.nodes.values()).filter((n) => n.connected);
    }

    getHealthyConnectedNodes(excludeNodeId = null) {
        return this.getConnectedNodes()
            .filter((n) => n.id !== excludeNodeId)
            .sort((a, b) => this.registry.scoreNode(b.id, b.options) - this.registry.scoreNode(a.id, a.options));
    }

    async ensurePlayer({ guildId, voiceChannelId, textChannelId }) {
        const connected = this.getHealthyConnectedNodes();
        if (connected.length === 0) {
            await this._reconcileNodePool(true);
            if (this.getHealthyConnectedNodes().length === 0) {
                throw new Error('NO_LAVALINK_NODES');
            }
        }

        let player = this.manager.getPlayer(guildId);
        if (!player) {
            const settings = this.guildStore.get(guildId);
            player = this.manager.createPlayer({
                guildId,
                voiceChannelId,
                textChannelId,
                selfDeaf: true,
                selfMute: false,
                volume: settings.defaultVolume ?? this.config.playback.defaultVolume,
                node: connected[0]?.id,
            });
            player.set('autoplay', Boolean(settings.autoplay));
            player.set('eqPreset', settings.eqPreset || 'flat');
        } else {
            if (textChannelId && player.textChannelId !== textChannelId) {
                player.textChannelId = textChannelId;
            }
        }

        if (!player.connected) {
            await player.connect();
        }
        return player;
    }

    async searchTracks(rawQuery, requester, guildId) {
        const classified = classifyQuery(rawQuery, this.config.playback.defaultSearchPlatform);
        if (!classified.valid) {
            return { ok: false, reason: classified.reason };
        }

        const nodes = this.getHealthyConnectedNodes();
        if (nodes.length === 0) {
            await this._reconcileNodePool(true);
        }

        const activeNodes = this.getHealthyConnectedNodes();
        if (activeNodes.length === 0) {
            return { ok: false, reason: 'NO_NODES' };
        }

        const attempts = [];
        if (classified.isUrl) {
            attempts.push({ query: classified.query, source: undefined });
        } else {
            attempts.push({ query: classified.query, source: classified.source });
            for (const alt of ['ytmsearch', 'scsearch', 'dzsearch', 'ytsearch']) {
                if (alt !== classified.source) {
                    attempts.push({ query: classified.query, source: alt });
                }
            }
        }

        for (const node of activeNodes.slice(0, 3)) {
            for (const attempt of attempts.slice(0, classified.isUrl ? 1 : 3)) {
                try {
                    const searchInput = attempt.source
                        ? { query: attempt.query, source: attempt.source }
                        : { query: attempt.query };
                    const res = await node.search(searchInput, requester);
                    if (res?.tracks?.length > 0 && res.loadType !== 'error' && res.loadType !== 'empty') {
                        this.registry.recordSuccess(node.id);
                        return { ok: true, result: res, node, classified };
                    }
                } catch (err) {
                    this.registry.recordFailure(node.id, 'TRANSIENT', err?.message || 'search_failed');
                }
            }
        }

        // Last resort for direct URLs that fail on YouTube bot-check: extract title fallback via ytsearch/scsearch if user pasted URL?
        return { ok: false, reason: 'NO_RESULTS' };
    }

    async playQuery({ guildId, voiceChannelId, textChannelId, query, requester, playNext = false }) {
        return this.lock.run(guildId, async () => {
            const search = await this.searchTracks(query, requester, guildId);
            if (!search.ok) return search;

            const player = await this.ensurePlayer({ guildId, voiceChannelId, textChannelId });

            // Prefer pinning new player to the node that successfully resolved the track
            if (!player.playing && !player.paused && search.node?.id && player.node?.id !== search.node.id) {
                if (typeof player.changeNode === 'function') {
                    await player.changeNode(search.node.id, false).catch(() => {});
                }
            }

            const res = search.result;
            const isPlaylist = res.loadType === 'playlist';
            const tracksToAdd = isPlaylist ? res.tracks : [res.tracks[0]];

            if (playNext && player.playing) {
                await player.queue.add(tracksToAdd, 0);
            } else {
                await player.queue.add(tracksToAdd);
            }
            const started = !player.playing && !player.paused;
            if (started) {
                await player.play();
            } else {
                await this.client.dashboard?.refresh(guildId, player);
            }

            return {
                ok: true,
                started,
                playNext: Boolean(playNext && !started),
                isPlaylist,
                playlistName: res.playlist?.name || null,
                addedCount: tracksToAdd.length,
                firstTrack: tracksToAdd[0],
                player,
            };
        });
    }

    async enqueueTrack({ guildId, voiceChannelId, textChannelId, track, requester }) {
        return this.lock.run(guildId, async () => {
            const player = await this.ensurePlayer({ guildId, voiceChannelId, textChannelId });
            if (requester && !track.requester) track.requester = requester;
            await player.queue.add(track);
            const started = !player.playing && !player.paused;
            if (started) {
                await player.play();
            } else {
                await this.client.dashboard?.refresh(guildId, player);
            }
            return { started, player };
        });
    }

    async stopAndLeave(guildId, { keep247 = false } = {}) {
        return this.lock.run(guildId, async () => {
            this.cancelEmptyChannelLeave(guildId);
            this.cancelEmptyQueueLeave(guildId);
            const player = this.getPlayer(guildId);
            await this.client.dashboard?.markStopped(guildId);
            if (!player) return;
            if (keep247) {
                player.queue.tracks.splice(0);
                await player.stopPlaying(true, false).catch(() => {});
            } else {
                await player.destroy('user_stopped').catch(() => {});
            }
        });
    }

    async handleBotDisconnected(guildId) {
        this.cancelEmptyChannelLeave(guildId);
        this.cancelEmptyQueueLeave(guildId);
        const player = this.getPlayer(guildId);
        if (player) {
            await this.client.dashboard?.markStopped(guildId);
            await player.destroy('bot_disconnected').catch(() => {});
        }
    }

    async ensure247Reconnect(guildId) {
        const settings = this.guildStore.get(guildId);
        if (!settings.twentyFourSeven || !settings.voiceChannelId) return;
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return;
        const channel = guild.channels.cache.get(settings.voiceChannelId);
        if (!channel) return;

        await this.ensurePlayer({
            guildId,
            voiceChannelId: settings.voiceChannelId,
            textChannelId: settings.textChannelId || undefined,
        });
    }

    async restore247Players() {
        for (const [guildId, settings] of this.guildStore.entries()) {
            if (settings.twentyFourSeven && settings.voiceChannelId) {
                await this.ensure247Reconnect(guildId).catch((err) =>
                    log.warn('Failed to restore 24/7 session', { guildId, error: err.message })
                );
            }
        }
    }

    scheduleEmptyChannelLeave(guildId) {
        const settings = this.guildStore.get(guildId);
        if (settings.twentyFourSeven) return;
        if (this.emptyChannelTimers.has(guildId)) return;

        const timer = setTimeout(() => {
            this.emptyChannelTimers.delete(guildId);
            void this.stopAndLeave(guildId, { keep247: false });
        }, this.config.playback.emptyChannelDestroyMs);
        timer.unref?.();
        this.emptyChannelTimers.set(guildId, timer);
    }

    cancelEmptyChannelLeave(guildId) {
        const timer = this.emptyChannelTimers.get(guildId);
        if (timer) {
            clearTimeout(timer);
            this.emptyChannelTimers.delete(guildId);
        }
    }

    scheduleEmptyQueueLeave(guildId) {
        const settings = this.guildStore.get(guildId);
        if (settings.twentyFourSeven) return;
        if (this.emptyQueueTimers.has(guildId)) return;

        const timer = setTimeout(() => {
            this.emptyQueueTimers.delete(guildId);
            const player = this.getPlayer(guildId);
            if (player && !player.playing && !player.paused && !player.queue?.tracks?.length) {
                void this.stopAndLeave(guildId, { keep247: false });
            }
        }, this.config.playback.queueEmptyDestroyMs);
        timer.unref?.();
        this.emptyQueueTimers.set(guildId, timer);
    }

    cancelEmptyQueueLeave(guildId) {
        const timer = this.emptyQueueTimers.get(guildId);
        if (timer) {
            clearTimeout(timer);
            this.emptyQueueTimers.delete(guildId);
        }
    }

    async _migratePlayersFromNode(badNodeId, reason) {
        if (!this.manager) return;
        const replacements = this.getHealthyConnectedNodes(badNodeId);
        if (replacements.length === 0) return;
        const targetNode = replacements[0];

        for (const player of this.manager.players.values()) {
            if (player.node?.id !== badNodeId) continue;
            if (this.migratingGuilds.has(player.guildId)) continue;
            this.migratingGuilds.add(player.guildId);

            try {
                if (typeof player.changeNode === 'function') {
                    await player.changeNode(targetNode.id, false);
                    log.info(`Migrated live player to healthier node`, {
                        guildId: player.guildId,
                        from: badNodeId,
                        to: targetNode.id,
                        reason,
                    });
                }
            } catch (err) {
                log.warn('Live player migration failed', { guildId: player.guildId, error: err.message });
            } finally {
                this.migratingGuilds.delete(player.guildId);
            }
        }
    }

    async _reconcileNodePool(forceRefresh = false) {
        if (!this.manager) return;
        if (this.config.lavalink.publicNodeEnabled) {
            await this.registry.refreshPublicNodes(forceRefresh);
        }

        const connected = this.getConnectedNodes();
        if (connected.length >= this.config.lavalink.maxActiveNodes) return;

        const existingIds = new Set(Array.from(this.manager.nodeManager.nodes.keys()));
        const candidates = this.registry.pickTopNodes(this.config.lavalink.maxActiveNodes - connected.length, existingIds);

        for (const cand of candidates) {
            try {
                const created = this.manager.nodeManager.createNode(this._toLavalinkNodeOptions(cand));
                if (created && typeof created.connect === 'function') {
                    created.connect();
                }
                log.info(`Added backup Lavalink node to pool: ${cand.id}`);
            } catch (err) {
                log.warn(`Failed to attach Lavalink node ${cand.id}`, { error: err.message });
            }
        }
    }

    _startHealthLoop() {
        if (this._healthTimer) clearInterval(this._healthTimer);
        this._healthTimer = setInterval(() => {
            void this._reconcileNodePool(false);
        }, this.config.lavalink.healthCheckIntervalMs);
        this._healthTimer.unref?.();
    }

    _startWatchdogLoop() {
        if (this._watchdogTimer) clearInterval(this._watchdogTimer);
        this._watchdogTimer = setInterval(() => {
            void this.checkPlaybackWatchdog();
        }, 8000);
        this._watchdogTimer.unref?.();
    }

    async checkPlaybackWatchdog() {
        if (!this.manager) return;
        for (const player of this.manager.players.values()) {
            const current = player.queue?.current;
            if (!player.playing || player.paused || !current?.info || current.info.isStream) {
                this.stallWatchdog.delete(player.guildId);
                continue;
            }
            const trackId = current.info.identifier || current.info.title;
            const pos = Number(player.position || 0);
            const prev = this.stallWatchdog.get(player.guildId);

            if (prev && prev.trackId === trackId && pos > 0 && pos === prev.lastPosition) {
                prev.strikes += 1;
                if (prev.strikes >= 2) {
                    this.stallWatchdog.delete(player.guildId);
                    log.warn('Silent audio stall detected by watchdog; recovering stream', {
                        guildId: player.guildId,
                        node: player.node?.id,
                        positionMs: pos,
                    });
                    if (player.node?.id) {
                        this.registry.recordFailure(player.node.id, 'STALL', 'watchdog_silent_stall');
                    }
                    await this._attemptTrackRecovery(player, current, pos).catch(() => false);
                }
            } else {
                this.stallWatchdog.set(player.guildId, { trackId, lastPosition: pos, strikes: 0 });
            }
        }
    }

    async shutdown() {
        if (this._healthTimer) clearInterval(this._healthTimer);
        if (this._watchdogTimer) clearInterval(this._watchdogTimer);
        for (const t of this.emptyChannelTimers.values()) clearTimeout(t);
        for (const t of this.emptyQueueTimers.values()) clearTimeout(t);
    }
}

module.exports = { LavalinkEngine };
