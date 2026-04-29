## Context

L'hub IKEA DIRIGERA è già fisicamente in casa al `192.168.178.164`, alimentato e raggiungibile via HTTPS sulla porta 8443 (verificato con probe TCP + handshake TLS self-signed). Quattro device Matter-over-Thread sono già paired all'hub via app IKEA Home smart: KAJPLATS (lampadina E27 dimmabile), ALPSTUGA (sensore qualità aria con CO2 NDIR + PM2.5 + temp + umidità), KLIPPBOK (sensore perdite acqua a batteria), TIMMERFLÖTTE (sensore temp/umidità a batteria).

Il backend `apps/api` ha già:
- Provider lights pluggable in `src/lib/lights/dispatcher.ts` con il provider `ewelink` come unica implementazione esistente
- Sistema push APNs in `src/lib/push/` (già implementato in fase add-foundation, ma le env `APNS_*` sul NAS production sono ancora da popolare — vedi memory `project_apns_setup.md`)
- Pipeline SSE in `src/routes/sse.ts` con bus pubsub interno per propagare eventi runtime al frontend
- Schema Drizzle con tabelle `lights`, `rooms`, `push_tokens`, e una migration story rodata

Il frontend `apps/mobile` ha già:
- Pattern per home tile (Weather, TV, ecc.) con `apps/mobile/src/components/home-tiles/*`
- `LightsPage` con card uniformi via dispatcher pattern
- Provider top-level pattern (vedi `VoiceProvider`) per subscriber globali
- Sistema modale base nel `ui-store` (Zustand)
- i18n via `i18next` con namespace per feature

L'integrazione DIRIGERA si inserisce in tutti questi sistemi senza richiedere infrastruttura nuova oltre allo script di auth one-time.

## Goals / Non-Goals

**Goals:**
- Tutti i 4 device DIRIGERA pilotabili e visibili dal Home Panel come se fossero device first-class
- KAJPLATS indistinguibile dalle altre luci dell'app — niente "tab DIRIGERA" o branding separato
- Latenza percepita < 200ms su comandi luce e refresh sensori (WebSocket push, no polling)
- Zero dipendenza Python/altri runtime — solo Node + container già esistenti
- Recovery automatico da: hub riavviato, API riavviata, network glitch, token scaduto (warning + UI di re-auth)
- Notifica leak end-to-end (DIRIGERA WS → backend → APNs + SSE → modale frontend) entro 2 secondi dall'evento fisico

**Non-Goals:**
- Multi-admin Matter (DIRIGERA + Apple Home contemporaneamente). Possibile in futuro, non in scope qui.
- Direct Matter via `python-matter-server`. Architetturalmente rimpiazzerebbe DIRIGERA come admin; lo lasciamo per una future change separata.
- Bridging dei device Zigbee paired al DIRIGERA verso Z2M e viceversa. I due ecosistemi convivono come isole separate; KLIPPBOK Matter qui, allarme Zigbee a parte.
- UI di pairing nuovi device dal Home Panel. Per pairing nuovi device l'utente usa l'app IKEA, e il sync DIRIGERA li scopre.
- Rich automation engine basato sui sensori (es. "se CO2 > X, manda comando Y"). Quello entra nel sistema routines esistente come change separata.

## Decisions

### Decision 1: REST API DIRIGERA, non Matter direct

Alternativa scartata: `python-matter-server` su Synology con commissioning diretto dei device via BLE.

Scelta: parlare direttamente alla REST API del DIRIGERA via HTTPS + WebSocket dal backend Node.

Rationale:
- I device sono **già commissionati** sul DIRIGERA. Andare Matter direct richiederebbe factory reset di ognuno + re-pairing al nostro controller, perdendo l'app IKEA come fallback.
- DIRIGERA REST API è in produzione da 2 anni, ben documentata via reverse engineering della community (libreria `dirigera-platform`, `homebridge-dirigera`, `python-dirigera`).
- Una `python-matter-server` instance sul Synology aggiungerebbe un container, certificati fabric da gestire, BLE dongle USB sul NAS (che attualmente non ne ha).
- Il pattern provider in `lights/dispatcher.ts` è già lì per accogliere un nuovo provider — niente refactoring architetturale.

Trade-off accettato: lock-in su DIRIGERA. Se un giorno IKEA dismette il prodotto o cambia API, dobbiamo riscrivere il provider. Mitigazione: il backend astrae i device verso schema interno (`env_sensors`, `leak_sensors`, `lights`) — riscrivere il provider non tocca tabelle né frontend.

### Decision 2: Auth via script standalone, non flusso UI

Alternativa scartata: una pagina Settings che fa il PKCE flow in-app, con countdown 60s "premi il pulsante".

