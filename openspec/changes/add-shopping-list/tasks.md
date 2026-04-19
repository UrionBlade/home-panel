## 1. Schema e migration

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` la tabella `shopping_items` (id, name, quantity, unit, category, completed, addedAt, addedBy, auditLog) con FK opzionale a `family_members`
- [x] 1.2 Aggiungere a `apps/api/src/db/schema.ts` la tabella `product_catalog` (id, name UNIQUE COLLATE NOCASE, category, defaultUnit) + indice prefix
- [x] 1.3 `pnpm --filter @home-panel/api db:generate` per creare la migration
- [x] 1.4 `pnpm --filter @home-panel/api db:migrate` per applicarla localmente
- [x] 1.5 Verificare con `sqlite3` che le tabelle esistano

## 2. Seed catalogo prodotti

- [x] 2.1 Creare `apps/api/src/db/seed-products.ts` con un array di almeno 80 prodotti italiani comuni (latte, pane, pasta, riso, uova, ecc.) con categoria + unit di default
- [x] 2.2 Implementare la funzione `seedProductCatalog(db)` idempotente: inserisce solo se la tabella è vuota
- [x] 2.3 Chiamare `seedProductCatalog` all'avvio del backend (`apps/api/src/index.ts`)
- [x] 2.4 Test: avviare il backend, verificare che `GET /api/v1/shopping/products` restituisca i prodotti seed

## 3. Tipi condivisi

- [x] 3.1 Creare `packages/shared/src/shopping.ts` con i tipi `ShoppingItem`, `Category`, `Unit`, `Product`, `CreateShoppingItemInput`, `UpdateShoppingItemInput`, `AuditEntry`
- [x] 3.2 Definire le costanti `CATEGORIES` e `UNITS` come tuple `as const` per type safety
- [x] 3.3 Esportare da `packages/shared/src/index.ts`

## 4. Backend: router CRUD

- [x] 4.1 Creare `apps/api/src/routes/shopping.ts` con sub-router per `/items`, `/categories`, `/units`, `/products`
- [x] 4.2 Implementare `GET /items` con ordinamento `completed ASC, added_at DESC`
- [x] 4.3 Implementare `POST /items` con validazione (`name` obbligatorio non vuoto, `category` ∈ CATEGORIES, `unit` ∈ UNITS) e popolamento `auditLog` iniziale
- [x] 4.4 Implementare `PATCH /items/:id` con merge dei campi mutabili e append all'audit log con `diff`
- [x] 4.5 Implementare `DELETE /items/:id` (hard delete)
- [x] 4.6 Implementare `GET /categories` (lista statica delle categorie)
- [x] 4.7 Implementare `GET /units` (lista statica delle unit)
- [x] 4.8 Implementare `GET /products?q=<query>` con prefix match + top 8 risultati
- [x] 4.9 Cleanup auto dell'audit log a 20 entry per item su `PATCH`
- [x] 4.10 Test manuale via curl di tutti gli endpoint con e senza Bearer token

## 5. Backend: rotte by-name (voice-ready)

- [x] 5.1 Implementare matcher `findItemByName(name, items)` con fallback exact → prefix → fuzzy levenshtein ≤ 2
- [x] 5.2 Implementare matcher `findProductByName(name)` per il catalogo (stessa logica)
- [x] 5.3 Implementare `POST /items/by-name` che cerca il prodotto nel catalogo e lo aggiunge con i default
- [x] 5.4 Implementare `POST /items/complete-by-name` che cerca un item attivo e lo completa
- [x] 5.5 Implementare `DELETE /items/by-name?name=<name>` che cerca un item attivo e lo elimina
- [x] 5.6 Test: aggiungere "latte" via by-name, verificare che category/unit siano popolati dal catalogo
- [x] 5.7 Test: ambiguità (es. "p" → 404 con suggerimenti)

## 6. Frontend: hook di dominio

- [x] 6.1 Creare `apps/mobile/src/lib/hooks/useShoppingList.ts` con TanStack Query
- [x] 6.2 Esporre `useShoppingItems()` (query), `useAddItem()`, `useToggleItem()` (con optimistic update + rollback), `useDeleteItem()`, `useUpdateItem()`
- [x] 6.3 Esporre `useShoppingProducts(query)` per autocomplete, `useShoppingCategories()`, `useShoppingUnits()`
- [x] 6.4 Tutti gli hook usano `apiClient` (definito nella foundation) e queryKey `['shopping', ...]`

## 7. Frontend: UI componenti

- [x] 7.1 Creare `apps/mobile/src/components/shopping/ProductAutocomplete.tsx` con dropdown debounced (300ms) basato su `useShoppingProducts`
- [x] 7.2 Creare `apps/mobile/src/components/shopping/ShoppingForm.tsx` con autocomplete + quantity + unit Select + category Select + bottone Aggiungi (usa `useAddItem`)
- [x] 7.3 Creare `apps/mobile/src/components/shopping/ShoppingItemCard.tsx` con checkbox completed, quantity+unit+name, bottone delete, swipe gestures Framer Motion
- [x] 7.4 Creare `apps/mobile/src/components/shopping/CategoryGroup.tsx` per raggruppare item per categoria con header (icona Phosphor + label i18n)
- [x] 7.5 Creare `apps/mobile/src/components/shopping/CompletedSection.tsx` collassabile con animazione di expand/collapse via Framer Motion grid-template-rows
- [x] 7.6 Creare `apps/mobile/src/components/shopping/EmptyState.tsx` con icona BasketIcon XL + messaggio italiano
- [x] 7.7 Verificare touch target 56pt+ su tutti gli interattivi

## 8. Frontend: pagina e tile home

- [x] 8.1 Creare `apps/mobile/src/pages/ShoppingPage.tsx` con header (titolo + count attivi), `ShoppingForm`, lista raggruppata, sezione completati
- [x] 8.2 Creare `apps/mobile/src/components/home-tiles/ShoppingTile.tsx` con count grande in Fraunces + lista preview top 5 + tap → `/shopping`
- [x] 8.3 Aggiornare `apps/mobile/src/router.tsx` per puntare la route `/shopping` a `ShoppingPage`
- [x] 8.4 Aggiornare `apps/mobile/src/pages/HomePage.tsx` per includere `<ShoppingTile />` nel mosaico
- [x] 8.5 Aggiornare `apps/mobile/src/components/layout/TabBar.tsx` per evidenziare la tab Spesa quando attiva (era già nel mosaico ma puntava al placeholder)

## 9. i18n

- [x] 9.1 Creare `apps/mobile/src/locales/it/shopping.json` con tutte le stringhe (titolo, label form, nomi categorie, nomi unit, empty state, count, conferme)
- [x] 9.2 Verificare che `useT('shopping')` sia type-safe su tutte le chiavi

## 10. Validazione end-to-end

- [x] 10.1 `pnpm typecheck && pnpm lint` verde
- [x] 10.2 Test manuale: aggiungere 5 item da UI, completarne 2, eliminarne 1, verificare persistenza nel SQLite
- [x] 10.3 Test multi-device: aggiungere item da iPad, verificare che appaia su iPhone (via Tailscale)
- [x] 10.4 Test by-name: `curl -X POST .../api/v1/shopping/items/by-name -d '{"name":"latte"}'` con token, verificare popolamento default
- [x] 10.5 Test offline: spegnere la rete, aggiungere un item, riaccendere, verificare che la mutation arrivi (TanStack Query retry)
- [x] 10.6 Test reduced motion: attivare `prefers-reduced-motion`, verificare che le animazioni siano minimali
- [x] 10.7 Test empty state: lista vuota mostra l'illustrazione corretta
- [x] 10.8 `openspec validate add-shopping-list` verde
