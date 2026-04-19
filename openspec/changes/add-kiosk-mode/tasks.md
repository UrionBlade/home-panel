## 1. Schema e migration

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` la tabella `kiosk_settings` con vincolo `id = 1`
- [x] 1.2 Generare e applicare la migration
- [x] 1.3 Seed: inserire riga di default se non esiste

## 2. Tipi condivisi

- [x] 2.1 Creare `packages/shared/src/kiosk.ts` con `KioskSettings`, `KioskPhoto`, `UpdateKioskSettingsInput`
- [x] 2.2 Esportare da `packages/shared/src/index.ts`

## 3. Backend: settings router

- [x] 3.1 Creare `apps/api/src/routes/kiosk.ts` con sub-router `/settings` e `/photos`
- [x] 3.2 `GET /settings` restituisce la riga 1
- [x] 3.3 `PATCH /settings` per aggiornare i campi (validation: hour 0-23, brightness 0-1, idle_minutes >= 1)

## 4. Backend: photos loader

- [x] 4.1 Creare `apps/api/src/lib/photos-loader.ts` con `listPhotos()` cached 5min + `refreshPhotosCache()`
- [x] 4.2 `GET /photos` restituisce array filenames
- [x] 4.3 `GET /photos/:filename` con sanitization path traversal + content-type detection + cache headers
- [x] 4.4 `POST /photos/refresh` per refresh manuale della cache

## 5. Docker compose

- [ ] 5.1 Aggiungere al `docker-compose.yml` il volume bind `/volume1/photo/HomePanel:/data/photos:ro` (parametrizzato via env `PHOTOS_HOST_PATH`)
- [ ] 5.2 Documentare nel README come configurare la cartella foto sul Synology

## 6. Plugin Tauri brightness

- [ ] ~~6.1 Aggiungere a `apps/mobile/src-tauri/src/kiosk.rs` i comandi `set_brightness(level: f32)` e `get_brightness() -> f32`~~ (iOS-blocked)
- [ ] ~~6.2 Aggiungere bridge Swift in `KioskPlugin.swift` con `@_cdecl("ios_set_brightness")` e `@_cdecl("ios_get_brightness")`~~ (iOS-blocked)
- [ ] ~~6.3 Stub no-op per non-iOS targets~~ (iOS-blocked)
- [ ] ~~6.4 Registrare i nuovi comandi in `tauri::Builder`~~ (iOS-blocked)
- [ ] ~~6.5 Test su simulator iPad: chiamare `set_brightness(0.3)` e verificare il dimming~~ (iOS-blocked)

## 7. Frontend: hook e provider

- [x] 7.1 Estendere `apps/mobile/src/lib/kiosk.ts` con `setBrightness`, `getBrightness`, `currentBrightness` state
- [x] 7.2 Creare `apps/mobile/src/lib/hooks/useKioskSettings.ts` con TanStack Query (read + update)
- [x] 7.3 Creare `apps/mobile/src/lib/hooks/useIdleDetection.ts` con event listeners + setTimeout
- [x] 7.4 Creare `apps/mobile/src/lib/kiosk/NightModeProvider.tsx` con polling 1min + Context
- [x] 7.5 Creare `apps/mobile/src/lib/kiosk/isInNightRange.ts` helper con cross-midnight handling
- [ ] 7.6 Test unit per `isInNightRange`

## 8. Frontend: night mode CSS

- [x] 8.1 Creare `apps/mobile/src/styles/night-mode.css` con override delle CSS variables documentate
- [x] 8.2 Importare in `main.tsx` dopo `tokens.css`
- [x] 8.3 Verificare che i componenti esistenti (Button, Card, Tile, ecc.) leggano automaticamente le nuove variabili

## 9. Frontend: ScreensaverOverlay

- [x] 9.1 Creare `apps/mobile/src/components/kiosk/PhotoSlideshow.tsx` con cross-fade + Ken Burns via Framer Motion
- [x] 9.2 Creare `apps/mobile/src/components/kiosk/ScreensaverOverlay.tsx` come fullscreen `motion.div` con z-index altissimo, usa `useKioskPhotos` + `PhotoSlideshow`
- [x] 9.3 Tap dismiss → onDismiss callback
- [x] 9.4 Orologio compatto in basso a destra
- [x] 9.5 Fallback senza foto: orologio grande centrato

## 10. Frontend: AppShell integration

- [x] 10.1 Aggiornare `AppShell.tsx` per wrappare con `NightModeProvider`
- [x] 10.2 Aggiungere `<ScreensaverOverlay />` come ultimo figlio condizionato dall'idle
- [x] 10.3 Coordinare `useKioskMode` con il NightMode Context per la luminosità
- [ ] ~~10.4 Quando in night mode, semplificare la home (vista clock + next event + next waste)~~ (iOS-blocked)

## 11. Settings → Schermo

- [x] 11.1 Creare `apps/mobile/src/components/settings/KioskSettings.tsx`
- [x] 11.2 Toggle "Modalità notte" + time picker start/end + slider brightness
- [x] 11.3 Toggle "Salvaschermo foto" + slider idle minutes + bottone "Refresh foto"
- [x] 11.4 Preview live: pulsante "Test screensaver" che lo attiva immediatamente
- [x] 11.5 Preview live: pulsante "Test night mode" che lo applica per 30 secondi
- [x] 11.6 Aggiungere la sezione a `SettingsPage.tsx`

## 12. i18n

- [x] 12.1 Creare `apps/mobile/src/locales/it/kiosk.json` con stringhe (titoli sezioni, label settings, conferme, fallback messages)

## 13. Validazione

- [x] 13.1 `pnpm typecheck && pnpm lint` verde
- [ ] 13.2 Test: cambiare ora di sistema sull'iPad (Settings → Generali → Data e ora) e verificare attivazione night mode
- [ ] 13.3 Test: idle 5 min, screensaver appare; tap, dismess
- [ ] 13.4 Test: caricare 3 foto sul Synology, verificare slideshow le mostra in cross-fade
- [ ] 13.5 Test: brightness 0.25 in night mode, ripristino al normale dopo
- [ ] 13.6 Test path traversal: `curl /photos/..%2Fetc%2Fpasswd` → 400
- [ ] 13.7 Test fallback: cartella photo vuota → screensaver mostra clock fallback
- [ ] 13.8 Test reduced motion: niente Ken Burns, solo cross-fade
- [ ] 13.9 `openspec validate add-kiosk-mode` verde
