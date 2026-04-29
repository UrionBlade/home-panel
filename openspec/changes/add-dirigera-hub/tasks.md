## 1. Auth flow + setup script

- [x] 1.1 Creare `scripts/dirigera/auth.sh` con il flusso PKCE completo (genera code_verifier S256, chiama `/v1/oauth/authorize` con audience=homesmart.local, prompta press del pulsante con countdown, chiama `/v1/oauth/token`, stampa env vars)
- [ ] 1.2 Verificare lo script su DIRIGERA reale (192.168.178.164), prendere il bearer e salvarlo localmente per sviluppo
- [x] 1.3 Aggiungere `DIRIGERA_HOST` e `DIRIGERA_TOKEN` a `apps/api/.env.example` con commenti che linkano lo script
- [x] 1.4 Documentare la procedura one-time in un commento testa di `scripts/dirigera/auth.sh` (no README dedicato)

## 2. Shared types

- [x] 2.1 Creare `packages/shared/src/dirigera.ts` con `DirigeraDevice`, `DirigeraAirReading`, `DirigeraLeakState`, `DirigeraLightState`, `DirigeraDeviceType`
- [x] 2.2 Creare `packages/shared/src/sensors.ts` con `EnvSensor`, `LeakSensor`, `EnvHistoryPoint`, `LeakAlertPayload`
- [x] 2.3 Aggiungere export dei nuovi moduli in `packages/shared/src/index.ts`
- [x] 2.4 `pnpm typecheck` su packages/shared deve passare

## 3. Backend — schema + migrations

- [x] 3.1 Aggiungere tabelle `env_sensors`, `leak_sensors`, `env_sensor_history` in `apps/api/src/db/schema.ts` con tutte le colonne dello spec dirigera-hub
- [x] 3.2 Verificare che la tabella `lights` esistente abbia già una colonna `provider` (string) e `provider_device_id` adatte ad accogliere righe DIRIGERA; se mancano, aggiungerle senza rompere righe eWeLink esistenti
- [x] 3.3 Generare la migration drizzle (`pnpm drizzle-kit generate` workspace api)
- [x] 3.4 Verificare la migration applicandola su un DB locale temporaneo
- [x] 3.5 Aggiungere indici: `env_sensors.dirigera_id` UNIQUE, `leak_sensors.dirigera_id` UNIQUE, `env_sensor_history.sensor_id`, `env_sensor_history.recorded_at`

## 4. Backend — DIRIGERA client (`src/lib/dirigera/`)

- [x] 4.1 Creare `src/lib/dirigera/client.ts` con `dirigeraGet`, `dirigeraPost`, `dirigeraPatch`, `dirigeraDelete` usando un `https.Agent({ rejectUnauthorized: false })` LOCALE (no env globale)
- [x] 4.2 Implementare lettura `DIRIGERA_HOST` / `DIRIGERA_TOKEN` da env, esporre `isConfigured()`
- [x] 4.3 Implementare `listDevices()`, `patchDevice(id, attrs)`, `getHubInfo()` come wrapper sopra il client
- [ ] 4.4 Test unit per il client con mock di `fetch` (verifica auth header, agent passato, error handling 401/403/503)
- [x] 4.5 Creare `src/lib/dirigera/ws-subscriber.ts`: WebSocket client `wss://$HOST:8443/v1/`, autenticazione bearer, exponential backoff (1, 2, 4, 8, 16, 30s capped), event emitter interno
- [x] 4.6 Mappare i messaggi WS DIRIGERA (`deviceStateChanged`, `deviceAdded`, `deviceRemoved`) sugli eventi locali del bus
- [ ] 4.7 Test unit per il subscriber con mock di WS server (verifica reconnect logic + sequence)

## 5. Backend — device repository + sync

