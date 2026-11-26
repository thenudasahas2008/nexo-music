'use strict';

async function clearAllFilters(player) {
    if (typeof player.filterManager.clearEQ === 'function') {
        await player.filterManager.clearEQ().catch(() => {});
    }
    await player.filterManager.resetFilters();
}

const FILTER_PRESETS = Object.freeze({
    flat: {
        id: 'flat',
        label: 'Flat (Studio)',
        description: 'Pure uncolored audio output',
        emoji: '🎛️',
        apply: async (player) => {
            await clearAllFilters(player);
        },
    },
    bassboost: {
        id: 'bassboost',
        label: 'Bass Boost',
        description: 'Warm sub-bass punch without clipping',
        emoji: '🔊',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.setEQ([
                { band: 0, gain: 0.13 },
                { band: 1, gain: 0.1 },
                { band: 2, gain: 0.07 },
                { band: 3, gain: 0.03 },
                { band: 4, gain: -0.02 },
                { band: 5, gain: -0.03 },
                { band: 6, gain: -0.02 },
                { band: 7, gain: 0.0 },
                { band: 8, gain: 0.02 },
                { band: 9, gain: 0.02 },
            ]);
        },
    },
    vocal: {
        id: 'vocal',
        label: 'Vocal Clarity',
        description: 'Crisp midrange presence and clean highs',
        emoji: '🎤',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.setEQ([
                { band: 0, gain: -0.06 },
                { band: 1, gain: -0.04 },
                { band: 4, gain: 0.08 },
                { band: 5, gain: 0.12 },
                { band: 6, gain: 0.1 },
                { band: 7, gain: 0.06 },
                { band: 9, gain: 0.05 },
            ]);
        },
    },
    soft: {
        id: 'soft',
        label: 'Late Night / Soft',
        description: 'Smooth low-fatigue listening profile',
        emoji: '🌙',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.toggleLowPass(18);
            await player.filterManager.setEQ([
                { band: 0, gain: 0.06 },
                { band: 1, gain: 0.04 },
                { band: 8, gain: -0.08 },
                { band: 9, gain: -0.1 },
            ]);
        },
    },
    nightcore: {
        id: 'nightcore',
        label: 'Nightcore',
        description: 'Energetic tempo and pitch lift (1.18x)',
        emoji: '⚡',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.toggleNightcore(1.18, 1.18, 1.0);
        },
    },
    vaporwave: {
        id: 'vaporwave',
        label: 'Vaporwave',
        description: 'Slowed dreamy tape aesthetic (0.85x)',
        emoji: '🌆',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.toggleVaporwave(0.85, 0.85, 1.0);
        },
    },
    '8d': {
        id: '8d',
        label: '8D Spatial',
        description: 'Smooth stereo rotation around the listener',
        emoji: '🎧',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.toggleRotation(0.16);
        },
    },
    karaoke: {
        id: 'karaoke',
        label: 'Karaoke',
        description: 'Attenuates center-panned lead vocals',
        emoji: '🎶',
        apply: async (player) => {
            await clearAllFilters(player);
            await player.filterManager.toggleKaraoke(1.0, 1.0, 220.0, 100.0);
        },
    },
});

function getPreset(name) {
    const key = String(name || 'flat').trim().toLowerCase();
    return FILTER_PRESETS[key] || null;
}

function listPresets() {
    return Object.values(FILTER_PRESETS);
}

async function applyFilterPreset(player, presetName) {
    const preset = getPreset(presetName);
    if (!preset) {
        throw new Error(`Unknown filter preset: ${presetName}`);
    }
    await preset.apply(player);
    player.set('eqPreset', preset.id);
    return preset;
}

module.exports = {
    FILTER_PRESETS,
    getPreset,
    listPresets,
    applyFilterPreset,
};
