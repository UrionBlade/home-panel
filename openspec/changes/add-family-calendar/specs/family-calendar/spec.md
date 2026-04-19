## ADDED Requirements

### Requirement: Events are first-class entities with multi-attendee support

Il sistema SHALL modellare gli eventi del calendario come entità `event` con i campi: `id` (UUID), `title` (obbligatorio), `description` (opzionale), `startsAt` (timestamp ISO), `endsAt` (timestamp ISO), `allDay` (boolean), `location` (testo opzionale), `categoryId` (FK a `event_categories`, opzionale), `recurrenceRule` (oggetto JSON con il modello descritto in `Requirement: Recurrence rules support common patterns`, opzionale), `reminderMinutes` (intero, minuti prima dell'inizio: 0/15/60/1440 oppure null per nessun reminder), `createdAt`, `updatedAt`.

Ogni evento SHALL poter essere associato a **uno o più** family member tramite la tabella di join `event_attendees(event_id, family_member_id)`. Quando un family member viene cancellato, le sue righe in `event_attendees` SHALL essere rimosse in cascata, ma gli eventi NON SHALL essere cancellati.

#### Scenario: Create event with two attendees
- **WHEN** un client invia `POST /api/v1/calendar/events` con `{ "title": "Veterinario", "startsAt": "2026-04-08T10:00:00Z", "endsAt": "2026-04-08T11:00:00Z", "allDay": false, "categoryId": "<vet-cat-id>", "attendeeIds": ["<matteo-id>", "<cody-id>"] }`
- **THEN** il backend SHALL creare la riga in `events`
- **AND** SHALL inserire 2 righe in `event_attendees` per Matteo e Cody
- **AND** SHALL restituire `201 Created` con l'evento + array `attendees` popolato

#### Scenario: Create all-day event
- **WHEN** un client invia un POST con `{ "title": "Compleanno Cody", "startsAt": "2026-06-15T00:00:00Z", "endsAt": "2026-06-15T23:59:59Z", "allDay": true }`
- **THEN** il backend SHALL salvare `allDay = true`
- **AND** la UI SHALL renderizzare l'evento come banner che attraversa l'intera giornata (non come blocco orario)

#### Scenario: Reject event without title
- **WHEN** un client invia un POST senza `title` o con stringa vuota
- **THEN** il backend SHALL rispondere `400 Bad Request` con messaggio "title è obbligatorio"

#### Scenario: Reject event with endsAt before startsAt
- **WHEN** un client invia un POST con `endsAt < startsAt`
- **THEN** il backend SHALL rispondere `400 Bad Request` con messaggio "endsAt deve essere ≥ startsAt"

#### Scenario: Family member deletion cascades attendees
- **WHEN** un family member viene cancellato via `DELETE /api/v1/family/:id`
- **THEN** tutte le righe in `event_attendees` con quel `family_member_id` SHALL essere rimosse
- **AND** gli eventi associati SHALL continuare a esistere (eventualmente senza attendees)

### Requirement: Recurrence rules support common patterns

Il sistema SHALL supportare regole di ricorrenza come oggetto JSON con il seguente schema (sottoinsieme volutamente semplice di RFC 5545 RRULE):

```ts
type RecurrenceRule = {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'every-n-days';
  interval?: number;       // ogni N (per every-n-days)
  byWeekday?: number[];    // 0=domenica, 6=sabato (per weekly)
  byMonthDay?: number;     // giorno del mese (per monthly: 15 = giorno 15)
  endsOn?: string;         // ISO date, opzionale (until)
  count?: number;          // numero massimo di occorrenze, opzionale
};
```

Il backend SHALL fornire un endpoint `GET /api/v1/calendar/expanded?from=<iso>&to=<iso>` che restituisce **istanze concrete** degli eventi (incluse le occorrenze ricorrenti espanse) entro il range richiesto. Il client riceve eventi pronti da renderizzare senza dover espandere lui stesso.

#### Scenario: Weekly recurrence on Monday and Wednesday
- **GIVEN** un evento con `recurrenceRule = { "freq": "weekly", "byWeekday": [1, 3] }` e `startsAt = "2026-04-06T10:00:00Z"` (lunedì)
- **WHEN** il client chiede `/expanded?from=2026-04-06&to=2026-04-19`
- **THEN** il backend SHALL restituire 4 istanze: lun 6, mer 8, lun 13, mer 15

#### Scenario: Every 14 days from anchor
- **GIVEN** un evento con `recurrenceRule = { "freq": "every-n-days", "interval": 14 }` e `startsAt = "2026-01-06T08:00:00Z"`
- **WHEN** il client chiede `/expanded?from=2026-01-01&to=2026-02-28`
- **THEN** il backend SHALL restituire istanze nei giorni: 6 gen, 20 gen, 3 feb, 17 feb

#### Scenario: Recurrence ends on date
- **GIVEN** un evento ricorrente con `endsOn = "2026-05-31"`
- **WHEN** il client chiede `/expanded?from=2026-01-01&to=2026-12-31`
- **THEN** il backend SHALL restituire solo le istanze fino al 31 maggio incluso

### Requirement: Categories provide color coding from a fixed seed

Il sistema SHALL pre-popolare la tabella `event_categories` con questo seed iniziale modificabile dall'utente da Settings → Calendario:

| id | name (it) | color (oklch) | icon (Phosphor) |
|---|---|---|---|
| `vet` | Veterinario | `oklch(72% 0.13 30)` | `Stethoscope` |
| `school` | Scuola | `oklch(72% 0.13 240)` | `GraduationCap` |
| `work` | Lavoro | `oklch(60% 0.10 70)` | `Briefcase` |
| `health` | Salute | `oklch(70% 0.15 5)` | `Heartbeat` |
| `birthday` | Compleanno | `oklch(78% 0.15 320)` | `Cake` |
| `family` | Famiglia | `oklch(72% 0.10 50)` | `Users` |
| `other` | Altro | `oklch(70% 0.04 80)` | `Star` |

L'utente SHALL poter aggiungere/modificare/eliminare categorie da una sezione apposita in Settings, con limite massimo 16 per non saturare la palette visiva.

#### Scenario: List categories
- **WHEN** un client invia `GET /api/v1/calendar/categories`
- **THEN** il backend SHALL restituire array delle 7 categorie seed (più eventuali aggiunte dall'utente)
- **AND** ogni categoria SHALL contenere `id`, `name`, `color`, `icon`

#### Scenario: Cannot delete category in use
- **WHEN** l'utente tenta di eliminare una categoria a cui sono associati eventi
- **THEN** il backend SHALL rispondere `409 Conflict` con messaggio "Categoria in uso da N eventi"
- **AND** la UI SHALL offrire all'utente di riassegnare gli eventi a un'altra categoria prima di procedere

### Requirement: Calendar provides four views: month, week, agenda, today

La pagina Calendario SHALL offrire 4 viste switchable da un selettore in alto:

1. **Mese**: griglia 7×6 con tutti i giorni del mese, ogni giorno mostra fino a 3 eventi (icona categoria + titolo troncato), colore della categoria visibile, badge "+N" se ci sono più eventi
2. **Settimana**: griglia 7 colonne × ore della giornata (06:00-22:00 default, configurabile), eventi posizionati come blocchi colorati nella loro fascia oraria
3. **Agenda**: lista cronologica scrollabile dei prossimi 30 giorni, eventi raggruppati per data con header data, evidenziazione del giorno corrente
4. **Oggi**: focus solo sugli eventi del giorno corrente, mostrati come card grandi con tutti i dettagli (titolo, ora, attendees con avatar, categoria, location, descrizione)

La view default all'apertura della pagina SHALL essere **Oggi** (il use case più frequente).

#### Scenario: Switch from Month to Week view
- **GIVEN** la pagina Calendario aperta in vista Mese
- **WHEN** l'utente tap sul tab "Settimana"
- **THEN** la UI SHALL passare alla vista Settimana mostrando la settimana corrente
- **AND** la transizione SHALL essere animata (fade + leggero slide, durata DURATION_DEFAULT)

#### Scenario: Today view focuses on today's events only
- **GIVEN** oggi sono presenti 2 eventi: "Veterinario 10:00" e "Cena famiglia 19:30"
- **WHEN** la pagina Calendario viene aperta
- **THEN** la vista default Oggi SHALL mostrare 2 card grandi con i 2 eventi
- **AND** ogni card SHALL mostrare titolo, ora di inizio, durata, avatar di tutti gli attendee, badge categoria, eventuali location/descrizione

#### Scenario: Month view shows max 3 events per day with overflow badge
- **GIVEN** il giorno 15 ha 5 eventi
- **WHEN** la vista Mese viene renderizzata
- **THEN** la cella del giorno 15 SHALL mostrare i primi 3 eventi (icona + titolo troncato a 12 caratteri)
- **AND** SHALL mostrare un badge "+2" cliccabile che apre un popover con tutti e 5

### Requirement: Today tile in home shows next 3 events

L'home page SHALL contenere una tile "Oggi" che mostra:
- Header con data corrente in formato lungo italiano (es. "Mercoledì 8 aprile")
- Conteggio degli eventi totali del giorno
- Lista dei prossimi 3 eventi del giorno (passati esclusi se sono già finiti) con: ora, icona categoria color-coded, titolo, avatar attendees
- Empty state elegante se non ci sono eventi: "Nessun evento oggi"
- Tap sulla tile SHALL navigare a `/calendar` in vista Oggi

#### Scenario: Tile shows next 3 upcoming events
- **GIVEN** oggi ci sono 5 eventi: 2 già passati e 3 futuri
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare i 3 eventi futuri ordinati per orario crescente
- **AND** SHALL mostrare conteggio "5 eventi oggi" nell'header

#### Scenario: Empty day shows calm state
- **WHEN** non ci sono eventi oggi
- **THEN** la tile SHALL mostrare "Nessun evento oggi" con icona Phosphor `CalendarBlank` e opacità leggermente ridotta

### Requirement: Event creation form is intuitive on iPad and iPhone

Il form di creazione/modifica evento SHALL essere accessibile da:
- Bottone "+" floating action button nella pagina Calendario
- Tap sull'header data nella vista Mese (pre-popola la data)
- Tap su una fascia oraria nella vista Settimana (pre-popola data + ora)

Il form SHALL contenere i campi: titolo (input grande in Fraunces), descrizione (textarea opzionale), date pickers per inizio e fine (con suggerimento "+1h" automatico se l'utente cambia solo l'inizio), all-day toggle, multi-select dei family member (chip selezionabili con avatar e nome, pattern visivo che consenta di vedere a colpo d'occhio chi è incluso), select categoria con preview colore, ricorrenza picker, reminder picker.

#### Scenario: Default duration is 1 hour
- **GIVEN** l'utente apre il form e seleziona startsAt = "10:00"
- **WHEN** non modifica endsAt
- **THEN** endsAt SHALL essere automaticamente "11:00"
- **AND** se l'utente poi cambia startsAt, endsAt SHALL aggiornarsi mantenendo la durata corrente

#### Scenario: Multi-select attendees with chips
- **GIVEN** la famiglia ha 3 member: Matteo, Sara, Cody
- **WHEN** l'utente apre il form
- **THEN** SHALL vedere 3 chip selezionabili con avatar + nome
- **AND** può selezionarne 1 o più tap-pando le chip
- **AND** le chip selezionate SHALL avere bordo accent color e checkmark

### Requirement: API operations are voice-control ready

Il backend SHALL esporre rotte specializzate per il voice control:

- `GET /api/v1/calendar/today` — restituisce gli eventi del giorno corrente (espansi se ricorrenti) ordinati per orario, formato voice-friendly (titolo, ora, attendee names risolti in stringa)
- `GET /api/v1/calendar/tomorrow` — idem per domani
- `POST /api/v1/calendar/events/by-natural-language` con `{ "input": "evento veterinario domani alle 10 con Cody" }` — parser semplice che estrae titolo, data, ora, attendee names e crea l'evento. Se l'input è ambiguo restituisce `400` con `{ "error": "ambiguous", "missing": ["time"] }` per chiedere chiarimento al voice handler.

#### Scenario: GET today returns voice-friendly events
- **WHEN** un client invia `GET /api/v1/calendar/today`
- **THEN** il backend SHALL rispondere con array `[{ "id", "title", "startsAt", "endsAt", "allDay", "categoryName", "attendeeNames": ["Matteo", "Cody"] }, ...]`
- **AND** gli eventi SHALL essere ordinati per `startsAt` crescente

#### Scenario: Natural language event creation
- **WHEN** un client invia `POST /events/by-natural-language` con `{ "input": "veterinario domani alle 10 con cody" }`
- **AND** un family member chiamato "Cody" esiste
- **THEN** il backend SHALL creare un evento con titolo "Veterinario", startsAt = domani 10:00, durata 1h, categoria "Veterinario", attendee = Cody
- **AND** SHALL restituire `201 Created` con l'evento creato
