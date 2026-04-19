## Context

Calendario è il dominio più complesso dopo la spesa per via di: ricorrenze (espansione in istanze), 4 viste UI diverse, multi-attendee, categorie con colori. È critico tenerlo semplice senza compromettere l'usabilità — l'utente non vuole RFC 5545 RRULE completo, vuole "ogni due settimane di martedì" facile da impostare.

Il vecchio `home-panel` aveva una `CalendarGrid` ma con un modello dati molto più semplice. Riprendo il pattern visivo (mese tile-style con colori per categoria) ma riscrivo lo schema da zero per supportare ricorrenze + multi-attendee.

## Goals / Non-Goals

### Goals

1. Modello eventi flessibile con multi-attendee, categorie, ricorrenze semplici
2. 4 viste UI (mese, settimana, agenda, oggi) costruite a mano coi design tokens
3. Espansione lato server delle ricorrenze in istanze concrete (il client non deve calcolare)
4. Tile home "Oggi" che mostra prossimi 3 eventi
5. API voice-ready per query e creazione da linguaggio naturale
6. Niente dipendenze pesanti di calendar UI

### Non-Goals

- **Niente RFC 5545 RRULE completo**. Subset minimo: daily / weekly / monthly / yearly / every-n-days, con `byWeekday`, `byMonthDay`, `endsOn`, `count`. Niente eccezioni alle ricorrenze (EXDATE), niente RDATE, niente per gli use case "il secondo martedì di ogni mese" (sarebbe `bysetpos`).
- **Niente sync esterno** (Google Calendar, iCloud, Caldav). Quello vivrà nella futura `add-ical-sync`.
- **Niente notifiche push** quando arriva un reminder. In questa change i reminder sono solo persistiti nel DB; la **change futura** `add-voice-control` (o una dedicata) li userà per leggerli vocalmente o mostrarli come overlay in app. Niente APNs.
- **Niente time zone management complesso**. Tutti gli eventi sono in `Europe/Rome` (configurabile a livello applicazione, non per evento).
- **Niente conflitti di sovrapposizione** (warning "hai già un evento alle 10"). Eventuale add futura.

## Decisions

### D1. Schema con tre tabelle e foreign keys

```sql
CREATE TABLE event_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,         -- oklch string
  icon TEXT NOT NULL,          -- Phosphor icon name
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,     -- ISO timestamp
  ends_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  category_id TEXT REFERENCES event_categories(id) ON DELETE SET NULL,
  recurrence_rule TEXT,        -- JSON, nullable
  reminder_minutes INTEGER,    -- nullable
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX idx_events_starts_at ON events(starts_at);

CREATE TABLE event_attendees (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  family_member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, family_member_id)
);
```

### D2. Espansione delle ricorrenze lato server

**Decisione**: il backend espone `GET /api/v1/calendar/expanded?from=X&to=Y` che ritorna istanze concrete pre-espanse. Il client riceve un array di "eventi visualizzabili" senza dover gestire la logica RRULE.

**Rationale**:
- Lato server abbiamo una sola implementazione, lato client non dobbiamo replicarla in TS
- Le viste mese/settimana/agenda fanno query su un range definito, perfetto per questo endpoint
- Quando arriverà il voice ("eventi di domani"), riusiamo lo stesso endpoint
- L'overhead è basso: SQLite è veloce, le ricorrenze sono poche

**Alternative considerate**:
- *Espandere lato client con `rrule.js`*: dipendenza ~30KB, complessità doppia
- *Pre-materializzare le istanze in DB*: aumenta storage, conflitti su modifica della rule

### D3. Implementazione manuale dell'espansione (no rrule.js)

**Decisione**: scrivere un piccolo expander custom in `apps/api/src/lib/recurrence.ts` che gestisce solo i 5 pattern del nostro `RecurrenceRule`. ~150 righe di codice, zero dipendenze, completamente testabile.

