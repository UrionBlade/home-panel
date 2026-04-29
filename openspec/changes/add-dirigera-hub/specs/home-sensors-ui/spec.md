## ADDED Requirements

### Requirement: AirQualityTile renders on the home dashboard

Il frontend SHALL fornire un componente `AirQualityTile` montato come tile nella home page (insieme alle altre tile esistenti tipo Weather, TV). La tile SHALL leggere i dati via hook `useEnvSensors`, mostrare per ogni env_sensor disponibile: CO2 (ppm) con label, PM2.5 (µg/m³), temperatura (°C, una cifra decimale), umidità (%, intero). Se più di un sensore è presente, la tile SHALL aggregare visualizzando la stanza accanto al valore (es. "Salotto 18°C 45% • Cucina 21°C 50%"). Color coding: CO2 < 800 ppm verde, 800-1200 giallo, > 1200 rosso. PM2.5 < 12 verde, 12-35 giallo, > 35 rosso.

#### Scenario: Single sensor shown
- **GIVEN** un solo ALPSTUGA paired in stanza "Soggiorno"
- **WHEN** la home page si apre
- **THEN** la tile SHALL mostrare i 4 valori con i loro indicatori color-coded, label "Soggiorno"

#### Scenario: Multiple sensors aggregated
- **GIVEN** ALPSTUGA in "Soggiorno" e TIMMERFLÖTTE in "Bagno"
- **WHEN** la home page si apre
- **THEN** la tile SHALL mostrare entrambe le stanze, ognuna con i propri valori (CO2/PM2.5 omessi per TIMMERFLÖTTE che non li ha)

#### Scenario: No sensor configured
- **GIVEN** nessun env_sensor sincronizzato
- **WHEN** la home page si apre
- **THEN** la tile NON SHALL essere mostrata (ritorna null), nessun placeholder vuoto

#### Scenario: CO2 over threshold
- **GIVEN** ALPSTUGA riporta `last_co2_ppm = 1450`
- **THEN** il valore CO2 nella tile SHALL essere reso con la classe rossa del design system

### Requirement: useEnvSensors hook auto-invalidates on SSE updates

Il frontend SHALL fornire un hook `useEnvSensors()` in `apps/mobile/src/lib/hooks/useEnvSensors.ts` che ritorna `{ data: EnvSensor[], isLoading, error }` da `GET /api/v1/sensors/env`. Il hook SHALL sottoscriversi all'evento SSE `sensors:env-update` e invalidare automaticamente la query quando arriva l'evento, usando il pattern già stabilito da `useLights` / altri hook esistenti. Un secondo hook `useEnvSensorHistory(id, hours)` SHALL ritornare `EnvHistoryPoint[]` da `GET /api/v1/sensors/env/$id/history`.

#### Scenario: Initial fetch
- **WHEN** un componente monta `useEnvSensors()`
- **THEN** SHALL chiamare `GET /api/v1/sensors/env` una volta e ritornare i dati cacheati per 30s

#### Scenario: SSE update invalidates
- **GIVEN** la query è cacheata
- **WHEN** SSE emette `sensors:env-update` con `sensorId`
- **THEN** il hook SHALL invalidare la query `["sensors", "env"]` e re-fetchare

### Requirement: KAJPLATS appears in LightsPage alongside eWeLink lights

Il frontend SHALL trattare KAJPLATS (e qualunque altra luce DIRIGERA) come una light qualunque nella pagina `LightsPage` esistente: stessa card, stessi controlli on/off + brightness slider, stessa modale di assegnazione stanza. Nessun branching frontend basato sul provider — il dispatcher backend nasconde la differenza. La pagina settings esistente per le luci (provider eWeLink in cima) SHALL avere una sezione DIRIGERA con stato connessione hub e link allo script di auth in caso di disconnessione.

#### Scenario: Mixed providers
- **GIVEN** 3 luci eWeLink + 1 KAJPLATS già sincronizzata
- **WHEN** l'utente apre LightsPage
- **THEN** SHALL vedere 4 light card identiche per layout, ognuna pilotabile

#### Scenario: Toggle KAJPLATS
- **GIVEN** KAJPLATS spenta
- **WHEN** l'utente tocca il toggle on
- **THEN** il frontend SHALL chiamare `POST /api/v1/lights/$id/on`, mostrare lo stato ottimistico immediatamente, e confermarlo quando arriva l'evento SSE `lights:update`

