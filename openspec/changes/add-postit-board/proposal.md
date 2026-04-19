## Why

L'utente vuole una "bacheca con post-it appesi al frigo" virtuale: appunti veloci, cose volatili, "ricordati di chiamare la nonna", "Wi-Fi guest: casa123", "Carta di credito scade a giugno". Devono essere visibili da chiunque in casa, draggabili sul canvas come pezzi di carta su un sughero (no griglia rigida), e modificabili al tocco.

Il livello di "minimalismo" del post-it è esplicito dell'utente: solo titolo + corpo + colore. Niente assignee, niente checklist, niente scadenze. È un appunto, non un task tracker.

## What Changes

- Modello dati `postits` con: `id`, `title`, `body`, `color` (uno della palette accent del design system), `posX`, `posY` (coordinate normalizzate 0-1 su canvas), `rotation` (gradi -8/+8 random per "carta vera"), `zIndex` (per layering), `createdAt`, `updatedAt`
- Una sola bacheca **condivisa** dalla famiglia (no per-user). Tutti modificano lo stesso canvas.
- CRUD backend `/api/v1/postits` con persistenza posizioni
- Pagina `BoardPage` come canvas fullscreen (su iPad usa quasi tutta la schermata, su iPhone scroll verticale con trasformazione layout)
- Drag&drop libero implementato con Framer Motion `drag` constrained al canvas. Al rilascio chiama `PATCH /:id` con le nuove coordinate (debounced)
- Tap su un post-it apre l'editor in-place (modal o overlay che contiene il post-it ingrandito + form titolo + textarea corpo + color picker)
- Bottone "+" floating action button per creare un nuovo post-it (appare al centro, l'utente lo trascina dove vuole)
- Tile home "Bacheca" che mostra count + preview dei top 3 post-it più recenti
- Voice-ready: `POST /api/v1/postits/by-natural-language` con `{ "text": "ricordami di comprare il regalo di compleanno" }` → crea post-it con titolo intelligente

## Capabilities

### New Capabilities

- `postit-board`: schema, CRUD, canvas drag&drop, editor in-place, tile home

### Modified Capabilities

- `app-shell`: la tab "Bacheca" passa da placeholder a `BoardPage` reale

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — `postits`
- `apps/api/src/routes/postits.ts`
- `packages/shared/src/postits.ts` — `Postit`, `CreatePostitInput`, `UpdatePostitInput`
- `apps/mobile/src/pages/BoardPage.tsx`
- `apps/mobile/src/components/board/` — `Postit`, `PostitEditor`, `BoardCanvas`, `ColorPicker`
- `apps/mobile/src/components/home-tiles/BoardTile.tsx`
- `apps/mobile/src/lib/hooks/usePostits.ts`
- `apps/mobile/src/locales/it/board.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router postits
- `apps/mobile/src/router.tsx` — `/board` punta a `BoardPage` reale
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `<BoardTile />`

**Dipendenze**: nessuna nuova (Framer Motion già presente).

**Migration**: nuova tabella, niente da migrare.

**Nessun breaking change**.
