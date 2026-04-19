## Context

Il calendario di raccolta a Besozzo (Convenzione Rifiuti Sesto Calende) ha pattern semplici e prevedibili che ho già estratto dal PDF `BESOZZO.pdf`:

- **UMIDO**: ogni martedì + ogni venerdì (ogni settimana, 2 volte)
- **CARTA**: ogni venerdì
- **PLASTICA**: ogni venerdì
- **SECCO**: ogni 14 giorni dal martedì 6 gennaio 2026 (anchor)
- **VETRO E LATTINE**: ogni 14 giorni dal martedì 13 gennaio 2026 (sfasato di 7 giorni dal SECCO)
- **VERDE**: a pagamento opzionale (frequenza definita dall'utente se attiva il servizio)

L'unica complessità sono le **festività**: a Natale e 1° Maggio le raccolte vengono spostate (es. plastica del 25/12 → mercoledì 23/12). Modello queste come `waste_exceptions` puntuali invece di logica fork nelle rules.

L'utente vuole sapere "stasera cosa porto fuori" (tile home dinamica), e voce ("Ok casa cosa porto fuori stasera").

## Goals / Non-Goals

### Goals

1. Modello generico di rules + exceptions che descrive Besozzo ma è generalizzabile ad altri comuni
2. Seed pre-popolato con la verità di Besozzo 2026 estratta dal PDF
3. Tile home dinamica stasera/domani in base all'orario corrente
4. Endpoint voice-friendly con `voiceText` italiano pronto per TTS
5. Import ICS opzionale come fallback se il Comune lo offrisse in futuro
6. Settings UI per gestire tipi/regole/eccezioni in modo guidato

### Non-Goals

- **Niente integrazione Junker app**: API non pubblica, scraping fragile, scartata
- **Niente notifiche push**: le notifiche vivono nelle change voice + in-app overlay
- **Niente recall manuale dei sacchi RFID**: il PDF dice che i sacchi RFID si ritirano agli ecosportelli, è un'azione fisica fuori scope app
- **Niente prenotazione ingombranti/RAEE**: il PDF dice di chiamare il numero verde 800.128064. Non integriamo telefonate.
- **Niente sync bidirezionale ICS**: solo import (read-only)

## Decisions

### D1. Schema con tre tabelle

```sql
CREATE TABLE waste_types (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  container_type TEXT NOT NULL CHECK (container_type IN ('bag', 'bin')),
  exposition_instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE waste_rules (
  id TEXT PRIMARY KEY,
  waste_type_id TEXT NOT NULL REFERENCES waste_types(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,         -- JSON: { freq, interval, byWeekday, anchorDate, endsOn }
  exposition_time TEXT NOT NULL DEFAULT '20:00',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE waste_exceptions (
  id TEXT PRIMARY KEY,
  waste_type_id TEXT NOT NULL REFERENCES waste_types(id) ON DELETE CASCADE,
  original_date TEXT,            -- nullable: per "raccolta straordinaria aggiunta"
  replacement_date TEXT,         -- nullable: per "raccolta cancellata"
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX idx_waste_exceptions_dates ON waste_exceptions(original_date, replacement_date);
```

### D2. Algoritmo di espansione

```pseudocode
function expandWasteCalendar(rules, exceptions, fromDate, toDate):
  collectionDays = {}  # Map<date, Set<wasteTypeId>>

  for rule in rules where rule.active:
    occurrences = expandPattern(rule.pattern, fromDate, toDate)
    for date in occurrences:
      collectionDays[date].add(rule.wasteTypeId)

  # Apply exceptions
  for exc in exceptions where overlapping(exc, fromDate, toDate):
    if exc.originalDate in collectionDays:
      collectionDays[exc.originalDate].remove(exc.wasteTypeId)
    if exc.replacementDate is not null:
      collectionDays[exc.replacementDate].add(exc.wasteTypeId)

  return collectionDays.entries.sortedByDate
```

L'ordine "rules first, then exceptions" garantisce che le exceptions vincano sempre.

### D3. Tile home con cutoff alle 16:00

**Decisione**: la `WasteTile` calcola lo "stato del giorno" lato client basandosi sull'orario corrente:
- `now.getHours() < 16` → mostra **domani**
- `now.getHours() >= 16` → mostra **stasera** (perché c'è da esporre alle 20:00)

L'orario di cutoff (16:00) è un compromesso ragionevole. L'utente può modificarlo nelle Settings se vuole (campo `tonightCutoffHour` in `app_settings`).

**Alternative considerate**:
- *Sempre "stasera" + "domani"* in tile più grande: doppio info, troppo testo per la home
- *Cutoff fisso 18:00*: troppo tardi se l'utente esce alle 17

### D4. Voice text pre-rendered server-side

**Decisione**: il backend genera il `voiceText` italiano già coniugato (es. "Stasera porta fuori umido e plastica") e il client lo passa direttamente al TTS. Questo evita di duplicare logica linguistica nel client.

**Logica**:
- 0 tipi → "Stasera niente da portare fuori"
- 1 tipo → "Stasera porta fuori `<articolo determinato>` `<displayName>`" (es. "l'umido", "la plastica", "il vetro e le lattine")
- 2 tipi → "Stasera porta fuori `<a>` e `<b>`" (con articoli)
- 3+ tipi → "Stasera porta fuori `<a>`, `<b>` e `<c>`"

Una piccola tabella di articoli determinati per ogni `wasteType.id` è hard-coded:
```ts
const ARTICLES: Record<string, string> = {
  secco: "il", umido: "l'", plastica: "la",
  vetro_lattine: "il", carta: "la", verde: "il", pannolini: "i"
};
```

### D5. ICS import con node-ical, conversione in eccezioni

**Decisione**: usare `node-ical` (popolare, MIT, parser RFC 5545 completo) per parsare il file. Per ogni evento ICS:
1. Estrarre la data
2. Cercare nel `summary` o `description` keyword corrispondenti ai tipi di rifiuto (case-insensitive: "secco", "umido", "plastica", "vetro", "lattine", "carta", "verde")
3. Per ogni match, creare/aggiornare una `waste_exception` come "raccolta straordinaria aggiunta" o "spostata" se la data non corrisponde a quella naturale della rule

Il job cron viene avviato all'avvio del backend solo se `app_settings.icsUrl` è popolato.

### D6. Import ICS con strategia "additive"

**Decisione**: l'import ICS NON cancella mai le rules esistenti. Aggiunge solo eccezioni puntuali. Questo significa che:
- Se l'utente ha le rules base di Besozzo + un ICS con tutti i giorni dell'anno, le rules sono ridondanti ma non c'è conflitto
- L'utente può scegliere di disattivare le rules se preferisce affidarsi solo all'ICS
- Le eccezioni create dall'import hanno un campo `source: 'ics'` per essere distinguibili da quelle manuali

### D7. Refresh schedulato con setInterval semplice

**Decisione**: niente librerie cron complesse. Il backend usa un `setInterval` di 24 ore al boot, che chiama `refreshIcs()` se l'URL è configurato. Il primo refresh avviene dopo 5 secondi dall'avvio per non bloccare lo startup.

```ts
if (settings.icsUrl) {
  setTimeout(refreshIcs, 5000);
  setInterval(refreshIcs, 24 * 60 * 60 * 1000);
}
```

**Alternative considerate**:
- *node-cron*: dipendenza extra per zero valore aggiuntivo
- *Job queue (BullMQ)*: enormemente sovradimensionato

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Le festività 2027 vanno aggiunte come exceptions a mano se non c'è ICS | Documentare nel README. Aggiungere un seed di exceptions per i giorni festivi italiani standard (Natale, 1 Maggio, Pasqua, Pasquetta, Ferragosto, ecc.) — almeno per il 2026 e 2027. |
| Il pattern del PDF cambia se il Comune cambia frequenza | Le rules sono modificabili dall'utente via Settings. Quando il calendario 2027 esce, l'utente aggiorna manualmente o importa il nuovo ICS. |
| Voice text con articoli italiani può sbagliare su tipi custom dell'utente | Per i tipi seed sappiamo gli articoli. Per i tipi custom usiamo "il" come fallback (oppure chiediamo all'utente l'articolo nel form di creazione). |
| ICS parser può ricevere file malformato | `node-ical` lancia eccezioni gestite, errore loggato, refresh skip senza danneggiare lo stato esistente. |
| Cutoff 16:00 hard-coded può essere errato per l'utente | Esporre `tonightCutoffHour` in Settings (default 16). |

## Migration Plan

1. Generare migration Drizzle, applicare
2. Implementare il seed Besozzo 2026 idempotente
3. Implementare l'expander con test unit (verificare le date di gennaio del PDF)
4. Implementare router e endpoint
5. Implementare ICS importer (opzionale, può essere skip se l'utente non lo configura)
6. Implementare WasteTile home + Settings UI
7. Aggiungere exceptions seed per le festività italiane 2026 (quelle estratte dal PDF: 23/12, 26/12, 29/4)
8. Test end-to-end: aprire il calendario di gennaio nella UI, verificare che le date matchino il PDF

**Rollback**: revert commit. Tabelle restano nel DB inutilizzate.

## Open Questions

1. **Aggiungere seed di tutte le festività italiane 2026 e 2027 come exceptions placeholder?** Risparmierebbe lavoro all'utente. — *Proposta*: solo le 3 confermate dal PDF Besozzo (23/12, 26/12, 29/4). Le altre vengono aggiunte se necessario in futuro.
2. **Notifica vocale automatica la sera alle 19:30?** Sarebbe utile come reminder. — *Proposta*: vive nella change `add-voice-control` futura come "routine serale".
3. **Pannolini (sacchi rossi)**: il PDF dice che è opt-in. Inserire come tipo seed disattivato di default? — *Proposta*: sì, lo aggiungo come 7° tipo con `active = false`.
4. **Sostituzione articoli italiani per il voice text**: lista hard-coded vs config in DB? — *Proposta*: hard-coded per i 6 seed, fallback "il" per i custom, l'utente può fare PR per estensioni linguistiche.
