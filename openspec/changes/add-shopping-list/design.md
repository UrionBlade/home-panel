## Context

Prima feature verticale post-foundation. Tutti gli elementi base esistono già: AppShell, design system, tab bar, primitive UI, api-client con bearer token, TanStack Query setup, i18n con namespace. Questa change consuma quell'infrastruttura per validare che funzioni con un dominio reale.

Il vecchio `home-panel` ha già un'implementazione di shopping list molto curata (Supabase + React + autocomplete prodotti + audit log + categorie + unità). Riutilizziamo il **modello concettuale** ma riscriviamo l'integrazione dato che:
- Il nuovo backend è Hono + SQLite, non Supabase
- I tipi sono in `@home-panel/shared` per condivisione end-to-end
- L'UI usa il nuovo design system, non quello vecchio
- Le API sono progettate sin dall'inizio per essere voice-control friendly

## Goals / Non-Goals

### Goals

1. Lista spesa unica condivisa, persistente su SQLite del Synology, sincronizzata tra iPad e iPhone
2. CRUD completo via API + UI con UX moderna (autocomplete, swipe-to-delete iOS, ottimistic updates)
3. Catalogo prodotti pre-popolato per autocomplete intelligente (latte → categoria dairy + unit l)
4. Audit log per tracciare ogni mutazione (chi, quando, cosa è cambiato)
5. Tile in home con count + preview
6. API "by-name" per voice control futuro

### Non-Goals

- **Niente liste multiple** (Esselunga vs OBI vs farmacia). L'utente ha esplicitamente scelto lista unica.
- **Niente smart sort per corsia di supermercato**. Solo raggruppamento per categoria.
- **Niente storico spese** (statistiche, "quante volte hai comprato latte ultimo mese"). Audit log esiste solo per debug, non per analytics utente.
- **Niente integrazione voice** in questa change. L'API è solo *predisposta*. La vera integrazione vive in `add-voice-control`.
- **Niente upload foto prodotti**. Le icone delle categorie bastano.
- **Niente prezzi / budget tracking**.

## Decisions

### D1. Schema con `audit_log` come JSON column

**Decisione**: salvare l'audit log come campo JSON SQLite (`text` con parsing JSON) sulla riga stessa, non su tabella separata.

```sql
CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '1',
  unit TEXT NOT NULL DEFAULT 'pz',
  category TEXT NOT NULL DEFAULT 'other',
  completed INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  added_by TEXT,                              -- nullable FK family_members.id
  audit_log TEXT NOT NULL DEFAULT '[]',       -- JSON array
  FOREIGN KEY (added_by) REFERENCES family_members(id) ON DELETE SET NULL
);
```

**Alternative considerate**:
- *Tabella separata `shopping_audit_logs`*: più normalizzato ma 10x query e join, e l'audit log ha vita breve (lo guardiamo solo per debug).
- *Niente audit log*: meno overhead, ma perdiamo visibilità.

**Rationale**: SQLite gestisce JSON nativamente con `json()`, l'audit log è per definizione "subordinato" al record (non vive senza), e non servono query analytiche.

### D2. Catalogo prodotti come tabella seed-only

**Decisione**: `product_catalog` è una tabella semplice popolata da uno script di seed all'avvio del backend (solo se vuota — idempotente). L'utente non gestisce mai i prodotti del catalogo direttamente. Sono solo suggerimenti per l'autocomplete.

```sql
CREATE TABLE product_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL,
  default_unit TEXT NOT NULL DEFAULT 'pz'
);
CREATE INDEX idx_product_catalog_name ON product_catalog(name COLLATE NOCASE);
```

Il seed iniziale contiene almeno 80 prodotti italiani comuni: latte, pane, pasta, riso, uova, burro, olio EVO, sale, zucchero, caffè, mele, banane, pomodori, insalata, ecc. La lista finale viene definita nel file `apps/api/src/db/seed-products.ts`.

**Alternative considerate**:
- *Catalogo modificabile dall'utente*: aggiunge UI complessa per zero valore (l'utente vuole comprare cose, non gestire un database).
- *Catalogo da API esterna* (es. OpenFoodFacts): overkill, latenze, dipendenza esterna.

**Rationale**: il catalogo è una pura "knowledge base" interna che evolve solo nel codice via PR.

### D3. Rotte "by-name" per voice control

**Decisione**: oltre alle rotte CRUD standard (`/items`, `/items/:id`), il backend espone tre rotte "by-name" che operano per nome stringa invece di id:
- `POST /items/by-name` `{ "name": "latte" }` — aggiunge usando i default del catalogo
- `POST /items/complete-by-name` `{ "name": "latte" }` — completa il primo match attivo
- `DELETE /items/by-name?name=latte` — rimuove il primo match attivo