Scelta: script bash standalone `scripts/dirigera/auth.sh` che l'utente esegue una volta in SSH sul NAS (o localmente, copia-incolla il token in `.env`).

Rationale:
- Pairing è one-time, gestito dall'admin (matteopoli). Implementare una UI per un'azione fatta una volta nella vita del progetto è overkill.
- Lo script è 30 righe di curl + jq, leggibile e debuggabile direttamente.
- Il token è long-lived (DIRIGERA non lo scade): re-auth è eccezionale, non vale una UI dedicata.
- Pattern coerente con altri flow di setup del progetto (es. SmartThings PAT in env, eWeLink OAuth helper).

Trade-off accettato: re-auth se token revocato richiede SSH al NAS. Mitigazione: l'API espone `/api/v1/dirigera/status` con `connected: false, reason: "auth_failed"` così che la UI possa almeno informare l'utente del problema.

### Decision 3: TLS rejectUnauthorized localizzato, non globale

Alternativa scartata: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` all'avvio.

Scelta: costruire un `https.Agent({ rejectUnauthorized: false })` dedicato al client DIRIGERA, passato come option a ogni fetch verso l'hub.

Rationale: disabilitare il check TLS globalmente metterebbe a rischio TUTTE le altre integrazioni HTTPS dell'API (Spotify, eWeLink, Open-Meteo, Apple APNs, GE Brillion, SmartThings). Localizzare l'agente al solo client DIRIGERA è il principio di minor privilegio.

Implementazione concreta in `client.ts`:
```ts
const agent = new https.Agent({ rejectUnauthorized: false });
async function dirigeraFetch(path: string, init?: RequestInit) {
  return fetch(`https://${HOST}:8443/v1${path}`, {
    ...init,
    // @ts-expect-error — node fetch supports `dispatcher` for undici, `agent` for native
    agent,
  });
}
```

Trade-off: l'hub potrebbe in teoria essere MITM-ato in LAN. Accettato perché siamo in LAN domestica fidata e DIRIGERA non emette cert valido per LAN IP. Nessun mitigation pratico se non pinning del cert (overkill per home use).

### Decision 4: Schema sensori separato da lights

Alternativa scartata: un'unica tabella `dirigera_devices` polimorfica con colonna `kind` e attributi JSON.

Scelta: tre tabelle separate — `env_sensors`, `leak_sensors`, e KAJPLATS dentro `lights` esistente.

Rationale:
- Query frontend più chiare (la home tile leggerà `SELECT * FROM env_sensors`, non un filtro su una tabella unica).
- Validazione tipi a livello DB (env vs leak hanno colonne diverse — tentare un leak su env_sensors fallisce esplicitamente).
- KAJPLATS è semanticamente identico a una luce eWeLink: stessa UI, stesso dispatcher, stesso schema. Tenerla nella tabella `lights` è coerente con "il provider è dettaglio backend, non concetto utente".
- Il costo extra (3 migrations invece di 1) è trascurabile.

### Decision 5: History bucketing 5 minuti, retention 7 giorni

Per la tabella `env_sensor_history` occorre decidere granularità e retention.

Scelta: append per ogni evento WS (granularità nativa, ~30s-2min per ALPSTUGA), ma `GET /history` aggrega in bucket 5 minuti con AVG. Retention 7 giorni con cleanup orario.

Rationale:
- Il grafico in UI per 24h con 288 punti (5min) è più che sufficiente per visualizzazione mobile.
- 7 giorni di history a ~1 reading/min × 4 sensori = ~40k record, gestibilissimi su SQLite senza indici elaborati.
- L'append-on-event preserva la granularità per future analisi (potremo cambiare il bucketing senza perdere dati storici).
- Un retention più lungo (30+ giorni) entrerebbe nel territorio "metriche serie temporali" e meriterebbe TimescaleDB / InfluxDB. Out of scope.

### Decision 6: LeakAlertProvider top-level, non per-page

Alternativa scartata: subscriber SSE dentro la sola HomePage, con redirect su evento leak.

Scelta: provider montato in `App.tsx` accanto a `VoiceProvider`, con UI store come single source of truth, e modale renderizzato sopra il `<Routes>`.

Rationale: il caso d'uso "perdita acqua" è critico — l'utente potrebbe essere su qualunque pagina (Settings, Music, Recipes). Forzare un redirect alla home prima di mostrare l'alert ritarda la reazione e perde il contesto della pagina. Un modale sopra la pagina corrente è meno invasivo e ugualmente bloccante.

### Decision 7: Sound asset embedded, non TTS

Per il modale leak: alarme sonoro acustico vs frase TTS via voice plugin.

Scelta: file audio statico `apps/mobile/public/sounds/leak-alert.mp3` riprodotto via `<audio loop autoplay>`.

Rationale:
- TTS richiederebbe il voice plugin attivo, che dipende dalla voice session iOS — può conflittare con la audio session corrente (Spotify che suona, ad esempio).
- Un file `<audio>` nel webview iOS è una primitiva consolidata, gestita da WKWebView con audio session standard, indipendente dal voice plugin.
- L'utente percepisce il suono come "allarme generico" — più riconoscibile rispetto a TTS che pronuncia testo (che potrebbe essere mascherato da musica in corso).

Trade-off: file `mp3` aumenta bundle Tauri di ~30-100KB. Trascurabile.

## Risks / Trade-offs

- **Rischio**: bug firmware DIRIGERA che causa device "fantasma" (visibili ma non rispondono) — riportato in passato dalla community → **Mitigazione**: il provider luci ritorna 503 con codice `DEVICE_OFFLINE` se DIRIGERA risponde 502/timeout, frontend mostra toast con suggerimento "verifica nell'app IKEA". Manual refresh endpoint per forzare un re-sync.

- **Rischio**: riconnessione WebSocket fallisce in loop dopo lungo downtime DIRIGERA → **Mitigazione**: backoff esponenziale capped a 30s. Dopo 10 fallimenti consecutivi, il bootstrap espone status `degraded` su `/api/v1/dirigera/status`.

- **Rischio**: APNs non configurato in production → **Mitigazione**: il leak trigger SHALL emettere SSE comunque (modale frontend funziona se l'app è aperta). Loga warning "APNs non configurato" e non crasha. Il completamento del setup APNs è tracciato in memory `project_apns_setup.md`.

- **Rischio**: Modale leak rumoroso quando l'utente è in chiamata o dorme → **Mitigazione**: il modale rispetta il volume di sistema iOS. Una settings "modalità silenziosa allarmi" è fuori scope per questa change ma può essere aggiunta a posteriori.

- **Rischio**: history `env_sensor_history` cresce all'infinito se il cleanup retention fallisce → **Mitigazione**: il job retention è schedulato con cron interno (riusa scheduler esistente). Aggiungiamo logging del numero di righe cancellate per detection di drift.

- **Trade-off**: i nuovi voice intent richiedono modifiche al parser intent ancora-in-flight (`add-voice-control` change a 42/84). Lavorando su quel modulo accettiamo conflitti di merge se l'altra change procede in parallelo. Mitigazione: tenere le modifiche al parser confinate a un singolo file `intentHandlers.ts` + `voiceCommandParser.ts`, con commit atomico.

## Migration Plan

1. **Pre-deploy locale**:
   - Creare lo script `scripts/dirigera/auth.sh`
   - Eseguirlo dalla macchina dev con il DIRIGERA su LAN, premere il pulsante, salvare il token output
   - Aggiornare `apps/api/.env.example` con i due placeholder

2. **Deploy backend**:
   - Migrations Drizzle (env_sensors, leak_sensors, env_sensor_history)
   - Deploy del nuovo provider via flusso CI standard del progetto
   - SSH al NAS, aggiornare `/volume1/docker/home-panel/apps/api/.env` con `DIRIGERA_HOST` e `DIRIGERA_TOKEN`
   - `docker compose up -d` per ricaricare l'API con le nuove env
   - Verificare `GET /api/v1/dirigera/status` → `{connected: true, deviceCount: 4}`

3. **Verifica funzionale**:
   - KAJPLATS visibile in `LightsPage`, on/off via UI
   - Tile AirQualityTile mostra valori live
   - Test forzato del modale leak: simulare evento via tool dev `POST /api/v1/sensors/leak/$id/test-trigger` (endpoint dietro flag `NODE_ENV !== 'production'`)
   - Test reale: bagnare il KLIPPBOK con un dito umido → entro 5s arriva il modale + push (se APNs configurato)

4. **Rollback**:
   - Se il provider rompe lights eWeLink: feature flag `DIRIGERA_DISABLED=1` skip-pa il bootstrap intero (provider non si registra, dispatcher resta solo eWeLink)
   - Migration rollback è additivo (le tabelle nuove non sono referenziate da altre): `drizzle-kit migrations:revert` rimuove env_sensors/leak_sensors senza impatto su esistenti

5. **Monitoring post-deploy**:
   - Log API: cercare warning DIRIGERA, errori auth, drop WS
   - SSE connection count / sensor reading rate (sanity check via `/api/v1/sensors/env` count delta)
   - Numero record env_sensor_history dopo 24h: dovrebbe stabilizzarsi sotto i 12k (4 sensori × ~120 reading/h × 24h)
