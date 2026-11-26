'use strict';

const DEFAULT_REST_TIMEOUT_MS = 6000;
const DEFER_TIMEOUT_MS = 2500;
const MAX_REST_TIMEOUT_MS = 8000;

function withTimeout(promiseFactory, timeoutMs = DEFAULT_REST_TIMEOUT_MS, parentSignal = null) {
    const ms = Math.min(MAX_REST_TIMEOUT_MS, Math.max(500, timeoutMs));
    const controller = new AbortController();
    let timer = null;

    const onParentAbort = () => controller.abort(parentSignal?.reason || new Error('Aborted'));
    if (parentSignal) {
        if (parentSignal.aborted) {
            controller.abort(parentSignal.reason || new Error('Aborted'));
        } else {
            parentSignal.addEventListener('abort', onParentAbort, { once: true });
        }
    }

    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`Discord REST call timed out after ${ms}ms`);
            err.code = 'REST_TIMEOUT';
            controller.abort(err);
            reject(err);
        }, ms);
        timer.unref?.();
    });

    return Promise.race([Promise.resolve().then(() => promiseFactory(controller.signal)), timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
        if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    });
}

function toEditPayload(payload) {
    if (typeof payload === 'string') return { content: payload };
    const { flags, ephemeral, fetchReply, withResponse, ...rest } = payload || {};
    return rest;
}

async function ensureDeferred(interaction, options = {}) {
    if (!interaction || interaction.deferred || interaction.replied) return true;
    const timeoutMs = options.timeoutMs ?? DEFER_TIMEOUT_MS;
    try {
        await withTimeout(
            () => interaction.deferReply({ flags: options.ephemeral ? 64 : undefined }),
            timeoutMs,
            interaction._abortSignal
        );
        return true;
    } catch {
        return false;
    }
}

async function safeReply(interaction, payload, options = {}) {
    if (!interaction) return null;
    const timeoutMs = options.timeoutMs ?? DEFAULT_REST_TIMEOUT_MS;
    const signal = interaction._abortSignal;

    try {
        if (interaction.deferred) {
            return await withTimeout(() => interaction.editReply(toEditPayload(payload)), timeoutMs, signal);
        }
        if (interaction.replied) {
            return await withTimeout(() => interaction.followUp(payload), timeoutMs, signal);
        }
        return await withTimeout(() => interaction.reply(payload), timeoutMs, signal);
    } catch (err) {
        // 40060: Interaction has already been acknowledged -> bounded editReply fallback
        if (err?.code === 40060) {
            try {
                return await withTimeout(() => interaction.editReply(toEditPayload(payload)), timeoutMs, signal);
            } catch {
                return null;
            }
        }
        // 10062: Unknown interaction (expired), 10008: Unknown message
        if (err?.code === 10062 || err?.code === 10008 || err?.code === 'REST_TIMEOUT') {
            return null;
        }
        throw err;
    }
}

async function safeUpdate(interaction, payload, options = {}) {
    if (!interaction) return null;
    const timeoutMs = options.timeoutMs ?? DEFAULT_REST_TIMEOUT_MS;
    const signal = interaction._abortSignal;

    try {
        if (interaction.deferred || interaction.replied) {
            return await withTimeout(() => interaction.editReply(toEditPayload(payload)), timeoutMs, signal);
        }
        return await withTimeout(() => interaction.update(payload), timeoutMs, signal);
    } catch (err) {
        if (err?.code === 40060) {
            try {
                return await withTimeout(() => interaction.editReply(toEditPayload(payload)), timeoutMs, signal);
            } catch {
                return null;
            }
        }
        if (err?.code === 10062 || err?.code === 10008 || err?.code === 'REST_TIMEOUT') {
            return null;
        }
        throw err;
    }
}

module.exports = {
    DEFAULT_REST_TIMEOUT_MS,
    DEFER_TIMEOUT_MS,
    MAX_REST_TIMEOUT_MS,
    withTimeout,
    ensureDeferred,
    safeReply,
    safeUpdate,
    toEditPayload,
};
