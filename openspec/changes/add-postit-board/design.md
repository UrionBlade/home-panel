## Context

I post-it sono una feature emotiva: devono "sentirsi" come pezzi di carta su un sughero, non come righe di una tabella. Il drag libero e la rotazione casuale sono cruciali per questo. L'utente ha esplicitamente richiesto solo titolo + corpo + colore, niente assignee/scadenze/checklist — è un fast capture, non un task manager.

La tile in home deve dare un colpo d'occhio sulla "vita attuale" della famiglia: "ah, ci sono 5 cose appese". Il livello di interazione richiesto è molto alto (drag&drop, tap to edit, FAB, color picker), quindi serve grande cura sui micro-dettagli e sulle animazioni meditative descritte in `.impeccable.md`.

## Goals / Non-Goals

### Goals

1. Canvas fullscreen con drag&drop libero e fluido
2. Post-it rotated random per simulare carta vera
3. Editor in-place con overlay elegante
4. Sync persistenza posizioni tra device della tailnet
5. Tile home con preview stack
6. Voice creation con estrazione titolo intelligente

### Non-Goals

- **Niente assignee/multi-utente**. Bacheca condivisa, no permission.
- **Niente checklist** dentro al post-it.
- **Niente scadenze** o reminder.
- **Niente immagini/allegati**. Solo testo.
- **Niente tag/categorie**.
- **Niente storico modifiche** (audit log).
- **Niente undo/redo**.
- **Niente collaborative editing realtime** (websocket). L'utente avvia la modifica e l'altro device vede il cambiamento al prossimo refetch (TanStack Query con polling o invalidate manuale).

## Decisions

### D1. Schema semplice

```sql
CREATE TABLE postits (
  id TEXT PRIMARY KEY,
  title TEXT,
  body TEXT,
  color TEXT NOT NULL CHECK (color IN ('amber', 'terracotta', 'sage', 'sand', 'mauve', 'ochre')),
  pos_x REAL NOT NULL DEFAULT 0.5,
  pos_y REAL NOT NULL DEFAULT 0.5,
  rotation REAL NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CHECK (title IS NOT NULL OR body IS NOT NULL),
  CHECK (pos_x BETWEEN 0 AND 1),
  CHECK (pos_y BETWEEN 0 AND 1)
);
```

Vincolo CHECK assicura che almeno uno tra title e body sia presente. Coordinate sono normalizzate 0-1 per essere indipendenti dalla risoluzione del device.

### D2. Coordinate normalizzate 0-1

**Decisione**: salvare `posX` e `posY` come float 0-1 invece di pixel assoluti. Il client converte in pixel basandosi sulla dimensione corrente del canvas.

**Rationale**:
- Lo stesso post-it sembra "nello stesso posto" anche se la dimensione del canvas cambia (iPad vs iPhone)
- Niente rounding errors da risoluzione
- Più semplice da serializzare

**Conversione client**:
```ts
const xPx = postit.posX * canvasWidth - postitWidth / 2;
const yPx = postit.posY * canvasHeight - postitHeight / 2;
```

### D3. Drag&drop con Framer Motion drag

**Decisione**: usare `<motion.div drag dragConstraints={canvasRef} dragMomentum={false}>` di Framer Motion. Il `dragConstraints` ref a un container assicura che il drag sia limitato all'area del canvas.

**Implementazione**:
```tsx
function PostitItem({ postit, canvasRef }) {
  const updateMutation = useUpdatePostit();

  return (
    <motion.div
      drag
      dragConstraints={canvasRef}
      dragMomentum={false}
      initial={false}
      animate={{
        x: postit.posX * canvasWidth - 100,
        y: postit.posY * canvasHeight - 100,
      }}
      whileDrag={{ scale: 1.05, boxShadow: SHADOW_LARGE }}
      whileHover={{ scale: 1.02 }}
      style={{ rotate: postit.rotation, zIndex: postit.zIndex }}
      onDragEnd={(_, info) => {
        const newX = (info.point.x + 100) / canvasWidth;
        const newY = (info.point.y + 100) / canvasHeight;
        updateMutation.mutate({ id: postit.id, posX: clamp(newX), posY: clamp(newY) });
      }}
    >
      <PostitCard postit={postit} />
    </motion.div>
  );
}
```

