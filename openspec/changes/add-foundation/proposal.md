## Why

Il progetto è una cartella vuota con scaffolding tecnico (Tauri + Hono + monorepo). Prima di poter pianificare qualsiasi feature verticale (spesa, calendario, voice, telecamere), serve una **fondamenta condivisa**: il modello dati delle persone/animali della famiglia (entità citata da quasi tutte le feature future), la sicurezza dell'API (Tailscale + token Bearer), il design system con palette/tipografia/primitive UI conformi a `.impeccable.md`, il layout home con navigazione, e il kiosk basics che impedisce all'iPad di addormentarsi. Senza questa foundation, ogni change futura dovrebbe reinventare le stesse fondamenta in modo incoerente.

## What Changes

- Modello dati `family_member` (persone + animali nella stessa entità con `kind: human|pet`), CRUD completo backend e frontend (menu Settings → Famiglia)
- Doppia cintura di sicurezza sull'API: Tailscale (documentato, no codice) + middleware Hono per token `Authorization: Bearer` configurato via env
- Design system base allineato a `.impeccable.md`: design tokens (palette OKLCH terracotta/ambra/salvia, scale tipografica fluida, spacing scale, shadow tinted warm), font loading (Fraunces variabile + Geist Sans variabile), tema dark/light auto via `prefers-color-scheme`
- Primitive UI riutilizzabili: `Button` (primary/ghost/icon, size lg/md/sm), `Card`/`Tile`, `Modal`, `Input`, `Select`, `Avatar`, `IconButton`, `Toast`
- Layout home iPad: griglia mosaico asimmetrica a 12 colonne con tile placeholder, header con data/ora/meteo placeholder, navigazione a tab inferiori (Home, Calendario, Spesa, Bacheca, Telecamere, Settings) — adattata a stack verticale su iPhone
- Plugin Tauri custom **kiosk-basics** in Rust: comando per `idleTimerDisabled` (impedisce auto-lock dello schermo finché l'app è in foreground), wrapper iOS Swift bridge
- Setup state management: TanStack Query (con `QueryClientProvider` configurato per stale time conservativi), Zustand per UI state (tema, sidebar, modali), provider di tema con override manuale dalle Settings
- Setup Framer Motion: wrapper `AnimatePresence` globale, easing token (`easeOutQuart`, `easeOutExpo`), durations token, rispetto di `prefers-reduced-motion` via hook condiviso
- i18n con react-i18next: bootstrap, italiano come lingua di default, struttura `apps/mobile/src/locales/it.json` con namespace per dominio
- Documentazione utente: setup Tailscale step-by-step nel README, Guided Access su iPad

## Capabilities

### New Capabilities

- `family-members`: gestione persone e animali della famiglia come entità di prima classe — schema, CRUD backend, UI di gestione, tipi condivisi
- `api-security`: middleware di autenticazione Bearer token + CORS configurabile per la tailnet
- `design-system`: design tokens, font loading, primitive UI, theme provider dark/light, motion tokens, allineamento a `.impeccable.md`
- `app-shell`: layout home iPad/iPhone responsive con tab navigation, header dinamico, slot per tile della home, error boundary globali
- `kiosk-basics`: plugin Tauri nativo per `idleTimerDisabled`, fullscreen, lock orientation, hooks React per attivarlo
- `i18n-foundation`: bootstrap react-i18next con namespace, lingua italiana di default, hook helper

### Modified Capabilities

(Nessuna — è la prima change del progetto, non esistono ancora spec)

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — tabella `family_members`
- `apps/api/src/db/migrations/` — prima migration generata da Drizzle Kit
- `apps/api/src/middleware/auth.ts` — Bearer token middleware
- `apps/api/src/routes/family.ts` — CRUD endpoint
- `apps/mobile/src/components/ui/` — primitive UI (Button, Card, Modal, ecc.)
- `apps/mobile/src/components/layout/` — AppShell, TabBar, Header, HomeMosaic
- `apps/mobile/src/components/family/` — FamilyManagementScreen, MemberCard, MemberForm
- `apps/mobile/src/lib/api-client.ts` — wrapper fetch con Bearer token automatico
- `apps/mobile/src/lib/theme/` — tokens, ThemeProvider, useTheme hook
- `apps/mobile/src/lib/motion/` — easing, durations, useReducedMotion hook
- `apps/mobile/src/lib/i18n.ts` — bootstrap react-i18next
- `apps/mobile/src/locales/it/` — file di traduzione iniziali
- `apps/mobile/src/store/` — Zustand stores (theme, ui)
- `apps/mobile/src-tauri/src/kiosk.rs` + Swift bridge — plugin custom
- `packages/shared/src/family.ts` — tipi `FamilyMember`, `Person`, `Pet`, `CreateFamilyMemberInput`

**Codice modificato**:
- `apps/api/src/index.ts` — registra middleware auth e router family
- `apps/api/.env.example` — aggiunge `API_TOKEN`
- `apps/mobile/.env.example` — aggiunge `VITE_API_TOKEN`
- `apps/mobile/src/App.tsx` — diventa AppShell con providers, sostituisce demo
- `packages/shared/src/index.ts` — esporta `family.ts`
- `apps/mobile/src-tauri/Cargo.toml` — dipendenze plugin
- `apps/mobile/src-tauri/tauri.conf.json` — capabilities per il plugin
- `README.md` — sezione Tailscale setup, Guided Access

**Dipendenze aggiunte**:
- `apps/mobile`: `framer-motion`, `react-i18next`, `i18next`, `zustand`, `@tanstack/react-query`, `@phosphor-icons/react`, `clsx` (o `cva`)
- `apps/api`: `hono/bearer-auth` (incluso in `hono`), nessuna nuova dipendenza significativa

**Sistemi esterni**:
- **Tailscale** account dell'utente (free tier) — installazione documentata su Synology, iPad, iPhone
- **Bunny Fonts** o self-hosting per Fraunces e Geist Sans (no Google Fonts in produzione per privacy)

**Nessun breaking change** (è la prima change funzionale del progetto, non esiste niente da rompere).
