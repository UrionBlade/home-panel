## ADDED Requirements

### Requirement: Shared SmartThings client

Il sistema SHALL esporre un modulo `apps/api/src/lib/smartthings/client.ts` che fornisce gli helper condivisi per parlare con l'API SmartThings. Il modulo SHALL esporre almeno: `getSmartThingsConfig()`, `stFetch<T>(pat, path)`, `stPost<T>(pat, path, body)`, `stListDevices(pat)`, `stGetDeviceStatus(pat, deviceId)`, `stSendCommands(pat, deviceId, commands)`. Il PAT SHALL essere letto prima dalla colonna `smartthings_config.pat` e, in fallback, da `process.env.SMARTTHINGS_PAT`.

#### Scenario: getSmartThingsConfig prefers DB over env
- **GIVEN** `smartthings_config.pat = "db-token"` in DB
- **AND** `process.env.SMARTTHINGS_PAT = "env-token"`
- **WHEN** viene chiamato `getSmartThingsConfig()`
- **THEN** SHALL ritornare l'oggetto config con `pat = "db-token"`

#### Scenario: getSmartThingsConfig falls back to env when DB row has null pat
- **GIVEN** `smartthings_config.pat = null` in DB
- **AND** `process.env.SMARTTHINGS_PAT = "env-token"`
- **WHEN** viene chiamato `getSmartThingsConfig()`
- **THEN** SHALL ritornare un oggetto con `pat = "env-token"`

#### Scenario: stSendCommands posts array of command objects
- **WHEN** viene chiamato `stSendCommands(pat, "d1", [{ capability: "switch", command: "on" }])`
- **THEN** SHALL eseguire `POST /devices/d1/commands` con body `{ "commands": [{ "component": "main", "capability": "switch", "command": "on" }] }`
- **AND** se il component non è specificato SHALL usare `"main"` come default

#### Scenario: laundry route consumes the shared client
- **WHEN** il codice di `apps/api/src/routes/laundry.ts` viene ispezionato dopo la change
- **THEN** NON SHALL esistere più una definizione locale di `stFetch`/`stPost`/`getConfig`
- **AND** tutte le interazioni con l'API SmartThings SHALL passare dal modulo `lib/smartthings/client.ts`

### Requirement: TV device binding persisted in smartthings_config

Il sistema SHALL aggiungere la colonna `tv_device_id TEXT` alla tabella `smartthings_config` via migration drizzle dedicata. La colonna SHALL essere nullable. La row esistente (id = 1) SHALL continuare a funzionare senza backfill.

#### Scenario: Migration adds nullable column
- **WHEN** la migration viene applicata su un DB esistente con una row in `smartthings_config`
- **THEN** la row preesistente SHALL avere `tv_device_id = NULL`
- **AND** le colonne precedenti (`pat`, `washer_device_id`, `dryer_device_id`, `updated_at`) SHALL restare invariate

#### Scenario: Config query returns new field
- **WHEN** il codice legge la row via drizzle select
- **THEN** il risultato SHALL contenere `tvDeviceId: string | null` (camelCase nel codice TS, snake_case in DB)

### Requirement: GET /tv/devices lists bindable Samsung OCF TVs

Il sistema SHALL esporre `GET /tv/devices` che ritorna la lista dei device SmartThings il cui `deviceTypeName` contiene `"TV"` o le cui capability includono `mediaInputSource` + `audioVolume`. Ogni entry SHALL contenere `{ deviceId: string, label: string, name: string, manufacturer: string | null }`.

#### Scenario: Returns only TV-like devices
- **GIVEN** il PAT utente vede 3 device: Lavatrice (washer), Asciugatrice (dryer), Samsung Q6 Series (TV)
- **WHEN** un client invia `GET /tv/devices`
- **THEN** la risposta SHALL essere `200 OK` con un array di 1 elemento
- **AND** l'elemento SHALL avere `label = "Samsung Q6 Series (49)"` e il relativo `deviceId`