### D4. Rotation random alla creazione

**Decisione**: backend assegna `rotation = random(-8, 8)` alla creazione. Il valore è stabile per l'intera vita del post-it (no re-randomizzazione). Questo dà la sensazione di "ogni post-it è messo a mano".

### D5. zIndex incrementale

**Decisione**: ogni post-it ha uno `zIndex` intero. Alla creazione viene assegnato `max(zIndex) + 1`. Su tap viene chiamato `bring-to-front` che fa lo stesso. Niente compaction (i numeri possono crescere indefinitamente, ma non importa).

### D6. Editor come overlay con stessa palette

**Decisione**: l'editor è un `<motion.div>` overlay (non una pagina separata) che appare sopra il canvas con backdrop blur leggero. Il post-it ingrandito sta al centro, e il form di modifica è sopra/sotto a seconda di iPad vs iPhone. Lo stesso colore del post-it viene usato come accent dell'editor stesso (titolo input bordo del colore, ecc.) per coerenza visiva.

### D7. Voice "by-natural-language" estrazione titolo

**Decisione**: il backend implementa una semplice euristica:
- Se il testo è ≤ 30 caratteri → tutto come `title`, `body = null`
- Altrimenti → prima frase (fino al primo punto) come `title` (clamped a 30 char), tutto il testo come `body`
- Rimuove parole filler iniziali come "ricordami di", "nota:", "appunto:" dal titolo

```ts
function extractTitle(text: string): { title: string; body: string | null } {
  const cleaned = text.replace(/^(ricordami di|nota:|appunto:)\s*/i, '');
  if (cleaned.length <= 30) return { title: cleaned, body: null };
  const firstSentence = cleaned.split(/[.!?]/)[0].slice(0, 30);
  return { title: firstSentence, body: text };
}
```

### D8. Texture sfondo canvas

**Decisione**: lo sfondo del canvas è un piccolo SVG pattern ripetuto (linee tratteggiate molto sottili o puntini) tinted warm. Implementato come `background: url(...)` o `background-image: radial-gradient(...)` molto leggero. Niente immagine grande.

```css
.board-canvas {
  background-color: var(--color-surface);
  background-image: radial-gradient(circle, oklch(50% 0.02 60 / 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Drag su iPhone con scroll del browser può confliggere | Canvas con `touch-action: none` durante il drag |
| Conflict di posizione se due device editano contemporaneamente | "Last write wins" — semplice, accettabile per uso domestico |
| zIndex può crescere indefinitamente | OK, integer sqlite = 8 byte, infinitamente espandibile per uso domestico |
| Drag libero può portare i post-it fuori dal canvas | `dragConstraints` di Framer Motion previene + coordinate clampate dal backend |
| Il vincolo CHECK su almeno uno tra title/body può essere bypassato da PATCH | PATCH validation lato Hono assicura che dopo merge resti almeno uno valido |
| Voice extraction è naive | Per ora basta. L'utente può sempre editare il post-it dopo. |

## Migration Plan

1. Schema + migration
2. Router CRUD + validation + bring-to-front
3. By-natural-language extraction
4. Hook + componenti UI
5. Test su iPad simulator (drag funziona?)
6. Tile home

**Rollback**: revert. Tabella postits inutilizzata.

## Open Questions

1. **Polling per sync multi-device**: TanStack Query con `refetchInterval: 30s` o solo on-focus? — *Proposta*: solo on-focus + invalidate al return alla pagina. La latenza non è critica per i post-it.
2. **Drag fluido a 60fps**: testarlo su iPad Pro 2-3 gen, dovrebbe essere ok ma da verificare con 20+ post-it.
3. **Stack di preview nella tile home**: 3 post-it impilati con offset mostrano davvero qualcosa di leggibile? — *Proposta*: mostriamo solo i titoli, no body.