```ts
function expandEvent(event: Event, from: Date, to: Date): EventInstance[] {
  if (!event.recurrenceRule) {
    return isInRange(event.startsAt, from, to) ? [{ ...event, instanceDate: event.startsAt }] : [];
  }
  // ... switch per freq
}
```

### D4. UI viste a mano con CSS Grid + Framer Motion

**Decisione**: nessuna libreria di calendar UI. Le 4 viste sono componenti React custom che usano CSS Grid (`grid-template-columns: repeat(7, 1fr)` per mese), Framer Motion per le transizioni di view switching, e i design tokens di `.impeccable.md`.

**Rationale**:
- `react-big-calendar`, `fullcalendar`, `@nivo/calendar`: tutti opinionati visivamente, sarebbero AI-slop test failure
- Costruire a mano in ~600 righe totali di codice è fattibile e produce UI distintiva
- Reuso pieno dei design tokens

**Alternative considerate**: scartate per il vincolo Impeccable.

### D5. Date library: date-fns + date-fns-tz

**Decisione**: `date-fns` per manipolazione date (formatting italiano, addDays, startOfMonth, ecc.) + `date-fns-tz` per gestione timezone Europe/Rome consistente.

**Alternative considerate**:
- *Luxon*: API più moderna ma bundle più grande
- *Day.js*: leggero ma plugin necessari per l'italiano
- *Temporal API*: non ancora ben supportata in Safari

### D6. Categorie modificabili dall'utente con seed iniziale

**Decisione**: il seed iniziale ha 7 categorie ragionevoli, ma l'utente può aggiungere/rinominare/eliminare dalle Settings → Calendario. Limite 16 per non saturare la palette visiva.

### D7. Form di evento full-screen su iPhone, modale su iPad

**Decisione**: il form di creazione/modifica evento è una modale fullscreen su iPhone (per ergonomia mobile) e una dialog modale centrata su iPad (75vw × 80vh max, per non bloccare il calendario sotto). Stesso componente, layout responsive.

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Espansione ricorrenze su range grande (1 anno) può essere lenta | Limitare il range max a 90 giorni per `/expanded`. Le viste UI non chiedono mai più di un mese alla volta. |
| Multi-attendee senza vincoli può creare evento "fantasma" senza nessuno | OK, è valido (es. "Riunione condominio") |
| Niente sync con calendari esterni significa data entry manuale | Documentato. La change `add-ical-sync` futura risolverà. Per ora il voice control rende il data entry rapido. |
| 4 viste = 4 componenti complessi da mantenere | Le viste condividono `EventCard` come unit base. Variano solo nel layout (grid week/month vs list agenda/today). |
| Categorie limitate a 16 può essere stringente | Il limite è soft, può essere alzato in futuro. È una scelta UX per evitare overload visivo. |
| Parser natural language è semplice e fallisce su input ambigui | Restituisce 400 con `missing` field, voice handler chiede chiarimento. Implementazione minima: regex per data/ora/membri/parole chiave categoria. |

## Migration Plan

1. Generare migration Drizzle, applicare, seedare categorie
2. Implementare expander con test unit
3. Implementare router backend
4. Implementare 4 viste UI in ordine: Today (più semplice) → Agenda → Week → Month
5. Implementare form evento + multi-select members
6. Aggiungere TodayEventsTile alla home
7. Test multi-device

**Rollback**: revert commit. Le tabelle restano nel DB ma inutilizzate.

## Open Questions

1. **Conflitti di evento**: vogliamo mostrare warning se si crea un evento sovrapposto a uno esistente? — *Proposta*: no nella prima versione, valutiamo dopo.
2. **Recurrence end "until" vs "count"**: supportare entrambi o solo uno? — *Proposta*: entrambi, ma solo uno alla volta nel form (radio "termina il" / "per N volte").
3. **Visualizzazione evento ricorrente nel form di edit**: editare l'istanza singola o la serie? — *Proposta*: questa change supporta solo "edit serie" (l'istanza concreta non è materializzata). Edit istanza singola in change futura se serve.
4. **Notifiche di reminder**: in app, vocali, push? Per ora solo persistite, vedere voice control change.