#### Scenario: Returns 400 when SmartThings is not configured
- **GIVEN** PAT mancante sia in DB che in env
- **WHEN** un client invia `GET /tv/devices`
- **THEN** la risposta SHALL essere `400 Bad Request` con body `{ "error": "SmartThings non configurato" }`

### Requirement: PATCH /tv/config binds a TV device

Il sistema SHALL esporre `PATCH /tv/config` con body `{ tvDeviceId: string | null }` che aggiorna la colonna `tv_device_id` nella row `smartthings_config`. Un valore `null` SHALL scollegare la TV. Il device id passato SHALL essere validato: deve esistere tra quelli ritornati da `GET /tv/devices`.

#### Scenario: Successful bind
- **GIVEN** PAT configurato e device `0ffe4a33-…` presente tra i TV visibili
- **WHEN** un client invia `PATCH /tv/config` con body `{ "tvDeviceId": "0ffe4a33-…" }`
- **THEN** la risposta SHALL essere `200 OK` con la config aggiornata
- **AND** la row in `smartthings_config` SHALL avere `tv_device_id = "0ffe4a33-…"` e `updated_at` al timestamp corrente

#### Scenario: Reject unknown device id
- **WHEN** un client invia `PATCH /tv/config` con un `tvDeviceId` che non è nella lista dei TV visibili al PAT
- **THEN** la risposta SHALL essere `400 Bad Request` con body `{ "error": "Device non trovato o non è una TV" }`

#### Scenario: Unbind with null
- **WHEN** un client invia `PATCH /tv/config` con body `{ "tvDeviceId": null }`
- **THEN** la risposta SHALL essere `200 OK`
- **AND** la row in `smartthings_config` SHALL avere `tv_device_id = NULL`

### Requirement: GET /tv/status returns current TV state

Il sistema SHALL esporre `GET /tv/status` che ritorna lo stato corrente della TV bindata. Il body di risposta SHALL contenere: `power: "on" | "off"`, `volume: number` (0-100), `muted: boolean`, `input: string | null`, `supportedInputs: string[]`, `supportedPlaybackCommands: string[]`, `lastUpdatedAt: string` (ISO-8601). La response SHALL essere servita da una cache in-memory con TTL 10s.

#### Scenario: Status returned with cache miss
- **GIVEN** TV bindata, cache vuota
- **WHEN** un client invia `GET /tv/status`
- **THEN** il backend SHALL chiamare `GET /devices/:id/status` su SmartThings
- **AND** SHALL mappare la risposta nel formato `TvStatus`
- **AND** SHALL popolare la cache con `fetchedAt = now`
- **AND** SHALL rispondere `200 OK`

#### Scenario: Status served from cache within TTL
- **GIVEN** cache popolata 3 secondi fa
- **WHEN** un client invia `GET /tv/status`
- **THEN** il backend NON SHALL chiamare SmartThings
- **AND** SHALL rispondere con la versione cached

#### Scenario: Status when TV is not bound
- **GIVEN** `tv_device_id = NULL`
- **WHEN** un client invia `GET /tv/status`
- **THEN** la risposta SHALL essere `404 Not Found` con body `{ "error": "TV non configurata" }`

### Requirement: POST /tv/power toggles power

Il sistema SHALL esporre `POST /tv/power` con body `{ on: boolean }`. Quando `on = true` SHALL inviare `{ capability: "switch", command: "on" }`; quando `on = false` SHALL inviare `{ capability: "switch", command: "off" }`. Dopo l'invio comando SHALL invalidare la cache dello status.

#### Scenario: Power on success
- **GIVEN** TV bindata, power attuale = "off"
- **WHEN** un client invia `POST /tv/power` con body `{ "on": true }`
- **THEN** il backend SHALL eseguire `stSendCommands` con `[{ capability: "switch", command: "on" }]`
- **AND** SHALL invalidare la cache
- **AND** SHALL rispondere `202 Accepted` con body `{ "ok": true }`

