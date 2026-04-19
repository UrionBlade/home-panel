## ADDED Requirements

### Requirement: iPad screen never auto-locks while the app is in foreground

Il sistema SHALL impedire l'auto-lock dello schermo iOS finché l'app Home Panel è in foreground sull'iPad. Questa funzionalità SHALL essere implementata tramite un plugin Tauri custom che imposti `UIApplication.shared.isIdleTimerDisabled = true` quando l'app passa in foreground e lo riporti a `false` quando l'app passa in background (per non scaricare la batteria di iPhone). L'utente SHALL poter disabilitare il comportamento dalle Settings (toggle "Mantieni schermo acceso").

#### Scenario: iPad foreground keeps screen on
- **WHEN** l'app entra in foreground sull'iPad fissato a parete
- **AND** il toggle "Mantieni schermo acceso" è attivo (default)
- **THEN** il plugin Tauri SHALL chiamare `isIdleTimerDisabled = true`
- **AND** lo schermo dell'iPad SHALL NOT spegnersi automaticamente per inattività finché l'app rimane in foreground

#### Scenario: App background restores idle timer
- **WHEN** l'utente preme home o cambia app
- **THEN** il plugin SHALL chiamare `isIdleTimerDisabled = false`
- **AND** iOS SHALL riprendere a gestire normalmente lo screen sleep

#### Scenario: User opts out from settings
- **WHEN** l'utente disattiva il toggle "Mantieni schermo acceso" dalle Settings
- **THEN** il plugin SHALL impostare `isIdleTimerDisabled = false` immediatamente
- **AND** la preferenza SHALL essere persistita

### Requirement: App runs in fullscreen with no status bar on iPad

Quando l'app gira su iPad, SHALL essere configurata per usare l'intero schermo senza mostrare la status bar di iOS, in modo da massimizzare la superficie utile per il pannello di controllo. Su iPhone la status bar SHALL rimanere visibile (è il comportamento atteso di un'app mobile normale).

#### Scenario: iPad hides status bar
- **WHEN** l'app è in esecuzione su un iPad
- **THEN** la status bar di iOS (orologio, batteria, segnale) SHALL NOT essere visibile
- **AND** il contenuto SHALL estendersi fino al bordo superiore dello schermo

#### Scenario: iPhone keeps status bar
- **WHEN** l'app è in esecuzione su un iPhone
- **THEN** la status bar di iOS SHALL rimanere visibile in alto
- **AND** il contenuto SHALL rispettare la safe area inset top

### Requirement: iPad orientation is locked to landscape

Il sistema SHALL forzare l'iPad in orientamento landscape (sia LandscapeLeft che LandscapeRight, per supportare il dock indipendentemente da come è montato), prevenendo la rotazione in portrait. L'iPhone SHALL mantenere l'orientamento libero (l'utente sceglie portrait o landscape secondo preferenza).

#### Scenario: iPad orientation lock landscape only
- **WHEN** l'iPad viene ruotato in portrait con l'app aperta
- **THEN** l'app SHALL NOT ruotare e SHALL rimanere in landscape
- **AND** la configurazione `tauri.conf.json` per iOS SHALL dichiarare solo `LandscapeLeft` e `LandscapeRight` come orientamenti supportati per iPad

### Requirement: Plugin exposes a clean React hook

Il plugin Tauri custom SHALL essere accompagnato da un hook React `useKioskMode()` in `apps/mobile/src/lib/kiosk.ts` che astragga i comandi Tauri raw e fornisca un'API ergonomica: `{ keepScreenOn, setKeepScreenOn, isFullscreen }`. L'hook SHALL gestire automaticamente attivazione/disattivazione su mount/unmount dell'AppShell.

#### Scenario: Hook activates on AppShell mount
- **WHEN** l'AppShell viene montato per la prima volta
- **AND** il device è un iPad
- **AND** la preferenza utente è "Mantieni schermo acceso = on"
- **THEN** `useKioskMode` SHALL invocare il comando Tauri `set_idle_timer_disabled(true)` automaticamente

#### Scenario: Hook is no-op on non-iOS targets
- **WHEN** l'AppShell viene montato in un browser desktop (sviluppo)
- **THEN** `useKioskMode` SHALL NOT lanciare errori
- **AND** SHALL semplicemente non eseguire alcuna operazione nativa
