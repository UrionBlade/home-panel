## ADDED Requirements

### Requirement: Postits are simple notes with title, body, color and position

Il sistema SHALL modellare i post-it come entità `postit` con i campi: `id`, `title` (testo, opzionale), `body` (testo multi-riga, opzionale), `color` (uno della palette accent della famiglia warm: ambra, terracotta, salvia, sabbia, malva, ocra), `posX` e `posY` (coordinate normalizzate 0-1 sulla canvas), `rotation` (gradi `-8` ... `+8`), `zIndex` (intero per il layering), `createdAt`, `updatedAt`. Almeno uno tra `title` e `body` SHALL essere presente al momento della creazione.

#### Scenario: Create postit with title and body
- **WHEN** un client invia `POST /api/v1/postits` con `{ "title": "Wi-Fi guest", "body": "casa-2026", "color": "amber" }`
- **THEN** il backend SHALL creare la riga con coordinate di default `posX = 0.5, posY = 0.5` (centro canvas)
- **AND** SHALL assegnare una rotazione random tra -8 e +8 gradi
- **AND** SHALL assegnare `zIndex = max(zIndex) + 1` per metterlo sopra gli altri
- **AND** SHALL restituire `201 Created`

#### Scenario: Create postit with only body
- **WHEN** un client invia un POST con `{ "body": "Comprare pane", "color": "terracotta" }` senza title
- **THEN** il backend SHALL accettare e creare il record con `title = null`
- **AND** la UI SHALL mostrare il post-it senza header titolo

#### Scenario: Reject postit without title and body
- **WHEN** un client invia un POST con title e body entrambi null/vuoti
- **THEN** il backend SHALL rispondere `400 Bad Request` con "Almeno uno tra title e body è obbligatorio"

#### Scenario: Reject invalid color
- **WHEN** un client invia un POST con `color: "rainbow"`
- **THEN** il backend SHALL rispondere `400 Bad Request` con "Colore non valido"
- **AND** SHALL elencare i 6 colori validi nel messaggio

### Requirement: Postit position updates are debounced and persisted

Il sistema SHALL supportare l'aggiornamento delle coordinate via `PATCH /api/v1/postits/:id` con `{ posX, posY }`. Il client SHALL essere libero di chiamare la mutation sia in modo immediato (al drag end) che debounced (durante il drag). Il backend SHALL semplicemente accettare e aggiornare; non SHALL gestire conflict resolution complesso (l'ultimo write vince — ottimista).

#### Scenario: Drag and persist position
- **WHEN** l'utente sull'iPad trascina un post-it dalla posizione (0.3, 0.4) a (0.7, 0.6)
- **AND** rilascia il drag
- **THEN** il client SHALL chiamare `PATCH /api/v1/postits/<id>` con `{ posX: 0.7, posY: 0.6 }`
- **AND** il backend SHALL aggiornare immediatamente le coordinate
- **AND** SHALL aggiornare `updatedAt`

#### Scenario: Coordinates are normalized 0-1
- **WHEN** un client invia coordinate fuori range (es. `posX: 1.5`)
- **THEN** il backend SHALL clamp i valori a `[0, 1]` invece di rifiutare

### Requirement: Bring-to-front updates zIndex on tap

Il sistema SHALL fornire un endpoint `POST /api/v1/postits/:id/bring-to-front` che imposta lo `zIndex` del post-it a `max(zIndex) + 1` di tutti gli altri post-it. Questo permette di portare un post-it "sopra" gli altri quando l'utente lo tocca.

#### Scenario: Bring postit to front
- **GIVEN** ci sono 5 post-it con zIndex 1-5
- **WHEN** un client invia `POST /api/v1/postits/<id-of-zindex-2>/bring-to-front`
- **THEN** il backend SHALL impostare il zIndex del target a 6
- **AND** gli altri post-it SHALL conservare il loro zIndex
- **AND** SHALL restituire `200 OK` con il record aggiornato

### Requirement: Board page is a fullscreen drag-and-drop canvas

La pagina `BoardPage` SHALL essere un canvas fullscreen (su iPad ~95% dello schermo, su iPhone scroll verticale con post-it stacked). Le caratteristiche SHALL includere:

- Sfondo sottile texture warm (es. linee tratteggiate molto leggere o pattern carta) per evocare un sughero/lavagna
- Tutti i post-it renderizzati come `<motion.div drag>` di Framer Motion, constrained al canvas tramite `dragConstraints={canvasRef}`
- Ogni post-it ha la sua rotation applicata via CSS `transform: rotate()`
- `whileHover` con leggera scale 1.02 e shadow ingrandita per feedback hover
- `whileDrag` con scale 1.05 + shadow più marcata per "alzato"
- Bottone FAB "+" in basso a destra per creare nuovo post-it
- Tap singolo su un post-it: bring-to-front + apre editor in-place (overlay)
- Long press: avvia drag immediato (skip click)
- Empty state elegante quando la bacheca è vuota: messaggio "La tua bacheca è vuota — tocca + per aggiungere"

