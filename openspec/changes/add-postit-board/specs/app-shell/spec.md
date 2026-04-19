## MODIFIED Requirements

### Requirement: Tab navigation includes all foundational sections

La tab bar SHALL contenere esattamente queste tab nell'ordine seguente: **Home**, **Calendario**, **Spesa**, **Bacheca**, **Telecamere**, **Settings**. Ogni tab SHALL avere un'icona Phosphor `duotone` e una label italiana. La tab attiva SHALL essere visualmente evidenziata con accent color e leggera scale up. Le tab **Spesa**, **Calendario** e **Bacheca** SHALL puntare a pagine reali. La tab **Telecamere** SHALL continuare a mostrare placeholder finché non verrà popolata da `add-blink-cameras`.

#### Scenario: Settings tab is fully functional in foundation
- **WHEN** l'utente tocca la tab Settings
- **THEN** la UI SHALL mostrare almeno: gestione famiglia (CRUD family members), selettore tema (auto/light/dark), info versione app
- **AND** queste sezioni SHALL essere completamente funzionanti dopo `add-foundation`

#### Scenario: Board tab is fully functional after this change
- **WHEN** l'utente tocca la tab Bacheca
- **THEN** la UI SHALL mostrare la `BoardPage` con canvas drag&drop fullscreen, FAB per nuovo post-it, editor in-place
- **AND** le mutation SHALL persistere nel backend e sincronizzarsi tra dispositivi nella tailnet

#### Scenario: Cameras tab still shows placeholder
- **WHEN** l'utente tocca la tab Telecamere
- **THEN** la UI SHALL mostrare uno schermo di placeholder elegante che indica "In arrivo nella change `add-blink-cameras`"
- **AND** SHALL essere visivamente coerente con il design system
