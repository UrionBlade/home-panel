## ADDED Requirements

### Requirement: Family member entity supports both humans and pets

Il sistema SHALL modellare persone e animali come istanze della stessa entità `family_member`, distinte dal campo discriminante `kind` che assume valori `human` o `pet`. Gli attributi comuni (id, displayName, avatarUrl, accentColor, createdAt, updatedAt) sono condivisi; gli attributi specie-specifici (role per gli umani, species/breed/weight per gli animali) sono opzionali e validati in funzione di `kind`.

#### Scenario: Create a human family member
- **WHEN** un client invia `POST /api/v1/family` con body `{ "kind": "human", "displayName": "Matteo", "role": "papà", "accentColor": "#c2410c" }`
- **THEN** il backend SHALL persistere la riga con `kind = human`, restituire `201 Created` con il record completo (incluso `id` UUID, `createdAt`, `updatedAt`)
- **AND** il record SHALL essere disponibile via `GET /api/v1/family`

#### Scenario: Create a pet family member with veterinary notes
- **WHEN** un client invia `POST /api/v1/family` con body `{ "kind": "pet", "displayName": "Cody", "species": "dog", "breed": "Border Collie", "veterinaryNotes": "Allergico al pollo" }`
- **THEN** il backend SHALL persistere la riga con `kind = pet`, popolare i campi pet-specifici, restituire `201 Created`
- **AND** il campo `role` SHALL essere `null` (non si applica agli animali)

#### Scenario: Reject member without displayName
- **WHEN** un client invia `POST /api/v1/family` con `displayName` mancante o stringa vuota
- **THEN** il backend SHALL rispondere `400 Bad Request` con un messaggio di errore esplicito che indichi `displayName` come campo obbligatorio

### Requirement: Family members support full CRUD operations

Il sistema SHALL esporre operazioni di lettura, creazione, modifica e cancellazione per i family member tramite API REST sotto `/api/v1/family`, e SHALL fornire una UI dedicata in `Settings → Famiglia` per eseguirle senza scrivere codice.

#### Scenario: List all family members ordered by creation
- **WHEN** un client invia `GET /api/v1/family`
- **THEN** il backend SHALL restituire `200 OK` con un array JSON di tutti i family member ordinati per `createdAt` ascendente

#### Scenario: Update a family member display name
- **WHEN** un client invia `PATCH /api/v1/family/:id` con body `{ "displayName": "Matteo P." }`
- **THEN** il backend SHALL aggiornare solo i campi forniti, aggiornare `updatedAt`, e restituire `200 OK` con il record completo aggiornato

#### Scenario: Delete a family member
- **WHEN** un client invia `DELETE /api/v1/family/:id` per un id esistente
- **THEN** il backend SHALL rimuovere il record e restituire `204 No Content`
- **AND** una successiva `GET /api/v1/family/:id` SHALL restituire `404 Not Found`

#### Scenario: Manage family members from frontend Settings
- **WHEN** l'utente apre `Settings → Famiglia` nel frontend mobile
- **THEN** la UI SHALL mostrare la lista corrente dei family member con avatar, nome, kind, ruolo o specie
- **AND** SHALL fornire azioni "Aggiungi", "Modifica", "Elimina" che invocano gli endpoint REST sopra
- **AND** ogni mutazione SHALL invalidare la cache TanStack Query relativa così che la lista si aggiorni senza ricaricare la pagina

### Requirement: Family members are referenceable by other entities

Il sistema SHALL fornire tipi TypeScript condivisi (`FamilyMember`, `Person`, `Pet`, `CreateFamilyMemberInput`) nel pacchetto `@home-panel/shared` in modo che le change future (eventi, spese, comandi vocali, post-it) possano referenziare uno o più family member tramite il loro `id` con piena type safety end-to-end.

#### Scenario: Shared types are exported
- **WHEN** un consumer importa `import type { FamilyMember } from '@home-panel/shared'`
- **THEN** il tipo SHALL essere disponibile e SHALL contenere il campo discriminato `kind: 'human' | 'pet'` con narrowing corretto (`Person` per `kind === 'human'`, `Pet` per `kind === 'pet'`)
