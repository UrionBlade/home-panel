## MODIFIED Requirements

### Requirement: Tab navigation includes all foundational sections

La tab bar SHALL contenere esattamente queste tab nell'ordine seguente: **Home**, **Calendario**, **Spesa**, **Bacheca**, **Telecamere**, **Settings**. Ogni tab SHALL avere un'icona Phosphor `duotone` e una label italiana. La tab attiva SHALL essere visualmente evidenziata con accent color e leggera scale up. **Tutte le 6 tab SHALL ora puntare a pagine reali** (Telecamere è l'ultima a essere implementata).

#### Scenario: All tabs are functional
- **WHEN** l'utente naviga tra le tab
- **THEN** ogni tab SHALL aprire la sua pagina reale (Home, CalendarPage, ShoppingPage, BoardPage, CamerasPage, SettingsPage)
- **AND** SHALL non esserci più placeholder

#### Scenario: Cameras tab is fully functional after this change
- **WHEN** l'utente tocca la tab Telecamere
- **THEN** la UI SHALL mostrare la `CamerasPage` con grid camere + live view + clips browser
- **AND** se le credenziali Blink sono configurate SHALL mostrare le camere reali
- **AND** se non sono configurate SHALL mostrare l'empty state con call-to-action

### Requirement: AppShell mounts global doorbell overlay

L'`AppShell` SHALL montare il `DoorbellOverlay` come componente top-level (sibling dello `ScreensaverOverlay` e del `VoiceListeningOverlay`), con z-index più alto di tutti per garantire che prenda il sopravvento in caso di doorbell event. SHALL ascoltare l'evento SSE `blink:doorbell-pressed` via il client SSE globale e attivare l'overlay sulla ricezione.

#### Scenario: Doorbell overlay takes priority
- **GIVEN** l'utente sta vedendo il calendario (CalendarPage attiva)
- **AND** lo screensaver è anche attivo perché idle
- **WHEN** un evento doorbell arriva via SSE
- **THEN** il `DoorbellOverlay` SHALL apparire con z-index più alto dello screensaver
- **AND** SHALL coprire entrambi
- **AND** lo screensaver SHALL essere automaticamente dismesso

#### Scenario: SSE connection at boot
- **WHEN** l'AppShell viene montato
- **THEN** SHALL aprire una connessione SSE su `/api/v1/sse`
- **AND** SHALL gestire reconnect automatico in caso di disconnect