- [x] 5.1 Creare `src/lib/dirigera/device-repo.ts` con funzioni `upsertLight`, `upsertEnvSensor`, `upsertLeakSensor`, `appendEnvHistory`, `getRoomMappings`
- [x] 5.2 Implementare `syncDevices()`: chiama `listDevices()`, classifica per `deviceType` + capability, upserta nelle tabelle giuste, preservando `room_id` + `friendly_name` lato Home Panel
- [x] 5.3 Implementare il listener bus che ascolta `homepanel:dirigera:device-update` e applica le delta al repo + emette SSE corrispondente (lights:update, sensors:env-update, sensors:leak-trigger/ack)
- [x] 5.4 Logica leak: detectare transizione `false → true`, chiamare push notification, emettere SSE leak-trigger; transizione `true → false` emette solo SSE leak-ack
- [x] 5.5 Bootstrap function `initDirigera(app)`: chiamata da `src/index.ts` all'avvio; se `isConfigured()`, fa sync iniziale + apre WS subscriber + registra il provider lights; gracefully no-op altrimenti
- [x] 5.6 Scheduler retention `env_sensor_history`: cron job orario che cancella record con `recorded_at < now() - 7 days`
- [ ] 5.7 Test integration: spin up un DIRIGERA mock (Express + ws server) e verificare sync + WS path end-to-end

## 6. Backend — lights provider integration

- [x] 6.1 Creare `src/lib/lights/providers/dirigera.ts` implementando l'interfaccia `LightProvider` esistente
- [x] 6.2 Mappare comandi `turnOn`, `turnOff`, `setBrightness` sulle chiamate `patchDevice` corrette
- [x] 6.3 Gestire device offline: ritornare error tipato `{ code: "DEVICE_OFFLINE" }` con HTTP 503 nel route layer
- [x] 6.4 Aggiornamento ottimistico della cache `lights` prima della conferma DIRIGERA
- [x] 6.5 Registrare il provider nel `dispatcher.ts` solo se `dirigera.isConfigured()`

## 7. Backend — routes

- [x] 7.1 Creare `src/routes/dirigera.ts` con `GET /status`, `POST /sync` (manual refresh), `GET /devices` (raw list per debug)
- [x] 7.2 Creare `src/routes/sensors.ts` con `GET /env`, `GET /env/:id`, `GET /env/:id/history`, `GET /leak`, `POST /leak/:id/ack`
- [x] 7.3 In dev/staging (NODE_ENV !== 'production'), esporre `POST /sensors/leak/:id/test-trigger` per iniettare evento simulato
- [x] 7.4 Wireare le route in `src/index.ts`, mountandole su `/api/v1/dirigera/*` e `/api/v1/sensors/*`
- [ ] 7.5 Test integration delle nuove route con `supertest` o equivalente già usato dal repo

## 8. Backend — APNs leak push

- [x] 8.1 Creare `src/lib/push/templates/leak-alert.ts` con builder `buildLeakAlertPayload({ friendlyName, roomName, sensorId })` che produce l'oggetto APNs (alert title/body, sound, custom data)
- [x] 8.2 Modificare la handler leak in `device-repo.ts` (5.4) per invocare il push solo se `apns.isConfigured()`, loggare warning altrimenti
- [ ] 8.3 Unit test del payload builder con vari input (room null, friendlyName con caratteri speciali)

## 9. Frontend — shared types e hooks

- [ ] 9.1 Creare `apps/mobile/src/lib/hooks/useEnvSensors.ts`: `useEnvSensors()` (lista) e `useEnvSensorHistory(id, hours)` con TanStack Query, sottoscrizione SSE auto-invalidate
- [ ] 9.2 Creare `apps/mobile/src/lib/hooks/useLeakSensors.ts`: `useLeakSensors()` lista, `useAckLeak()` mutation
- [ ] 9.3 Estendere `apps/mobile/src/lib/sse/client.ts` (o equivalente) per gestire i nuovi event types: `sensors:env-update`, `sensors:leak-trigger`, `sensors:leak-ack`

## 10. Frontend — AirQualityTile

