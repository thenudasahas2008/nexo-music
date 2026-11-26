'use strict';

const { createLogger } = require('../utils/logger');
const { isSafePublicHost, isSafeHttpUrl, readResponseTextWithLimit } = require('../utils/networkGuard');

const log = createLogger('NodeRegistry');

const PUBLIC_NODE_LIST_URL = 'https://lavalink-list.ajieblogs.eu.org/All';
const MAX_FETCH_BYTES = 262144;
const FETCH_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 4000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_FAILS = 8;

const COOLDOWN_MS = Object.freeze({
    INCOMPATIBLE_API: 30 * 60 * 1000,
    AUTH_FAILED: 20 * 60 * 1000,
    RATE_LIMITED: 90 * 1000,
    STALL: 4 * 60 * 1000,
    TRANSIENT: 2 * 60 * 1000,
});

class NodeRegistry {
    constructor(config) {
        this.config = config;
        this.candidates = new Map(); // id -> candidate descriptor
        this.health = new Map(); // id -> health metrics
        this._refreshPromise = null;
        this._lastRefreshAt = 0;
    }

    static makeNodeId(host, port, secure) {
        return `${String(host).toLowerCase()}:${Number(port)}:${secure ? 'tls' : 'ws'}`;
    }

    getPrivateNodeOption() {
        const ll = this.config.lavalink;
        if (!ll.hasPrivateNode) return null;
        return {
            id: `private-${ll.host}-${ll.port}`,
            host: ll.host,
            port: ll.port,
            authorization: ll.password,
            secure: ll.secure,
            retryAmount: ll.maxReconnectAttempts,
            retryDelay: ll.baseDelayMs,
            requestSignalTimeoutMS: 8000,
            isPrivate: true,
        };
    }

    async refreshPublicNodes(force = false) {
        if (!this.config.lavalink.publicNodeEnabled) return [];
        if (!force && Date.now() - this._lastRefreshAt < REFRESH_INTERVAL_MS && this.candidates.size > 0) {
            return this.listCandidateOptions();
        }
        if (this._refreshPromise) return this._refreshPromise;

        this._refreshPromise = this._fetchAndValidatePublicNodes().finally(() => {
            this._refreshPromise = null;
        });
        return this._refreshPromise;
    }

