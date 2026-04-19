## ADDED Requirements

### Requirement: Waste types are configurable with seed for Besozzo

Il sistema SHALL definire una tabella `waste_types` con i campi `id` (kebab-case), `displayName` (italiano), `color` (oklch string), `icon` (Phosphor name), `containerType` (`bag` | `bin`), `expositionInstructions` (testo libero opzionale), `active` (boolean). Il seed iniziale per Besozzo SHALL contenere questi 6 tipi:

| id | displayName | color | icon | containerType |
|---|---|---|---|---|
| `secco` | Secco non riciclabile | `oklch(50% 0.02 70)` | `TrashSimple` | bag (sacchi RFID grigi, max 7-8kg) |
| `umido` | Umido (organico) | `oklch(50% 0.10 60)` | `Leaf` | bin (contenitore marrone con sacchetti compostabili) |
| `plastica` | Plastica | `oklch(80% 0.15 90)` | `Bottle` | bag (sacchi gialli trasparenti) |
| `vetro_lattine` | Vetro e lattine | `oklch(60% 0.13 150)` | `Wine` | bin (contenitore verde con coperchio) |
| `carta` | Carta e cartone | `oklch(58% 0.13 240)` | `Newspaper` | bin (contenitore blu) |
| `verde` | Verde / scarti vegetali | `oklch(65% 0.13 130)` | `Plant` | bin (carrellato giallo 240L, a pagamento opzionale) |

L'utente SHALL poter aggiungere/modificare/disattivare tipi dalla sezione Settings → Spazzatura.

#### Scenario: Seed creates 6 waste types for Besozzo
- **WHEN** il backend si avvia per la prima volta con DB vuoto
- **THEN** il seed SHALL inserire le 6 righe di `waste_types` documentate
- **AND** se il seed viene rieseguito SHALL essere idempotente (non duplicare)

#### Scenario: User adds custom waste type
- **WHEN** l'utente crea da Settings un tipo "Tessili" con icona `Tshirt` e colore custom
- **THEN** il backend SHALL persistere il nuovo tipo
- **AND** SHALL essere disponibile per la creazione di regole

### Requirement: Waste rules use anchor-date interval pattern

Il sistema SHALL modellare le regole di raccolta come oggetti `waste_rule` con il seguente schema:

```ts
type WasteRule = {
  id: string;
  wasteTypeId: string;
  pattern: {
    freq: 'weekly' | 'every-n-days' | 'monthly';
    interval?: number;        // per every-n-days (es. 14)
    byWeekday?: number[];     // per weekly (0=domenica, 6=sabato)
    anchorDate: string;       // ISO date di riferimento
    endsOn?: string;          // opzionale, se la regola scade
  };
  expositionTime: string;     // "20:00" default
  active: boolean;
};
```

Questo schema deriva direttamente dall'analisi del PDF Besozzo 2026. Esempio dal PDF: il SECCO è raccolto ogni 14 giorni a partire dal martedì 6 gennaio 2026 → `{ freq: 'every-n-days', interval: 14, anchorDate: '2026-01-06' }`.

#### Scenario: Weekly rule on Tuesday and Friday
- **GIVEN** una regola UMIDO con `pattern = { freq: 'weekly', byWeekday: [2, 5], anchorDate: '2026-01-01' }`
- **WHEN** il client chiede `GET /api/v1/waste/calendar?from=2026-01-05&to=2026-01-11`
- **THEN** il backend SHALL restituire 2 collection day per UMIDO: martedì 6 gen e venerdì 9 gen

#### Scenario: Every 14 days from anchor
- **GIVEN** una regola SECCO con `pattern = { freq: 'every-n-days', interval: 14, anchorDate: '2026-01-06' }`
- **WHEN** il client chiede `GET /api/v1/waste/calendar?from=2026-01-01&to=2026-02-28`
- **THEN** il backend SHALL restituire 4 collection day per SECCO: 6 gen, 20 gen, 3 feb, 17 feb

#### Scenario: Rule with endsOn ignores dates after expiration
- **GIVEN** una regola con `endsOn = '2026-06-30'`
- **WHEN** il client chiede `/calendar?from=2026-06-01&to=2026-08-31`
- **THEN** il backend SHALL restituire solo le occorrenze fino al 30 giugno incluso

### Requirement: Besozzo 2026 rules are pre-seeded from PDF analysis

Il seed iniziale per Besozzo SHALL inserire le seguenti regole derivate dal PDF `BESOZZO.pdf` (calendario 2026 della Convenzione Rifiuti Sesto):

