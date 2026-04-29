## Why

L'utente ha installato un hub IKEA DIRIGERA (192.168.178.164) sulla LAN con quattro device già accoppiati: una lampadina E27 KAJPLATS, un sensore qualità aria ALPSTUGA (CO2, PM2.5, temp, umidità), un sensore perdite acqua KLIPPBOK, un sensore temp/umidità TIMMERFLÖTTE. Tutti i device sono Matter-over-Thread, ma il commissioning è già stato fatto verso DIRIGERA — usare l'API REST del DIRIGERA è la via più rapida e stabile per portarli sul Home Panel, senza tirare in ballo `python-matter-server` e una seconda Matter fabric.

Il valore concreto per l'utente: vedere CO2/PM2.5/temperatura/umidità sulla home (informazione utile ogni giorno), spegnere la lampadina del salotto dal pannello come fa già con le luci eWeLink, e — il caso ad alta priorità — ricevere subito una notifica push + un modale bloccante in app quando KLIPPBOK rileva una perdita in lavanderia, riusando l'infrastruttura APNs e SSE già pronte.

## What Changes

- **Backend `apps/api`**:
  - Nuovo modulo `src/lib/dirigera/`: REST client (auth PKCE, fetch wrapper con TLS self-signed e `rejectUnauthorized: false` esplicito su un agent dedicato), WebSocket subscriber per eventi push, device repository, state cache, mapping helpers per device type (light → schema lights esistente, sensori env → nuova tabella, leak → nuova tabella + trigger push).
  - Nuova tabella `env_sensors` (`id`, `dirigera_id`, `kind`, `last_co2_ppm`, `last_pm25`, `last_temp_c`, `last_humidity_pct`, `last_seen`, `room_id`, `friendly_name`).
  - Nuova tabella `leak_sensors` (`id`, `dirigera_id`, `last_state`, `battery_pct`, `last_seen`, `room_id`, `friendly_name`).
  - Nuova tabella `env_sensor_history` per il trend 24h (rolling window, append-only, `sensor_id`, `recorded_at`, valori).
  - Estensione del `lights` schema per ospitare le righe DIRIGERA accanto alle eWeLink (provider stringa già presente nel modello).
  - Migration drizzle dedicate.
  - Nuove route `src/routes/dirigera.ts` (auth setup, devices list, manual sync) e `src/routes/sensors.ts` (env list/detail/history, leak list/ack).
  - Nuovi event SSE: `sensors:env-update`, `sensors:leak-trigger`, `sensors:leak-ack`.
  - Trigger push APNs su transizione leak da `false` → `true`, riusa `src/lib/push/`.
  - Bootstrap: all'avvio dell'API, se `DIRIGERA_TOKEN` è settato, connessione WebSocket + sync device list + persist initial state. Riconnessione exponential backoff su drop.
- **Shared types** in `packages/shared/src/`:
  - `dirigera.ts`: `DirigeraDevice`, `DirigeraAirReading`, `DirigeraLeakState`, `DirigeraLightState`.
  - `sensors.ts`: `EnvSensor`, `LeakSensor`, `EnvHistoryPoint`, `LeakAlertPayload`.
