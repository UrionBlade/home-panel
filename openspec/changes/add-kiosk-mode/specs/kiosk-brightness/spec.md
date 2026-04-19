## ADDED Requirements

### Requirement: Plugin Tauri supports brightness control on iOS

Il plugin Tauri custom (esistente da `add-foundation` con i comandi `set_idle_timer_disabled`, `set_fullscreen`, `set_orientation_lock`) SHALL essere esteso con due nuovi comandi:

- `set_brightness(level: f32)` — chiama `UIScreen.main.brightness = level` su iOS, dove `level` è un float 0.0-1.0 (clampato server-side per sicurezza)
- `get_brightness() -> f32` — restituisce il valore corrente

Su target non-iOS i comandi SHALL essere no-op (in dev browser desktop).

#### Scenario: Set brightness to 0.3 in night mode
- **WHEN** il client invoca `invoke('set_brightness', { level: 0.3 })`
- **AND** l'app gira su iPad
- **THEN** il plugin SHALL chiamare lo Swift bridge che esegue `UIScreen.main.brightness = 0.3`
- **AND** la luminosità dello schermo SHALL ridursi visibilmente

#### Scenario: Restore brightness on night mode end
- **WHEN** il night mode termina alle 07:00
- **THEN** il client SHALL invocare `set_brightness` con il valore originale memorizzato
- **AND** la luminosità SHALL tornare al livello precedente all'attivazione del night mode

#### Scenario: No-op on browser desktop
- **WHEN** lo sviluppatore lancia `pnpm dev` in browser desktop
- **AND** il codice invoca `set_brightness`
- **THEN** il plugin SHALL non lanciare errori
- **AND** SHALL semplicemente ritornare senza fare nulla

### Requirement: useKioskMode hook integrates brightness with night mode

L'hook `useKioskMode()` (esistente da `add-foundation`) SHALL essere esteso per gestire automaticamente la luminosità in coordinazione con il `NightModeProvider`. Quando il night mode si attiva, l'hook SHALL:
1. Salvare la luminosità corrente come "originale"
2. Impostare la luminosità al valore `kioskSettings.nightBrightness` (default 0.25)
3. Quando il night mode termina, ripristinare la luminosità originale

#### Scenario: Auto-dim on night mode activation
- **GIVEN** la luminosità corrente è 0.7
- **WHEN** il night mode si attiva alle 22:00
- **THEN** `useKioskMode` SHALL salvare 0.7 come originale
- **AND** SHALL chiamare `set_brightness(0.25)` (o il valore configurato)

#### Scenario: Auto-restore on night mode end
- **GIVEN** la luminosità è 0.25 (set da night mode) e l'originale era 0.7
- **WHEN** il night mode termina
- **THEN** `useKioskMode` SHALL chiamare `set_brightness(0.7)`
- **AND** la luminosità originale SHALL essere ripristinata

#### Scenario: User manual override during night mode
- **GIVEN** night mode è attivo e brightness = 0.25
- **WHEN** l'utente cambia la luminosità manualmente da iOS Control Center a 0.5
- **THEN** il plugin SHALL aggiornare il valore "corrente"
- **AND** quando night mode termina, ripristinerà 0.5 (non 0.7) — l'utente vince
