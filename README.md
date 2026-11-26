# Kairo Music

Studio-grade, zero-drop Discord music bot built on **Discord.js v14** and **Lavalink v4** with multi-node automatic failover, active silent-stall watchdog recovery, cross-source playback fallback, and an interactive **Kairo Studio** Now Playing dashboard.

## Highlights

- **Zero-Drop Multi-Node Audio Engine**
  - Scores Lavalink v4 nodes by live RTT latency, CPU load, and audio `frameStats` (`deficit` / `nulled` frames).
  - Automatically migrates active guild players to healthier nodes before frame starvation causes stutter or drops.
  - **Active Anti-Stall Watchdog:** Detects silent stream freezes mid-song and recovers playback at the exact timestamp on a healthy node/source.
  - Cross-source fallback (`ytmsearch` -> `scsearch` -> `dzsearch` -> `ytsearch`) when a source or node encounters blocks or timeouts.
- **Kairo Studio Interactive Dashboard**
  - Live progress bar, active EQ preset indicator, node ping telemetry, Up Next preview, transport buttons, and instant EQ preset dropdown.
- **256 MiB Container Friendly**
  - Bounded Discord gateway entity caching and sweepers, bounded Undici HTTP connection pool, and atomic JSON persistence for server settings.
- **36 Slash Commands**
  - **Playback:** `/play`, `/playnext`, `/search`, `/pause`, `/resume`, `/skip`, `/back`, `/seek`, `/replay`, `/stop`
  - **Queue & History:** `/nowplaying`, `/queue`, `/history`, `/remove`, `/move`, `/jump`, `/clear`, `/shuffle`, `/dedupe`, `/loop`, `/grab`
  - **Audio & DSP:** `/filter`, `/bassboost`, `/speed`, `/pitch`, `/volume`, `/247`, `/autoplay`, `/lyrics`
  - **Utility & Diagnostics:** `/join`, `/leave`, `/nodes`, `/settings`, `/stats`, `/help`, `/invite`

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
