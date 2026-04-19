## Context

Il progetto è una cartella vuota con scaffolding tecnico (Tauri 2 + React 19 + Vite, Hono + Drizzle + SQLite, monorepo pnpm/Turbo). Tutte le decisioni macro sono già state prese e documentate in `openspec/project.md` (stack, sicurezza, hardware, roadmap) e `.impeccable.md` (UI/UX, brand, tipografia, motion, accessibilità). Questo design.md si concentra sulle scelte tecniche specifiche della foundation che non sono già coperte da quei due documenti, in particolare le decisioni di **come** implementare le 6 capability nuove.

Stakeholder unico: Matteo (proprietario, sviluppatore, e utente finale del pannello).

Constraints:
- Tutte le scelte devono essere coerenti con la roadmap: ogni capability della foundation deve servire come base solida per le 13 change successive senza dover essere riscritta.
- Voice è una preoccupazione di prima classe: la foundation deve già lasciare lo spazio per il futuro plugin Whisper.cpp (background mode `audio` in `Info.plist`, registrazione di un'area "voice indicator" nell'AppShell).
- Il dispositivo target è un iPad Pro 11" 2-3a generazione (A12Z o M1) — abbondante budget di CPU/RAM per Whisper.cpp small e Framer Motion senza preoccupazioni.
- Sicurezza percepita > velocità di sviluppo. L'utente è esplicito su questo punto.

## Goals / Non-Goals

### Goals

1. Modello dati `family_member` polimorfico (human + pet) flessibile abbastanza da non dover essere migrato per le change future
2. Doppia cintura di sicurezza Tailscale + Bearer token operativa al primo deploy
3. Design system completo e validato contro `.impeccable.md` (palette OKLCH, Fraunces + Geist Sans self-hosted, primitive UI con touch target 56pt+, motion con reduced motion)
4. AppShell responsive iPad/iPhone con tab navigation, header live, error boundary, slot per voice indicator futuro
5. Plugin Tauri custom `kiosk-basics` funzionante per `idleTimerDisabled`, fullscreen iPad-only, orientation lock landscape iPad-only
6. i18n bootstrap con type safety sulle chiavi di traduzione
7. Setup developer experience: tutto deve essere `pnpm install && pnpm dev` e funzionare in browser (per dev rapido) prima ancora di toccare Xcode

### Non-Goals

- **Nessuna feature verticale**: niente spesa, calendario, meteo, voice, blink, postit. Quelli sono change separate.
- **Nessun login/account**: la sicurezza è demandata a Tailscale + token API. La gestione famiglia è un modello dati, non un sistema di account.
- **Nessuna sincronizzazione realtime** (websocket, SSE) in foundation. Verrà valutata feature-by-feature più avanti.
- **Nessun tema custom oltre dark/light**: l'utente non ha chiesto temi multipli, e non aggiungiamo configurabilità non richiesta.
- **Nessun supporto per lingue diverse dall'italiano** in questa change. Solo la struttura per supportarle in futuro.
- **Nessun sistema di permission/role** sui family member. Il campo `role` è informativo ("papà", "mamma", "figlio"), non funzionale.

## Decisions

### D1. Modello dati `family_member` come unica tabella discriminata

**Decisione**: una sola tabella `family_members` in SQLite con campo discriminante `kind: 'human' | 'pet'` e colonne nullable per gli attributi specie-specifici.

```sql
CREATE TABLE family_members (
  id TEXT PRIMARY KEY,                  -- UUID v7
  kind TEXT NOT NULL CHECK (kind IN ('human', 'pet')),
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  accent_color TEXT,                    -- esadecimale o oklch string
  birth_date TEXT,                      -- ISO date, nullable

  -- human-only
  role TEXT,                            -- "papà", "mamma", "figlio", ecc.

  -- pet-only
  species TEXT,                         -- "dog", "cat", ecc.
  breed TEXT,
  weight_kg REAL,
  veterinary_notes TEXT,

  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
```

**Alternative considerate**:
- *Due tabelle separate `people` e `pets`*: più normalizzato ma rende dolorose le query "tutti i membri della famiglia" e le foreign key polimorfiche dalle entità future (eventi, spese).
- *Tabella `family_members` + tabelle separate per attributi specie-specifici (`human_attributes`, `pet_attributes`)*: pulito ma overkill per ~10 record totali.

