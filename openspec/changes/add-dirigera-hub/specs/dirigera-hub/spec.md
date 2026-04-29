## ADDED Requirements

### Requirement: PKCE auth flow produces a long-lived bearer token

Il sistema SHALL fornire uno script `scripts/dirigera/auth.sh` che esegue l'OAuth PKCE flow contro l'hub DIRIGERA: genera `code_verifier` + `code_challenge` (SHA-256), chiama `POST https://$DIRIGERA_HOST:8443/v1/oauth/authorize?audience=homesmart.local&response_type=code&code_challenge=$CHALLENGE&code_challenge_method=S256` per ottenere il `code`, prompta l'utente di premere il pulsante fisico sul DIRIGERA entro 60 secondi, poi chiama `POST /v1/oauth/token` con `grant_type=authorization_code&code=$CODE&name=home-panel&code_verifier=$VERIFIER` e stampa il bearer token risultante. Lo script SHALL accettare TLS self-signed via `curl -k` esplicito, non disabilitare la verifica TLS a livello globale, e non scrivere il token su disco — solo stdout perché l'utente lo incolli nel `.env` del NAS.

#### Scenario: Successful pairing
- **GIVEN** il DIRIGERA è raggiungibile su 192.168.178.164:8443
- **WHEN** l'utente esegue `./scripts/dirigera/auth.sh 192.168.178.164` e preme il pulsante entro 60s
- **THEN** lo script SHALL stampare due righe `DIRIGERA_HOST=192.168.178.164` e `DIRIGERA_TOKEN=<bearer>` da incollare nel `.env`

#### Scenario: Button not pressed in time
- **GIVEN** lo script ha richiesto il `code` e attende il press
- **WHEN** l'utente non preme il pulsante entro 60s
- **THEN** la chiamata `POST /v1/oauth/token` SHALL ritornare 403, lo script SHALL stampare un messaggio chiaro "pulsante non premuto in tempo, riprova" ed exit code != 0

#### Scenario: Hub unreachable
- **GIVEN** l'IP del DIRIGERA non risponde
- **WHEN** lo script tenta `POST /v1/oauth/authorize`
- **THEN** SHALL fallire con messaggio "DIRIGERA non raggiungibile su $HOST:8443" ed exit code != 0

### Requirement: REST client connects with self-signed TLS without globals

Il backend SHALL fornire un modulo `apps/api/src/lib/dirigera/client.ts` che espone funzioni HTTP wrapper (`dirigeraGet`, `dirigeraPatch`, `dirigeraPost`, `dirigeraDelete`) verso `https://$DIRIGERA_HOST:8443/v1/*`. Il client SHALL costruire un `https.Agent` dedicato con `rejectUnauthorized: false` per accettare il cert self-signed dell'hub, e SHALL passarlo come option `agent` o `dispatcher` solo alle chiamate DIRIGERA — mai impostando `NODE_TLS_REJECT_UNAUTHORIZED` come variabile d'ambiente. Il bearer token SHALL essere letto da `process.env.DIRIGERA_TOKEN` e iniettato come `Authorization: Bearer $TOKEN` su ogni chiamata.

#### Scenario: Read device list
- **GIVEN** `DIRIGERA_HOST` e `DIRIGERA_TOKEN` validi nel `.env`
- **WHEN** il backend chiama `dirigeraGet("/devices")`
- **THEN** SHALL ritornare la lista JSON dei device dell'hub, e nessuna altra chiamata HTTPS dell'API (eWeLink, Spotify, ecc.) SHALL essere influenzata dalla policy TLS rilassata

#### Scenario: Token assente
- **GIVEN** `DIRIGERA_TOKEN` non è settato nel `.env`
- **WHEN** il bootstrap dell'API parte
- **THEN** il modulo dirigera SHALL loggare un warning "DIRIGERA non configurato — skipping" ed esporre stato `disabled` su `/api/v1/dirigera/status`, senza crashare l'API

### Requirement: WebSocket subscriber emits device-state events

Il backend SHALL aprire un WebSocket persistente verso `wss://$DIRIGERA_HOST:8443/v1/` autenticato col bearer, ricevere gli eventi push del DIRIGERA (`deviceStateChanged`, `deviceAdded`, `deviceRemoved`), normalizzarli in eventi interni del bus `homepanel:dirigera:device-update` e propagarli al device repository. Su `close` o `error` la connessione SHALL essere ricreata con backoff esponenziale (1s, 2s, 4s, 8s, capped a 30s).

#### Scenario: Device state push updates repository
- **GIVEN** il WebSocket è connesso
- **WHEN** DIRIGERA invia un messaggio `{"type":"deviceStateChanged","data":{...}}` per la KAJPLATS
- **THEN** il repository SHALL aggiornare `lights.<id>` con il nuovo `isOn` e/o `lightLevel` entro 100ms, e SHALL emettere un evento SSE `lights:update` per il frontend

#### Scenario: Connection drop reconnects
- **GIVEN** il WebSocket è connesso da almeno 1 minuto
- **WHEN** la connessione cade (es. DIRIGERA riavviato)
- **THEN** il client SHALL tentare di riconnettere con backoff esponenziale, e una volta ristabilita SHALL fare un sync completo (`GET /v1/devices`) per recuperare gli stati persi

