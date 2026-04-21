## Why

L'utente ha una Samsung Q6 Series 49" (QE49Q6FNA, Tizen 4.0, 2018) già registrata su SmartThings con lo stesso PAT che usiamo per lavatrice/asciugatrice. Aggiungere il controllo TV al pannello di casa è un win ad alto valore e basso costo: riusa infrastruttura esistente (integrazione SmartThings in `apps/api/src/routes/laundry.ts`), si sposa perfettamente con lo stack voice già in cantiere (Casa/Home) e abilita micro-interazioni utili nel quotidiano (accendi la TV, alza il volume, metti Netflix). Inoltre apre la strada all'auto-pause della TV quando suona il videocitofono Blink — uno dei momenti "wow" più forti del progetto — senza costare una riga di codice in più a questa change.

Il discovery live (`apps/api/scripts/discover-smartthings.ts`) ha confermato che la TV espone tutte le capability necessarie: `switch` con `samsungvd.supportsPowerOnByOcf: true` (si accende anche da spenta via OCF), `audioVolume`, `audioMute`, `mediaInputSource` (input rilevati: `digitalTv`, `HDMI2`), `mediaPlayback` e `custom.launchapp` (lancio app Tizen via package name).

## What Changes

- **Backend**:
  - Estrazione di un client SmartThings condiviso in `apps/api/src/lib/smartthings/client.ts` (helpers `stFetch`/`stPost`, `getConfig` con fallback `.env`/DB) per disaccoppiarlo dal modulo laundry; `laundry.ts` viene refattorizzato per consumarlo
  - Modello dati: colonna nuova `tv_device_id` sulla tabella esistente `smartthings_config` (il PAT resta condiviso); migration drizzle dedicata
  - Nuovo modulo route `apps/api/src/routes/tv.ts` (Hono router) con endpoint:
    - `GET  /tv/status` — stato corrente: power, volume, mute, input, inputs supportati, app in esecuzione (se disponibile)
    - `GET  /tv/devices` — lista Samsung OCF TV visibili al PAT (per selezione in Settings)
    - `PATCH /tv/config` — assegna/cambia il device TV bindato
    - `POST /tv/power` — `{ on: boolean }`
    - `POST /tv/volume` — `{ level?: number /* 0-100 */, delta?: "up" | "down" }`
    - `POST /tv/mute` — `{ muted: boolean | "toggle" }`
    - `POST /tv/input` — `{ source: string }` validato contro `supportedInputSources` recuperati dal device
    - `POST /tv/app` — `{ appId: string }` (package name Tizen, es. `org.tizen.netflix-app`)
    - `POST /tv/playback` — `{ command: "play" | "pause" | "stop" | "fastForward" | "rewind" | "next" | "previous" }`
  - Cache in-memory dello status TV con TTL 10s (le TV cambiano stato meno frequentemente della lavatrice; nessun scheduler di polling background)
- **Shared types**: `packages/shared/src/tv.ts` — `TvStatus`, `TvPowerInput`, `TvVolumeInput`, `TvMuteInput`, `TvInputSelectInput`, `TvAppLaunchInput`, `TvPlaybackInput`, `TvAppPreset`, `TvConfig`, `TvDeviceSummary`. Export dall'index.
- **Frontend (apps/mobile)**:
  - Nuovo hook `src/lib/hooks/useTv.ts` (TanStack Query): `useTvStatus`, `useTvPower`, `useTvVolume`, `useTvMute`, `useTvApp`, `useTvInput`, `useTvPlayback`, `useTvDevices`, `useTvAssign`
  - Nuovo componente home tile `src/components/home-tiles/TvTile.tsx`. Due stati visivi:
    - **Off**: card compatta con icona TV, label "Accendi la TV", tap → power on
    - **On**: card con nome input corrente, barra volume, bottoni quick action (power toggle, vol −/+, mute, shortcut 4 app preset: Netflix, YouTube, Prime, Disney+)
  - Sezione nuova in Settings → "TV": wizard di binding (lista dei Samsung OCF TV disponibili + selezione device id), test di connettività, tasto disconnect
  - Nuovo namespace i18n `apps/mobile/src/locales/{it,en}/tv.json` + aggiornamento `settings.json`
  - Aggiunta intent vocali nel router intent esistente (`apps/mobile/src/lib/voice/intentHandlers.ts` + parser): accensione/spegnimento, volume (su/giù/set), mute, lancio app preset, switch input
  - Aggiunta chiavi in `voice.responses.tv.*` per entrambi i locales (tutte le risposte parlate passano da `vt(...)` / `vtArray(...)`, mai hardcoded)
