## 1. Schema e migration

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` le tabelle `event_categories`, `events`, `event_attendees` con FK e indici
- [x] 1.2 `pnpm --filter @home-panel/api db:generate` per generare la migration
- [x] 1.3 `pnpm --filter @home-panel/api db:migrate` per applicarla
- [x] 1.4 Verificare lo schema SQLite

## 2. Seed categorie

- [x] 2.1 Creare `apps/api/src/db/seed-event-categories.ts` con i 7 preset documentati (vet, school, work, health, birthday, family, other)
- [x] 2.2 Chiamare il seed all'avvio backend (idempotente)

## 3. Tipi condivisi

- [x] 3.1 Creare `packages/shared/src/calendar.ts` con `Event`, `EventCategory`, `RecurrenceRule`, `EventAttendee`, `CreateEventInput`, `UpdateEventInput`, `EventInstance`
- [x] 3.2 Esportare da `packages/shared/src/index.ts`

## 4. Backend: recurrence expander

- [x] 4.1 Creare `apps/api/src/lib/recurrence.ts` con funzione `expandEvent(event, fromDate, toDate)` che gestisce: nessuna ricorrenza, daily, weekly (con byWeekday), monthly (con byMonthDay), yearly, every-n-days
- [x] 4.2 Gestire `endsOn` (until) e `count` (max occorrenze)
- [x] 4.3 Test unit per ognuno dei 5 pattern + edge case (range vuoto, count, until, weekday array)

## 5. Backend: router CRUD

- [x] 5.1 Creare `apps/api/src/routes/calendar.ts` con sub-router `/events`, `/categories`
- [x] 5.2 `GET /events?from=&to=` — eventi non espansi (per edit)
- [x] 5.3 `GET /events/:id` con attendee popolati
- [x] 5.4 `POST /events` con inserimento eventi + righe attendee in transazione
- [x] 5.5 `PATCH /events/:id` con merge campi e replace attendee se passati
- [x] 5.6 `DELETE /events/:id` con cascade attendee
- [x] 5.7 `GET /expanded?from=&to=` — invoca expander per ogni evento, restituisce array di EventInstance
- [x] 5.8 `GET /today` e `GET /tomorrow` — voice-friendly con attendeeNames risolti
- [x] 5.9 CRUD `/categories` con check 409 su delete se in uso
- [x] 5.10 Limit 16 categorie su POST

## 6. Backend: parser natural language

- [x] 6.1 Implementare `parseEventFromNaturalLanguage(input)` con regex per: data ("oggi", "domani", "lunedì", "8 aprile"), ora ("alle 10", "alle 14:30"), keywords categoria, attendee names match
- [x] 6.2 Implementare endpoint `POST /events/by-natural-language`
- [x] 6.3 Gestire ambiguità con `400 { error: "ambiguous", missing: [...] }`
- [x] 6.4 Test unit dei pattern di parsing

## 7. Frontend: hook di dominio

- [x] 7.1 Creare `apps/mobile/src/lib/hooks/useCalendar.ts` con hook: `useEvents(rangeFrom, rangeTo)`, `useExpandedEvents(...)`, `useEventsToday()`, `useCategories()`, `useCreateEvent()`, `useUpdateEvent()`, `useDeleteEvent()`
- [x] 7.2 Tutti gli hook usano `apiClient` e queryKey `['calendar', ...]`

## 8. Frontend: viste calendario

- [x] 8.1 Creare `apps/mobile/src/components/calendar/EventCard.tsx` (componente base riusato dalle viste, varianti `compact | full`)
- [x] 8.2 Creare `TodayView.tsx` con lista delle EventCard fullsize del giorno
- [x] 8.3 Creare `AgendaView.tsx` con scroll virtuale (se >100 items, react-virtual) per i prossimi 30 giorni
- [x] 8.4 Creare `WeekView.tsx` con CSS Grid 7 colonne × ore (06-22), eventi posizionati con CSS calc
- [x] 8.5 Creare `MonthView.tsx` con CSS Grid 7×6, ogni cella mostra fino a 3 eventi + badge "+N"
- [x] 8.6 Creare `ViewSelector.tsx` con 4 tab (Oggi/Settimana/Mese/Agenda) e animazione di switch via Framer Motion

## 9. Frontend: form evento

- [x] 9.1 Creare `apps/mobile/src/components/calendar/EventForm.tsx` con tutti i campi documentati
- [x] 9.2 Creare `apps/mobile/src/components/calendar/MemberMultiSelect.tsx` con chip toggle per ogni family member
- [x] 9.3 Creare `apps/mobile/src/components/calendar/RecurrencePicker.tsx` con UI guided (no/giornaliera/settimanale con weekday checkboxes/mensile/annuale/ogni N giorni) + endsOn opzionale
- [x] 9.4 Creare `apps/mobile/src/components/calendar/CategoryPicker.tsx` con preview colore + icona
- [x] 9.5 Logica auto-1h se l'utente cambia solo startsAt
- [x] 9.6 Validazione form: title obbligatorio, ends >= starts
- [x] 9.7 Modal full-screen su iPhone, dialog centrata su iPad

## 10. Frontend: pagina e tile home

- [x] 10.1 Creare `apps/mobile/src/pages/CalendarPage.tsx` con ViewSelector + viste switchable + FAB per nuovo evento
- [x] 10.2 Creare `apps/mobile/src/components/home-tiles/TodayEventsTile.tsx` con header data + count + lista 3 eventi futuri
- [x] 10.3 Aggiornare `router.tsx` per puntare `/calendar` a `CalendarPage`
- [x] 10.4 Aggiornare `HomePage.tsx` per includere `<TodayEventsTile />`

## 11. Settings: gestione categorie

- [x] 11.1 Aggiungere a `SettingsPage.tsx` una sezione "Calendario → Categorie"
- [x] 11.2 Lista categorie con preview colore + icona + nome
- [x] 11.3 Form per aggiungere/modificare con color picker (preset OKLCH della palette) + Phosphor icon picker
- [x] 11.4 Conferma di delete con check 409

## 12. i18n

- [x] 12.1 Creare `apps/mobile/src/locales/it/calendar.json` con tutte le stringhe (titoli viste, label form, nomi giorni/mesi italiani via date-fns locale, recurrence options, reminder options)

## 13. Validazione

- [x] 13.1 `pnpm typecheck && pnpm lint` verde
- [x] 13.2 Creare evento ricorrente settimanale lun+mer, verificare espansione corretta in WeekView e MonthView
- [x] 13.3 Creare evento multi-attendee (Cody + Matteo), verificare visualizzazione avatar e cascade su delete member
- [x] 13.4 Test natural language: `curl -X POST .../by-natural-language -d '{"input":"veterinario domani alle 10 con cody"}'`
- [x] 13.5 Test ambiguità parser
- [x] 13.6 Test reduced motion
- [x] 13.7 Test view switching animations
- [x] 13.8 `openspec validate add-family-calendar` verde
