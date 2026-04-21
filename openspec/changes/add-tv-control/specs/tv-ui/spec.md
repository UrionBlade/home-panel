## ADDED Requirements

### Requirement: TanStack Query hooks for TV operations

Il sistema SHALL fornire `apps/mobile/src/lib/hooks/useTv.ts` che esporta: `useTvStatus()` (query con `staleTime: 10s`, `refetchInterval: 15s` quando la TV è on, `30s` quando off), `useTvDevices()` (query, enabled solo in Settings), `useTvAssign()` (mutation PATCH /tv/config), `useTvPower()`, `useTvVolume()`, `useTvMute()`, `useTvInput()`, `useTvApp()`, `useTvPlayback()` (tutte mutation). Ogni mutation SHALL invalidare la query key `['tv','status']` on success.

#### Scenario: useTvStatus polls at lower cadence when TV is off
- **GIVEN** status cached con `power = "off"`
- **THEN** l'hook SHALL usare `refetchInterval: 30_000`

#### Scenario: Mutation invalidates status
- **WHEN** `useTvPower().mutate({ on: true })` completa con successo
- **THEN** la query `['tv','status']` SHALL essere marcata stale
- **AND** il prossimo render SHALL fare refetch

### Requirement: Home page includes TvTile in the mosaic

Il sistema SHALL aggiungere `<TvTile />` alla `HomePage`. La tile SHALL avere **tre stati visivi mutualmente esclusivi**:
- **Non configurata** (`tv_device_id = null` lato backend → 404 sullo status): label "Imposta la TV" con icona `Television` Phosphor duotone, tap apre `SettingsPage` pre-scrollata alla sezione TV
- **Spenta** (`power = "off"`): compatta, label "TV spenta", tap chiama `useTvPower().mutate({ on: true })`
- **Accesa** (`power = "on"`): estesa, mostra input corrente, slider volume, bottoni mute + power + 4 shortcut app preset (Netflix/YouTube/Prime/Disney+). Tap su un preset chiama `useTvApp().mutate({ appId })`.

#### Scenario: Off state shows single tap to power on
- **GIVEN** status = `{ power: "off", volume: 5, muted: false, ... }`
- **WHEN** l'utente tappa la tile
- **THEN** SHALL essere chiamato `useTvPower({ on: true })`
- **AND** la tile SHALL mostrare un loader spinner per ~2s in attesa del refetch dello status

#### Scenario: On state renders full controls
- **GIVEN** status = `{ power: "on", volume: 20, muted: false, input: "HDMI2", ... }`
- **WHEN** la tile renderizza
- **THEN** SHALL mostrare: label input ("HDMI2"), slider volume a 20%, icona speaker non barrata, 4 bottoni app preset
- **AND** SHALL mostrare un bottone power toggle chiaramente distinto

#### Scenario: Preset button launches app
- **GIVEN** tile in stato "on"
- **WHEN** l'utente tappa il bottone "Netflix"
- **THEN** SHALL essere chiamato `useTvApp({ appId: "<netflix preset appId>" })`
- **AND** SHALL mostrare feedback visivo (ripple + toast "Apro Netflix…")

#### Scenario: Not-configured state links to settings
- **GIVEN** `GET /tv/status` ritorna 404
- **WHEN** l'utente tappa la tile
- **THEN** la navigation SHALL portare a `SettingsPage` con hash `#tv`
- **AND** la sezione TV SHALL essere scrollata in vista

### Requirement: Settings page includes TV binding section

Il sistema SHALL aggiungere una sezione "TV" in `SettingsPage`. La sezione SHALL contenere: (1) stato binding corrente ("Nessuna TV selezionata" o "Samsung Q6 Series (49)"), (2) bottone "Scegli TV" che apre un modal con la lista da `useTvDevices()`, (3) dopo la selezione, un bottone "Test connessione" che chiama `GET /tv/status` e mostra esito, (4) un bottone "Scollega TV" che chiama `PATCH /tv/config { tvDeviceId: null }`. La sezione SHALL mostrare un warning informativo "Per l'accensione remota, sulla TV deve essere attiva l'opzione 'Attivazione tramite rete' (Generali → Gestione dispositivo)".

#### Scenario: User binds a TV from the list
- **GIVEN** SmartThings configurato, TV non ancora bindata
- **WHEN** l'utente apre la sezione TV e tappa "Scegli TV"
- **THEN** il modal SHALL mostrare la lista ritornata da `useTvDevices()`
- **AND** alla selezione di un'entry SHALL essere chiamato `useTvAssign({ tvDeviceId })`
- **AND** al success il modal SHALL chiudersi
- **AND** la sezione SHALL riflettere il nuovo stato "Samsung Q6 Series (49)"

#### Scenario: User tests connection
- **GIVEN** TV bindata
- **WHEN** l'utente tappa "Test connessione"
- **THEN** l'UI SHALL chiamare `GET /tv/status`
- **AND** al success SHALL mostrare toast "TV raggiungibile, stato: acceso/spento"
- **AND** al fallimento (502) SHALL mostrare toast "TV non raggiungibile: controlla la rete o il PAT SmartThings"

#### Scenario: User unbinds TV
- **GIVEN** TV bindata
- **WHEN** l'utente tappa "Scollega TV"
- **AND** conferma il dialog di conferma
- **THEN** SHALL essere chiamato `useTvAssign({ tvDeviceId: null })`
- **AND** la sezione SHALL tornare a mostrare "Nessuna TV selezionata"

### Requirement: i18n coverage for TV namespace

Il sistema SHALL creare i namespace `tv` in entrambi i locali (`apps/mobile/src/locales/it/tv.json` e `apps/mobile/src/locales/en/tv.json`) con le chiavi necessarie per tile, settings, toast e messaggi di errore. NESSUNA stringa di copy UI SHALL essere hardcoded nei componenti TV: tutto SHALL passare da `useT("tv")`.

#### Scenario: All user-facing strings are localized
- **WHEN** si ispezionano i file `TvTile.tsx` e `TvSettings.tsx` dopo la change
- **THEN** NON SHALL esistere letterali stringa italiani o inglesi inline (a parte label tecniche accettabili tipo "HDMI2" o nomi app)
- **AND** ogni letterale UI SHALL essere accessibile via `t("<chiave>")`

#### Scenario: Locale files are complete
- **WHEN** si esegue il check di coerenza tra locales
- **THEN** `it/tv.json` e `en/tv.json` SHALL avere la stessa identica struttura di chiavi (nessuna chiave presente in uno e non nell'altro)
