## ADDED Requirements

### Requirement: Cameras page shows grid of camera tiles

La pagina `CamerasPage` SHALL mostrare:
- Header con titolo "Telecamere" + bottone "Aggiorna"
- Grid responsive di `CameraTile` (uno per camera): snapshot grande, nome camera, indicatore online/offline, count motion eventi ultimi 7gg, bottoni "Live", "Clip"
- Tap su "Live" → apre modal/overlay con `LiveViewPlayer`
- Tap su "Clip" → naviga a `ClipsBrowser` filtrato per camera
- Empty state elegante se nessuna camera configurata: "Aggiungi le tue credenziali Blink in Settings → Telecamere"

#### Scenario: Show cameras grid
- **GIVEN** l'utente ha 1 camera + 1 doorbell sincronizzati
- **WHEN** apre la pagina Telecamere
- **THEN** SHALL vedere 2 tile, una per camera
- **AND** ogni tile SHALL mostrare snapshot recente, nome, stato online

#### Scenario: Empty state
- **GIVEN** nessuna camera configurata
- **WHEN** apre la pagina
- **THEN** SHALL vedere il messaggio "Aggiungi le tue credenziali Blink"
- **AND** SHALL avere bottone "Vai a Settings"

### Requirement: Live view player uses HLS.js

Il `LiveViewPlayer` SHALL usare la libreria `hls.js` per riprodurre lo stream m3u8 fornito dal backend. SHALL gestire:
- Autoplay quando si apre
- Indicatore "LIVE" rosso lampeggiante
- Bottone fullscreen
- Bottone close
- Riconnessione automatica quando lo stream Blink scade (~30s) — bottone "Continua"

#### Scenario: Player auto-plays stream
- **WHEN** l'utente apre il LiveViewPlayer per una camera
- **THEN** il player SHALL chiamare `/api/v1/blink/cameras/<id>/live`
- **AND** SHALL inizializzare HLS.js con l'URL ricevuto
- **AND** SHALL iniziare la riproduzione automaticamente

#### Scenario: Stream expires
- **WHEN** lo stream raggiunge i 30 secondi
- **THEN** Blink termina lo stream e il player riceve evento `ended`
- **AND** la UI SHALL mostrare un overlay "Stream terminato" + bottone "Continua a guardare"
- **WHEN** l'utente preme "Continua"
- **THEN** un nuovo stream SHALL essere richiesto

### Requirement: Clips browser shows motion clips by date

Il `ClipsBrowser` SHALL mostrare:
- Lista cronologica dei `blink_motion_clips` raggruppati per data (oggi, ieri, 2 giorni fa, ecc.)
- Per ogni clip: thumbnail, nome camera, ora, durata
- Tap su clip → apre `ClipPlayer` con video full
- Filtri: per camera, per range di date
- Pulsante "Elimina" per cancellare manualmente
- Sezione info: "Retention: 30 giorni — clip più vecchi vengono cancellati automaticamente"

#### Scenario: List clips grouped by day
- **GIVEN** ci sono 15 clip degli ultimi 7 giorni
- **WHEN** l'utente apre il ClipsBrowser
- **THEN** SHALL vedere i clip raggruppati con header data ("Oggi", "Ieri", "Lunedì 5 aprile", ecc.)
- **AND** ogni gruppo SHALL essere ordinato per ora decrescente

#### Scenario: Play clip
- **WHEN** l'utente tap su un clip
- **THEN** un `ClipPlayer` SHALL aprirsi
- **AND** SHALL caricare il video da `/api/v1/blink/clips/<id>` (servito dal backend dal volume locale)
- **AND** SHALL riprodurre con controlli standard (play/pause/seek/fullscreen)

#### Scenario: Manual delete
- **WHEN** l'utente preme "Elimina" su un clip
- **THEN** un modal di conferma SHALL chiedere "Eliminare questo clip?"
- **AND** alla conferma il backend SHALL rimuovere il file + record DB

### Requirement: Home tile shows last motion preview

La home page SHALL contenere una `CamerasTile` di dimensione media che mostra:
- Header "Telecamere" con icona Phosphor `videocamera`
- Snapshot della prima camera (default: doorbell) come sfondo
- Overlay con: count totale cameras, "Ultima attività" timestamp del clip più recente
- Tap → naviga a `/cameras`

Se nessuna camera è configurata, la tile mostra un'illustrazione minimale con call-to-action verso le Settings.

#### Scenario: Tile with snapshot
- **GIVEN** ci sono camere e clip recenti
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare lo snapshot più recente come sfondo
- **AND** SHALL mostrare "2 camere" + "Ultima attività: 5 minuti fa"

#### Scenario: Tile empty state
- **WHEN** nessuna camera è configurata
- **THEN** la tile SHALL mostrare un'illustrazione minimale + "Configura le telecamere"

### Requirement: Settings page allows credential setup and configuration

La sezione Settings → Telecamere SHALL fornire:
- Form login Blink (email + password) con bottone "Salva e accedi"
- Stato login: "Connesso come x@y.com" con bottone "Disconnetti"
- Lista cameras sincronizzate con stato online + nome editabile
- Slider retention clip (7-90 giorni, default 30)
- Toggle "Notifiche videocitofono" (default on)
- Bottone "Sincronizza ora" per refresh manuale
- Sezione info: link alla documentazione "Come funziona Blink integration (best effort, non ufficiale)"

#### Scenario: Login success
- **WHEN** l'utente inserisce email + password validi
- **AND** preme "Salva e accedi"
- **THEN** il backend SHALL fare login e sincronizzare le camere
- **AND** la UI SHALL mostrare "Connesso, X camere trovate"

#### Scenario: Login failure
- **WHEN** le credenziali sono errate
- **THEN** il backend SHALL rispondere `401`
- **AND** la UI SHALL mostrare "Credenziali errate" senza salvare nulla

#### Scenario: Logout
- **WHEN** l'utente preme "Disconnetti"
- **THEN** il backend SHALL cancellare le credenziali criptate
- **AND** SHALL fermare i job di polling
- **AND** la UI SHALL tornare al form di login
