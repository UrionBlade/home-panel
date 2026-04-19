## MODIFIED Requirements

### Requirement: Tab navigation includes all foundational sections

La tab bar SHALL contenere esattamente queste tab nell'ordine seguente: **Home**, **Calendario**, **Spesa**, **Bacheca**, **Telecamere**, **Settings**. Ogni tab SHALL avere un'icona Phosphor `duotone` e una label italiana. La tab attiva SHALL essere visualmente evidenziata con accent color e leggera scale up. Le tab **Spesa** e **Calendario** SHALL puntare a pagine reali. Le tab non ancora popolate (Bacheca, Telecamere) SHALL continuare a mostrare placeholder finché non verranno popolate dalle rispettive change verticali.

#### Scenario: Settings tab is fully functional in foundation
- **WHEN** l'utente tocca la tab Settings
- **THEN** la UI SHALL mostrare almeno: gestione famiglia (CRUD family members), selettore tema (auto/light/dark), info versione app
- **AND** queste sezioni SHALL essere completamente funzionanti dopo `add-foundation`

#### Scenario: Calendar tab is fully functional after this change
- **WHEN** l'utente tocca la tab Calendario
- **THEN** la UI SHALL mostrare la `CalendarPage` con vista Oggi di default + selettore di vista Mese/Settimana/Agenda/Oggi
- **AND** le mutation SHALL persistere nel backend e sincronizzarsi tra dispositivi nella tailnet

#### Scenario: Other tabs still show placeholder
- **WHEN** l'utente tocca una tab tra Bacheca / Telecamere
- **THEN** la UI SHALL mostrare uno schermo di placeholder elegante che indica "In arrivo nella change `<nome>`"
- **AND** SHALL essere visivamente coerente con il design system
