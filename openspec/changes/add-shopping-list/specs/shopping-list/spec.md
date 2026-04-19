## ADDED Requirements

### Requirement: Single shared shopping list with rich items

Il sistema SHALL gestire **una sola lista della spesa** condivisa da tutta la famiglia (nessun multi-lista). Ogni voce della lista (`ShoppingItem`) SHALL contenere: `id`, `name` (testo libero), `quantity` (testo: "1", "500", "1.5"), `unit` (uno dei preset documentati in `Requirement: Units catalog`), `category` (uno dei preset in `Requirement: Categories catalog`), `completed` (boolean), `addedAt` (timestamp ISO), `addedBy` (nullable, riferimento a `family_member.id` se l'item è stato aggiunto via UI da un member o via voice riconosciuto), `auditLog` (array di entry).

#### Scenario: Add a basic item
- **WHEN** un client invia `POST /api/v1/shopping/items` con `{ "name": "Latte", "quantity": "1", "unit": "l", "category": "dairy" }`
- **THEN** il backend SHALL creare la riga con `completed = false`, `addedAt = now`, `auditLog = [{ "action": "added", "at": now, "by": null }]`
- **AND** SHALL restituire `201 Created` con il record completo

#### Scenario: Add an item attributed to a family member
- **WHEN** un client invia `POST /api/v1/shopping/items` con `{ "name": "Pane", "quantity": "1", "unit": "pz", "category": "bakery", "addedBy": "<member-id>" }`
- **THEN** il backend SHALL persistere `addedBy = <member-id>`
- **AND** la entry di audit log SHALL avere `by = <member-id>`

#### Scenario: Reject item with empty name
- **WHEN** un client invia `POST /api/v1/shopping/items` con `name` mancante o stringa vuota
- **THEN** il backend SHALL rispondere `400 Bad Request` con messaggio "name è obbligatorio"

### Requirement: Items can be toggled, updated and deleted

Il sistema SHALL supportare le operazioni di marcatura come completato/non completato (toggle), aggiornamento dei campi mutabili (`name`, `quantity`, `unit`, `category`), e cancellazione hard delete. Ogni mutazione SHALL essere registrata nell'`auditLog` come entry separata con `action`, `at`, `by`.

#### Scenario: Toggle item to completed
- **WHEN** un client invia `PATCH /api/v1/shopping/items/:id` con `{ "completed": true }`
- **THEN** il backend SHALL aggiornare il campo `completed = true`
- **AND** SHALL appendere all'`auditLog` una entry `{ "action": "completed", "at": now, "by": null }`
- **AND** SHALL restituire `200 OK` con il record aggiornato

#### Scenario: Update quantity and unit
- **WHEN** un client invia `PATCH /api/v1/shopping/items/:id` con `{ "quantity": "2", "unit": "l" }`
- **THEN** il backend SHALL aggiornare entrambi i campi
- **AND** l'audit log SHALL avere una entry `{ "action": "updated", "at": now, "by": null, "diff": { "quantity": ["1", "2"], "unit": ["l", "l"] } }`

#### Scenario: Delete item
- **WHEN** un client invia `DELETE /api/v1/shopping/items/:id`
- **THEN** il backend SHALL rimuovere il record dal database (hard delete)
- **AND** SHALL restituire `204 No Content`

### Requirement: List endpoint returns items grouped and ordered

Il sistema SHALL esporre `GET /api/v1/shopping/items` che restituisce **tutti** gli item (attivi e completati) come singolo array. Il client SHALL essere responsabile del raggruppamento per categoria e dell'ordinamento. Il backend SHALL ordinare per `completed ASC, addedAt DESC` come default per essere amichevole al client.

#### Scenario: List returns all items ordered
- **WHEN** un client invia `GET /api/v1/shopping/items`
- **THEN** il backend SHALL rispondere `200 OK` con array JSON di tutti gli item
- **AND** gli item SHALL essere ordinati con i `completed = false` prima, e all'interno per `addedAt` decrescente (ultimi aggiunti per primi)

#### Scenario: Empty list
- **WHEN** un client invia `GET /api/v1/shopping/items` quando non ci sono item
- **THEN** il backend SHALL rispondere `200 OK` con `[]`

### Requirement: Categories catalog is fixed and i18n-friendly

Il sistema SHALL definire un catalogo fisso di categorie ispirato al vecchio home-panel: `fruits`, `meat`, `dairy`, `bakery`, `pantry`, `frozen`, `beverages`, `other`. Ogni categoria SHALL avere un id stabile (kebab-case), un'icona Phosphor associata, e una traduzione italiana tramite `i18n` namespace `shopping`. SHALL essere esposto da `GET /api/v1/shopping/categories` per permettere al client di non duplicare la lista.

#### Scenario: List categories
- **WHEN** un client invia `GET /api/v1/shopping/categories`
- **THEN** il backend SHALL rispondere con array di `{ id, defaultIcon }` per tutte e 8 le categorie
- **AND** il client SHALL risolvere le label italiane via `t('category.fruits', { ns: 'shopping' })`

### Requirement: Units catalog is fixed and i18n-friendly

Il sistema SHALL definire un catalogo fisso di unità di misura ispirato al vecchio home-panel: `pz` (pezzi), `kg`, `g`, `l`, `ml`, `confezione`, `bottiglia`, `lattina`, `barattolo`, `scatola`, `busta`, `other`. Esposto da `GET /api/v1/shopping/units`.

#### Scenario: List units
- **WHEN** un client invia `GET /api/v1/shopping/units`
- **THEN** il backend SHALL rispondere con array degli id unità documentati
- **AND** il client SHALL risolvere le label italiane via `t('unit.<id>', { ns: 'shopping' })`

### Requirement: Product catalog provides typed-ahead suggestions

Il sistema SHALL mantenere una tabella `product_catalog` con prodotti tipici della spesa italiana (latte, pane, pasta, mele, ecc.), ognuno con `id`, `name`, `category` (default), `defaultUnit`. Il catalogo SHALL essere pre-popolato da seed con almeno 80 prodotti comuni. SHALL essere esposto da `GET /api/v1/shopping/products?q=<query>` come ricerca prefix-match case-insensitive che restituisce i top 8 risultati.

#### Scenario: Search returns prefix matches
- **WHEN** un client invia `GET /api/v1/shopping/products?q=lat`
- **THEN** il backend SHALL rispondere con array di prodotti il cui `name` inizia con "lat" (case-insensitive), max 8 risultati, ordinati alfabeticamente
- **AND** il primo risultato SHALL essere "Latte" se presente nel seed

#### Scenario: Empty query returns popular suggestions
- **WHEN** un client invia `GET /api/v1/shopping/products?q=`
- **THEN** il backend SHALL rispondere con i top 8 prodotti del catalogo (ordinati per uso frequente o alfabeticamente)

#### Scenario: Selecting a product pre-fills form
- **WHEN** l'utente nella UI seleziona "Latte" dall'autocomplete
- **THEN** il form SHALL pre-popolare `name = "Latte"`, `category = "dairy"`, `unit = "l"` automaticamente
- **AND** il focus SHALL spostarsi sul campo `quantity`

### Requirement: Mobile UI groups active items by category and supports swipe-to-delete

La pagina `ShoppingPage` SHALL mostrare:
- Form di aggiunta in alto (autocomplete prodotto + quantità + unità + categoria + bottone "Aggiungi")
- Sezione "Da comprare" con tutti gli item `completed = false` raggruppati per categoria, ogni gruppo ordinato per `addedAt` decrescente
- Sezione "Completati" collassabile (collassata di default) con tutti gli item `completed = true`
- Su iOS lo swipe-left su un item SHALL rivelare il bottone "Elimina"; lo swipe-right SHALL toggle il completamento
- Animazioni di entrata/uscita per gli item (fade + leggero slide), durata `DURATION_DEFAULT`
- Empty state elegante quando la lista è vuota: illustrazione minimale + suggerimento "Aggiungi il primo prodotto"

#### Scenario: Active items are grouped by category
- **WHEN** la lista contiene 3 item nella categoria `dairy`, 2 in `bakery`, 1 in `frozen`
- **THEN** la sezione "Da comprare" SHALL mostrare 3 sotto-gruppi con i nomi delle categorie come header (icona + label italiana)
- **AND** ogni gruppo SHALL contenere solo gli item della propria categoria

#### Scenario: Swipe right to toggle complete
- **WHEN** l'utente fa swipe-right su un item
- **THEN** il client SHALL invocare la mutation `toggleItem(id)` con ottimistic update
- **AND** l'item SHALL animare il passaggio da "Da comprare" a "Completati"

#### Scenario: Empty state
- **WHEN** la lista è vuota
- **THEN** la pagina SHALL mostrare l'empty state illustrato invece di una lista vuota
- **AND** SHALL invitare con testo "Aggiungi il primo prodotto"

### Requirement: Home tile shows active count and first items

L'home page SHALL contenere una tile "Spesa" di dimensione media che mostra:
- Icona Phosphor `shopping-cart` duotone in alto a sinistra
- Conteggio degli item attivi in display tipografico grande (Fraunces, font-size scaled)
- Lista dei primi 3-5 nomi di item attivi (ellipsi se troppo lunghi)
- Tap sulla tile SHALL navigare alla pagina Spesa

#### Scenario: Tile shows count and preview
- **WHEN** la lista contiene 7 item attivi
- **THEN** la tile SHALL mostrare "7" come conteggio principale
- **AND** SHALL mostrare i primi 3-5 nomi sotto il conteggio
- **AND** un tap SHALL navigare a `/shopping`

#### Scenario: Tile shows zero state
- **WHEN** la lista è vuota
- **THEN** la tile SHALL mostrare "0" e il testo "Tutto sotto controllo"
- **AND** la tile SHALL avere un'opacità leggermente ridotta per indicare "stato calmo"

### Requirement: API operations are voice-control ready

Tutte le mutation della lista spesa (`addItem`, `toggleByName`, `removeByName`) SHALL avere wrapper sul backend che accettano `name` come stringa e risolvono internamente l'item via match case-insensitive con fallback fuzzy. Questo permette alla change `add-voice-control` futura di chiamare `addItem({ name: "latte" })` direttamente senza dover prima cercare l'id.

#### Scenario: Add by name from voice
- **WHEN** un client invia `POST /api/v1/shopping/items/by-name` con `{ "name": "latte" }`
- **AND** il prodotto "Latte" è nel catalogo
- **THEN** il backend SHALL creare l'item con i default del catalogo (`category = dairy`, `unit = l`, `quantity = "1"`)
- **AND** SHALL marcarlo con `addedBy = null` (o l'id del member identificato dal voice se passato)
- **AND** SHALL restituire `201 Created`

#### Scenario: Toggle complete by name
- **WHEN** un client invia `POST /api/v1/shopping/items/complete-by-name` con `{ "name": "latte" }`
- **THEN** il backend SHALL trovare l'item attivo con name che matcha "latte" (case-insensitive)
- **AND** SHALL marcarlo come completato
- **AND** SHALL restituire `200 OK` con il record
- **AND** se nessun match esiste SHALL restituire `404 Not Found` con messaggio "Nessun 'latte' nella lista"

#### Scenario: Remove by name
- **WHEN** un client invia `DELETE /api/v1/shopping/items/by-name?name=latte`
- **THEN** il backend SHALL rimuovere l'item attivo con quel name
- **AND** SHALL restituire `204 No Content` o `404 Not Found` se non trovato