### Requirement: Device sync maps DIRIGERA types to local schemas

Il backend SHALL fornire un sync che, dato l'array `GET /v1/devices`, mappa ogni device sul corrispondente schema locale: i device con `deviceType === "light"` SHALL essere upsertati nella tabella `lights` con `provider="dirigera"`; i device con `deviceType === "sensor"` e attributi `concentration` (CO2) o `pm25` SHALL essere upsertati in `env_sensors`; i device con `deviceType === "sensor"` e capability `waterLeakDetector` SHALL essere upsertati in `leak_sensors`; i device con `deviceType === "sensor"` con solo temp+humidity (TIMMERFLÖTTE) SHALL essere upsertati in `env_sensors` con CO2/PM2.5 nullabili. Il sync SHALL preservare il `room_id` e `friendly_name` lato Home Panel se già presenti localmente, sovrascrivendo solo i campi runtime (last_*, last_seen).

#### Scenario: First sync persists devices
- **GIVEN** un `.env` valido e database vuoto
- **WHEN** l'API parte e fa il primo sync
- **THEN** SHALL inserire 1 riga in `lights` per KAJPLATS, 2 righe in `env_sensors` (ALPSTUGA + TIMMERFLÖTTE), 1 riga in `leak_sensors` (KLIPPBOK), tutte con `room_id=NULL` e `friendly_name` derivato da DIRIGERA

#### Scenario: Subsequent sync preserves user assignments
- **GIVEN** l'utente ha assegnato KAJPLATS alla stanza "Salotto" e rinominato la lampadina
- **WHEN** un nuovo sync gira
- **THEN** SHALL aggiornare `last_seen` e gli stati runtime, ma SHALL preservare `room_id` e `friendly_name` impostati dall'utente

#### Scenario: Device removed from hub
- **GIVEN** KLIPPBOK è stata in precedenza sincronizzata
- **WHEN** l'utente la rimuove dall'app IKEA, e parte un sync
- **THEN** la riga in `leak_sensors` SHALL essere marcata `last_seen` non aggiornato; il sistema NON SHALL cancellarla automaticamente — l'utente la rimuove esplicitamente da Settings

### Requirement: Light commands proxy to DIRIGERA via lights dispatcher

Il backend SHALL registrare un nuovo provider `dirigera` nel dispatcher `apps/api/src/lib/lights/` che traduce i comandi (on/off, set brightness 0-100) sulle chiamate `PATCH /v1/devices/$id` con il payload corretto (`isOn`, `lightLevel`). Il provider SHALL gestire device offline ritornando un errore strutturato `{ error: "device offline", code: "DEVICE_OFFLINE" }` con HTTP 503, e SHALL aggiornare ottimisticamente la cache locale prima della conferma DIRIGERA.

#### Scenario: Turn on KAJPLATS
- **GIVEN** KAJPLATS è online e spenta
- **WHEN** un client chiama `POST /api/v1/lights/$id/on`
- **THEN** il dispatcher SHALL chiamare `PATCH /v1/devices/$dirigera_id` con `[{"attributes":{"isOn":true}}]`, aggiornare `lights.last_state.isOn=true`, e ritornare 200 con il nuovo stato

#### Scenario: Set brightness
- **GIVEN** KAJPLATS accesa
- **WHEN** un client chiama `PATCH /api/v1/lights/$id` con `{"brightness": 50}`
- **THEN** SHALL inviare `{"attributes":{"lightLevel":50}}` al DIRIGERA

#### Scenario: Device offline
- **GIVEN** KAJPLATS è scollegata dalla rete
- **WHEN** il client chiama `POST /api/v1/lights/$id/on`
- **THEN** SHALL ritornare 503 con `{"error":"device offline","code":"DEVICE_OFFLINE"}`

### Requirement: Leak transition triggers APNs push notification

Il backend SHALL osservare le transizioni di stato dei `leak_sensors` e, ogni volta che un sensore passa da `last_state=false` a `last_state=true`, SHALL inviare una notifica push APNs a tutti i device iOS registrati nella tabella `push_tokens`. Il payload notifica SHALL avere `alert.title="Perdita rilevata"`, `alert.body="$friendly_name in $room_name"` (con fallback "in posizione sconosciuta" se room_id è null), `sound="default"`, e un campo custom `kind="leak"` con `sensorId`. La transizione inversa (true → false) NON SHALL inviare notifiche.

#### Scenario: Leak detected
- **GIVEN** KLIPPBOK è in stato dry (`last_state=false`) ed è in stanza "Lavanderia"
- **WHEN** DIRIGERA invia un evento `waterLeakDetected: true`
- **THEN** il backend SHALL persistere `last_state=true`, inviare APNs push con title "Perdita rilevata" e body "$KLIPPBOK_name in Lavanderia", emettere SSE `sensors:leak-trigger` con il payload completo, e NON SHALL inviare push aggiuntive finché lo stato non torna a false