- [ ] 10.1 Creare `apps/mobile/src/components/home-tiles/AirQualityTile.tsx`: layout per 1+ sensori, color coding CO2 + PM2.5
- [ ] 10.2 Definire le soglie color in un util `apps/mobile/src/lib/sensors/thresholds.ts` (CO2: 800/1200, PM2.5: 12/35) con types tipo `Severity = "good" | "medium" | "high"`
- [ ] 10.3 Aggiungere la tile alla home page (l'ordine va concordato con le tile esistenti — typically aria sotto al meteo)
- [ ] 10.4 Caso "nessun sensore": tile non si renderizza (return null)
- [ ] 10.5 Test componente con render condizionale + valori a soglia

## 11. Frontend — leak alert modale e provider

- [ ] 11.1 Creare `apps/mobile/src/components/sensors/LeakAlertModal.tsx`: modale full-screen con icona, copy, bottone ack
- [ ] 11.2 Aggiungere asset audio `apps/mobile/public/sounds/leak-alert.mp3` (~2-3s loop, royalty-free)
- [ ] 11.3 Estendere `apps/mobile/src/store/ui-store.ts` con slice `leakAlert` (stato, push, dismiss, ack)
- [ ] 11.4 Creare `apps/mobile/src/lib/sensors/LeakAlertProvider.tsx`: subscriber SSE top-level, gestisce coda alert, renderizza il modale, controlla `<audio>` element
- [ ] 11.5 Montare `LeakAlertProvider` in `App.tsx` accanto agli altri provider top-level
- [ ] 11.6 Test e2e: simulare ricezione SSE leak-trigger via mock e verificare che il modale appaia + sound parta

## 12. Frontend — LightsPage integration

- [ ] 12.1 Verificare che la `LightsPage` esistente legga le luci via dispatcher senza branching per provider (refactor minimo se necessario)
- [ ] 12.2 Smoke test: KAJPLATS appare, on/off + brightness funzionano, gli stati ottimistici sono confermati da SSE
- [ ] 12.3 Estendere la sezione settings DIRIGERA con stato connessione hub e link a documentazione re-auth

## 13. Frontend — i18n

- [ ] 13.1 Creare `apps/mobile/src/locales/it/sensors.json` con tutte le chiavi (label, soglie, modale leak, unità)
- [ ] 13.2 Creare `apps/mobile/src/locales/en/sensors.json` parallelo
- [ ] 13.3 Aggiornare la config i18next per registrare il nuovo namespace
- [ ] 13.4 Verificare che nessuna stringa user-facing nei nuovi componenti sia hardcoded (`pnpm biome check` con regola lint i18n se presente)

## 14. Frontend — voice intents

- [ ] 14.1 Aggiungere pattern regex per `read_air_quality`, `read_temperature`, `read_humidity`, `read_leaks` in `apps/mobile/src/lib/voice/voiceCommandParser.ts` con scenari coperti dallo spec
- [ ] 14.2 Aggiungere handler corrispondenti in `apps/mobile/src/lib/voice/intentHandlers.ts` che chiamano le route `/api/v1/sensors/*` esistenti
- [ ] 14.3 Aggiungere chiavi `voice.responses.sensors.*` in IT e EN per tutti i casi (1 sensore, multi sensore con room, nessun sensore configurato, leak attiva, dry)
- [ ] 14.4 Verificare che `light_on_room` / `light_off_room` esistenti picchino sul dispatcher e funzionino con KAJPLATS senza nuove modifiche al handler luce
- [ ] 14.5 Test parser per ogni nuovo intent (almeno 3 frasi test per pattern)

## 15. End-to-end test + deploy

- [ ] 15.1 Far girare l'API in locale con DIRIGERA reale; eseguire smoke test manuale: light on/off, sensor readings, simulazione leak
- [ ] 15.2 Test sul Tauri iPad reale: home tile aggiornata, modale leak triggerato dal `test-trigger` endpoint
- [ ] 15.3 Test push APNs sul device fisico (richiede env APNS popolate sul NAS — se non ancora fatte, documentare come blocking task della deploy)
- [ ] 15.4 Aggiornare `apps/api/.env.example` definitivamente
- [ ] 15.5 Deploy: SSH al NAS, aggiornare `.env`, `docker compose pull && docker compose up -d`, verificare `/api/v1/dirigera/status`
- [ ] 15.6 Smoke test post-deploy: stesso scenario del 15.1 ma sul backend production

## 16. Cleanup + archive

- [ ] 16.1 `pnpm biome check` passa con 0 errori in tutto il monorepo
- [ ] 16.2 `pnpm typecheck` passa
- [ ] 16.3 Tutti i test passano
- [ ] 16.4 `openspec validate add-dirigera-hub --strict` passa
- [ ] 16.5 Aggiornare CHANGELOG con sezione DIRIGERA integration
- [ ] 16.6 Archive della change con `openspec archive add-dirigera-hub` quando deploy verificato in production