- **App presets**: lista hardcoded di pacchetti Tizen con label e icona Phosphor. Set iniziale da validare sul device reale in fase di implementazione:
  - `Netflix` → `org.tizen.netflix-app`
  - `YouTube` → `111299001912` (o `3201611010016` a seconda del firmware)
  - `Prime Video` → `org.tizen.primevideo` (o `3201512006785`)
  - `Disney+` → `MCmYXNxgcu.DisneyPlus` (o `3201901017640`)
  - `RaiPlay` → `3201611010011` (tentativo)
  Il primo task di implementazione validerà i package name sul device reale e aggiornerà la lista hardcoded.
- **Docs / config**: aggiornamento commento su `SMARTTHINGS_PAT` in `apps/api/.env.example` per chiarire che ora serve a lavatrice/asciugatrice **e TV**.

## Capabilities

### New Capabilities

- `tv-control`: integrazione backend SmartThings per TV Samsung (client condiviso, schema DB, endpoint REST, cache status, validazione input contro capability del device)
- `tv-ui`: tile home, sezione Settings di binding, hook TanStack Query, namespace i18n
- `tv-voice-intents`: intent vocali TV per accensione/spegnimento, volume, mute, launch app, switch input, con risposte naturali in italiano e inglese via `vt(...)`

### Modified Capabilities

<!-- Nessuna capability già archiviata in openspec/specs/ viene modificata. L'integrazione SmartThings esistente è codice pre-OpenSpec e non ha uno spec file; viene riorganizzata come dettaglio implementativo nel design.md. Il parser vocale di add-voice-control (ancora pending) resta invariato come contratto: questa change aggiunge solo nuovi intent TV dietro la stessa interfaccia. -->

## Impact

**Codice nuovo**:
- `apps/api/src/lib/smartthings/client.ts` — client condiviso estratto da `routes/laundry.ts`
- `apps/api/src/lib/smartthings/tv.ts` — wrapper tipizzato sulle capability TV (read status, commands)
- `apps/api/src/routes/tv.ts` — router Hono degli endpoint `/tv/*`
- `apps/api/drizzle/<next>_<slug>.sql` — aggiunge `tv_device_id TEXT` a `smartthings_config`
- `packages/shared/src/tv.ts` — type condivisi
- `apps/mobile/src/lib/hooks/useTv.ts` — hook TanStack Query
- `apps/mobile/src/components/home-tiles/TvTile.tsx`
- `apps/mobile/src/components/settings/TvSettings.tsx`
- `apps/mobile/src/lib/voice/tvIntents.ts` — handler/pattern TV riusabili dal parser
- `apps/mobile/src/locales/it/tv.json` + `apps/mobile/src/locales/en/tv.json`

**Codice modificato**:
- `apps/api/src/routes/laundry.ts` — consuma il client condiviso invece di avere gli helper inline
- `apps/api/src/db/schema.ts` — aggiunge `tvDeviceId` alla tabella `smartthingsConfig`
- `apps/api/src/index.ts` — registra il router `/tv`
- `apps/api/.env.example` — aggiorna il commento su `SMARTTHINGS_PAT`
- `packages/shared/src/index.ts` — esporta `./tv`
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `<TvTile />` nel mosaico
- `apps/mobile/src/pages/SettingsPage.tsx` — monta la sezione `TvSettings`
- `apps/mobile/src/lib/voice/intentHandlers.ts` — integra intent TV
- `apps/mobile/src/locales/it/settings.json` + `apps/mobile/src/locales/en/settings.json` — chiavi per la sezione TV
- `apps/mobile/src/locales/it/voice.json` + `apps/mobile/src/locales/en/voice.json` — chiavi sotto `voice.responses.tv.*`

**Dipendenze**: nessuna nuova dipendenza runtime. Nessuna nuova env var.

**Migration**: aggiunge colonna `tv_device_id` a `smartthings_config` (nullable, nessun backfill necessario).

**Nessun breaking change**: il modulo laundry mantiene lo stesso contratto REST; cambia solo l'implementazione interna (consumo del client condiviso).

**Out of scope per questa change**:
- Auto-pause della TV su bell press del videocitofono — il contratto dell'endpoint `/tv/playback` è sufficiente, il wiring spetta alla futura `add-blink-doorbell-interrupting`
- Ambient mode, picture mode, sound mode
- Multi-TV (una sola TV bindata; lo schema è già pensato per permettere future colonne `tv_device_id_2` o una tabella dedicata se serve)
- Gestione errori di TV offline oltre il ritorno `409 Conflict` con `{ error, retryable: true }` dall'API
