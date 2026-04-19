## ADDED Requirements

### Requirement: Buongiorno routine narrates morning briefing

Il sistema SHALL fornire una routine "Buongiorno" attivabile via comando vocale "Buongiorno" o "Ok casa, buongiorno" che genera un briefing mattutino narrato. La routine SHALL chiamare in parallelo:
1. `GET /api/v1/weather/voice?when=now`
2. `GET /api/v1/calendar/today`
3. `GET /api/v1/waste/today`

E SHALL comporre una risposta vocale con questa struttura:
```
Buongiorno!
<weather voiceText>
<eventi: 0 → "Non hai eventi in programma oggi"; 1 → "Oggi hai un evento alle <time>: <title>"; 2+ → "Oggi hai <count> eventi: <list>">
<waste tonight: "Stasera dovrai portare fuori <waste>" oppure niente se nessun rifiuto>
```

#### Scenario: Buongiorno with all data
- **GIVEN** è una mattina con meteo soleggiato 18°, 2 eventi (veterinario alle 10, riunione alle 14), e stasera tocca umido + plastica
- **WHEN** l'utente dice "ok casa, buongiorno"
- **THEN** la risposta SHALL essere "Buongiorno! A Besozzo ci sono 18 gradi, soleggiato. Massima 22, minima 14. Oggi hai 2 eventi: alle 10 veterinario, alle 14 riunione. Stasera dovrai portare fuori umido e plastica."

#### Scenario: Buongiorno empty day
- **GIVEN** è una domenica con 0 eventi e niente rifiuti
- **WHEN** l'utente dice "buongiorno"
- **THEN** la risposta SHALL essere "Buongiorno! A Besozzo ci sono 8 gradi, nuvoloso. Non hai eventi in programma oggi."

#### Scenario: Buongiorno API error fallback
- **WHEN** una delle 3 chiamate fallisce (es. weather API down)
- **THEN** la routine SHALL comporre la risposta con i dati disponibili
- **AND** SHALL omettere il pezzo mancante senza segnalare l'errore vocalmente
- **AND** SHALL loggare l'errore in console per debug

### Requirement: Buonanotte routine triggers night mode and previews tomorrow

Il sistema SHALL fornire una routine "Buonanotte" attivabile via comando vocale "Buonanotte" o "Ok casa, buonanotte" che:
1. Invoca immediatamente l'attivazione del night mode (anche se l'orario corrente è prima del `nightStartHour`)
2. Chiama in parallelo:
   - `GET /api/v1/calendar/tomorrow`
   - `GET /api/v1/waste/tomorrow`
3. Compone una risposta che riassume la giornata di domani

```
Buonanotte. Passo in modalità notte.
<eventi domani: 0 → "Domani non hai eventi"; 1+ → "Domani hai <count> eventi: <list>">
<waste tomorrow: "E dovrai portare fuori <waste>" oppure niente>
Sogni d'oro!
```

#### Scenario: Buonanotte triggers night mode immediately
- **GIVEN** sono le 21:30 e nightStartHour è 22:00
- **WHEN** l'utente dice "ok casa, buonanotte"
- **THEN** il sistema SHALL forzare l'attivazione del night mode immediato (manualOverride = true)
- **AND** SHALL leggere il riassunto domani

#### Scenario: Buonanotte with empty tomorrow
- **GIVEN** domani non ci sono eventi né rifiuti
- **WHEN** l'utente dice "buonanotte"
- **THEN** la risposta SHALL essere "Buonanotte. Passo in modalità notte. Domani non hai eventi in programma. Sogni d'oro!"

#### Scenario: Buonanotte cancels itself if pause requested
- **WHEN** l'utente dice "buonanotte" e poi "annulla" entro 3 secondi durante il TTS
- **THEN** il TTS SHALL fermarsi
- **AND** il night mode SHALL NOT essere applicato
- **AND** un breve "Annullato" SHALL essere detto come conferma
