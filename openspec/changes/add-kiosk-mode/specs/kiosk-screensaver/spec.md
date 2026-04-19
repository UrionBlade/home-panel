## ADDED Requirements

### Requirement: Screensaver activates after idle and shows family photos

Il sistema SHALL fornire uno screensaver fullscreen che si attiva automaticamente dopo N minuti senza interazione touch (default 5 minuti, configurabile). Lo screensaver SHALL mostrare uno slideshow di foto caricate dall'utente nella cartella Synology `/volume1/photo/HomePanel`, montata nel container backend come `/data/photos:ro`. Le foto SHALL alternarsi con un cross-fade lento (8 secondi di permanenza + 2 secondi di transizione). Tap sullo schermo SHALL dismettere lo screensaver e tornare all'AppShell.

#### Scenario: Screensaver activates after 5 min idle
- **GIVEN** l'utente non tocca lo schermo da 5 minuti
- **WHEN** il timer di idle scade
- **THEN** il `ScreensaverOverlay` SHALL apparire fullscreen sopra l'AppShell
- **AND** SHALL iniziare a mostrare le foto in slideshow

#### Scenario: Tap dismisses screensaver
- **WHEN** lo screensaver è attivo
- **AND** l'utente tocca lo schermo
- **THEN** lo screensaver SHALL dissolvere con fade out di 400ms
- **AND** l'AppShell SHALL tornare visibile alla tab che era attiva

#### Scenario: No photos available
- **WHEN** lo screensaver si attiva ma la cartella `/data/photos` è vuota
- **THEN** lo screensaver SHALL mostrare un fallback elegante: orologio grande + data + sfondo dim
- **AND** SHALL NON crashare

### Requirement: Backend serves photos from mounted volume

Il backend SHALL esporre due endpoint:
- `GET /api/v1/kiosk/photos` — restituisce array di nomi file presenti in `/data/photos` (filtrati per estensioni `.jpg .jpeg .png .heic`)
- `GET /api/v1/kiosk/photos/:filename` — serve il file binario con header `Content-Type` corretto e `Cache-Control: public, max-age=3600`

L'endpoint photo list SHALL essere ordinato alfabeticamente per default. Il client SHALL essere libero di shuffle al rendering.

#### Scenario: List returns photo filenames
- **WHEN** la cartella contiene `01.jpg`, `02.jpg`, `pranzo.heic`
- **AND** un client invia `GET /api/v1/kiosk/photos`
- **THEN** la response SHALL essere `["01.jpg", "02.jpg", "pranzo.heic"]`

#### Scenario: Serve photo with cache header
- **WHEN** un client invia `GET /api/v1/kiosk/photos/01.jpg`
- **THEN** il backend SHALL leggere `/data/photos/01.jpg` e ritornare il binario
- **AND** il content-type SHALL essere `image/jpeg`
- **AND** SHALL includere `Cache-Control: public, max-age=3600`

#### Scenario: Reject path traversal
- **WHEN** un client invia `GET /api/v1/kiosk/photos/..%2Fetc%2Fpasswd`
- **THEN** il backend SHALL rifiutare con `400 Bad Request` senza accedere al filesystem
- **AND** SHALL loggare il tentativo

### Requirement: Photo slideshow has subtle motion design

Lo slideshow SHALL mostrare ogni foto con:
- Scala iniziale 1.0 → animazione lenta a 1.05 in 10 secondi (effetto "Ken Burns" leggero)
- Cross-fade tra una foto e la successiva di 2 secondi
- Sfondo nero warm `oklch(8% 0.005 60)` per le aree non coperte se l'aspect ratio non matcha
- Orologio compatto in basso a destra `oklch(60% 0.005 80 / 0.6)` (very subtle)
- Niente UI visibile oltre l'orologio

#### Scenario: Ken Burns effect
- **WHEN** una foto entra nello slideshow
- **THEN** SHALL avere `transform: scale(1)` iniziale
- **AND** SHALL animare a `scale(1.05)` con duration 10s, easing linear
- **AND** la animazione SHALL essere disabilitata se `prefers-reduced-motion`

#### Scenario: Crossfade between photos
- **WHEN** una foto sta finendo (8 secondi)
- **THEN** la successiva SHALL iniziare a fadare in con opacity 0→1 in 2 secondi
- **AND** quella corrente SHALL fadare out in opacity 1→0 in parallelo

### Requirement: Idle detection respects all interaction types

Il sistema SHALL considerare "idle" lo stato in cui non si verificano:
- Eventi touch (touchstart, touchmove)
- Eventi mouse (mousemove, mousedown, click)
- Eventi keyboard
- Voice events del wake word (qualsiasi attivazione del microfono)

Il timer di idle SHALL essere reset su qualsiasi di questi. Quando il timer scade, lo screensaver attiva. La detection SHALL essere implementata come hook React `useIdleDetection(timeoutMs)`.

#### Scenario: Touch resets idle timer
- **GIVEN** il timer è a 4 minuti su 5
- **WHEN** l'utente tocca lo schermo
- **THEN** il timer SHALL essere reset a 0
- **AND** lo screensaver NON SHALL attivarsi prima di altri 5 minuti

#### Scenario: Voice activation resets idle
- **WHEN** il wake word "Ok casa" viene rilevato (anche senza touch)
- **THEN** il timer di idle SHALL essere reset
- **AND** se lo screensaver è attivo SHALL essere dismesso
