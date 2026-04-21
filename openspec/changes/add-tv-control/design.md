## Context

L'integrazione SmartThings esiste già nel repo (lavatrice + asciugatrice, `apps/api/src/routes/laundry.ts`). È stata scritta prima dell'adozione OpenSpec e non ha uno spec file dedicato: PAT condiviso (`SMARTTHINGS_PAT` in `.env` oppure `smartthings_config.pat` in DB via Settings UI), helper HTTP inline (`stFetch`/`stPost`), polling cache 30s solo per gli appliance laundry, detect type basato su capability.

Il discovery live ha confermato che la Samsung Q6 espone 24 capability tra cui tutte quelle che ci servono. Punti rilevanti:

- **`samsungvd.supportsPowerOnByOcf: true`** → la TV può essere accesa via cloud anche da spenta (dipende da impostazione "Network Standby" / "Remote Connection" in TV; va verificato sul device reale).
- **`supportedInputSources: ["digitalTv", "HDMI2"]`** → solo gli input effettivamente connessi sono riportati. La lista si aggiorna dinamicamente se l'utente collega altre HDMI.
- **Status con timestamp molto vecchi (2019-2022)** su vari campi → il cloud mantiene l'ultimo valore noto anche quando la TV è offline da tempo. Status non è realtime.
- **Modello 2018, Tizen 4.0** → alcune capability recenti (ambient18, Bixby, picture modes moderni) tornano campi `null` su questo device. Ignorate in scope.
- **`custom.launchapp`** espone un `execute(command)` che accetta `{ id, name, metadata }` ma **non** elenca `supportedApps`. Il lancio di un'app inesistente non dà errore sincrono: il comando viene accettato, ma la TV non fa nulla. Unica verifica possibile è il feedback visivo sul televisore.

Questa change estende l'integrazione per coprire la TV, con un refactor minimo ma pulito del modulo SmartThings condiviso.

## Goals / Non-Goals

### Goals

1. Un endpoint REST per ogni operazione base della TV, con validazione lato server degli input (usando `supportedInputSources` e `supportedPlaybackCommands` del device).
2. Un'unica `smartthings_config` row che contiene PAT + device id per lavatrice, asciugatrice **e** TV.
3. Un client SmartThings condiviso riusabile da laundry e TV, con superficie minima (`stFetch`, `stPost`, `getConfig`, `listDevices`, `getDeviceStatus`, `sendCommands`).
4. Tile home TV con due stati visivi (off compatta / on espansa), voice intent per controlli principali, sezione Settings per il binding del device.
5. Lista app preset hardcoded + comando generico `POST /tv/app { appId }` per supportare qualsiasi package name.
6. Cache status 10s in-memory (no scheduler), refresh opportunistico su mutation (dopo ogni comando, invalida la cache).

### Non-Goals

- Nessuna gestione ambient mode, picture mode, sound mode (campi null su questo modello).
- Nessun multi-TV: schema permette un solo `tv_device_id`. Se un domani ci sono più TV si passerà a una tabella dedicata in una change successiva.
- Nessuna integrazione con altri protocolli TV (Samsung SmartView WebSocket locale, WoL raw). SmartThings è sufficiente e aggira i problemi di firewall/LAN.
- Nessuna UI per gestire la coda di riproduzione, lista canali, EPG.
- Nessun wiring concreto con l'overlay videocitofono: l'endpoint `POST /tv/playback { command: "pause" }` è sufficiente come contratto, il trigger è responsabilità di `add-blink-doorbell-interrupting`.
- Nessuna autenticazione extra: gli endpoint `/tv/*` ereditano il middleware Bearer già applicato a `/api/*`.

## Decisions

### D1. Refactor client SmartThings condiviso — ora, scope minimo

**Decisione**: estrarre in `apps/api/src/lib/smartthings/client.ts` le funzioni che oggi vivono in `routes/laundry.ts`:

```ts
// apps/api/src/lib/smartthings/client.ts
export const ST_BASE = "https://api.smartthings.com/v1";

export function getSmartThingsConfig(): SmartThingsConfigRow | undefined;
export function stHeaders(pat: string): Record<string, string>;
export async function stFetch<T>(pat: string, path: string): Promise<T>;
export async function stPost<T>(pat: string, path: string, body: unknown): Promise<T>;
export async function stListDevices(pat: string): Promise<SmartThingsDeviceRaw[]>;
export async function stGetDeviceStatus(pat: string, deviceId: string): Promise<SmartThingsDeviceStatus>;
export async function stSendCommands(
  pat: string,
  deviceId: string,
  commands: Array<{ component?: string; capability: string; command: string; arguments?: unknown[] }>,
): Promise<void>;
```

`laundry.ts` viene modificato per consumare il client. `tv.ts` lo consuma per sua volta. Niente più duplicazione né drift.

**Alternative considerate**:
- **Non refattorare ora**: duplicare helper in `routes/tv.ts`. Costo basso nell'immediato ma ogni nuova integrazione SmartThings (aspirapolvere, climatizzatore, ecc.) replica il pattern.
- **Refattorare in una change separata prima**: richiede un bounce OpenSpec-only senza valore utente, rallenta la consegna di TV senza benefici concreti.

