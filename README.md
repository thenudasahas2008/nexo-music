# Sonara Music

Studio-grade, zero-drop Discord music bot built on **Discord.js v14** and **Lavalink v4** with multi-node automatic failover, cross-source playback recovery, and a sleek interactive Now Playing studio dashboard.

## Highlights

- **Zero-Drop Multi-Node Audio Engine**
  - Scores Lavalink v4 nodes by live RTT latency, CPU load, and audio `frameStats` (`deficit`/`nulled` frames).
  - Automatically migrates active guild players to healthier nodes before frame starvation causes stutter or drops.
  - Cross-source fallback (`ytmsearch` -> `scsearch` -> `dzsearch` -> `ytsearch`) when a source or node encounters rate limits or blocks.
- **Interactive Studio Dashboard**
  - Live progress bar, active EQ preset indicator, node ping telemetry, Up Next preview, transport buttons, and instant EQ preset dropdown.
- **256 MiB Container Friendly**
  - Bounded Discord gateway entity caching and sweepers, bounded Undici HTTP connection pool, and atomic JSON persistence for server settings.
- **Full Slash Command Suite**
  - Playback (`/play`, `/search`, `/pause`, `/resume`, `/skip`, `/back`, `/seek`, `/replay`, `/stop`)
  - Queue (`/nowplaying`, `/queue`, `/remove`, `/move`, `/jump`, `/clear`, `/shuffle`, `/dedupe`, `/loop`, `/grab`)
  - Audio & Modes (`/volume`, `/filter`, `/bassboost`, `/247`, `/autoplay`, `/lyrics`)
  - Utility (`/join`, `/leave`, `/nodes`, `/settings`, `/stats`, `/help`, `/invite`)

## Quick Start

1. Copy `.env.example` to `.env` and set `TOKEN`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Start the bot:
   ```bash
   npm start
   ```