#### Scenario: KAJPLATS offline
- **GIVEN** KAJPLATS è offline (DIRIGERA non la vede più)
- **WHEN** l'utente tocca il toggle
- **THEN** il backend SHALL ritornare 503 e il frontend SHALL mostrare un toast "Lampada offline" e revertire lo stato ottimistico

### Requirement: Leak alert modal blocks UI on trigger

Il frontend SHALL mostrare un modale bloccante `LeakAlertModal` ogni volta che riceve un evento SSE `sensors:leak-trigger` mentre l'app è in foreground. Il modale SHALL essere reso sopra qualunque contenuto (z-index massimo), avere icona di allarme + titolo "Perdita rilevata!", body con `friendly_name` e `room_name` del sensore, e un solo bottone "Ho visto, gestisco io" che chiama `POST /api/v1/sensors/leak/$id/ack` e chiude il modale. Il modale SHALL emettere un loop sonoro di alert (asset audio in `public/sounds/leak-alert.mp3`) che si ferma alla chiusura.

#### Scenario: Modal appears on leak event
- **GIVEN** l'utente è sulla home page
- **WHEN** SSE emette `sensors:leak-trigger` con `sensorId=X, friendlyName="Lavanderia leak", roomName="Lavanderia"`
- **THEN** un modale SHALL coprire la home con il copy specificato e il sound SHALL partire

#### Scenario: Acknowledge dismisses modal
- **GIVEN** il modale leak è aperto
- **WHEN** l'utente preme "Ho visto, gestisco io"
- **THEN** il frontend SHALL chiamare `POST /api/v1/sensors/leak/$id/ack`, fermare il sound, chiudere il modale, e mostrare un toast "Allarme tacitato"

#### Scenario: Multiple leak events queue
- **GIVEN** un modale leak è già aperto per sensorId A
- **WHEN** SSE emette `sensors:leak-trigger` per sensorId B
- **THEN** il modale corrente SHALL aggiornarsi mostrando entrambi i sensor name, e l'ack SHALL accumularsi (richiedere ack di B chiude solo il riferimento a B; se A è già stato ackato in precedenza il modale si chiude; altrimenti resta aperto per A)

#### Scenario: Sensor returns to dry while modal open
- **GIVEN** il modale leak è aperto per sensorId A
- **WHEN** SSE emette `sensors:leak-ack` per A (perché il sensore è tornato dry)
- **THEN** il modale SHALL chiudersi automaticamente e il sound SHALL fermarsi, senza richiedere ack manuale

### Requirement: Leak alert subscriber lives in top-level provider

Il frontend SHALL montare un provider `LeakAlertProvider` in `App.tsx` (o equivalente top-level) che si sottoscrive a `sensors:leak-trigger` e `sensors:leak-ack` indipendentemente dalla pagina corrente. Il provider SHALL gestire la coda di alert in `ui-store.ts` (slice `leakAlert`) ed esporre `useLeakAlert()` per leggere lo stato corrente. Il modale stesso SHALL essere renderizzato sempre dal `LeakAlertProvider`, sopra il `<Routes>` figli.

#### Scenario: Alert fires on any page
- **GIVEN** l'utente è in `/settings/voice` con scroll fino in fondo
- **WHEN** SSE emette `sensors:leak-trigger`
- **THEN** il modale SHALL apparire sopra la pagina settings, anche se l'utente non era su Home

#### Scenario: Provider does not re-subscribe on route change
- **GIVEN** l'app è caricata e il provider connesso al SSE
- **WHEN** l'utente naviga tra 5 pagine diverse
- **THEN** il provider SHALL mantenere una sola sottoscrizione SSE per tutta la sessione, niente reconnect a ogni route change

### Requirement: i18n namespace `sensors` covers all visible strings

Il frontend SHALL usare un nuovo namespace i18n `sensors` con file `apps/mobile/src/locales/it/sensors.json` e `apps/mobile/src/locales/en/sensors.json`. Le chiavi SHALL coprire: label per CO2/PM2.5/temperatura/umidità, soglie testuali ("buona", "media", "scarsa"), copy del modale leak (titolo, body template con interpolazione, bottone ack), unità di misura. Nessuna stringa user-facing SHALL essere hardcoded nei componenti — sempre via `useT("sensors")`.

