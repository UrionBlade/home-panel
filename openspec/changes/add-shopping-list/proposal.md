## Why

Una lista della spesa centralizzata e accessibile in cucina (sull'iPad a parete) e fuori casa (sull'iPhone) è la feature più richiesta dall'utente per il day-to-day domestico. Il vecchio `home-panel` ha già un'implementazione validata di questo dominio (vedi `home-panel/src/components/organisms/ShoppingList.tsx` con audit log + autocomplete + categorie + unità) ed è il punto di partenza naturale. Va riscritta su SQLite + Hono invece di Supabase, ma il modello dati e l'UX vincente sono già pronti da copiare.

Inoltre questa è la prima feature verticale dopo la foundation: serve a validare che AppShell, design system, primitive UI, api-client e Settings → Famiglia funzionino davvero con un dominio reale.

## What Changes

- Modello dati `shopping_items` con `name`, `quantity`, `unit`, `category`, `completed`, `addedAt`, `addedBy` (riferimento opzionale a un `family_member`), `audit_log` JSON (tracciamento di ogni mutazione)
- CRUD backend completo `/api/v1/shopping/items` (list, create, update, complete, delete) + endpoint `/categories` e `/units` che restituiscono i preset
- Catalogo prodotti `product_catalog` con suggerimenti tipici (latte, pane, mele, ecc.) categorizzati e con `default_unit`. Pre-popolato da seed iniziale ispirato al catalogo del vecchio home-panel.
- UI pagina Spesa: form di aggiunta con autocomplete prodotto + quantità + unità + categoria, lista raggruppata per categoria, sezione "completati" collassabile, swipe-to-delete su iOS, animazioni di transizione
- Tile home "Spesa" che mostra count items attivi + prime 3 voci, click → apre la pagina Spesa
- Hook di dominio `useShoppingList()` con TanStack Query (list, add, toggle, delete, mutazioni ottimistiche)
- Predisposizione **voice-ready**: l'API espone metodi semplici e idempotenti che la change `add-voice-control` userà direttamente per "aggiungi X alla spesa", "rimuovi X", "leggi la spesa"

## Capabilities

### New Capabilities

- `shopping-list`: schema, CRUD backend, UI pagina Spesa, tile home, hook di dominio, catalogo prodotti

### Modified Capabilities

- `app-shell`: la tab "Spesa" passa da placeholder a contenuto reale (delta minimo, vedi spec)

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — tabelle `shopping_items` + `product_catalog`
- `apps/api/src/db/seed-products.ts` — seed iniziale del catalogo
- `apps/api/src/routes/shopping.ts` — router CRUD
- `packages/shared/src/shopping.ts` — tipi `ShoppingItem`, `Category`, `Unit`, `Product`, `CreateShoppingItemInput`, `AuditEntry`
- `apps/mobile/src/pages/ShoppingPage.tsx`
- `apps/mobile/src/components/shopping/` — `ShoppingForm`, `ShoppingItem`, `ProductAutocomplete`, `CategoryGroup`
- `apps/mobile/src/components/home-tiles/ShoppingTile.tsx`
- `apps/mobile/src/lib/hooks/useShoppingList.ts`
- `apps/mobile/src/locales/it/shopping.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router shopping
- `apps/mobile/src/router.tsx` — la route `/shopping` punta a `ShoppingPage` invece del placeholder
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `ShoppingTile` nel mosaico
- `packages/shared/src/index.ts` — esporta `shopping.ts`

**Dipendenze**: nessuna nuova significativa (riusa @tanstack/react-query, framer-motion, phosphor icons già presenti dalla foundation).

**Migration**: nuova tabella, niente da migrare. Seed catalogo prodotti idempotente.

**Nessun breaking change**.