1. **UMIDO**: `weekly`, `byWeekday: [2, 5]` (martedì e venerdì), `anchorDate: '2026-01-06'`, espositione 20:00
2. **CARTA**: `weekly`, `byWeekday: [5]` (venerdì), `anchorDate: '2026-01-02'`, esposizione 20:00
3. **PLASTICA**: `weekly`, `byWeekday: [5]` (venerdì), `anchorDate: '2026-01-02'`, esposizione 20:00
4. **SECCO**: `every-n-days`, `interval: 14`, `anchorDate: '2026-01-06'` (martedì), esposizione 20:00
5. **VETRO E LATTINE**: `every-n-days`, `interval: 14`, `anchorDate: '2026-01-13'` (martedì, sfasato di 7 giorni dal SECCO), esposizione 20:00
6. **VERDE**: nessuna regola seed (servizio a pagamento opzionale, l'utente la crea solo se ha attivato il servizio)

#### Scenario: Seeded rules match PDF for January 2026
- **WHEN** il backend è seedato e il client chiede `GET /api/v1/waste/calendar?from=2026-01-01&to=2026-01-31`
- **THEN** il backend SHALL restituire collection day che includono almeno: martedì 6 gen (UMIDO + SECCO), venerdì 9 gen (UMIDO + CARTA + PLASTICA), martedì 13 gen (UMIDO + VETRO_LATTINE), venerdì 16 gen (UMIDO + CARTA + PLASTICA), e così via
- **AND** la sequenza SHALL corrispondere esattamente al PDF di gennaio

### Requirement: Exceptions override rules for specific dates

Il sistema SHALL supportare `waste_exceptions` per gestire i giorni in cui la raccolta viene spostata (festività). Una eccezione può:
- **Spostare** una raccolta da una data X a una data Y (`originalDate` → `replacementDate`)
- **Cancellare** una raccolta (impostando `replacementDate = null`)
- **Aggiungere** una raccolta straordinaria (impostando `originalDate = null`, `replacementDate = X`)

Esempi dal PDF Besozzo 2026:
- Plastica del venerdì 25/12/2025 (Natale) spostata a mercoledì 23/12/2025
- Carta del venerdì 25/12 spostata a sabato 26/12
- Plastica del venerdì 1/5 (1° Maggio) spostata a mercoledì 29/4

#### Scenario: Exception moves collection to alternative date
- **GIVEN** una rule PLASTICA che originalmente cadrebbe il 25/12
- **AND** una eccezione `{ wasteTypeId: 'plastica', originalDate: '2025-12-25', replacementDate: '2025-12-23' }`
- **WHEN** il client chiede `/calendar?from=2025-12-22&to=2025-12-26`
- **THEN** il backend SHALL restituire PLASTICA il 23/12 (non il 25/12)

#### Scenario: Exception cancels collection
- **GIVEN** una eccezione con `replacementDate = null` per il 25/12
- **WHEN** il client chiede il calendario di quella settimana
- **THEN** il 25/12 NOT SHALL contenere quel tipo di rifiuto, e nessuna data sostitutiva SHALL essere generata

### Requirement: Calendar endpoint returns collection days for date range

Il backend SHALL esporre `GET /api/v1/waste/calendar?from=<iso-date>&to=<iso-date>` che restituisce un array di `WasteCollectionDay` ordinati cronologicamente, dove ogni giorno contiene:
- `date` (ISO date)
- `wasteTypes` (array di oggetti `{ id, displayName, color, icon, expositionTime }`)
- `dayOfWeek` (italiano: "lunedì", "martedì", ...)
- `isToday`, `isTomorrow` (boolean per facilità del client)

Il backend SHALL applicare l'algoritmo: per ogni regola attiva, espandere le occorrenze nel range; per ogni eccezione nel range, applicare l'override. Solo i giorni con almeno un tipo di rifiuto SHALL essere inclusi nell'array di risposta.

#### Scenario: Range with multiple types per day
- **WHEN** il client chiede `/calendar?from=2026-04-06&to=2026-04-12`
- **THEN** il backend SHALL restituire array che include almeno questi giorni con i loro tipi:
  - `martedì 7 aprile`: UMIDO + SECCO (se la sequenza dell'every-n-days lo prevede)
  - `venerdì 10 aprile`: UMIDO + CARTA + PLASTICA
- **AND** ogni giorno SHALL essere ordinato per data crescente

#### Scenario: Empty range returns empty array
- **WHEN** il client chiede un range senza raccolte (es. solo domeniche)
- **THEN** il backend SHALL rispondere con `[]`

### Requirement: Today endpoint is voice-friendly

Il backend SHALL esporre `GET /api/v1/waste/today` e `GET /api/v1/waste/tomorrow` che restituiscono:

```json
{
  "date": "2026-04-08",
  "dayOfWeek": "mercoledì",
  "wasteTypes": [
    { "id": "umido", "displayName": "umido" },
    { "id": "plastica", "displayName": "plastica" }
  ],
  "voiceText": "Stasera porta fuori umido e plastica"
}
```

Il `voiceText` SHALL essere una frase italiana naturale pronta per il TTS, costruita server-side per evitare logica di linguaggio nel client. Gestisce le coniugazioni: 0 tipi → "Niente da portare fuori", 1 tipo → "Stasera porta fuori il <tipo>", 2 tipi → "Stasera porta fuori <tipo> e <tipo>", 3+ tipi → "Stasera porta fuori <a>, <b> e <c>".

#### Scenario: Single type
- **WHEN** oggi solo umido va portato fuori
- **THEN** `voiceText` SHALL essere "Stasera porta fuori l'umido"

#### Scenario: Three types
- **WHEN** oggi vanno portati fuori umido, carta e plastica
- **THEN** `voiceText` SHALL essere "Stasera porta fuori umido, carta e plastica"

#### Scenario: Nothing to throw
- **WHEN** oggi nessuna raccolta
- **THEN** `voiceText` SHALL essere "Stasera niente da portare fuori"

### Requirement: ICS import is optional and configurable

Il sistema SHALL supportare l'import di un file ICS dal sito del Comune se l'utente fornisce un URL nelle Settings → Spazzatura → "Importa da calendario ICS". Quando l'URL è configurato:
1. Il backend SHALL fare fetch del file ICS al primo setup
2. SHALL parsare gli eventi ICS (libreria `node-ical`) ed estrarre per ogni evento la data + i tipi di rifiuto (matchando keyword come "secco", "plastica", ecc. nel summary/description)
3. SHALL convertirli in eccezioni puntuali (sovrascrivendo eventuali rules per quelle date)
4. SHALL schedulare un refresh giornaliero (cron 03:00) per riallineare se il Comune aggiorna il file
5. SHALL mostrare l'ultimo refresh nella UI Settings

Se il fetch fallisce, SHALL loggare l'errore e mantenere le eccezioni esistenti senza azzerare nulla.

#### Scenario: ICS URL is configured and fetched
- **WHEN** l'utente salva un URL ICS nelle Settings
- **THEN** il backend SHALL fare fetch immediatamente
- **AND** SHALL parsare gli eventi
- **AND** SHALL inserire/aggiornare le `waste_exceptions` corrispondenti
- **AND** SHALL aggiornare il timestamp `lastIcsRefreshAt` nelle settings

#### Scenario: ICS fetch fails gracefully
- **WHEN** l'URL non risponde o restituisce contenuto non valido
- **THEN** il backend SHALL loggare l'errore con dettagli
- **AND** SHALL NOT azzerare le eccezioni esistenti
- **AND** la UI Settings SHALL mostrare un warning con il messaggio dell'errore

### Requirement: Home tile shows tonight or tomorrow waste

L'home page SHALL contenere una `WasteTile` di dimensione media con questo comportamento dinamico:
- **Prima delle 16:00**: mostra "Domani" e i tipi di rifiuto del giorno successivo
- **Dopo le 16:00**: mostra "Stasera" e i tipi di rifiuto del giorno corrente (perché c'è da esporre la sera prima dalle 20:00)
- **Se non c'è raccolta**: mostra "Niente da portare fuori" con icona elegante e opacità ridotta
- Per ogni tipo SHALL mostrare un badge colorato con icona Phosphor + nome
- Tap sulla tile SHALL aprire la pagina Settings → Spazzatura per visualizzare il calendario completo

#### Scenario: Evening shows tonight items
- **GIVEN** sono le 18:00 e oggi ci sono UMIDO e CARTA
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare header "Stasera" + badge umido + badge carta

#### Scenario: Morning shows tomorrow items
- **GIVEN** sono le 09:00 e domani ci sono UMIDO + PLASTICA
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare header "Domani" + badge umido + badge plastica

#### Scenario: Weekend with no collection
- **GIVEN** è sabato e domenica non c'è raccolta
- **WHEN** la home viene caricata
- **THEN** la tile SHALL mostrare "Niente da portare fuori" con opacità ridotta

### Requirement: Settings UI manages types, rules and exceptions

La sezione Settings → Spazzatura SHALL fornire:
- **Lista tipi di rifiuto** con preview colore + icona, possibilità di toggle attivo, edit, delete (con check 409 se in uso da rules)
- **Editor regole** per ogni tipo: form guided (settimanale → checkbox giorni; ogni N giorni → input N + anchor date picker), preview "prossime 5 occorrenze"
- **Lista eccezioni** con data origine + data sostituzione + tipo + motivo, bottone "Aggiungi eccezione"
- **Sezione ICS Import**: input URL + bottone "Refresh ora" + ultimo refresh timestamp + log errori
- **Visualizzazione calendario**: vista mese-piccola con badge colorati nei giorni di raccolta, tap su giorno apre dettaglio

#### Scenario: Add a new rule for a custom type
- **WHEN** l'utente seleziona "Tessili" e crea una rule "ogni 4 settimane di giovedì a partire dal 1 gennaio"
- **THEN** il backend SHALL persistere la rule
- **AND** la UI SHALL mostrare immediatamente il preview "prossime 5 occorrenze: 1/1, 29/1, 26/2, 26/3, 23/4"
