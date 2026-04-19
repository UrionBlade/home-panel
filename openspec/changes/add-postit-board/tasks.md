## 1. Schema e migration

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` la tabella `postits` con tutti i campi e i CHECK
- [x] 1.2 Generare e applicare la migration

## 2. Tipi condivisi

- [x] 2.1 Creare `packages/shared/src/postits.ts` con `Postit`, `PostitColor` (union), `CreatePostitInput`, `UpdatePostitInput`
- [x] 2.2 Esportare le 6 stringhe di colore come `POSTIT_COLORS = ['amber', 'terracotta', 'sage', 'sand', 'mauve', 'ochre'] as const`

## 3. Backend: router

- [x] 3.1 Creare `apps/api/src/routes/postits.ts` con CRUD
- [x] 3.2 `GET /` restituisce tutti i post-it ordinati per `zIndex ASC`
- [x] 3.3 `POST /` con random rotation -8/+8, posX=posY=0.5, zIndex auto-incremental
- [x] 3.4 Validation: almeno uno tra title/body, color tra i 6 validi
- [x] 3.5 `PATCH /:id` con clamp coordinate 0-1 e merge fields
- [x] 3.6 `DELETE /:id`
- [x] 3.7 `POST /:id/bring-to-front` con `max(zIndex) + 1`
- [x] 3.8 `POST /by-natural-language` con extraction title intelligente
- [x] 3.9 Registrare router in `apps/api/src/index.ts`

## 4. Frontend: hook

- [x] 4.1 Creare `apps/mobile/src/lib/hooks/usePostits.ts` con `usePostits()`, `useCreatePostit()`, `useUpdatePostit()` (debounced opzionalmente), `useDeletePostit()`, `useBringToFront()`
- [x] 4.2 QueryKey `['postits']`
- [x] 4.3 Optimistic update per drag (così il post-it segue il dito senza lag)

## 5. Frontend: componenti board

- [x] 5.1 Creare `apps/mobile/src/components/board/PostitCard.tsx` (pure visualizzazione: sfondo color, titolo Fraunces medio, body sans corpo, padding generoso, ombra tinted warm)
- [x] 5.2 Creare `apps/mobile/src/components/board/PostitDraggable.tsx` con `motion.div drag` + dragConstraints + whileDrag/whileHover
- [x] 5.3 Creare `apps/mobile/src/components/board/BoardCanvas.tsx` come container con sfondo texture + ref per dragConstraints + render dei `PostitDraggable`
- [x] 5.4 Creare `apps/mobile/src/components/board/PostitEditor.tsx` come overlay modal con form titolo + textarea body + ColorPicker + bottoni Elimina/Fatto
- [x] 5.5 Creare `apps/mobile/src/components/board/ColorPicker.tsx` con i 6 pallini cliccabili con label tooltip
- [x] 5.6 Creare `apps/mobile/src/components/board/EmptyBoardState.tsx`
- [x] 5.7 Creare `apps/mobile/src/components/board/AddPostitFAB.tsx`

## 6. Frontend: pagina e tile

- [x] 6.1 Creare `apps/mobile/src/pages/BoardPage.tsx` con BoardCanvas + AddPostitFAB + gestione editor open/close
- [x] 6.2 Aggiornare `router.tsx` per `/board`
- [x] 6.3 Creare `apps/mobile/src/components/home-tiles/BoardTile.tsx` con count + stack 3 preview rotated + tap → /board
- [x] 6.4 Aggiornare `HomePage.tsx` per includere `<BoardTile />`

## 7. i18n

- [x] 7.1 Creare `apps/mobile/src/locales/it/board.json` con stringhe (titoli, placeholders, conferma elimina, color names)

## 8. Validazione

- [x] 8.1 `pnpm typecheck && pnpm lint` verde
- [ ] 8.2 Test: creare 5 post-it via UI, trascinarli in posizioni diverse, ricaricare la pagina, verificare che le posizioni siano persistite
- [ ] 8.3 Test: tap su post-it apre editor, modifica colore, salva, verifica
- [ ] 8.4 Test: bring-to-front al tap (post-it sotto altri va in cima)
- [ ] 8.5 Test: empty state quando si cancellano tutti i post-it
- [ ] 8.6 Test: by-natural-language con `curl -X POST .../by-natural-language -d '{"text":"comprare pane"}'` e con un testo lungo
- [ ] 8.7 Test multi-device: creare un post-it su iPad, refetch su iPhone, vedere la sincronizzazione
- [ ] 8.8 Test reduced motion: drag senza animazione enfatica
- [ ] 8.9 `openspec validate add-postit-board` verde
