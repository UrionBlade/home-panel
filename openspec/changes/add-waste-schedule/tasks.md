## 1. Schema e migration

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` le tabelle `waste_types`, `waste_rules`, `waste_exceptions` con FK e indici
- [x] 1.2 Aggiungere `app_settings` (key/value) per `icsUrl`, `lastIcsRefreshAt`, `tonightCutoffHour` se non già presente
- [x] 1.3 Generare e applicare la migration

## 2. Seed Besozzo 2026

- [x] 2.1 Creare `apps/api/src/db/seed-besozzo-2026.ts` con i 6 tipi (+ pannolini opt-in 7°) e le 5 rules documentate (umido, carta, plastica, secco, vetro_lattine)
- [x] 2.2 Aggiungere le 3 eccezioni del PDF: plastica 25/12 → 23/12, carta 25/12 → 26/12, plastica 1/5 → 29/4
- [x] 2.3 Idempotente all'avvio del backend
- [x] 2.4 Test: avviare il backend, verificare che `GET /api/v1/waste/types` restituisca 6 tipi attivi + 1 disattivo

## 3. Tipi condivisi

- [x] 3.1 Creare `packages/shared/src/waste.ts` con tipi `WasteType`, `WasteRule`, `WasteRulePattern`, `WasteException`, `WasteCollectionDay`, `VoiceWasteResponse`
- [x] 3.2 Esportare da `packages/shared/src/index.ts`

## 4. Backend: expander e calendario

- [x] 4.1 Creare `apps/api/src/lib/waste-expander.ts` con `expandPattern(pattern, fromDate, toDate)` per i 3 freq (weekly, every-n-days, monthly)
- [x] 4.2 Implementare `buildCollectionCalendar(rules, exceptions, fromDate, toDate)` che combina rules + exceptions
- [x] 4.3 Test unit: verificare che il calendario generato per gennaio 2026 corrisponda esattamente al PDF Besozzo (estrai 5-6 date di sample)

## 5. Backend: router CRUD

- [x] 5.1 Creare `apps/api/src/routes/waste.ts` con sub-router `/types`, `/rules`, `/exceptions`, `/calendar`, `/today`, `/tomorrow`, `/ics`
- [x] 5.2 CRUD `/types` con check 409 su delete se in uso
- [x] 5.3 CRUD `/rules` con validazione pattern JSON
- [x] 5.4 CRUD `/exceptions`
- [x] 5.5 `GET /calendar?from=&to=` con limit max range 365 giorni
- [x] 5.6 `GET /today` e `GET /tomorrow` con generazione voiceText italiano

## 6. Backend: voice text generator

- [x] 6.1 Creare `apps/api/src/lib/waste-voice.ts` con tabella articoli + funzione `buildVoiceText(types, when: 'tonight'|'tomorrow')`
- [x] 6.2 Test unit per 0/1/2/3 tipi

## 7. Backend: ICS import

- [x] 7.1 Aggiungere dipendenza `node-ical`
- [x] 7.2 Creare `apps/api/src/lib/ics-import.ts` con `fetchAndParseIcs(url)` + `convertEventsToExceptions(events, types)`
- [x] 7.3 Implementare matching keyword nei summary/description per identificare il tipo di rifiuto
- [x] 7.4 Implementare `refreshIcsExceptions(db)` che fa fetch + replace eccezioni `source = 'ics'`
- [x] 7.5 Aggiungere campo `source` alle exceptions per distinguere ics vs manuale
- [x] 7.6 Endpoint `POST /ics/refresh` per refresh on-demand
- [x] 7.7 Schedule setInterval 24h al boot se `app_settings.icsUrl` configurato

## 8. Frontend: hook e tile home

- [x] 8.1 Creare `apps/mobile/src/lib/hooks/useWasteSchedule.ts` con `useWasteToday()`, `useWasteTomorrow()`, `useWasteCalendar(from, to)`, `useWasteTypes()`, `useWasteRules()`, `useWasteExceptions()`, mutations
- [x] 8.2 Creare `apps/mobile/src/components/home-tiles/WasteTile.tsx` con logica cutoff stasera/domani basata su `now.getHours()`, badge colorati per tipo, empty state
- [x] 8.3 Aggiornare `HomePage.tsx` per includere `<WasteTile />`

## 9. Frontend: Settings → Spazzatura

- [x] 9.1 Creare `apps/mobile/src/components/settings/WasteSettings.tsx` come container con sub-sezioni
- [x] 9.2 Creare `WasteTypeList.tsx` con CRUD tipi, color picker (preset palette), Phosphor icon picker
- [x] 9.3 Creare `WasteRuleEditor.tsx` con form guided per pattern (radio freq + checkboxes weekday + interval input + anchor date picker + endsOn opzionale + preview prossime 5 occorrenze in tempo reale)
- [x] 9.4 Creare `WasteExceptionList.tsx` con lista exceptions + form aggiunta + filtro `source` (manuale/ics)
- [x] 9.5 Creare `IcsImportSection.tsx` con input URL + bottone "Refresh ora" + display ultimo refresh + log errori
- [x] 9.6 Creare `WasteCalendarPreview.tsx` con mini-vista mese che evidenzia i giorni di raccolta con badge colorati
- [x] 9.7 Aggiungere la sezione Spazzatura a `SettingsPage.tsx`

## 10. i18n

- [x] 10.1 Creare `apps/mobile/src/locales/it/waste.json` con stringhe (titoli, label tipi, freq, weekday, eccezioni, ICS, voice text patterns)

## 11. Validazione

- [x] 11.1 `pnpm typecheck && pnpm lint` verde
- [x] 11.2 Test: verificare che `GET /calendar?from=2026-01-01&to=2026-01-31` restituisca esattamente le date del PDF Besozzo gennaio
- [x] 11.3 Test: verificare che il 23/12 abbia plastica e il 25/12 NO (eccezione applicata)
- [x] 11.4 Test: aprire la home alle 14:00 vede "domani", alle 18:00 vede "stasera"
- [x] 11.5 Test: `curl /today` restituisce voiceText corretto in italiano
- [x] 11.6 Test: configurare un finto URL ICS, verificare fetch + parse + creazione exceptions
- [x] 11.7 Test reduced motion sulla tile
- [x] 11.8 `openspec validate add-waste-schedule` verde