**Motivazione**: il refactor è di ~60 righe, a zero rischio (contratto HTTP immutato), e dà immediato riuso alla TV. Lo scope è contenuto entro questa change perché non introduce capability nuove né cambia i contratti esposti da laundry.

### D2. Un'unica `smartthings_config` row, colonna `tv_device_id` aggiunta

**Decisione**: aggiungere `tv_device_id TEXT` (nullable) alla tabella esistente `smartthings_config` via drizzle migration. Il PAT resta condiviso tra tutti i device Samsung dell'utente.

**Alternative considerate**:
- **Tabella dedicata `tv_config`** — overkill per una singola riga che condivide il PAT.
- **JSON column `device_bindings`** — flessibile ma complica le query e la UI di binding.

**Motivazione**: il PAT SmartThings è un token "account-wide" per definizione. Tenere un solo posto dove leggerlo è coerente col mental model. L'estensione a un terzo device (TV) è una colonna nullable: nessun breaking change, nessun backfill.

### D3. Cache status 10s in-memory + invalidazione opportunistica

**Decisione**:

```ts
type CachedStatus = { status: TvStatus; fetchedAt: number };
let cache: CachedStatus | null = null;
const TTL_MS = 10_000;

async function getStatus(pat: string, deviceId: string, force = false): Promise<TvStatus> {
  if (!force && cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.status;
  const raw = await stGetDeviceStatus(pat, deviceId);
  const status = mapTvStatus(raw);
  cache = { status, fetchedAt: Date.now() };
  return status;
}

function invalidateCache() { cache = null; }
```

Ogni endpoint mutation (`/tv/power`, `/tv/volume`, ecc.) invoca `invalidateCache()` alla fine. Il prossimo `GET /tv/status` (tipicamente il polling del frontend dopo la mutation) riprende lo stato fresco.

**Alternative considerate**:
- **Nessuna cache, fetch on every call**: TV spente rispondono in ~800ms, rumore inutile sull'API SmartThings.
- **Cache TTL più lungo (60s)**: UX troppo stantia — se l'utente alza il volume dal telecomando, il panel lo vede dopo 1 minuto.
- **Scheduler background polling 30s**: non giustificato per una TV, consuma rate limit SmartThings per niente.

**Motivazione**: 10s è il compromesso tra reattività e riduzione chiamate, allineato con il comportamento tipico del polling TanStack Query lato frontend.

### D4. App preset hardcoded + passthrough `appId`

**Decisione**: esporre due vie parallele:

1. **Preset noti**: costante `TV_APP_PRESETS` nel backend con `{ key, label, icon, appId }[]`. Esposta al frontend via `GET /tv/apps/presets`. Usata per i 4 bottoni nella tile e nei voice intent.
2. **Passthrough**: `POST /tv/app { appId: string }` accetta qualunque package name. Permette override se il preset non funziona sul device reale e dà espandibilità senza redeploy.

La conferma dei `appId` per questo modello è un **task di implementazione**: si aprono le 4 app manualmente sulla TV, si verifica dal frontend che il comando le lanci davvero, si fissa il valore definitivo nel codice.

