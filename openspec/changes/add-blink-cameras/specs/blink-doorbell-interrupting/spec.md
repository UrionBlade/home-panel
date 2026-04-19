## ADDED Requirements

### Requirement: Doorbell press is detected with low latency

Il sistema SHALL pollare il videocitofono Blink ogni **10 secondi** (più frequente del polling motion clip) per detectare un bell press. Quando rilevato:
1. Il backend emette un evento `blink:doorbell-pressed` via Server-Sent Events (SSE) verso tutti i client connessi
2. Avvia immediatamente il fetch del live stream del videocitofono per averlo pronto
3. Persiste l'evento in `blink_motion_clips` con `eventType: 'doorbell'`

#### Scenario: Doorbell press detected
- **GIVEN** il polling è attivo
- **WHEN** Blink riporta un bell press appena avvenuto
- **THEN** il backend SHALL emettere un evento SSE su `/api/v1/sse` con payload `{ type: 'doorbell-pressed', cameraId: '<id>', at: <ts> }`
- **AND** SHALL avviare in background il fetch del live stream
- **AND** SHALL persistere l'evento

#### Scenario: Multiple devices receive event
- **GIVEN** sia iPad che iPhone sono connessi al backend via SSE
- **WHEN** il videocitofono suona
- **THEN** entrambi i client SHALL ricevere l'evento simultaneamente
- **AND** entrambi SHALL aprire il `DoorbellOverlay`

### Requirement: Doorbell overlay takes over the entire UI

Quando l'evento `blink:doorbell-pressed` arriva al frontend, il `DoorbellOverlay` SHALL essere montato sopra tutto (z-index massimo, anche sopra screensaver e voice listening overlay). Caratteristiche:

- **Backdrop**: scuro dim `oklch(8% 0.012 60 / 0.95)`
- **Live view**: video player HLS al centro che mostra lo stream del videocitofono in tempo reale
- **Bottone "Vedi"**: già attivo per default (avvia live view se non già partita)
- **Bottone "Parla"**: attiva audio bidirezionale (push-to-talk hold gesture)
- **Bottone "Ignora"**: chiude l'overlay
- **Suono campanello**: audio distintivo (campanello di casa) che parte appena arriva l'evento, smetto al primo tap o dopo 15 secondi
- **Auto-dismiss**: dopo 60 secondi senza interazione si chiude automaticamente

L'overlay SHALL respect priorità: se l'utente sta usando voice control quando suona il videocitofono, il voice viene messo in pausa e l'overlay prende il sopravvento.

#### Scenario: Overlay opens with live view
- **WHEN** l'evento doorbell arriva
- **THEN** il `DoorbellOverlay` SHALL apparire fullscreen
- **AND** il live stream SHALL iniziare a riprodurre entro 2 secondi
- **AND** il suono campanello SHALL iniziare a suonare

#### Scenario: Push-to-talk activates two-way audio
- **WHEN** l'utente preme e tiene premuto il bottone "Parla"
- **THEN** il client SHALL richiedere il microfono (se non già concesso) e iniziare lo streaming audio bidirezionale via la libreria Blink
- **AND** SHALL mostrare l'icona microfono attiva
- **WHEN** l'utente rilascia il bottone
- **THEN** lo streaming SHALL fermarsi
- **AND** l'icona SHALL tornare normale

#### Scenario: Ignore dismisses
- **WHEN** l'utente preme "Ignora"
- **THEN** l'overlay SHALL chiudersi con animazione fade out
- **AND** il suono campanello SHALL fermarsi
- **AND** lo stream SHALL terminare

#### Scenario: Auto-dismiss after timeout
- **WHEN** nessuna interazione avviene per 60 secondi
- **THEN** l'overlay SHALL chiudersi automaticamente
- **AND** SHALL persistere comunque l'evento doorbell come "missed"

#### Scenario: Voice is paused during overlay
- **GIVEN** il loop voice control è attivo
- **WHEN** il videocitofono suona
- **THEN** il loop voice SHALL essere messo in pausa
- **AND** dopo che l'overlay si chiude, il loop voice SHALL essere ripreso automaticamente

### Requirement: SSE endpoint streams realtime events

Il backend SHALL esporre `GET /api/v1/sse` che è un endpoint Server-Sent Events. Tutti i client connessi (tipicamente iPad + iPhone in tailnet) ricevono eventi push:

- `blink:doorbell-pressed` (evento prioritario, alta latenza max ~10s)
- `blink:motion-detected` (secondario, latenza max ~5min)
- `voice:status-changed` (cambi di stato del voice loop, opzionale)
- Heartbeat ogni 30 secondi per mantenere viva la connessione

Il client SHALL gestire la riconnessione automatica con backoff esponenziale se la connessione cade.

#### Scenario: Client connects to SSE
- **WHEN** il frontend si avvia
- **THEN** SHALL aprire una connessione `EventSource('/api/v1/sse')`
- **AND** SHALL gestire gli eventi tipizzati
- **AND** in caso di disconnect SHALL ritentare con backoff (1s, 2s, 4s, 8s, max 30s)

#### Scenario: Heartbeat keeps connection alive
- **WHEN** la connessione SSE è aperta
- **THEN** il backend SHALL inviare un commento `: heartbeat` ogni 30 secondi
- **AND** il client SHALL non chiudere la connessione per timeout

### Requirement: Doorbell sound is distinctive and respects volume

Il suono campanello SHALL essere un asset audio bundlato nell'app (file MP3/AAC ~2 secondi, "ding-dong" classico). Il client SHALL riprodurlo via Web Audio API quando arriva l'evento doorbell. Volume SHALL essere al massimo (l'utente deve sentirlo da un'altra stanza). SHALL respect comunque il "Silent Mode" iOS se attivo.

#### Scenario: Doorbell sound plays
- **WHEN** l'overlay si apre
- **THEN** il client SHALL riprodurre `/assets/doorbell.mp3` al volume max
- **AND** il suono SHALL ripetersi in loop ogni 3 secondi finché l'overlay è aperto
- **AND** SHALL fermarsi al primo tap o dopo 15 secondi

#### Scenario: Silent mode mutes ringtone
- **WHEN** l'iPad è in modalità silenzioso (Ring/Silent switch)
- **THEN** il suono campanello SHALL non riprodursi
- **AND** l'overlay SHALL comunque apparire con vibrazione tactile (se supportato)