#### Scenario: Bad body
- **WHEN** un client invia `POST /tv/power` con body `{ "on": "yes" }` (non boolean)
- **THEN** la risposta SHALL essere `400 Bad Request` con body `{ "error": "on è richiesto (boolean)" }`

### Requirement: POST /tv/volume sets or nudges volume

Il sistema SHALL esporre `POST /tv/volume`. Il body SHALL contenere **esattamente uno** tra `level: number` (0-100, intero) e `delta: "up" | "down"`. Con `level` SHALL inviare `{ capability: "audioVolume", command: "setVolume", arguments: [level] }`. Con `delta` SHALL inviare `volumeUp` o `volumeDown`. Dopo il comando SHALL invalidare la cache dello status.

#### Scenario: Set exact volume
- **WHEN** un client invia `POST /tv/volume` con body `{ "level": 20 }`
- **THEN** il backend SHALL eseguire `setVolume` con argomento `20`
- **AND** SHALL rispondere `202 Accepted`

#### Scenario: Volume up
- **WHEN** un client invia `POST /tv/volume` con body `{ "delta": "up" }`
- **THEN** il backend SHALL eseguire `volumeUp`

#### Scenario: Reject both level and delta
- **WHEN** un client invia `POST /tv/volume` con body `{ "level": 10, "delta": "up" }`
- **THEN** la risposta SHALL essere `400 Bad Request` con body `{ "error": "specificare esattamente uno tra level e delta" }`

#### Scenario: Reject out-of-range level
- **WHEN** un client invia `POST /tv/volume` con body `{ "level": 150 }`
- **THEN** la risposta SHALL essere `400 Bad Request` con body `{ "error": "level deve essere intero tra 0 e 100" }`

### Requirement: POST /tv/mute sets mute state

Il sistema SHALL esporre `POST /tv/mute` con body `{ muted: boolean | "toggle" }`. Con `muted = true` SHALL inviare `{ capability: "audioMute", command: "mute" }`; con `muted = false` SHALL inviare `unmute`; con `muted = "toggle"` SHALL leggere lo status corrente e invertire. Dopo il comando SHALL invalidare la cache.

#### Scenario: Explicit mute
- **WHEN** un client invia `POST /tv/mute` con body `{ "muted": true }`
- **THEN** il backend SHALL eseguire `mute`

#### Scenario: Toggle when currently unmuted
- **GIVEN** status cache indica `muted = false`
- **WHEN** un client invia `POST /tv/mute` con body `{ "muted": "toggle" }`
- **THEN** il backend SHALL eseguire `mute`

### Requirement: POST /tv/input switches input source

Il sistema SHALL esporre `POST /tv/input` con body `{ source: string }`. Il `source` SHALL essere validato contro `supportedInputSources` del device (ottenuto dal status corrente). Se non supportato SHALL ritornare `400`. In caso di successo SHALL inviare `{ capability: "mediaInputSource", command: "setInputSource", arguments: [source] }` e invalidare la cache.

#### Scenario: Valid input
- **GIVEN** status del device con `supportedInputSources = ["digitalTv", "HDMI2"]`
- **WHEN** un client invia `POST /tv/input` con body `{ "source": "HDMI2" }`
- **THEN** il backend SHALL eseguire `setInputSource("HDMI2")`
- **AND** SHALL rispondere `202 Accepted`

#### Scenario: Rejected input with helpful list
- **GIVEN** `supportedInputSources = ["digitalTv", "HDMI2"]`
- **WHEN** un client invia `POST /tv/input` con body `{ "source": "HDMI3" }`
- **THEN** la risposta SHALL essere `400 Bad Request`
- **AND** il body SHALL essere `{ "error": "Input non supportato da questa TV", "supported": ["digitalTv", "HDMI2"] }`