    async _fetchAndValidatePublicNodes() {
        if (!isSafeHttpUrl(PUBLIC_NODE_LIST_URL)) {
            log.warn('Public node feed URL blocked by network guard');
            return [];
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        timer.unref?.();

        let rawList;
        try {
            const res = await fetch(PUBLIC_NODE_LIST_URL, {
                signal: controller.signal,
                headers: { Accept: 'application/json', 'User-Agent': 'NexoMusic/1.2' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await readResponseTextWithLimit(res, MAX_FETCH_BYTES);
            rawList = JSON.parse(text);
        } catch (err) {
            log.warn('Failed to fetch public Lavalink list', { error: err.message });
            return this.listCandidateOptions();
        } finally {
            clearTimeout(timer);
        }

        if (!Array.isArray(rawList)) return this.listCandidateOptions();

        const allowlist = this.config.lavalink.publicNodeAllowlist;
        const filtered = rawList.filter((item) => {
            if (!item || typeof item !== 'object') return false;
            const host = String(item.host || '').trim();
            const port = Number(item.port);
            const password = String(item.password || '').trim();
            if (!host || !password || !Number.isInteger(port) || port < 1 || port > 65535) return false;
            const ver = String(item.version || '').toLowerCase();
            if (ver && !ver.startsWith('v4') && !ver.startsWith('4')) return false;
            return isSafePublicHost(host, allowlist);
        });

        const probed = await this._probeBatch(filtered.slice(0, 32));
        const dedupedByHost = new Map();

        for (const node of probed) {
            if (!this.health.has(node.id)) {
                this.health.set(node.id, this._createInitialHealth(node.probeLatencyMs));
            }
            const h = this.health.get(node.id);
            h.latencyMs = node.probeLatencyMs;
            if (node.initialStats) {
                this.updateStats(node.id, node.initialStats);
            }

            const hostKey = node.host.toLowerCase();
            const existing = dedupedByHost.get(hostKey);
            if (!existing || this.scoreNode(node.id, node) > this.scoreNode(existing.id, existing)) {
                dedupedByHost.set(hostKey, node);
            }
        }

        const nextMap = new Map();
        for (const node of dedupedByHost.values()) {
            nextMap.set(node.id, node);
        }

        if (nextMap.size > 0) {
            this.candidates = nextMap;
            this._lastRefreshAt = Date.now();
            log.info(`Discovered ${nextMap.size} unique healthy public Lavalink v4 hosts`);
        }

        return this.listCandidateOptions();
    }

    async _probeBatch(items, concurrency = 8) {
        const results = [];
        let cursor = 0;

        const worker = async () => {
            while (cursor < items.length) {
                const item = items[cursor++];
                const validated = await this._probeSingleNode(item);
                if (validated) results.push(validated);
            }
        };

        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
        return results;
    }

    async _probeSingleNode(item) {
        const host = String(item.host).trim();
        const port = Number(item.port);
        const secure = Boolean(item.secure);
        const authorization = String(item.password).trim();
        const proto = secure ? 'https' : 'http';
        const base = `${proto}://${host}:${port}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        timer.unref?.();

        const started = Date.now();
        try {
            const headers = { Authorization: authorization, 'User-Agent': 'NexoMusic/1.2' };
            const [infoRes, statsRes] = await Promise.all([
                fetch(`${base}/v4/info`, { signal: controller.signal, headers }),
                fetch(`${base}/v4/stats`, { signal: controller.signal, headers }).catch(() => null),
            ]);
            if (!infoRes.ok) return null;

            const infoBody = await readResponseTextWithLimit(infoRes, 65536);
            const info = JSON.parse(infoBody);
            if (!info?.version) return null;

            let initialStats = null;
            if (statsRes?.ok) {
                try {
                    const statsBody = await readResponseTextWithLimit(statsRes, 32768);
                    initialStats = JSON.parse(statsBody);
                } catch {
                    initialStats = null;
                }
            }

            const latencyMs = Date.now() - started;
            const sources = Array.isArray(info.sourceManagers)
                ? info.sourceManagers.map((s) => String(s).toLowerCase())
                : [];
            const id = NodeRegistry.makeNodeId(host, port, secure);

            return {
                id,
                host,
                port,
                authorization,
                secure,
                probeLatencyMs: latencyMs,
                initialStats,
                sourceManagers: sources,
                hasYoutube: sources.includes('youtube'),
                hasSoundCloud: sources.includes('soundcloud'),
                retryAmount: 4,
                retryDelay: 2000,
                requestSignalTimeoutMS: 8000,
                isPrivate: false,
            };
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    _createInitialHealth(latencyMs = 200) {
        return {
            latencyMs,
            cpuLoad: 0,
            frameDeficit: 0,
            frameNulled: 0,
            playingPlayers: 0,
            failCount: 0,
            stallCount: 0,
            successCount: 0,
            cooldownUntil: 0,
            lastReason: null,
            lastUpdatedAt: Date.now(),
        };
    }

    getHealth(nodeId) {
        if (!this.health.has(nodeId)) {
            this.health.set(nodeId, this._createInitialHealth());
        }
        return this.health.get(nodeId);
    }

    updateStats(nodeId, stats) {
        if (!stats) return;
        const h = this.getHealth(nodeId);
        const sysLoad = Number(stats.cpu?.systemLoad ?? 0);
        const llLoad = Number(stats.cpu?.lavalinkLoad ?? 0);
        h.cpuLoad = Math.max(sysLoad, llLoad);
        h.playingPlayers = Number(stats.playingPlayers ?? 0);
        h.frameDeficit = Number(stats.frameStats?.deficit ?? 0);
        h.frameNulled = Number(stats.frameStats?.nulled ?? 0);
        h.lastUpdatedAt = Date.now();
    }

    updateLatency(nodeId, latencyMs) {
        if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
        const h = this.getHealth(nodeId);
        h.latencyMs = latencyMs;
        h.lastUpdatedAt = Date.now();
    }

    recordSuccess(nodeId) {
        const h = this.getHealth(nodeId);
        h.successCount += 1;
        h.failCount = Math.max(0, h.failCount - 1);
        h.stallCount = Math.max(0, h.stallCount - 1);
        h.cooldownUntil = 0;
        h.lastReason = null;
        h.lastUpdatedAt = Date.now();
    }

    recordFailure(nodeId, category = 'TRANSIENT', reason = 'unknown') {
        const h = this.getHealth(nodeId);
        h.failCount = Math.min(MAX_CONSECUTIVE_FAILS, h.failCount + 1);
        if (category === 'STALL') h.stallCount += 1;
        const baseCooldown = COOLDOWN_MS[category] || COOLDOWN_MS.TRANSIENT;
        const multiplier = Math.min(4, Math.pow(1.5, Math.max(0, h.failCount - 1)));
        h.cooldownUntil = Date.now() + Math.round(baseCooldown * multiplier);
        h.lastReason = reason;
        h.lastUpdatedAt = Date.now();
    }

    isInCooldown(nodeId, now = Date.now()) {
        const h = this.health.get(nodeId);
        return Boolean(h && h.cooldownUntil > now);
    }

    /**
     * Higher score = healthier, low-player, low-latency, stutter-free node.
     */
    scoreNode(nodeId, meta = {}) {
        const h = this.getHealth(nodeId);
        const now = Date.now();
        let score = 1200;

        if (meta.isPrivate) score += 800;
        if (meta.secure) score += 60;
        if (meta.hasYoutube) score += 50;
        if (meta.hasSoundCloud) score += 20;

        // Penalize latency (1ms = 0.45pt, up to 450pt)
        score -= Math.min(450, (h.latencyMs || 150) * 0.45);

        // Heavily penalize congested public nodes with dozens/hundreds of concurrent players
        if (!meta.isPrivate && h.playingPlayers > 0) {
            if (h.playingPlayers > 150) score -= 550;
            else if (h.playingPlayers > 50) score -= 260;
            else score -= h.playingPlayers * 3;
        }

        // Penalize CPU saturation (stutter/choppy audio territory)
        if (h.cpuLoad > 0.85) score -= 650;
        else if (h.cpuLoad > 0.6) score -= 280;
        else score -= h.cpuLoad * 150;

        // Penalize ANY audio frame drops/nulled frames heavily
        if (h.frameNulled > 0 || h.frameDeficit > 2) {
            score -= Math.min(650, 180 + h.frameDeficit * 15 + h.frameNulled * 25);
        }

        // Penalize recent failures & stalls
        score -= h.failCount * 100 + h.stallCount * 130;
        if (h.cooldownUntil > now) score -= 1200;

        // Reward proven playback stability
        score += Math.min(180, h.successCount * 10);

        return Math.round(score);
    }

    listCandidateOptions(excludeIds = new Set()) {
        const now = Date.now();
        const items = [];
        const priv = this.getPrivateNodeOption();
        if (priv && !excludeIds.has(priv.id)) items.push(priv);

        for (const node of this.candidates.values()) {
            if (excludeIds.has(node.id)) continue;
            items.push(node);
        }

        items.sort((a, b) => {
            const aCooling = this.isInCooldown(a.id, now) ? 1 : 0;
            const bCooling = this.isInCooldown(b.id, now) ? 1 : 0;
            if (aCooling !== bCooling) return aCooling - bCooling;
            return this.scoreNode(b.id, b) - this.scoreNode(a.id, a);
        });

        return items;
    }

    pickTopNodes(count = 3, excludeIds = new Set()) {
        return this.listCandidateOptions(excludeIds).slice(0, count);
    }
}

module.exports = {
    NodeRegistry,
    PUBLIC_NODE_LIST_URL,
};