#### Scenario: Italian rendering
- **GIVEN** locale `it`
- **WHEN** la AirQualityTile rende CO2 "media" (>= 800 < 1200)
- **THEN** il testo SHALL essere "media", letto da `sensors.thresholds.co2.medium`

#### Scenario: English rendering
- **GIVEN** locale `en`
- **WHEN** la AirQualityTile rende CO2 "high" (>= 1200)
- **THEN** il testo SHALL essere "high", letto da `sensors.thresholds.co2.high`

### Requirement: Voice intents read sensors and toggle DIRIGERA lights

Il sistema SHALL aggiungere cinque nuovi intent al parser e ai handler vocali esistenti, riusando le strutture di `add-voice-control` (parser regex italiano, handler che invocano API, risposte via `vt(...)` / `vtArray(...)` con chiavi sotto `voice.responses.sensors.*`):

1. `read_air_quality` — pattern: "qual è la qualità dell'aria", "com'è l'aria", "leggimi qualità dell'aria"
2. `read_temperature` — pattern: "qual è la temperatura", "che temperatura c'è", con entità room opzionale "qual è la temperatura in $room"
3. `read_humidity` — pattern: "qual è l'umidità", "che umidità c'è", con entità room opzionale "qual è l'umidità in $room"
4. `read_leaks` — pattern: "ci sono perdite", "tutto ok con l'acqua"
5. `light_on_room` / `light_off_room` — pattern: "accendi/spegni la lampada/luce $room" — questi intent riusano l'handler light esistente che già pesca dal lights dispatcher condiviso (eWeLink + DIRIGERA), quindi KAJPLATS funziona senza nuovo codice nel handler una volta che la luce ha un `room_id` assegnato

I primi quattro intent SHALL chiamare le route `/api/v1/sensors/*` esistenti e formattare le risposte vocali in italiano naturale (es. "La qualità dell'aria è buona, 450 ppm di CO2"). Tutti SHALL gestire il caso "nessun sensore configurato" con risposta esplicita ("Non ho sensori della qualità dell'aria configurati", ecc.). Quando più sensori coprono la stessa metrica senza che l'utente specifichi una stanza, la risposta SHALL menzionare ciascuna stanza ("In soggiorno 22 gradi, in bagno 24 gradi").

#### Scenario: Read air quality with one sensor
- **GIVEN** ALPSTUGA con CO2=600, PM2.5=8
- **WHEN** l'utente dice "qual è la qualità dell'aria"
- **THEN** il sistema SHALL rispondere con TTS che dice approssimativamente "La qualità dell'aria è buona, 600 ppm di CO2 e 8 microgrammi di PM2.5"

#### Scenario: Read temperature in specific room
- **GIVEN** TIMMERFLÖTTE in stanza "Bagno" con temp=22
- **WHEN** l'utente dice "qual è la temperatura in bagno"
- **THEN** il sistema SHALL rispondere "In bagno ci sono 22 gradi"

#### Scenario: Read humidity in specific room
- **GIVEN** TIMMERFLÖTTE in stanza "Bagno" con humidity=58
- **WHEN** l'utente dice "qual è l'umidità in bagno"
- **THEN** il sistema SHALL rispondere "In bagno l'umidità è al 58%"

#### Scenario: Read humidity without room hint, multiple sensors
- **GIVEN** ALPSTUGA in "Soggiorno" (45%) e TIMMERFLÖTTE in "Bagno" (58%)
- **WHEN** l'utente dice "qual è l'umidità"
- **THEN** il sistema SHALL rispondere "In soggiorno 45%, in bagno 58%"

#### Scenario: Read leaks - all dry
- **GIVEN** KLIPPBOK con `last_state=false`
- **WHEN** l'utente dice "ci sono perdite"
- **THEN** il sistema SHALL rispondere "Nessuna perdita rilevata"

#### Scenario: Read leaks - active leak
- **GIVEN** KLIPPBOK con `last_state=true` in "Lavanderia"
- **WHEN** l'utente dice "ci sono perdite"
- **THEN** il sistema SHALL rispondere "Attenzione, perdita rilevata in Lavanderia"

#### Scenario: Light on KAJPLATS via voice
- **GIVEN** KAJPLATS sincronizzata e assegnata a "Soggiorno"
- **WHEN** l'utente dice "accendi la lampada del soggiorno"
- **THEN** il light dispatcher SHALL ricevere la richiesta on, KAJPLATS SHALL accendersi, e il TTS SHALL confermare "Ho acceso la lampada del soggiorno"