- **Frontend `apps/mobile`**:
  - Nuovo hook `src/lib/hooks/useEnvSensors.ts` (lista + dettaglio + history, SSE auto-invalidate).
  - Nuovo hook `src/lib/hooks/useLeakSensors.ts` (lista + mutation `ack`).
  - Nuova tile `src/components/home-tiles/AirQualityTile.tsx`: card con CO2 (ppm), PM2.5 (µg/m³), temperatura (°C), umidità (%), color-coded (verde/giallo/rosso) sulle soglie di CO2 e PM2.5.
  - Estensione di `src/pages/LightsPage.tsx` (o pagina equivalente esistente): KAJPLATS appare come light qualunque, niente special-case.
  - Nuovo `LeakAlertModal` modale bloccante che si apre sopra la schermata corrente quando arriva l'evento `sensors:leak-trigger`. Suona `<audio>` con suono di allarme. Persistente fino al tap "Ho capito" che chiama `/api/v1/sensors/leak/:id/ack`.
  - Subscriber SSE in un provider top-level (es. `LeakAlertProvider` montato in `App.tsx` accanto a `VoiceProvider`) così il modale parte da qualunque pagina.
  - Estensione `src/store/ui-store.ts`: slice `leakAlert` (`current`, `pushAlert`, `dismissAlert`).
  - Nuovo namespace i18n `src/locales/{it,en}/sensors.json` (label CO2, PM2.5, temp, umidità, soglie testuali, copy modale leak).
  - Nuovi voice intent: "qual è la qualità dell'aria", "qual è la temperatura in $room", "ci sono perdite", "accendi/spegni la lampada $room" (riusa intent dispatcher esistente). Risposte in `voice.responses.sensors.*` per IT/EN, sempre via `vt(...)`/`vtArray(...)`.
- **Setup & operations**:
  - Nuovo script `scripts/dirigera/auth.sh` interattivo: esegue PKCE, prompta l'utente di premere il pulsante fisico sul DIRIGERA entro 60s, stampa `DIRIGERA_TOKEN` e `DIRIGERA_HOST` da incollare nel `.env`.
  - Aggiornamento `apps/api/.env.example` con `DIRIGERA_HOST` e `DIRIGERA_TOKEN` commentati.
  - Documentazione one-time setup nel proposal/design (no README dedicato — segue il pattern eWeLink).

## Capabilities

### New Capabilities

- `dirigera-hub`: integrazione backend col DIRIGERA — auth PKCE, REST + WebSocket client con TLS self-signed, device repository, sync, mapping su schemi esistenti (lights) e nuovi (env_sensors, leak_sensors), routes `/api/v1/dirigera/*` e `/api/v1/sensors/*`, trigger push APNs su evento leak, bootstrap automatico all'avvio, riconnessione su drop.
- `home-sensors-ui`: tile home `AirQualityTile`, hooks TanStack Query per env/leak sensors, modale leak bloccante con suono e ack, sottoscrizione SSE top-level, namespace i18n `sensors`, voice intents di lettura ambiente e attuazione lampadina, integrazione di KAJPLATS dentro `LightsPage` esistente.

### Modified Capabilities

<!-- Nessuna capability già archiviata in openspec/specs/ viene modificata. La capability `voice-commands` proposta in add-voice-control è ancora pending: i nuovi intent (lettura sensori, on/off lampada KAJPLATS) si aggiungono lì come dettaglio implementativo riusando il dispatcher esistente, senza un delta spec separato in questa change. -->


## Impact

- **Schema DB**: tre nuove tabelle (`env_sensors`, `leak_sensors`, `env_sensor_history`), una colonna potenziale su `lights` se non già coperta dal provider string esistente. Migration drizzle dedicate.
- **API surface**: nuovi endpoint sotto `/api/v1/dirigera/*` (3 route) e `/api/v1/sensors/*` (5 route).
- **SSE event vocabulary**: tre nuovi tipi event consumati dal frontend.
- **APNs push**: nuovo template payload per leak event, riusa il client Apple esistente.
- **Bundle size mobile**: trascurabile (1 modale, 1 tile, 2 hook, 1 namespace i18n).
- **Configurazione runtime**: nuove env `DIRIGERA_HOST` + `DIRIGERA_TOKEN` su NAS production.
- **Out of scope** (change separate, future): integrazione Bosch Home Connect; Matter direct via `python-matter-server`; multi-admin DIRIGERA + Apple Home.
- **Rischi noti**: firmware IKEA Matter ha avuto bug occasionali con controller terzi — qui parliamo direttamente con DIRIGERA stesso, quindi il rischio è ridotto al subset "DIRIGERA non espone correttamente un device". Mitigazione: log diagnostici granulari nel sync iniziale + manual refresh endpoint.
