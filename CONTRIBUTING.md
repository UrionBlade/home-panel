# Contributing

Thanks for your interest in contributing to Home Panel! Here's how to get involved.

## Development setup

### Prerequisites

- **Node.js** >= 22
- **pnpm** 10.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Rust** (for Tauri builds) — [rustup.rs](https://rustup.rs/)
- Xcode (iOS/macOS builds only)

### Getting started

```bash
# Clone the repo
git clone git@github.com:UrionBlade/home-panel.git
cd home-panel

# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# Generate an API token and paste it in both .env files
TOKEN=$(openssl rand -base64 32)
echo "Paste this token into apps/api/.env (API_TOKEN) and apps/mobile/.env (VITE_API_TOKEN):"
echo "$TOKEN"

# Start the backend
cd apps/api
pnpm tsx src/db/migrate.ts   # Create/update database
pnpm dev                      # API at http://localhost:3000

# In another terminal, start the frontend
cd apps/mobile
pnpm dev                      # Vite at http://localhost:1420
```

### Tauri build (desktop)

```bash
cd apps/mobile
pnpm tauri build
```

### iOS build

```bash
cd apps/mobile
pnpm tauri ios dev
```

## How to contribute

### Issues

- Use issues to report bugs or propose features
- Include screenshots/screencasts for visual problems
- Specify the device (iPad, iPhone, desktop, browser)

### Pull requests

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/feature-name
   ```

2. **Develop** following the project conventions (see below)

3. **Verify** everything compiles:
   ```bash
   pnpm typecheck
   ```

4. **Commit** with clear messages:
   ```
   feat: add public transit tile
   fix: calendar timezone off by 2h
   ```

5. **Open a PR** against `main` with:
   - Description of what and why
   - Screenshots for visual changes
   - Testing checklist

### Code conventions

- **TypeScript** strict — no `any`, no `@ts-ignore`
- **Tailwind CSS 4** — use design tokens (`--color-*`, `--radius-*`), no hardcoded colors
- **i18n** — all visible strings in `apps/mobile/src/locales/it/`. Add a namespace if needed
- **Components** — follow existing patterns (PageContainer, PageHeader, Tile, hooks with TanStack Query)
- **Backend** — Hono routes in `apps/api/src/routes/`, Drizzle schema in `apps/api/src/db/schema.ts`
- **Shared types** — in `packages/shared/src/`, exported from `index.ts`
- **Comments** — in English

### Monorepo structure

```
apps/api/          Hono backend + SQLite (Drizzle ORM)
apps/mobile/       React + Tauri frontend
packages/shared/   Shared TypeScript types
```

### What NOT to do

- Don't commit `.env` files, credentials, tokens or personal data
- Don't add heavy dependencies without discussing in an issue first
- Don't change the design system structure without consensus

## License

This project uses the **CC BY-NC 4.0** license. Contributions are accepted under the same license. You may not use the code for commercial purposes.
