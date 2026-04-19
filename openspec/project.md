# Home Panel — Project Context

> Documento di contesto OpenSpec. Letto da ogni change futura per evitare di ripetere requisiti, scelte tecniche, vincoli e roadmap. Per il **Design Context** (UI/UX, brand, palette, tipografia, motion, accessibilità) vedi `.impeccable.md` nella radice del repo.

## Visione

Pannello di controllo casalingo "vero prodotto" installato su un **iPad Pro 11" 2-3a generazione** fissato in cucina o sala (dock stampato in 3D, alimentazione permanente). Lo stesso codice gira anche sull'**iPhone personale** dell'utente, sia in casa che fuori casa.

L'esperienza primaria è **vocale + touch**: l'utente parla al pannello con il wake word "**Ok casa**" e completa l'80% delle azioni a mano libera. La parte touch è ottimizzata per essere usata anche da lontano (3 metri dal divano) e da persone della famiglia con vari livelli di familiarità tecnologica.

L'app deve sembrare "un prodotto vero", non un side project. Per i principi visivi vedi `.impeccable.md`.

## Composizione famiglia (modello dati)

**Decisione**: nessun seed di persone/animali nel database. L'utente li aggiunge tutti dinamicamente da un menu dedicato nel frontend (`Settings → Famiglia`). Il modello deve supportare:

- **Persone** (`type: human`) con nome, foto/avatar, colore identificativo, ruolo (informativo, non di permessi: es. "papà", "mamma", "figlio"), data di nascita opzionale.
- **Animali** (`type: pet`) con nome, foto/avatar, specie (cane, gatto, ecc.), razza opzionale, data di nascita, peso opzionale, note veterinarie.
- Entrambi sono cittadini di prima classe della stessa entità `family_member` (con `kind: human|pet`).
- Eventi del calendario, note della spesa, comandi vocali, ecc. possono essere associati a **uno o più** membri della famiglia (es. "Cody e Matteo dal veterinario").

## Hardware e contesto fisico

| Componente | Modello | Note |
|---|---|---|
| Pannello principale | iPad Pro 11" gen 2-3 (A12Z o M1) | Sempre in landscape, alimentato 24/7, Guided Access attivo |
| Compagno mobile | iPhone personale dell'utente | iOS recente, anche fuori casa |
| Backend | Synology DSM (NAS personale) | Container Manager / Docker, file SQLite su volume persistente |
| Telecamera esterna | 1× Blink outdoor (oggi) | API non ufficiale via libreria reverse-engineered |
| Videocitofono | 1× Blink doorbell (oggi) | Notifica interrupting, overlay live + audio |
| Sicurezza casa (futura) | Sensori finestra, fumogeni di deterrenza, telecamere interne | Modulo "sicurezza/allarme" da pianificare in change separata futura |

**Future hardware accessory** (annotato per memoria): dock per iPad da progettare in CAD per stampante 3D, da appendere a parete in cucina o sala. Non è scope del codice ma va menzionato nella documentazione di progetto.

## Stack tecnico

| Layer | Scelta | Motivazione |
|---|---|---|
| Monorepo | **pnpm 10 + Turborepo** | Standard 2026, workspace nativi, cache build |
| Frontend | **Tauri 2 + React 19 + Vite + Tailwind 4** | Tauri 2 supporta iOS nativo, React mantiene continuità col vecchio home-panel di riferimento |
| Backend | **Node 22 + Hono + Drizzle ORM + SQLite** (`better-sqlite3`) | TS end-to-end, immagine Docker piccola, single-file DB perfetto per Synology |
| Pacchetto condiviso | `@home-panel/shared` | Tipi condivisi tra mobile e api |
| State client | **TanStack Query** (server state) + **Zustand** (UI state) | Stesso pattern del vecchio home-panel, già validato |
| Animazioni | **Framer Motion** | Coerente con design context, supporta reduced motion nativo |
| Icone | **Phosphor Icons** weight `duotone` o `regular` | Già usate nel vecchio home-panel, calde, ben disegnate |
| i18n | **react-i18next** | Italiano primario, struttura pronta per inglese in futuro |
| Voice — STT | **Whisper.cpp** on-device, modello italiano small (~466MB) | Open source MIT, zero cloud, privacy massima, qualità top |
| Voice — wake word | **OpenWakeWord** o **Porcupine** (free personal) | Always-on detection di "Ok casa" |
| Voice — TTS | **AVSpeechSynthesizer** iOS via plugin Tauri Swift | Voci neurali italiane native, gratis, qualità Siri-like |
| Plugin Tauri custom | Whisper bridge, wake word bridge, AVSpeech bridge, kiosk (idleTimerDisabled), Blink bridge | Ognuno scope di una change dedicata |
| Deploy backend | **Docker su Synology DSM** | Multi-stage Dockerfile già scritto, volume bind per SQLite |

