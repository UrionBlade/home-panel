## Why

L'utente ha 1 telecamera Blink esterna + 1 videocitofono Blink, e in futuro pianifica di aggiungere telecamere interne + sensori finestra + fumogeni di deterrenza (modulo `add-home-security-module` futuro). Questa change copre il livello base: poter vedere le live view, scaricare e archiviare i clip motion sul Synology con retention 30 giorni, e gestire **il videocitofono come evento interrupting** che prende il sopravvento dell'intera UI quando suona.

Il videocitofono è la priorità: è l'unico evento che giustifica di interrompere quello che stai facendo (l'utente è in cucina e qualcuno suona alla porta = bisogna vedere subito chi è e poter aprire/parlare). La tile "Telecamere" in home è secondaria.

**Importante**: Blink **non ha API ufficiale pubblica**. Esistono librerie reverse-engineered (`blinkpy` Python, `node-blink-security`, `blink-camera`). Sono fragili: Blink può romperle a ogni server-side update. La feature è esplicitamente **best-effort**.

## What Changes

- **Backend**:
  - Modello dati `blink_credentials` (singola riga: email, encrypted password, refresh token, lastLoginAt) — credenziali persistite criptate (chiave da env)
  - Modello dati `blink_cameras` (id Blink, name, type: `camera | doorbell`, syncModuleId, isOnline, lastSeenAt, motionEnabled, snapshotUrl)
  - Modello dati `blink_motion_clips` (id, cameraId, recordedAt, durationSec, fileSizeBytes, localPath, thumbnailPath, syncedAt) — un record per ogni clip scaricato e salvato su `/data/blink_clips`
  - Servizio `blinkService.ts` che usa una libreria Node reverse-engineered (TBD: `blink-api` o equivalente) per:
    - Login + token refresh
    - Lista cameras + status
    - Snapshot on-demand
    - Live view streaming (URL m3u8 / RTSP)
    - Listing motion events
    - Download motion clip MP4 → save su volume
  - Endpoint `/api/v1/blink/cameras`, `/cameras/:id/snapshot`, `/cameras/:id/live`, `/cameras/:id/clips`, `/clips/:id` (serve file), `/credentials` (POST per setup, POST per logout)
  - Job background che ogni 5 minuti polla nuovi motion events e li scarica
  - Webhook fallback: se Blink supporta callback, riceverli via endpoint dedicato (caso ottimale, da verificare in implementazione)
- **Doorbell push system**:
  - Polling più frequente (ogni 10 secondi) sul videocitofono per detectare il bell press
  - Quando rilevato, emette un evento Server-Sent Events (SSE) o WebSocket al frontend connesso
  - Il frontend mostra l'overlay interrupting fullscreen
- **Frontend**:
  - Pagina `CamerasPage` con grid di tile camera (live view miniatura + controlli)
  - Componente `LiveViewPlayer` con HLS player (HLS.js) per stream
  - Componente `ClipsBrowser` con galleria dei clip motion ordinata per data
  - **`DoorbellOverlay`**: componente top-level montato sull'AppShell che si attiva su evento `blink:doorbell-pressed`. Fullscreen, mostra live view del videocitofono, bottoni "Vedi" / "Parla" / "Ignora", suono distintivo
  - Tile home "Telecamere" con count + ultimo motion + snapshot della prima camera
  - Sezione Settings → Telecamere per setup credenziali, gestione retention, lista cameras
- **Storage**: volume Docker `/data/blink_clips` montato su `/volume1/docker/home-panel/blink_clips` (Synology). Cleanup automatico clip > 30 giorni

## Capabilities

### New Capabilities

- `blink-integration`: schema, servizio reverse-engineered, sync motion clip, retention, credenziali criptate
- `blink-live-view`: streaming live view via HLS, player iOS-compatible
- `blink-doorbell-interrupting`: overlay fullscreen interrupting, audio bidirezionale, suono campanello, SSE/WebSocket per push events
- `blink-cameras-ui`: pagina cameras, tile home, settings

### Modified Capabilities

- `app-shell`: la tab "Telecamere" passa da placeholder a `CamerasPage` reale; aggiunge `DoorbellOverlay` come sibling top-level

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — `blink_credentials`, `blink_cameras`, `blink_motion_clips`
- `apps/api/src/lib/blink/client.ts` — wrapper API non ufficiale
- `apps/api/src/lib/blink/sync.ts` — job di sync motion clip
- `apps/api/src/lib/blink/doorbell-poller.ts` — polling per bell press
- `apps/api/src/lib/crypto.ts` — encrypt/decrypt password con AES-GCM e chiave da env `BLINK_ENCRYPTION_KEY`
- `apps/api/src/routes/blink.ts`
- `apps/api/src/routes/sse.ts` — Server-Sent Events endpoint per eventi realtime (doorbell, motion)
- `apps/api/src/jobs/blink-cleanup.ts` — cleanup clip > 30gg
- `packages/shared/src/blink.ts` — `BlinkCamera`, `BlinkMotionClip`, `BlinkCredentials`, `BlinkEvent`
- `apps/mobile/src/pages/CamerasPage.tsx`
- `apps/mobile/src/components/cameras/` — `CameraTile`, `LiveViewPlayer`, `ClipsBrowser`, `ClipPlayer`, `DoorbellOverlay`
- `apps/mobile/src/components/home-tiles/CamerasTile.tsx`
- `apps/mobile/src/components/settings/BlinkSettings.tsx`
- `apps/mobile/src/lib/hooks/useBlink.ts`
- `apps/mobile/src/lib/sse-client.ts` — client per SSE
- `apps/mobile/src/locales/it/cameras.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router blink + sse + avvia job sync e doorbell poller
- `apps/api/.env.example` — aggiunge `BLINK_ENCRYPTION_KEY` (32 byte base64)
- `apps/mobile/src/components/layout/AppShell.tsx` — monta `<DoorbellOverlay>` come fratello top-level
- `apps/mobile/src/router.tsx` — `/cameras` punta a `CamerasPage` reale
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `<CamerasTile />`
- `apps/mobile/src/pages/SettingsPage.tsx` — sezione Telecamere
- `docker-compose.yml` — aggiunge volume `/volume1/docker/home-panel/blink_clips:/data/blink_clips`
- `packages/shared/src/index.ts` — esporta blink

**Dipendenze aggiunte**:
- `node-blink-security` o equivalente reverse-engineered (libreria da scegliere in implementazione)
- `hls.js` (frontend, per HLS player)
- Niente dipendenze nuove rilevanti backend per SSE (Hono ha supporto nativo)

**Migration**: nuove tabelle. Volume Synology per i clip.

**Nessun breaking change**.