**Alternative considerate**:
- **Preset dinamici dalla TV** (`supportedApps`): non disponibile su questo modello (il campo torna `null`), non affidabile.
- **Solo passthrough**: UX peggiore (l'utente deve ricordarsi i package name per i bottoni).

### D5. Validazione input lato server contro le capability del device

**Decisione**: ogni mutation carica lo status del device una volta, legge `mediaInputSource.supportedInputSources` e `mediaPlayback.supportedPlaybackCommands`, e valida il body della richiesta contro quelle liste. Se il client manda un input non supportato (`HDMI3` quando la TV vede solo `HDMI2`), l'API risponde `400` con `{ error, supported: [...] }`.

**Motivazione**: evita di inviare comandi che SmartThings accetta silenziosamente senza effetto (la TV non cambia input ma nessun errore viene propagato). Errori informativi > comandi no-op.

### D6. Voice intents: modulo separato `tvIntents.ts`, registrato dal dispatcher

**Decisione**: creare `apps/mobile/src/lib/voice/tvIntents.ts` che esporta due cose:

```ts
export const tvIntentPatterns: IntentPattern[] = [ ... ]; // per il parser
export const tvIntentHandlers: Record<TvIntent, IntentHandler> = { ... }; // per il dispatcher
```

Il parser principale (`voiceCommandParser`) e il dispatcher (`intentHandlers.ts`) li importano e li aggregano con gli intent esistenti. Così una futura change può aggiungere altri handler (es. `lightIntents.ts`, `thermostatIntents.ts`) senza toccare il core.

**Alternative considerate**:
- **Aggiungere intent TV direttamente in `intentHandlers.ts`**: il file cresce all'infinito, ogni feature deve modificarlo.
- **Aggiungere intent TV allo spec `voice-commands` di `add-voice-control`**: cross-change modification che complica il merge order delle change pending.

**Motivazione**: pattern a registration permette di crescere orizzontalmente senza toccare codice esistente; è lo stesso pattern usato per i tile della home (`HomeTilesRegistry`).

### D7. Power-on dipende dall'impostazione TV "Remote Connection"

Questa TV supporta `supportsPowerOnByOcf` ma la feature funziona solo se nell'UI della TV è attiva **Impostazioni → Generali → Gestione dispositivo → Attivazione tramite rete** (o nome simile su Tizen 4.0). Documentiamo in `TvSettings` un warning "Se l'accensione remota non funziona, controlla che sulla TV sia attiva l'accensione via rete".

L'API non può rilevare questo caso in anticipo. Se `/tv/power { on: true }` non produce cambio stato entro 15s (polling post-comando), l'hook mobile mostra un toast con il suggerimento.

### D8. Error handling

| Caso | HTTP | Body |
|---|---|---|
| TV non bindata | 404 | `{ error: "TV non configurata" }` |
| PAT mancante | 400 | `{ error: "SmartThings non configurato" }` |
| SmartThings 401 | 502 | `{ error: "Token SmartThings non valido o scaduto" }` |
| SmartThings 5xx | 502 | `{ error: "SmartThings non raggiungibile", retryable: true }` |
| Input non supportato | 400 | `{ error: "Input <x> non supportato", supported: [...] }` |
| Comando non supportato | 400 | `{ error: "Comando <x> non supportato", supported: [...] }` |

Tutti gli errori sono loggati su `console.error` con prefisso `[tv]`. Nessun retry automatico lato backend: la retry è decisione del frontend (TanStack Query la gestisce).

## Risks / Trade-offs

**R1. Accensione remota non funziona sul device reale** → Mitigazione: il task di QA manuale in `tasks.md` include il test dell'accensione da spenta come primo step. Se non funziona, documentiamo la procedura di abilitazione in un `README` nella sezione Settings e nel proposal.md (aggiornato).

**R2. Lista app preset non combacia col firmware** → Mitigazione: il design prevede passthrough `appId` così che l'utente possa fornire qualsiasi package name. Primi 4 preset vengono validati sul device reale nella fase di implementazione prima della chiusura della change.

**R3. Cambio capability dopo aggiornamento firmware Samsung** → Mitigazione: la validazione lato server usa sempre il `supportedInputSources` corrente del device; nessun hardcoding. Se Samsung rimuove/rinomina capability, l'impatto è limitato alla UI (che può mostrare input non più supportati finché non refetcha il device status).

**R4. Rate limit SmartThings** → Il TTL 10s + invalidation opportunistica manteniamo <10 chiamate/minuto/TV in uso attivo. SmartThings non pubblica rate limit ufficiali ma 250 req/min/PAT è ampiamente tollerato. Non rischioso a questi volumi.

**R5. Status timestamp vecchio su TV offline** → Il client UI mostra il pallino di stato basato su `switch.switch.value`. Se la TV è fisicamente scollegata da ore, lo stato resta "off" (che è semanticamente corretto ai fini della UX). Nessuna mitigazione necessaria.

## Migration Plan

1. Drizzle: `pnpm --filter @home-panel/api exec drizzle-kit generate` con schema aggiornato → produce file `drizzle/<nnnn>_<slug>.sql` contenente `ALTER TABLE smartthings_config ADD COLUMN tv_device_id TEXT`.
2. Deploy backend: al primo avvio la migration si applica automaticamente (il runtime esegue le migration pending). Nessun seed.
3. Deploy frontend: al primo load, `useTvStatus()` chiama `GET /tv/status`, che ritorna `404 { error: "TV non configurata" }`. La `TvTile` mostra uno stato "Da configurare" con link a Settings. Nessun crash.
4. Utente va in Settings → TV, lista device si popola via `GET /tv/devices`, seleziona "Samsung Q6 Series (49)", click "Salva". La tile home diventa attiva.

**Rollback**: la colonna `tv_device_id` resta nullable nel DB. Rimuovere i route `/tv/*` dal backend e la tile dal frontend ripristina lo stato pre-change senza necessità di down-migration.

## Open Questions

- **Q1**: I package name di YouTube, Prime, Disney+, RaiPlay variano tra firmware. Quali funzionano davvero sulla Q6 firmware 1310.4 dell'utente? → Risoluzione: QA manuale sul device reale durante l'implementazione (primo task pratico dopo il merge del backend).
- **Q2**: Ha senso esporre `tvChannel` (cambio canale) ora o rimandare? → Proposta: rimandare. La TV è sempre su HDMI2 (Apple TV/console) nel uso tipico, i canali digitali non sono il caso d'uso principale. Si riapre se l'utente li richiede.
- **Q3**: Vogliamo un bottone "Richiama ultimo input" per fare un quick-toggle tra `digitalTv` e `HDMI2`? → Parcheggiato: feature carina ma fuori dall'MVP. Valutare dopo il primo uso reale della tile.