## Sicurezza e accesso

**Doppia cintura** confermata dall'utente:

1. **Tailscale (WireGuard)** — i tre device (iPad, iPhone, Synology) formano una tailnet privata. L'API non è esposta su internet pubblico in alcun modo. Nessuna porta aperta sul router, nessun DNS pubblico. È più sicuro di qualsiasi soluzione "API esposta + login".
2. **Token API condiviso** — ogni richiesta verso l'API porta `Authorization: Bearer <token>` configurato via env nel frontend. Anche un device della tailnet compromesso non può chiamare l'API senza il token.
3. **PIN locale per azioni critiche** (futuro, quando arriverà il modulo allarme) — terzo strato per arma/disarma allarme, vedere telecamere live, sbloccare il kiosk, ecc.

L'utente è **molto** preoccupato dalla sicurezza, soprattutto in vista del futuro modulo allarme. Ogni change che tocca rete/auth/storage critico deve preferire la sicurezza percepita alla velocità di sviluppo.

## Limitazioni iOS note (da accettare, non aggirare)

| Limite | Workaround |
|---|---|
| Apple non permette vero kiosk mode senza supervised mode | **Guided Access** manuale (triplo click sul tasto laterale, blocca tutto fino al PIN). Documentato nel README. |
| Always-on display vero non esiste su iPad | Schermo si spegne quando iPad decide. `idleTimerDisabled = true` via plugin Tauri previene auto-lock finché l'app è in foreground. |
| WKWebView non gestisce bene Web Speech API per wake word continuo | Plugin Tauri nativo Rust+Swift custom per Whisper.cpp + wake word + AVSpeech. |
| `SFSpeechRecognizer` ha limite di 1 minuto per sessione | Non lo usiamo (preferiamo Whisper.cpp on-device, no limite). |
| Background audio richiede entitlement specifico | L'app deve dichiarare `audio` come background mode in `Info.plist` per ascoltare il wake word in foreground prolungato. Documentato nei task della change voice. |
| Push notifications fuori casa richiedono APNs e developer account | Per ora notifiche solo in-app. Push remote in change futura se necessario. |

## Feature roadmap

Le change OpenSpec sono pianificate in ordine, una per macro-feature. La numerazione è indicativa.

### 1. `add-foundation` (in pianificazione adesso)
Modello dati famiglia (CRUD persone + animali), design system base (palette, tipografia, primitive UI), layout home con tab di navigazione, kiosk basics (idleTimerDisabled), token API auth, setup Tailscale documentato. Tutto ciò su cui le altre change si appoggiano.

### 2. `add-shopping-list`
Lista della spesa offline-first ispirata al vecchio home-panel: nome + quantità + unità + categoria + stato (attivo/completato), audit log per ogni mutazione (chi ha aggiunto, quando), autocomplete prodotti, raggruppamento per categoria, ordinamento smart. Anche da comando vocale.

### 3. `add-family-calendar`
Calendario eventi famiglia. Vista mese + agenda + lista "oggi". Eventi associati a uno o più membri famiglia (persone e animali). Categorie/colori. Eventi ricorrenti. Promemoria. Niente sync esterni in questa change (verranno dopo).