#### Scenario: APNs not configured
- **GIVEN** le env `APNS_*` non sono settate sul NAS
- **WHEN** un evento leak fires
- **THEN** il backend SHALL comunque emettere SSE `sensors:leak-trigger` (la modale frontend funziona), loggare warning "APNs non configurato, push skipped", e NON SHALL crashare

#### Scenario: Sensor transitions back to dry
- **GIVEN** KLIPPBOK è in stato wet (`last_state=true`)
- **WHEN** DIRIGERA invia `waterLeakDetected: false`
- **THEN** il backend SHALL aggiornare `last_state=false`, emettere SSE `sensors:leak-ack` (per rimuovere il modale lato frontend se ancora aperto), ma NON SHALL inviare alcuna push APNs

### Requirement: Sensors API exposes env and leak readings

Il backend SHALL esporre route REST sotto `/api/v1/sensors/*`:
- `GET /env` — lista di tutti gli env_sensors con last_*, room_id, friendly_name, last_seen.
- `GET /env/:id` — dettaglio singolo sensore.
- `GET /env/:id/history?hours=24` — array di `EnvHistoryPoint` ordinati per timestamp ascendente, max 1 punto ogni 5 minuti.
- `GET /leak` — lista di tutti i leak_sensors con last_state, battery_pct, room_id, friendly_name.
- `POST /leak/:id/ack` — acknowledge di un alert leak corrente; aggiorna `last_ack_at` ma NON cambia `last_state`. Emette SSE `sensors:leak-ack`.

#### Scenario: List env sensors
- **GIVEN** ALPSTUGA + TIMMERFLÖTTE sincronizzati
- **WHEN** un client chiama `GET /api/v1/sensors/env`
- **THEN** SHALL ritornare un array con 2 elementi `{ id, kind, last_co2_ppm, last_pm25, last_temp_c, last_humidity_pct, room_id, friendly_name, last_seen }`

#### Scenario: History bucketing
- **GIVEN** ALPSTUGA ha 1000 readings nelle ultime 24h
- **WHEN** un client chiama `GET /api/v1/sensors/env/$id/history?hours=24`
- **THEN** SHALL ritornare al massimo 288 punti (24h × 60min / 5min), aggregati per finestra di 5 minuti

#### Scenario: Acknowledge leak
- **GIVEN** un leak_sensor con `last_state=true`
- **WHEN** un client chiama `POST /api/v1/sensors/leak/$id/ack`
- **THEN** SHALL aggiornare `last_ack_at`, emettere SSE `sensors:leak-ack`, e ritornare 200 con il sensore aggiornato

### Requirement: Bootstrap connects to DIRIGERA at startup

All'avvio dell'API, se `DIRIGERA_HOST` e `DIRIGERA_TOKEN` sono entrambi presenti nel `.env`, il backend SHALL fare nell'ordine: (1) `GET /v1/devices` per il sync iniziale, (2) aprire il WebSocket subscriber, (3) registrare il provider `dirigera` nel lights dispatcher. Se uno qualsiasi di questi step fallisce, l'API SHALL avviarsi comunque, loggando l'errore, e SHALL esporre `/api/v1/dirigera/status` con `{"connected":false,"error":"..."}`.

#### Scenario: Startup with valid credentials
- **GIVEN** `.env` con DIRIGERA_HOST e DIRIGERA_TOKEN validi
- **WHEN** l'API parte
- **THEN** entro 5 secondi SHALL aver completato sync + WS connect, e `GET /api/v1/dirigera/status` SHALL ritornare `{"connected":true,"deviceCount":4,"lastSync":<iso>}`

#### Scenario: Startup with missing token
- **GIVEN** `.env` senza `DIRIGERA_TOKEN`
- **WHEN** l'API parte
- **THEN** SHALL avviarsi normalmente, loggare "DIRIGERA disabled — token missing", e `/api/v1/dirigera/status` SHALL ritornare `{"connected":false,"reason":"not_configured"}`

#### Scenario: Hub down at startup
- **GIVEN** credenziali valide ma DIRIGERA spento
- **WHEN** l'API parte
- **THEN** il sync iniziale SHALL fallire, l'API SHALL avviarsi comunque, e il WS subscriber SHALL ritentare con backoff fino a connessione

### Requirement: History rolling window and retention

Il backend SHALL persistere un record in `env_sensor_history` ogni volta che un sensore env emette un nuovo reading via WebSocket, includendo `recorded_at`, `co2_ppm`, `pm25`, `temp_c`, `humidity_pct`. Un job scheduler SHALL girare ogni ora e cancellare record con `recorded_at` più vecchio di 7 giorni, per evitare che la tabella cresca indefinitamente.

#### Scenario: New reading appended
- **WHEN** ALPSTUGA emette un reading via WS
- **THEN** SHALL essere inserita una riga in `env_sensor_history` con i valori e `recorded_at = now()`

#### Scenario: Retention cleanup
- **GIVEN** la tabella `env_sensor_history` contiene 50000 record con date sparse su 30 giorni
- **WHEN** lo scheduler retention gira
- **THEN** SHALL cancellare tutte le righe con `recorded_at < now() - 7 days`, lasciando solo gli ultimi 7 giorni