#### Scenario: Drag postit on canvas
- **WHEN** l'utente trascina un post-it
- **THEN** il post-it SHALL seguire il cursore/dito con scale 1.05 + shadow ingrandita
- **AND** SHALL essere constrained al rettangolo del canvas
- **AND** al rilascio le nuove coordinate SHALL essere persistite via PATCH

#### Scenario: Tap opens editor
- **WHEN** l'utente fa tap singolo su un post-it
- **THEN** il post-it SHALL essere portato in front (zIndex aggiornato)
- **AND** un editor overlay SHALL aprirsi mostrando il post-it ingrandito al centro con form di modifica
- **AND** lo sfondo della bacheca SHALL essere leggermente blurred + dimmato per focalizzare l'attenzione

#### Scenario: FAB creates new postit
- **WHEN** l'utente tocca il FAB "+"
- **THEN** un nuovo post-it SHALL apparire al centro del canvas con animazione di entrata (scale + leggera rotazione)
- **AND** l'editor SHALL aprirsi automaticamente per popolare titolo/corpo
- **AND** il colore di default SHALL essere il primo della palette (`amber`)

#### Scenario: Empty state
- **WHEN** non ci sono post-it
- **THEN** il canvas SHALL mostrare un messaggio elegante centrato "La tua bacheca è vuota"
- **AND** SHALL avere un'illustrazione minimale di un post-it stilizzato
- **AND** il FAB "+" SHALL essere comunque visibile

### Requirement: Postit editor allows in-place editing

L'editor SHALL essere un overlay (non una pagina separata) che mostra:
- Il post-it ingrandito (~70% width su iPad, full width su iPhone) al centro
- Input grande in Fraunces per il titolo (placeholder "Titolo (opzionale)")
- Textarea per il corpo (placeholder "Aggiungi un appunto…")
- Color picker con i 6 colori della palette come pallini cliccabili
- Bottone "Elimina" in alto a sinistra (con conferma)
- Bottone "Fatto" in alto a destra (salva e chiude)
- Tap fuori dall'editor SHALL salvare e chiudere
- Esc su keyboard SHALL salvare e chiudere

#### Scenario: Edit and save
- **GIVEN** l'editor è aperto su un post-it esistente
- **WHEN** l'utente modifica il titolo da "Wi-Fi" a "Wi-Fi guest"
- **AND** preme "Fatto"
- **THEN** il client SHALL chiamare `PATCH /:id` con `{ title: "Wi-Fi guest" }`
- **AND** l'overlay SHALL chiudersi
- **AND** il post-it sulla canvas SHALL mostrare il nuovo titolo

#### Scenario: Delete with confirm
- **WHEN** l'utente preme "Elimina"
- **THEN** un modal di conferma SHALL chiedere "Eliminare questo post-it?"
- **AND** alla conferma, `DELETE /:id` SHALL essere chiamato
- **AND** il post-it SHALL animare la sua scomparsa (scale 0 + fade) con `EASE_OUT_QUART` e durata 320ms

#### Scenario: Color picker changes color
- **WHEN** l'utente seleziona un nuovo colore dal picker
- **THEN** il post-it ingrandito SHALL aggiornare il proprio sfondo immediatamente (ottimistic)
- **AND** alla chiusura SHALL persistere via PATCH

### Requirement: Home tile shows count and preview

L'home page SHALL contenere una `BoardTile` di dimensione media che mostra:
- Header "Bacheca" con icona Phosphor `note` duotone
- Conteggio totale dei post-it
- Preview dei 3 post-it più recenti come mini-card stack (uno sopra l'altro con leggero offset e rotazione)
- Tap → naviga `/board`

#### Scenario: Tile shows recent stack
- **GIVEN** ci sono 7 post-it
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare "7 post-it"
- **AND** SHALL mostrare i 3 più recenti come stack visivo con leggera rotazione casuale

#### Scenario: Empty tile
- **GIVEN** non ci sono post-it
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare "Bacheca vuota" con illustrazione minimale
- **AND** opacità leggermente ridotta

### Requirement: API supports voice creation by natural language

Il backend SHALL esporre `POST /api/v1/postits/by-natural-language` con `{ "text": "<dettato dall'utente>" }`. Il backend SHALL:
1. Estrarre un titolo intelligente dalle prime ~5 parole significative del testo
2. Mettere il resto del testo nel `body`
3. Assegnare un colore casuale dalla palette
4. Restituire il post-it creato

#### Scenario: Voice creation extracts smart title
- **WHEN** un client invia `POST /by-natural-language` con `{ "text": "ricordami di comprare il regalo di compleanno per mamma" }`
- **THEN** il backend SHALL creare un post-it con `title = "Comprare il regalo"` (o simile estratto smart)
- **AND** `body = "ricordami di comprare il regalo di compleanno per mamma"`
- **AND** SHALL restituire `201 Created`

#### Scenario: Short text becomes only title
- **WHEN** un client invia `{ "text": "wi-fi casa123" }`
- **THEN** il backend SHALL creare il post-it con `title = "wi-fi casa123"` e `body = null`
