## Why

Il calendario famiglia è il **secondo cittadino di prima classe** del pannello (dopo la spesa). L'utente vuole vedere a colpo d'occhio cosa succede oggi in casa: appuntamenti, veterinario, scuola, lavoro, salute. Gli eventi devono essere associabili a uno o più membri della famiglia (esempio dell'utente: "Cody e Matteo dal veterinario l'8/04/2026"), supportare ricorrenze ragionevoli (settimanali, mensili, ogni N giorni), avere categorie con colori per leggibilità da 3 metri, e mostrare promemoria.

## What Changes

- Modello dati `events` con `id`, `title`, `description`, `startsAt`, `endsAt`, `allDay`, `location`, `category` (foreign key), `recurrenceRule` (subset semplice di RRULE), `reminderMinutes`, `createdAt`, `updatedAt`
- Modello dati `event_attendees` come tabella di join `(event_id, family_member_id)` per multi-membro
- Modello dati `event_categories` con `id`, `name`, `color` (hex/oklch), `icon` (Phosphor name), seed iniziale: "Veterinario", "Scuola", "Lavoro", "Salute", "Compleanno", "Famiglia", "Altro"
- CRUD backend `/api/v1/calendar/events`, `/categories`, `/today`, `/range`, `/expanded` (per espandere ricorrenze in istanze concrete in un range)
- Pagina Calendario con 4 viste switchable: **Settimana**, **Mese**, **Agenda** (lista cronologica 30 giorni), **Oggi** (focus sul giorno corrente)
- Form di creazione/modifica evento con: titolo, descrizione, date picker (start/end), all-day toggle, multi-select membri famiglia, select categoria, ricorrenza semplice (no/giornaliera/settimanale/mensile/annuale/ogni N giorni con end date opzionale), reminder
- Tile home "Oggi" che mostra i prossimi 3 eventi del giorno con orario + categoria color + avatar member
- Predisposizione **voice-ready**: API by-natural-language per "che eventi ho oggi", "aggiungi evento Y il Z", "leggi domani"

## Capabilities

### New Capabilities

- `family-calendar`: schema eventi + categorie + attendees, CRUD, viste mese/settimana/agenda/oggi, espansione ricorrenze, tile home, hook di dominio

### Modified Capabilities

- `app-shell`: la tab "Calendario" passa da placeholder a contenuto reale

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — `events`, `event_categories`, `event_attendees`
- `apps/api/src/db/seed-event-categories.ts`
- `apps/api/src/routes/calendar.ts`
- `apps/api/src/lib/recurrence.ts` — espansione delle ricorrenze in istanze concrete
- `packages/shared/src/calendar.ts` — tipi `Event`, `EventCategory`, `RecurrenceRule`, `CreateEventInput`
- `apps/mobile/src/pages/CalendarPage.tsx` con sub-componenti viste
- `apps/mobile/src/components/calendar/` — `MonthView`, `WeekView`, `AgendaView`, `TodayView`, `EventForm`, `EventCard`, `RecurrencePicker`, `MemberMultiSelect`
- `apps/mobile/src/components/home-tiles/TodayEventsTile.tsx`
- `apps/mobile/src/lib/hooks/useCalendar.ts`
- `apps/mobile/src/locales/it/calendar.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router calendar
- `apps/mobile/src/router.tsx` — `/calendar` punta a `CalendarPage` reale
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `TodayEventsTile`
- `packages/shared/src/index.ts` — esporta calendar

**Dipendenze aggiunte**:
- `date-fns` (gestione date, ITALIANO locale)
- `date-fns-tz` (timezone-safe)
- nessuna libreria di calendario UI (le viste le costruiamo a mano coi design tokens)

**Migration**: nuove tabelle. Il calendario settimana/mese è **costruito a mano** con CSS grid + Tailwind, non importiamo `react-big-calendar` né `fullcalendar` (sono troppo opinionati visivamente e violerebbero `.impeccable.md`).

**Nessun breaking change**.
