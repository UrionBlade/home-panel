<h1 align="center">
  Home Panel
</h1>

<p align="center">
  <strong>Wall-mounted home control panel for iPad</strong><br>
  Tauri app + self-hosted API — local-first, zero cloud dependency.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/Tauri-2-orange?logo=tauri" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Hono-4-purple" alt="Hono 4">
  <img src="https://img.shields.io/badge/SQLite-Drizzle-green" alt="SQLite + Drizzle">
  <img src="https://img.shields.io/badge/license-CC%20BY--NC%204.0-lightgrey" alt="License">
</p>

---

A home dashboard designed for a wall-mounted iPad (or any tablet/browser). Manages family calendar, shopping list, weather, cameras, music, timers, recipes, laundry and more — all on your local network with no cloud dependencies.

## Features

| Feature | Details |
|---|---|
| **Calendar** | Family events + external calendars (Google Calendar via ICS) with recurrence, color-coded attendees per family member |
| **Shopping list** | Shared list with product catalog, categories, and voice input |
| **Weather** | 7-day forecast with animated illustrations (rain, snow) |
| **Cameras** | Blink (live view, motion clips, arm/disarm). Ready for CloudPlus/Taioho |
| **Music** | Spotify Connect — player, search, playlists, device picker, shuffle/repeat |
| **Laundry** | Samsung washer/dryer via SmartThings — cycle status, live countdown, remote commands, sound notification on completion |
| **Timers** | Multiple timers with persistent alarms |
| **Recipes** | Recipe book with URL import (GialloZafferano, etc.) |
| **Board** | Draggable colored sticky notes |
| **Waste** | Waste collection calendar with recurrence rules |
| **Family** | Member management (people + pets) with distinctive colors |
| **Voice** | Native iOS voice control (SFSpeechRecognizer) |
| **Kiosk** | Photo screensaver, night mode, keep screen on |
| **Theming** | Light/dark mode + customizable accent color picker |

## Architecture

```
home-panel/
├── apps/
│   ├── api/             Hono backend + SQLite (Drizzle ORM)
│   └── mobile/          React 19 + Tauri 2 frontend
├── packages/
│   └── shared/          Shared TypeScript types
├── docker-compose.yml   API deployment on Synology/NAS
└── turbo.json           Monorepo orchestration
```

**Frontend**: React 19, Tailwind CSS 4, Framer Motion, TanStack Query, i18next  
**Backend**: Hono, Drizzle ORM, SQLite, tsx  
**App shell**: Tauri 2 (iOS, macOS, Windows, Linux)  
**Monorepo**: pnpm workspaces + Turborepo

## Quick start

### Prerequisites

- Node.js >= 22
- pnpm 10.x
- Rust (for Tauri builds)

### Setup

```bash
git clone git@github.com:UrionBlade/home-panel.git
cd home-panel
pnpm install

# Configure environment variables
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# Generate an API token and paste it in both .env files
openssl rand -base64 32

# Run database migrations
cd apps/api && pnpm tsx src/db/migrate.ts && cd ../..

# Start everything
pnpm dev
```

Frontend runs at `http://localhost:1420`, backend at `http://localhost:3000`.

### Backend deployment (Docker)

For self-hosting on Synology or any Docker host:

```bash
docker compose up -d --build
```

The API runs on port 3000 with persistent SQLite in `./data/`.

## Optional integrations

| Service | How to configure |
|---|---|
| **Spotify** | Create an app at [developer.spotify.com](https://developer.spotify.com/dashboard), add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to `apps/api/.env` |
| **SmartThings** | Generate a PAT at [account.smartthings.com/tokens](https://account.smartthings.com/tokens), add `SMARTTHINGS_PAT` to `apps/api/.env` |
| **Blink cameras** | Configure from the UI: Settings > Cameras |
| **Google Calendar** | Add ICS feed from the UI: Settings > Calendar sources |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, and how to open a PR.

## License

**CC BY-NC 4.0** — You can use, modify and share this project for non-commercial purposes. See [LICENSE.md](LICENSE.md) for details.

Commercial use is reserved to the author. For commercial licensing, open an issue.
