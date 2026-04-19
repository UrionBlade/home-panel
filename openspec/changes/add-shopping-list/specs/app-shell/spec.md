## MODIFIED Requirements

### Requirement: Tab navigation includes all foundational sections

La tab bar SHALL contenere esattamente queste tab nell'ordine seguente: **Home**, **Calendario**, **Spesa**, **Bacheca**, **Telecamere**, **Settings**. Ogni tab SHALL avere un'icona Phosphor `duotone` e una label italiana. La tab attiva SHALL essere visualmente evidenziata con accent color e leggera scale up. La tab **Spesa** SHALL puntare alla pagina `ShoppingPage` con la lista funzionante (non più placeholder). Le altre tab non-Settings non ancora popolate (Calendario, Bacheca, Telecamere) SHALL continuare a mostrare placeholder finché non verranno popolate dalle rispettive change verticali.

#### Scenario: Settings tab is fully functional in foundation
- **WHEN** l'utente tocca la tab Settings
- **THEN** la UI SHALL mostrare almeno: gestione famiglia (CRUD family members), selettore tema (auto/light/dark), info versione app
- **AND** queste sezioni SHALL essere completamente funzionanti dopo `add-foundation`

#### Scenario: Shopping tab is fully functional after this change
- **WHEN** l'utente tocca la tab Spesa
- **THEN** la UI SHALL mostrare la `ShoppingPage` con form di aggiunta, lista raggruppata per categoria, sezione completati collassabile
- **AND** le mutation SHALL persistere nel backend e sincronizzarsi tra dispositivi nella tailnet

#### Scenario: Other tabs still show placeholder
- **WHEN** l'utente tocca una tab tra Calendario / Bacheca / Telecamere
- **THEN** la UI SHALL mostrare uno schermo di placeholder elegante che indica "In arrivo nella change `<nome>`"
- **AND** SHALL essere visivamente coerente con il design system