Queste rotte usano un matcher case-insensitive con due livelli di fallback:
1. Match esatto sul `name` (case-insensitive)
2. Se nessun match: prefix match
3. Se ancora nessun match: fuzzy con `levenshtein` (distanza ≤ 2)

**Alternative considerate**:
- *Tutto via id*: il voice dovrebbe prima cercare l'item, poi chiamare la mutation. Più chiamate, più attrito.
- *Endpoint search separato* + chiamate id: idem.

**Rationale**: il voice ha bisogno di latenza minima e zero round-trip. Le rotte by-name sono ottimizzate per quello caso.

### D4. UI con TanStack Query + ottimistic updates

**Decisione**: tutte le mutation usano `useMutation` con `onMutate` per ottimistic update e rollback `onError`. Questo fa sembrare l'app istantanea anche con latenza di rete (importante per iPhone fuori casa via Tailscale).

Esempio:
```ts
const toggleMutation = useMutation({
  mutationFn: (item: ShoppingItem) =>
    apiClient.patch(`/api/v1/shopping/items/${item.id}`, { completed: !item.completed }),
  onMutate: async (item) => {
    await queryClient.cancelQueries({ queryKey: ["shopping"] });
    const prev = queryClient.getQueryData<ShoppingItem[]>(["shopping"]);
    queryClient.setQueryData<ShoppingItem[]>(["shopping"], (old) =>
      old?.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i)
    );
    return { prev };
  },
  onError: (_err, _item, ctx) => {
    if (ctx?.prev) queryClient.setQueryData(["shopping"], ctx.prev);
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["shopping"] }),
});
```

### D5. Swipe-to-delete con Framer Motion + drag controls

**Decisione**: implementare lo swipe gestures con Framer Motion `drag="x"` + `dragConstraints` invece di librerie dedicate (`react-swipeable`, `swiper`). Framer Motion è già installato dalla foundation, ha API ergonomica e supporta nativamente reduced-motion.

**Alternative considerate**:
- *react-swipeable*: dipendenza extra, meno controllo sull'animazione.
- *Touch handler manuali*: più codice, più bug.

### D6. Tile home come componente registrabile

**Decisione**: la tile "Spesa" è un componente in `apps/mobile/src/components/home-tiles/ShoppingTile.tsx` che il `HomeMosaic` (definito nella foundation) include nel layout. Future change potranno aggiungere altre tile semplicemente registrando un nuovo componente nella stessa cartella.

Il pattern è: ogni feature verticale possiede la propria tile e la registra nel mosaico, mantenendo l'home modulare.

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Audit log JSON cresce indefinitamente nella riga | Cleanup periodico (es. mantenere solo le ultime 20 entry per item). Implementato come job lato backend o cleanup on-write se l'array > 20. |
| Match fuzzy "by-name" può essere ambiguo (es. "panna" vs "pane") | Restituire 404 con suggerimenti se l'ambiguità è alta (distanza levenshtein simile per più match). Lo voice handler chiederà disambiguazione. |
| Catalogo prodotti italiano monolingua | OK per ora, l'app è italiana. Quando arriverà l'inglese, il catalogo passerà a `name_it` / `name_en`. |
| Swipe gestures su Framer Motion possono interferire con scroll iOS | Test approfondito su simulator + device. Fallback: bottoni "Elimina" / "Completa" sempre visibili come alternativa. |
| TanStack Query optimistic update può divergere dal server in caso di concorrenza | `invalidateQueries` su `onSettled` riallinea sempre alla truth del server. La race window è di pochi ms. |

## Migration Plan

1. Generare migration Drizzle per `shopping_items` + `product_catalog`
2. Applicare migration localmente, eseguire seed del catalogo prodotti
3. Implementare router backend, testare con curl
4. Implementare hook + UI mobile, testare in browser
5. Test su device iOS via Tauri
6. Commit atomico
7. Deploy del nuovo backend su Synology (rebuild docker compose)
8. Verificare che il vecchio backend in dev non abbia data conflicts (è un nuovo schema, non c'è migration di dati)

**Rollback**: revert del commit. La nuova tabella resta nel DB ma è inutilizzata; oppure drop manuale se necessario.

## Open Questions

1. **Soglia di troncamento audit log**: 20 entry per item è un guess. Verificare empiricamente dopo qualche settimana di uso.
2. **Catalogo prodotti definitivo**: quali 80 prodotti seed? Estrarre dalla mia esperienza italiana + verificare con l'utente che corrispondano alla sua tipica spesa.
3. **Empty state illustrazione**: usare un'icona Phosphor grande o un'illustrazione SVG custom? Per ora icona Phosphor `BasketIcon` size XL, valutiamo upgrade a illustrazione con `polish` skill in implementazione.