### 4. `add-waste-schedule`
Programma raccolta spazzatura per Besozzo. Definizione dei tipi di sacco (umido, secco, plastica, vetro, carta, verde, ecc. — lista configurabile dall'utente). Regole di ricorrenza flessibili: settimanale, bisettimanale, trisettimanale, "ogni N giorni", giorni specifici del mese. **+ import ICS** dal sito del Comune se l'utente fornisce un URL. Mostra in home: "stasera porta fuori X". Notifica vocale la sera prima.

### 5. `add-weather`
Meteo localizzato a Besozzo (default), modificabile da Settings. **Open-Meteo API** (gratis senza chiave). Mostra: oggi (corrente + 24h), prossimi 7 giorni, allerte se presenti. Tile in home con icona + temp + condizione. Niente hourly nelle prime versioni.

### 6. `add-kiosk-mode`
Always-on display best-effort, fullscreen senza status bar, prevenzione screen saver, blocco gesture di uscita (compatibile con Guided Access). Plugin Tauri nativo per `idleTimerDisabled`, fullscreen, lock orientation. Documentazione utente per attivare Guided Access.

### 7. `add-voice-control`
Wake word "**Ok casa**" sempre attivo + Whisper.cpp on-device per STT + AVSpeechSynthesizer per TTS. Plugin Tauri custom (Rust + Swift bridges). Comandi vocali per: aggiungere a spesa, creare evento, impostare timer, leggere meteo, leggere calendario di oggi, leggere lista spesa, "buongiorno"/"buonanotte" come routine. Indicatore visivo always-on quando il microfono ascolta. Risposta vocale garantita per ogni comando.

### 8. `add-postit-board`
Bacheca con post-it draggabili. Post-it con titolo + corpo + colore (tinted accent caldo). Drag&drop libero su canvas, snap-to-grid opzionale. Modificabili in-place (tap → edit). Persistenti nel backend. Vista a schermo intero o tile in home. Animazioni meditative quando vengono creati/spostati.

### 9. `add-blink-cameras`
Integrazione con telecamera Blink esterna + videocitofono. Live view on-demand. Storico clip rilevate da motion detection. **Salvataggio video clip su Synology** (volume dedicato, retention configurabile). Il videocitofono ha priorità interrupting: quando suona, l'app prende il sopravvento dell'intera UI con overlay live + bottoni "Vedi" / "Ignora" / "Parla" (audio bidirezionale se supportato dal device). Best effort: API Blink non ufficiale, può rompersi.

### 10. (futura) `add-recipes`
Tile/sezione ricette ispirata al vecchio home-panel (esisteva un servizio `gialloZafferanoService`). Da pianificare quando le altre saranno solide.

### 11. (futura) `add-timers-and-alarms`
Multi-timer cross-page (esisteva nel vecchio home-panel). Sveglie. Suoni sempre attivi (impostazione separata da effetti UI). Comandi vocali "imposta timer X minuti", "aggiungi 5 minuti al timer".

### 12. (futura) `add-home-security-module`
**Modulo grosso e prioritario sulla sicurezza percepita.** Sensori finestra, fumogeni di deterrenza, telecamere interne. Allarme arma/disarma con PIN. Notifiche immediate. Logging eventi. Da pianificare quando l'utente acquisterà l'hardware. **Triplo strato di sicurezza**: Tailscale + token API + PIN locale.

### 13. (futura) `add-ical-sync`
Sync calendario eventi con Google Calendar / iCloud / Caldav. Import + export.

### 14. (futura) `add-3d-dock-design`
Documentazione e file STL per il dock dell'iPad da stampare in 3D. Non codice, ma asset di progetto.

## Glossario di dominio

- **Family member**: persona o animale della famiglia. Cittadino di prima classe per eventi, spese, post-it, comandi vocali.
- **Wake word**: la frase "Ok casa" che attiva l'ascolto del comando.
- **Tile**: blocco visuale della home page, di dimensione variabile, che mostra una feature (meteo, eventi, spesa, ecc.). La home è un mosaico di tile, mai una griglia uniforme.
- **Interrupting overlay**: stato UI che prende il sopravvento dell'intera schermata in caso di evento critico (videocitofono, allarme, timer scaduto).
- **Tailnet**: rete privata virtuale Tailscale composta dai device dell'utente.
- **Guided Access**: feature iOS nativa per bloccare l'iPad in una singola app fino all'inserimento di un PIN.
- **Audit log**: ogni mutazione su entità rilevanti (spesa, eventi, post-it) registra chi/quando/cosa ha modificato. Pattern già usato nel vecchio home-panel.

## Riferimenti utili

- **Tauri 2 iOS**: https://v2.tauri.app/start/prerequisites/#ios
- **Whisper.cpp**: https://github.com/ggerganov/whisper.cpp (MIT, modello italiano da Hugging Face)
- **Tailscale**: https://tailscale.com (gratis per uso personale fino a 100 device)
- **Open-Meteo**: https://open-meteo.com (gratis senza chiave)
- **Phosphor Icons**: https://phosphoricons.com (weight `duotone` consigliato)
- **Fraunces** (display): https://fonts.google.com/specimen/Fraunces
- **Geist Sans** (body): https://vercel.com/font
- **Vecchio home-panel** (riferimento di pattern): `/Users/matteopoli/Projects/Personal/home-panel` — non sostituire/modificare, solo guardare
  - Pattern interessanti: `src/components/organisms/ShoppingList.tsx` (audit log + autocomplete + categorie), `src/services/voiceCommandService.ts`, `src/services/weatherService.ts`, `src/components/organisms/CalendarGrid.tsx`, `src/components/organisms/WasteCollectionWidget.tsx`, `VOICE_OPTIMIZATION_PLAN.md`, `VOICE_COMMANDS_GAP_ANALYSIS.md`