**Rationale**: SQLite + ~10 record totali rende l'approccio "single table polymorphic" il più semplice e il più ergonomico. Drizzle ha pieno supporto per discriminated unions in TypeScript.

### D2. Bearer token sull'API tramite middleware Hono nativo

**Decisione**: usare il middleware `bearerAuth` incluso in Hono (`hono/bearer-auth`) montato su `app.use('/api/*', bearerAuth({ token: process.env.API_TOKEN }))`. L'endpoint `/health` resta fuori da `/api/*` e non richiede auth.

**Alternative considerate**:
- *JWT firmato*: overhead inutile dato che c'è un solo client trusted (le mie app in tailnet).
- *mTLS*: troppo complesso da gestire su iOS.
- *Basic auth*: debole, niente meccanismo di rotazione del token, header `Authorization` meno standard.

**Rationale**: Bearer token statico è il pattern più semplice possibile, perfettamente adeguato dato che il primo strato di sicurezza è già Tailscale. Quando arriverà il modulo allarme aggiungeremo il PIN locale come terzo strato.

### D3. Frontend `apiClient` come thin wrapper attorno a `fetch`

**Decisione**: implementare `apps/mobile/src/lib/api-client.ts` come piccolo wrapper di ~50 righe che:
- legge `VITE_API_TOKEN` e `VITE_API_BASE_URL` una volta sola
- aggiunge automaticamente `Authorization: Bearer` e `Content-Type: application/json`
- normalizza errori HTTP in eccezioni tipizzate
- espone metodi `.get`, `.post`, `.patch`, `.delete` con tipi generici

Lo usiamo in tandem con TanStack Query, che gestisce caching e retry.

**Alternative considerate**:
- *axios*: dipendenza pesante per quello che ci serve.
- *ofetch*: ottimo ma in più nel bundle, e non aggiunge granché.
- *trpc*: sovradimensionato per ora, valutabile se le API crescono molto.

**Rationale**: meno dipendenze, più controllo, type safety end-to-end via tipi condivisi in `@home-panel/shared`.

### D4. Design tokens via CSS variables + Tailwind 4 `@theme`

**Decisione**: definire i token in un file `apps/mobile/src/styles/tokens.css` come variabili CSS native, e dichiararli in Tailwind 4 tramite il direttivo `@theme` per esporli come classi utility.

```css
@theme {
  --color-accent-primary: oklch(68% 0.15 50);
  --color-accent-secondary: oklch(78% 0.13 75);
  --color-accent-success: oklch(72% 0.08 150);
  --space-4: 16px;
  --radius-tile: 32px;
  --font-display: "Fraunces", serif;
  --font-sans: "Geist Sans", sans-serif;
  --duration-default: 320ms;
  --easing-quart: cubic-bezier(0.2, 0, 0, 1);
}
```

**Alternative considerate**:
- *Tailwind config in JS*: meno flessibile per OKLCH e meno performante.
- *CSS-in-JS (Emotion, styled-components)*: overhead a runtime, non necessario.
- *Stitches/Vanilla Extract*: ottimi ma aggiungono complessità di build.

**Rationale**: Tailwind 4 ha pieno supporto nativo per `@theme` e CSS variables. Zero runtime, zero build complexity, massima flessibilità per dark/light mode swap.

### D5. Theme provider via `data-theme` attribute + Zustand

**Decisione**: il `ThemeProvider` setta `<html data-theme="light">` o `<html data-theme="dark">` (o nessun attributo per `auto`). Il file `tokens.css` definisce i valori in `:root`, `[data-theme="light"]`, `[data-theme="dark"]`, e `:root` con `prefers-color-scheme: dark` per il default automatico. La preferenza utente è memorizzata in uno store Zustand persistito in `localStorage`.

**Alternative considerate**:
- *Solo CSS via `prefers-color-scheme`*: niente override manuale possibile.
- *Class-based dark mode di Tailwind 3*: meno ergonomico in Tailwind 4.

**Rationale**: pattern standard 2025/2026, zero JS runtime per il theme switch effettivo, override manuale facile.

### D6. Plugin Tauri `kiosk-basics` come plugin Rust con Swift bridge

