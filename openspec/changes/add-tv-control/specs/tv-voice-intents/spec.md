## ADDED Requirements

### Requirement: Voice parser recognizes TV intents

Il parser vocale (il modulo `voiceCommandParser` introdotto da `add-voice-control`) SHALL riconoscere i seguenti intent TV: `tv_power_on`, `tv_power_off`, `tv_volume_up`, `tv_volume_down`, `tv_volume_set` (con entity `level: number`), `tv_mute`, `tv_unmute`, `tv_launch_app` (con entity `appKey: "netflix"|"youtube"|"prime"|"disney"|"raiplay"`), `tv_input_set` (con entity `source: string`). Il parser SHALL accettare formulazioni italiane e inglesi e SHALL tollerare variazioni comuni (articoli, sinonimi, inversione ordine).

I pattern SHALL essere definiti in un modulo `apps/mobile/src/lib/voice/tvIntents.ts` e importati dal parser principale tramite il pattern di registration. Il parser SHALL ritornare `{ intent, entities, confidence, raw }` con `confidence > 0.8` quando un pattern matcha pienamente.

#### Scenario: Recognize italian power on
- **WHEN** il parser riceve `"accendi la tv"`
- **THEN** SHALL ritornare `{ intent: "tv_power_on", entities: {}, confidence: > 0.8 }`

#### Scenario: Recognize italian power off with synonym
- **WHEN** il parser riceve `"spegni la televisione"`
- **THEN** SHALL ritornare `{ intent: "tv_power_off", entities: {}, confidence: > 0.8 }`

#### Scenario: Recognize english power
- **WHEN** il parser riceve `"turn on the tv"`
- **THEN** SHALL ritornare `{ intent: "tv_power_on", confidence: > 0.8 }`

#### Scenario: Recognize volume nudges
- **WHEN** il parser riceve `"alza il volume"`
- **THEN** SHALL ritornare `{ intent: "tv_volume_up" }`
- **AND** quando riceve `"abbassa un po'"` (in contesto TV) SHALL ritornare `{ intent: "tv_volume_down" }`

#### Scenario: Recognize absolute volume
- **WHEN** il parser riceve `"imposta il volume a venti"` oppure `"volume a 20"`
- **THEN** SHALL ritornare `{ intent: "tv_volume_set", entities: { level: 20 } }`

#### Scenario: Recognize mute variants
- **WHEN** il parser riceve `"muta la tv"` o `"metti il muto"`
- **THEN** SHALL ritornare `{ intent: "tv_mute" }`
- **WHEN** il parser riceve `"togli il muto"` o `"riattiva l'audio"`
- **THEN** SHALL ritornare `{ intent: "tv_unmute" }`

#### Scenario: Recognize app launch
- **WHEN** il parser riceve `"metti Netflix"` o `"apri Netflix"` o `"fai partire Netflix"`
- **THEN** SHALL ritornare `{ intent: "tv_launch_app", entities: { appKey: "netflix" } }`
- **AND** SHALL riconoscere allo stesso modo `"metti YouTube"`, `"apri Prime"`, `"apri Disney"`, `"metti RaiPlay"`

#### Scenario: Recognize input switch
- **WHEN** il parser riceve `"passa a HDMI 2"` o `"cambia input a HDMI2"`
- **THEN** SHALL ritornare `{ intent: "tv_input_set", entities: { source: "HDMI2" } }`

### Requirement: TV intent handlers call the backend and produce localized voice responses

Per ogni intent TV, il dispatcher SHALL invocare l'endpoint REST corrispondente e ritornare un `{ voiceResponse: string }` localizzato. Le risposte SHALL essere lette da `voice.responses.tv.*` via `vt(...)` / `vtArray(...)`. NESSUNA stringa di risposta SHALL essere hardcoded nel codice degli handler.

#### Scenario: tv_power_on success
- **GIVEN** intent `tv_power_on`
- **WHEN** l'handler viene invocato
- **THEN** SHALL chiamare `POST /tv/power { "on": true }`
- **AND** al success SHALL ritornare `{ voiceResponse: vt("tv.powerOn.success") }` (es. "Ho acceso la tv")
- **AND** se il backend ritorna 404 `{ error: "TV non configurata" }` SHALL ritornare `{ voiceResponse: vt("tv.notConfigured") }` (es. "La tv non è ancora configurata, vai nelle impostazioni")

#### Scenario: tv_volume_set success
- **GIVEN** intent `tv_volume_set` con `entities.level = 20`
- **WHEN** l'handler viene invocato
- **THEN** SHALL chiamare `POST /tv/volume { "level": 20 }`
- **AND** al success SHALL ritornare una voice response con il livello interpolato (es. `vt("tv.volumeSet.success", { level: 20 })` → "Volume impostato a venti")

#### Scenario: tv_launch_app maps appKey to preset
- **GIVEN** intent `tv_launch_app` con `entities.appKey = "netflix"`
- **WHEN** l'handler viene invocato
- **THEN** SHALL risolvere `appKey` all'`appId` tramite la lista preset condivisa
- **AND** SHALL chiamare `POST /tv/app { "appId": "<netflix preset appId>" }`
- **AND** al success SHALL ritornare `vt("tv.appLaunched", { name: "Netflix" })` (es. "Apro Netflix")

#### Scenario: Handler gracefully handles upstream 502
- **GIVEN** SmartThings è down, il backend risponde 502 su tutti gli endpoint TV
- **WHEN** un handler TV viene invocato
- **THEN** SHALL ritornare `{ voiceResponse: vt("tv.upstreamError") }` (es. "Non riesco a raggiungere la tv in questo momento")

### Requirement: Voice response keys exist in both locales

Il sistema SHALL aggiungere le chiavi `voice.responses.tv.*` in entrambi i file `apps/mobile/src/locales/it/voice.json` e `apps/mobile/src/locales/en/voice.json`. Le chiavi minime richieste: `powerOn.success`, `powerOff.success`, `volumeUp.success`, `volumeDown.success`, `volumeSet.success` (con placeholder `{{level}}`), `mute.success`, `unmute.success`, `appLaunched` (con placeholder `{{name}}`), `inputSet.success` (con placeholder `{{source}}`), `notConfigured`, `upstreamError`. Ogni chiave SHALL avere almeno 2 varianti per rotazione naturale quando consumata via `vtArray`.

#### Scenario: Locales are in sync
- **WHEN** si confrontano le chiavi sotto `voice.responses.tv` nei due locale file
- **THEN** il set di chiavi SHALL essere identico

#### Scenario: Multiple variants per key
- **WHEN** si ispeziona una chiave tipo `voice.responses.tv.powerOn.success`
- **THEN** SHALL essere presente un array con almeno 2 stringhe varianti
- **AND** nessuna variante SHALL contenere il nome "Casa"/"Home" hardcoded (l'assistente non si auto-nomina nelle risposte)
