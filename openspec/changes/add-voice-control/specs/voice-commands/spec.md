## ADDED Requirements

### Requirement: Voice command parser classifies italian intents

Il sistema SHALL fornire un parser `voiceCommandParser.parse(transcript: string): ParsedCommand | null` che riceve una stringa italiana trascritta da Whisper e restituisce un `ParsedCommand` con `{ intent, entities, confidence, raw }` oppure `null` se nessun intent è riconosciuto. Il parser SHALL supportare i 14 intent documentati in proposal.md, con pattern matching basato su regex + keyword italiani.

#### Scenario: Recognize add to shopping
- **WHEN** il parser riceve "aggiungi latte alla spesa"
- **THEN** SHALL ritornare `{ intent: 'add_to_shopping', entities: { product: 'latte' }, confidence: > 0.8 }`

#### Scenario: Recognize add event with date and member
- **WHEN** il parser riceve "ricordami che cody ha veterinario domani alle dieci"
- **THEN** SHALL ritornare `{ intent: 'add_event', entities: { title: 'veterinario', date: '<tomorrow ISO>', time: '10:00', members: ['Cody'] } }`

#### Scenario: Recognize read waste tonight
- **WHEN** il parser riceve "cosa porto fuori stasera"
- **THEN** SHALL ritornare `{ intent: 'read_waste_today', entities: {}, confidence: > 0.9 }`

#### Scenario: Unknown input returns null
- **WHEN** il parser riceve "aprite la finestra del salotto"
- **AND** nessun pattern matcha
- **THEN** SHALL ritornare `null` (oppure un fallback intent `unknown`)

### Requirement: Intent handlers invoke feature APIs

Per ogni intent riconosciuto, il sistema SHALL fornire un handler dedicato in `intentHandlers.ts` che invoca le API delle altre feature e ritorna una risposta `{ voiceResponse: string, action?: { type, payload } }`. La risposta vocale SHALL essere in italiano naturale, generata via `voiceResponses.ts` con template fissi.

#### Scenario: add_to_shopping calls by-name endpoint
- **GIVEN** un comando con `intent: 'add_to_shopping', entities: { product: 'latte' }`
- **WHEN** l'handler viene invocato
- **THEN** SHALL chiamare `apiClient.post('/api/v1/shopping/items/by-name', { name: 'latte' })`
- **AND** SHALL ritornare `{ voiceResponse: "Ho aggiunto latte alla spesa" }`
- **AND** se il backend ritorna 404 SHALL ritornare `{ voiceResponse: "Non sono riuscito a trovare latte nel catalogo, vuoi che lo aggiunga comunque?" }`

#### Scenario: read_today_events queries calendar
- **GIVEN** intent `read_today_events`
- **WHEN** l'handler viene invocato
- **THEN** SHALL chiamare `apiClient.get('/api/v1/calendar/today')`
- **AND** se la lista è vuota SHALL ritornare `"Oggi non hai eventi in programma"`
- **AND** se ha 1 evento SHALL ritornare `"Oggi hai un evento: <title> alle <time>"`
- **AND** se ha 2+ eventi SHALL costruire una stringa naturale italiana che li elenca

#### Scenario: read_waste_today calls voice endpoint
- **GIVEN** intent `read_waste_today`
- **WHEN** l'handler viene invocato
- **THEN** SHALL chiamare `apiClient.get('/api/v1/waste/today')`
- **AND** SHALL ritornare il `voiceText` ricevuto direttamente dal backend (già coniugato in italiano)

#### Scenario: read_weather calls voice endpoint
- **GIVEN** intent `read_weather`
- **WHEN** l'handler viene invocato
- **THEN** SHALL chiamare `apiClient.get('/api/v1/weather/voice?when=now')`
- **AND** SHALL ritornare il `voiceText` ricevuto

### Requirement: Routine commands orchestrate multi-feature responses

I 2 routine intents (`routine_morning`, `routine_night`) SHALL chiamare multiple API in parallelo e comporre una risposta vocale narrativa.

**Buongiorno** SHALL:
1. Chiamare `weather/voice?when=now` + `calendar/today` + `waste/today` in parallelo
2. Comporre una risposta come: `"Buongiorno! <weather voiceText>. Oggi hai <event count> eventi: <event list>. Stasera dovrai portare fuori <waste>."`
3. Se non ci sono eventi: `"Buongiorno! <weather>. Non hai eventi oggi. <waste reminder>."`

**Buonanotte** SHALL:
1. Chiamare `calendar/tomorrow` + `waste/tomorrow` in parallelo
2. Invocare `setNightMode(true)` immediato (anche prima dell'orario)
3. Comporre: `"Buonanotte. Passo in modalità notte. Domani avrai <event count> eventi e dovrai portare fuori <waste>."`

#### Scenario: Buongiorno full
- **WHEN** l'utente dice "ok casa, buongiorno"
- **THEN** il parser SHALL riconoscere `intent: routine_morning`
- **AND** l'handler SHALL chiamare le 3 API in parallelo
- **AND** SHALL ritornare una stringa narrativa italiana che combina meteo + eventi + spazzatura

#### Scenario: Buonanotte triggers night mode
- **WHEN** l'utente dice "ok casa, buonanotte"
- **AND** sono le 21:30 (ancora prima del nightStartHour)
- **THEN** l'handler SHALL invocare `setNightMode(true)` per attivare il night mode immediato
- **AND** SHALL leggere il riassunto di domani

### Requirement: Voice command flow handles confirmation and disambiguation

Per i comandi che potrebbero essere ambigui (es. "rimuovi latte dalla spesa" quando ci sono 2 item che matchano), il sistema SHALL gestire una mini-conversazione di disambiguazione:

1. Handler scopre ambiguità → ritorna `{ voiceResponse: "Ho trovato 2 voci con latte: latte intero e latte di soia. Quale vuoi rimuovere?", waitingForFollowup: true, followupContext: { originalIntent: 'remove_from_shopping', candidates: [...] } }`
2. Frontend riprende immediatamente lo STT (senza richiedere wake word di nuovo) per ascoltare la risposta dell'utente
3. La risposta dell'utente ("intero") viene parsata con il contesto → handler completa l'azione

#### Scenario: Disambiguation flow
- **WHEN** l'utente dice "rimuovi latte"
- **AND** la lista contiene "latte intero" e "latte di soia"
- **THEN** il sistema SHALL chiedere "Quale vuoi rimuovere: intero o di soia?"
- **AND** SHALL riavviare lo STT per ascoltare la risposta
- **WHEN** l'utente dice "intero"
- **THEN** il sistema SHALL completare la rimozione e dire "Fatto, ho rimosso latte intero"

### Requirement: Voice responses use Italian template generators

Il sistema SHALL fornire `voiceResponses.ts` con funzioni template che generano risposte italiane naturali per ogni intent, gestendo:
- Plurali (1 evento vs 2 eventi)
- Articoli (il/la/lo/l'/i/le)
- Coniugazioni (oggi → "stasera/oggi", domani → "domani")
- Concatenazioni con virgola e "e" finale

#### Scenario: Plural events
- **WHEN** ci sono 3 eventi oggi
- **THEN** la funzione `composeTodayEvents(events)` SHALL ritornare "Oggi hai 3 eventi: ..." (non "Oggi hai 1 eventi")

#### Scenario: Single event
- **WHEN** c'è 1 evento oggi
- **THEN** SHALL ritornare "Oggi hai un evento: ..."

#### Scenario: Empty events
- **WHEN** non ci sono eventi
- **THEN** SHALL ritornare "Oggi non hai eventi in programma"