**Decisione**: scrivere un plugin Tauri 2 in Rust che esponga 3 comandi al frontend:
- `set_idle_timer_disabled(disabled: bool)`
- `set_fullscreen(fullscreen: bool)`
- `set_orientation_lock(orientations: Vec<String>)`

Il plugin SHALL avere un layer Swift bridge per chiamare le API UIKit corrispondenti (`UIApplication.shared.isIdleTimerDisabled`, ecc.). Su target non-iOS (browser dev, desktop) i comandi SHALL essere no-op.

**Alternative considerate**:
- *Plugin community esistente*: nessun plugin Tauri 2 maturo copre tutto questo combinato. `tauri-plugin-keep-screen-on` esiste ma non gestisce orientamento e fullscreen iOS.
- *Capacitor*: ecosistema diverso, non integrabile.

**Rationale**: scrivere un piccolo plugin custom è la strada più pulita e dà zero dipendenze esterne.

### D7. AppShell con container queries per il responsive

**Decisione**: l'AppShell usa CSS container queries (`@container`) per adattarsi al viewport, non media queries globali. Questo permette di testare e visualizzare il layout iPad anche in finestre piccole durante lo sviluppo, e rende l'AppShell riutilizzabile in contesti diversi.

```css
.app-shell {
  container-type: inline-size;
}

@container (min-width: 1024px) {
  .home-mosaic { display: grid; grid-template-columns: repeat(12, 1fr); }
}
```

**Alternative considerate**:
- *Media queries pure*: meno flessibili.
- *useMediaQuery hook*: non necessario, il CSS basta.

