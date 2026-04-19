## 1. Schema e migration

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` `blink_credentials`, `blink_cameras`, `blink_motion_clips`
- [x] 1.2 Generare e applicare migration

## 2. Crittografia credenziali

- [ ] 2.1 Creare `apps/api/src/lib/crypto.ts` con `encrypt`, `decrypt` AES-256-GCM
- [ ] 2.2 Aggiungere `BLINK_ENCRYPTION_KEY` a `.env.example` con istruzioni `openssl rand -base64 32`
- [ ] 2.3 Validation startup: se la chiave non è impostata e c'è un'entry credenziali in DB → errore chiaro
- [ ] 2.4 Test unit encrypt/decrypt round-trip

## 3. Tipi condivisi

- [x] 3.1 Creare `packages/shared/src/blink.ts` con `BlinkCamera`, `BlinkMotionClip`, `BlinkCredentials`, `BlinkEvent`, `LiveStreamUrl`
- [x] 3.2 Esportare da `packages/shared/src/index.ts`

## 4. Backend: Blink client

- [ ] 4.1 Creare `apps/api/src/lib/blink/client.ts` con classe `BlinkClient`
- [ ] 4.2 Implementare `login(email, password)` → restituisce `{ accountId, syncModuleId, refreshToken }`
- [ ] 4.3 Implementare `listCameras()` → array di camera oggetti
- [ ] 4.4 Implementare `requestSnapshot(cameraId)` + `getLastSnapshot(cameraId)`
- [ ] 4.5 Implementare `startLiveStream(cameraId)` → URL m3u8
- [ ] 4.6 Implementare `listMotionEvents(since)` → array di event
- [ ] 4.7 Implementare `downloadMotionClip(eventId)` → buffer MP4
- [ ] 4.8 Implementare `pollDoorbell(cameraId)` per detect bell press
- [ ] 4.9 Gestione token refresh automatico
- [ ] 4.10 Gestione rate limit con backoff esponenziale
- [ ] 4.11 Test integration con account Blink reale (manuale)

## 5. Backend: sync e poller jobs

- [ ] 5.1 Creare `apps/api/src/lib/blink/sync.ts` con `syncMotionClips()` che lista nuovi events e scarica i nuovi
- [ ] 5.2 Salvataggio MP4 in `/data/blink_clips/<cameraId>/<eventId>.mp4`
- [ ] 5.3 Generazione thumbnail JPEG (ffmpeg via child process — aggiungere FROM con ffmpeg al Dockerfile)
- [ ] 5.4 Insert in `blink_motion_clips`
- [ ] 5.5 Creare `apps/api/src/lib/blink/doorbell-poller.ts` con polling 10s
- [ ] 5.6 Creare `apps/api/src/jobs/blink-cleanup.ts` per retention 30gg
- [ ] 5.7 Avvio dei job al boot del backend se le credenziali sono presenti

## 6. Backend: SSE endpoint

- [x] 6.1 Creare `apps/api/src/routes/sse.ts` con `streamSSE` di Hono
- [x] 6.2 EventEmitter globale per emettere eventi `blink:doorbell-pressed`, `blink:motion-detected`
- [x] 6.3 Heartbeat ogni 30s
- [x] 6.4 Test con `curl -N http://localhost:3000/api/v1/sse`

## 7. Backend: blink router

- [x] 7.1 Creare `apps/api/src/routes/blink.ts`
- [x] 7.2 `POST /credentials` con encrypt + login + sync
- [x] 7.3 `DELETE /credentials` per logout
- [x] 7.4 `GET /cameras` con sync da DB
- [x] 7.5 `POST /cameras/sync` per refresh manuale
- [ ] 7.6 `GET /cameras/:id/snapshot` con caching 5min
- [ ] 7.7 `GET /cameras/:id/live` che ritorna URL m3u8
- [x] 7.8 `GET /cameras/:id/clips` lista
- [x] 7.9 `GET /clips/:id` serve il file MP4 dal volume con range support
- [ ] 7.10 `GET /clips/:id/thumbnail` serve JPEG
- [x] 7.11 `DELETE /clips/:id` per delete manuale
- [ ] 7.12 `GET /settings` e `PATCH /settings` per retention + toggle notifiche

## 8. Docker compose

- [ ] 8.1 Aggiornare `docker-compose.yml` con volume `/volume1/docker/home-panel/blink_clips:/data/blink_clips`
- [ ] 8.2 Aggiornare `Dockerfile` per includere `ffmpeg` (apk add ffmpeg)
- [ ] 8.3 Documentare nel README la creazione della cartella sul Synology

