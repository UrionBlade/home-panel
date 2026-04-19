## MODIFIED Requirements

### Requirement: Plugin exposes a clean React hook

Il plugin Tauri custom SHALL essere accompagnato da un hook React `useKioskMode()` in `apps/mobile/src/lib/kiosk.ts` che astragga i comandi Tauri raw e fornisca un'API ergonomica: `{ keepScreenOn, setKeepScreenOn, isFullscreen, setBrightness, currentBrightness }`. L'hook SHALL gestire automaticamente attivazione/disattivazione di `idleTimerDisabled` su mount/unmount dell'AppShell. SHALL inoltre coordinare automaticamente la luminosità con lo stato di `nightMode` dal `NightModeProvider`: salvare la luminosità originale all'attivazione del night mode, applicare il valore `kioskSettings.nightBrightness`, e ripristinare l'originale al termine del night mode.

#### Scenario: Hook activates on AppShell mount
- **WHEN** l'AppShell viene montato per la prima volta
- **AND** il device è un iPad
- **AND** la preferenza utente è "Mantieni schermo acceso = on"
- **THEN** `useKioskMode` SHALL invocare il comando Tauri `set_idle_timer_disabled(true)` automaticamente

#### Scenario: Hook is no-op on non-iOS targets
- **WHEN** l'AppShell viene montato in un browser desktop (sviluppo)
- **THEN** `useKioskMode` SHALL NOT lanciare errori
- **AND** SHALL semplicemente non eseguire alcuna operazione nativa

#### Scenario: Hook coordinates brightness with night mode
- **WHEN** il night mode si attiva
- **THEN** `useKioskMode` SHALL salvare la luminosità corrente come `originalBrightness`
- **AND** SHALL chiamare `setBrightness(kioskSettings.nightBrightness)`
- **AND** quando il night mode termina, SHALL chiamare `setBrightness(originalBrightness)`