**Rationale**: container queries sono ben supportate in Safari iOS 16+ (l'iPad Pro 11" 2-3 gen è certamente >= iOS 16).

### D8. State management: TanStack Query + Zustand + niente Redux

**Decisione**:
- **TanStack Query** per tutto lo state lato server (lista famiglia, eventi futuri, spesa futura, ecc.) con `staleTime` di 30 secondi di default e invalidazione esplicita su mutazioni.
- **Zustand** per UI state locale (tema corrente, sidebar aperta, modale aperto, indicatore voice in/out).
- **useState** locale per state effimero di un singolo componente.

**Alternative considerate**:
- *Redux Toolkit*: overkill per la dimensione del progetto.
- *Jotai/Recoil*: meno standard, comunità più piccola.
- *Solo Context API*: re-render eccessivi, non scala bene.

**Rationale**: pattern già usato e validato nel vecchio home-panel di riferimento, comunità molto attiva, zero attrito.

### D9. i18n con type safety sulle chiavi via `i18next-parser` + dichiarazioni globali

**Decisione**: usare `react-i18next` standard, ma generare automaticamente un file `apps/mobile/src/types/i18next.d.ts` che dichiara i tipi delle chiavi a partire dai file JSON di traduzione, in modo che `t('member.invalid_key')` sia errore di compilazione.

**Alternative considerate**:
- *typesafe-i18n*: ottimo ma alternativo a react-i18next, cambia paradigma.
- *Lingui*: stesso discorso.

**Rationale**: react-i18next è già lo standard del vecchio home-panel, low-friction migration di pattern, type safety è puramente additiva.

### D10. Font self-hosted via Fontsource (no Google Fonts)

**Decisione**: installare i pacchetti `@fontsource-variable/fraunces` e `@fontsource-variable/geist-sans` (npm) e importarli in `apps/mobile/src/main.tsx`. I font diventano parte del bundle, zero richieste a CDN esterne, zero leak di privacy verso Google.

**Alternative considerate**:
- *Google Fonts CDN*: privacy leak (request all'IP utente verso google.com).
- *Bunny Fonts CDN*: meglio di Google ma comunque dipendenza esterna.
- *Self-hosting manuale dei file `.woff2`*: lavoro inutile, Fontsource lo fa per noi.

**Rationale**: Fontsource è la best practice 2026, zero attrito, totalmente self-hosted.

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Plugin Tauri custom richiede competenze Rust + Swift bridge che potrebbero rallentare la prima build iOS | Documentare ogni passo nei tasks (`pnpm tauri ios init`, comandi per build, errori comuni). Iniziare con il comando più semplice (`set_idle_timer_disabled`) e iterare. |
| `idleTimerDisabled = true` aumenta consumo batteria sull'iPad | L'iPad è sempre alimentato da cavo permanente in cucina/sala. Su iPhone il plugin SHALL detectare il device type e non attivare keep-on. |
| Bearer token statico è vulnerabile se l'.env del frontend viene committato per errore | `.gitignore` blocca `.env`, README documenta `.env.example` come unico file commitabile, lint pre-commit verifica che `.env` non sia tracciato. |
| Tailscale richiede un account utente e installazione fisica su 3 device prima che l'app sia usabile fuori casa | Il setup è documentato step-by-step nel README. In dev locale tutto funziona via `http://localhost:3000` senza Tailscale. |
| Container queries Safari iOS hanno qualche bug noto | Test su iPad simulator + device fisico durante lo sviluppo; fallback a media queries puntuale se necessario. |
| Whisper.cpp richiede ~466MB di modello + binary Rust pesante: la foundation deve già lasciare spazio (background mode `audio` in `Info.plist`) | I tasks di foundation includono la dichiarazione `audio` in `Info.plist` anche se Whisper arriverà in `add-voice-control`. Così non serve toccare il config nativo due volte. |
| L'utente non ha mai usato OpenSpec — il workflow change/specs/design/tasks è nuovo | Questa change funziona come "tutorial implicito": dopo averla applicata, l'utente avrà visto il pattern completo. |
| Design system con palette OKLCH richiede browser moderni | Safari iOS 16+ supporta OKLCH nativo. iPad Pro 11" 2-3 gen è certamente >= iOS 16. Nessun fallback necessario. |

## Migration Plan

Trattandosi della **prima change funzionale** del progetto, non c'è migrazione da uno stato precedente. Il piano di rollout è:

1. **Preparazione locale**: `pnpm install`, generazione migration Drizzle, applicazione migration al SQLite locale, test `pnpm dev`.
2. **Sviluppo iterativo**: implementare i tasks nell'ordine documentato in `tasks.md`. Ogni gruppo logico di tasks chiude con un commit atomico.
3. **Test su browser**: validare AppShell, design system, family CRUD via browser desktop prima ancora di toccare iOS.
4. **Test su iPad**: `pnpm tauri ios init` (una tantum), poi `pnpm tauri ios dev` su simulatore o device fisico per validare il plugin kiosk.
5. **Setup Tailscale**: l'utente installa Tailscale su Synology + iPad + iPhone seguendo il README.
6. **Deploy backend Synology**: `docker compose up -d --build` sul NAS, `.env` con `API_TOKEN` generato.
7. **Configurazione frontend**: `apps/mobile/.env` con `VITE_API_BASE_URL` puntato all'hostname Tailscale del Synology e `VITE_API_TOKEN` allineato.
8. **Validazione end-to-end**: aggiunta di un primo family member via UI, conferma persistenza nel SQLite del NAS, conferma che l'iPhone fuori casa vede gli stessi dati.

**Rollback strategy**: dato che è la prima change e non ci sono utenti reali, rollback = `git revert` + reset del file SQLite.

## Open Questions

1. **Generazione del `API_TOKEN`**: lo creiamo manualmente con `openssl rand -base64 32` documentato nel README, oppure aggiungiamo uno script `pnpm generate-token` al monorepo? — *Proposta*: documentazione manuale, è un'azione one-shot.
2. **Avatar dei family members**: per ora accettiamo solo `avatarUrl` (URL esterno o data URI). L'upload di foto vere da iPad richiede un endpoint di file upload che NON è in scope per la foundation. Verrà aggiunto se/quando l'utente lo chiederà.
3. **Persistenza del tema su iOS**: `localStorage` funziona in WKWebView ma viene cancellato se l'utente svuota i dati Safari. Vale la pena usare il file system Tauri per persistenza più robusta? — *Proposta*: localStorage per ora, upgrade a Tauri Store solo se l'utente segnala il problema.
4. **Plugin community vs custom**: ricontrollare se nel periodo di esecuzione esiste un plugin Tauri 2 community che copre `idleTimerDisabled` + `fullscreen` + orientation lock combinati. Se sì, valutare adozione invece del custom.
