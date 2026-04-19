## Why

`add-foundation` ha implementato il **kiosk basics** (idleTimerDisabled, fullscreen, orientation lock landscape iPad). Questa change estende il kiosk con i comportamenti che rendono l'iPad davvero "un dispositivo da parete":

1. **Modalità notte automatica**: dopo un orario configurabile (es. 22:00) la UI passa a tema scuro caldissimo dimmato (luminanza ridotta), riduce le animazioni, mostra solo l'essenziale (orologio, prossimo evento, prossimi sacchi). Al mattino torna al normale.
2. **Photo screensaver**: dopo N minuti di inattività (no touch), lo schermo passa a un slideshow di foto della famiglia/casa caricate dall'utente su una cartella dedicata del Synology. Le foto si alternano lentamente con cross-fade (tipo Apple Photos screensaver). Tap riporta alla home.
3. **Brightness control via plugin nativo**: in modalità notte la luminosità dello schermo viene ridotta automaticamente (richiede plugin Tauri custom che usa `UIScreen.main.brightness` su iOS).

L'utente vuole un'esperienza "vero prodotto", e queste sono le micro-attenzioni che fanno la differenza tra un'app e un *device*.

## What Changes

- **Backend**:
  - Modello dati `kiosk_settings` (singola riga con: `nightModeEnabled`, `nightStartHour`, `nightEndHour`, `screensaverEnabled`, `screensaverIdleMinutes`, `screensaverPhotosDir`, `nightBrightness`)
  - Endpoint `/api/v1/kiosk/settings` per leggere/aggiornare
  - Endpoint `/api/v1/kiosk/photos` che ritorna la lista degli URL delle foto disponibili nella cartella `screensaverPhotosDir` (path relativo al volume `/data/photos` montato in Docker)
  - Endpoint `/api/v1/kiosk/photos/:filename` che serve un'immagine come blob (con cache header)
- **Frontend**:
  - Hook `useKioskMode()` esteso (nella foundation era basics, ora supporta night mode + screensaver)
  - `NightModeProvider` che monitora l'orario corrente e applica `data-night-mode="true"` all'`<html>`. Tutti i componenti respond con CSS variables alternative (palette ancora più dimmata, animazioni ridotte, font weight più sottile)
  - `ScreensaverOverlay` componente che si attiva dopo N minuti di idle (no pointer/touch event) — fullscreen overlay con foto + cross-fade lento + minimo testo (orologio in basso a destra) + tap dismiss
  - Sezione Settings → Schermo per configurare night mode + screensaver
- **Plugin Tauri esteso**:
  - Nuovo comando `set_brightness(level: f32)` che chiama `UIScreen.main.brightness = level` su iOS
  - Nuovo comando `get_brightness()` per ricordare il valore originale
- **Docker compose**: aggiunge volume bind `/volume1/photo/HomePanel:/data/photos:ro` per esporre la cartella foto del Synology al backend

## Capabilities

### New Capabilities

- `kiosk-night-mode`: schema settings, NightModeProvider, dim CSS variables, toggle automatico per orario
- `kiosk-screensaver`: backend photos endpoint, ScreensaverOverlay, idle detection
- `kiosk-brightness`: plugin Tauri esteso con set/get brightness

### Modified Capabilities

- `kiosk-basics`: estende il plugin Tauri con i nuovi comandi `set_brightness`/`get_brightness`

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — `kiosk_settings`
- `apps/api/src/routes/kiosk.ts`
- `apps/api/src/lib/photos-loader.ts` — list + serve dei file dalla cartella foto
- `packages/shared/src/kiosk.ts` — `KioskSettings`, `KioskPhoto`
- `apps/mobile/src/lib/kiosk/NightModeProvider.tsx`
- `apps/mobile/src/components/kiosk/ScreensaverOverlay.tsx`
- `apps/mobile/src/components/kiosk/PhotoSlideshow.tsx`
- `apps/mobile/src/lib/hooks/useKioskSettings.ts`
- `apps/mobile/src/lib/hooks/useIdleDetection.ts`
- `apps/mobile/src/components/settings/KioskSettings.tsx`
- `apps/mobile/src/styles/night-mode.css` — alternative CSS variables
- `apps/mobile/src/locales/it/kiosk.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router kiosk
- `apps/mobile/src-tauri/src/kiosk.rs` — aggiunge `set_brightness`, `get_brightness`
- `apps/mobile/src-tauri/ios/KioskPlugin.swift` — bridge per `UIScreen.brightness`
- `apps/mobile/src/components/layout/AppShell.tsx` — wrappa con `NightModeProvider` + monta `ScreensaverOverlay`
- `apps/mobile/src/pages/SettingsPage.tsx` — aggiunge sezione Schermo/Kiosk
- `docker-compose.yml` — aggiunge volume foto

**Dipendenze**: nessuna nuova significativa.

**Migration**: nuova tabella settings (1 riga seed di default).

**Nessun breaking change**.