### Requirement: POST /tv/app launches a Tizen app by package name

Il sistema SHALL esporre `POST /tv/app` con body `{ appId: string }`. Il backend SHALL inviare un comando sulla capability `custom.launchapp` con il formato `{ command: "launchApp", arguments: [appId, appId, "{}"] }` (il secondo argomento, `name`, è ripetuto come fallback; il terzo è metadata JSON serializzato). Il sistema NON SHALL rifiutare `appId` sconosciuti (la TV li ignora silenziosamente se invalidi). Dopo il comando SHALL invalidare la cache.

#### Scenario: Launch Netflix
- **WHEN** un client invia `POST /tv/app` con body `{ "appId": "org.tizen.netflix-app" }`
- **THEN** il backend SHALL eseguire un comando `launchApp` sulla capability `custom.launchapp` con argomenti `["org.tizen.netflix-app", "org.tizen.netflix-app", "{}"]`
- **AND** SHALL rispondere `202 Accepted`

#### Scenario: Empty appId rejected
- **WHEN** un client invia `POST /tv/app` con body `{ "appId": "" }`
- **THEN** la risposta SHALL essere `400 Bad Request` con body `{ "error": "appId è richiesto" }`

### Requirement: POST /tv/playback sends playback command

Il sistema SHALL esporre `POST /tv/playback` con body `{ command: string }`. Il `command` SHALL essere validato contro `supportedPlaybackCommands` del device. In caso di successo SHALL inviare un comando sulla capability `mediaPlayback`. Dopo il comando SHALL invalidare la cache.

#### Scenario: Pause when supported
- **GIVEN** `supportedPlaybackCommands = ["play", "pause", "stop", "fastForward", "rewind", "next", "previous"]`
- **WHEN** un client invia `POST /tv/playback` con body `{ "command": "pause" }`
- **THEN** il backend SHALL eseguire `{ capability: "mediaPlayback", command: "pause" }`

#### Scenario: Unsupported command rejected
- **WHEN** un client invia `POST /tv/playback` con un command non presente in `supportedPlaybackCommands`
- **THEN** la risposta SHALL essere `400 Bad Request`
- **AND** il body SHALL includere la lista dei command supportati

### Requirement: TV endpoints handle SmartThings upstream errors

Tutti gli endpoint `/tv/*` SHALL mappare gli errori dall'API SmartThings nei seguenti HTTP status: `401` upstream → `502 { error: "Token SmartThings non valido o scaduto" }`; `5xx` upstream → `502 { error: "SmartThings non raggiungibile", retryable: true }`; timeout/network error → `502 { error: "SmartThings non raggiungibile", retryable: true }`. Ogni errore SHALL essere loggato su `console.error` con prefisso `[tv]`.

#### Scenario: Upstream 401 becomes 502
- **GIVEN** PAT revocato, SmartThings risponde 401
- **WHEN** un client invia `POST /tv/power { "on": true }`
- **THEN** la risposta SHALL essere `502 Bad Gateway` con body `{ "error": "Token SmartThings non valido o scaduto" }`

### Requirement: App preset catalog exposed at GET /tv/apps/presets

Il sistema SHALL esporre `GET /tv/apps/presets` che ritorna un array di preset app con struttura `{ key: string, label: string, icon: string, appId: string }`. Il set minimo iniziale SHALL includere almeno Netflix, YouTube, Prime Video, Disney+. La lista SHALL essere hardcoded nel codice (non DB-driven) e modificabile via PR.

#### Scenario: Presets returned
- **WHEN** un client invia `GET /tv/apps/presets`
- **THEN** la risposta SHALL essere `200 OK` con un array che contiene almeno 4 entry
- **AND** ogni entry SHALL avere campi `key`, `label`, `icon`, `appId` tutti stringhe non vuote
- **AND** le `key` SHALL essere uniche