## 9. Frontend: SSE client

- [x] 9.1 Creare `apps/mobile/src/lib/sse-client.ts` con `EventSource` + reconnect backoff
- [x] 9.2 Esporre `subscribeSSE(eventType, handler)` API
- [x] 9.3 Hook `useSSEEvent(eventType)` con cleanup automatico

## 10. Frontend: hook blink

- [x] 10.1 Creare `apps/mobile/src/lib/hooks/useBlink.ts` con `useCameras()`, `useCameraSnapshot(id)`, `useCameraLive(id)`, `useClips(filter)`, mutation `useLogin/useLogout`, `useSyncCameras`
- [x] 10.2 Subscription al SSE per `blink:motion-detected` → invalidate clip query

## 11. Frontend: components cameras

- [ ] 11.1 Creare `apps/mobile/src/components/cameras/CameraTile.tsx` con snapshot + nome + stato + bottoni Live/Clip
- [ ] 11.2 Creare `apps/mobile/src/components/cameras/LiveViewPlayer.tsx` con HLS.js
- [ ] 11.3 Creare `apps/mobile/src/components/cameras/ClipPlayer.tsx` con `<video>` standard + controls
- [ ] 11.4 Creare `apps/mobile/src/components/cameras/ClipsBrowser.tsx` con grouping per data + filtri
- [ ] 11.5 Aggiungere `hls.js` come dipendenza

## 12. Frontend: DoorbellOverlay

- [ ] 12.1 Creare `apps/mobile/src/components/cameras/DoorbellOverlay.tsx` come fullscreen `motion.div` z-index altissimo
- [ ] 12.2 Live view player + 3 bottoni grandi (Vedi/Parla/Ignora)
- [ ] 12.3 Push-to-talk gesture sul bottone Parla
- [ ] 12.4 Suono campanello loop ogni 3s, max 15s
- [ ] 12.5 Auto-dismiss 60s
- [ ] 12.6 Subscribe a SSE `blink:doorbell-pressed` → mount automatico
- [ ] 12.7 Coordinazione: pause voice loop quando overlay attivo, dismiss screensaver

## 13. Frontend: integration AppShell

- [ ] 13.1 Aggiornare `AppShell.tsx` per montare `<DoorbellOverlay>` come ultimo figlio (z-index più alto di tutti)
- [ ] 13.2 Aprire SSE connection al boot dell'AppShell
- [ ] 13.3 Asset audio in `apps/mobile/public/sounds/doorbell.mp3`

## 14. Frontend: pagina e tile

- [x] 14.1 Creare `apps/mobile/src/pages/CamerasPage.tsx` con grid camere + selezione + tab live/clips
- [x] 14.2 Creare `apps/mobile/src/components/home-tiles/CamerasTile.tsx` con snapshot + count + tap
- [x] 14.3 Aggiornare `router.tsx` per `/cameras`
- [x] 14.4 Aggiornare `HomePage.tsx` per includere `<CamerasTile />`

## 15. Settings → Telecamere

- [ ] 15.1 Creare `apps/mobile/src/components/settings/BlinkSettings.tsx`
- [ ] 15.2 Form login + lista camere + slider retention + toggle notifiche
- [ ] 15.3 Bottone "Sincronizza ora" + "Disconnetti"
- [ ] 15.4 Aggiungere alla `SettingsPage.tsx`

## 16. i18n

- [x] 16.1 Creare `apps/mobile/src/locales/it/cameras.json`

## 17. Test E2E

- [ ] 17.1 `pnpm typecheck && pnpm lint` verde
- [ ] 17.2 Test login Blink con account reale dell'utente
- [ ] 17.3 Test sync camere → vedere lista in UI
- [ ] 17.4 Test snapshot → vedere immagine
- [ ] 17.5 Test live view → 30s di stream
- [ ] 17.6 Test motion → simulare movimento davanti alla camera, verificare clip scaricato e visibile in ClipsBrowser
- [ ] 17.7 Test doorbell → suonare il videocitofono, verificare overlay fullscreen + suono + live view
- [ ] 17.8 Test two-way audio → premere "Parla" durante doorbell event
- [ ] 17.9 Test cleanup retention → impostare retention 1 giorno, verificare rimozione clip vecchi
- [ ] 17.10 Test SSE reconnect → spegnere e riaccendere il backend, verificare reconnect automatico
- [ ] 17.11 Test multi-device → doorbell suona su iPad e iPhone simultaneamente
- [ ] 17.12 `openspec validate add-blink-cameras` verde
