## ADDED Requirements

### Requirement: Night mode activates automatically based on hour range

Il sistema SHALL supportare una "modalità notte" automatica configurabile dall'utente con: orario inizio (default 22:00), orario fine (default 07:00), enabled flag. Il `NightModeProvider` lato client SHALL controllare ogni minuto se l'ora corrente cade nel range, e applicare/rimuovere l'attributo `data-night-mode="true"` sull'elemento `<html>`.

#### Scenario: Night mode activates at configured hour
- **GIVEN** night mode è abilitato con start = 22:00 e end = 07:00
- **WHEN** l'ora corrente diventa 22:00
- **THEN** il `NightModeProvider` SHALL applicare `<html data-night-mode="true">`
- **AND** il file `night-mode.css` SHALL cambiare le CSS variables a valori dimmati

#### Scenario: Night mode deactivates at end hour
- **GIVEN** night mode è attivo
- **WHEN** l'ora corrente diventa 07:00
- **THEN** l'attributo `data-night-mode` SHALL essere rimosso
- **AND** la UI SHALL tornare ai valori normali con cross-fade di 1 secondo

#### Scenario: Range crossing midnight
- **WHEN** start = 22:00 e end = 07:00 (range che attraversa mezzanotte)
- **AND** l'ora corrente è 02:00
- **THEN** il provider SHALL considerare l'ora dentro il range e attivare night mode

### Requirement: Night mode CSS variables override design tokens

Il file `night-mode.css` SHALL definire selectors `[data-night-mode="true"]` che ridefiniscono le CSS variables del design system per:
- **Background**: ancora più scuro warm (`oklch(10% 0.012 60)` invece di `oklch(16% 0.012 60)`)
- **Text**: leggermente meno saturo (`oklch(85% 0.005 80)` invece di `oklch(94% 0.008 80)`)
- **Accent**: dimmato del 30%
- **Shadows**: opacità ridotta
- **Animations**: durations dimezzate (più lente per essere meditative)

#### Scenario: Background becomes deeper warm
- **WHEN** night mode è attivo
- **THEN** `var(--color-bg)` SHALL valutare a `oklch(10% 0.012 60)`
- **AND** il computed style del body SHALL riflettere il nuovo valore senza ricaricare componenti

### Requirement: Night mode reduces UI to essentials on home page

Quando il night mode è attivo, la home page SHALL passare a una vista semplificata che mostra solo l'essenziale:
- Orologio molto grande al centro (Fraunces clamp 8rem-14rem)
- Data lunga sotto l'orologio
- Prossimo evento (se esiste, dalla calendar tile)
- Prossimi sacchi della spazzatura (se rilevante)
- **Tutte le altre tile** (spesa, meteo, postit, telecamere) SHALL essere nascoste o ridotte a una piccola riga di icone in fondo

Tap su qualsiasi punto SHALL riportare alla vista normale per l'interazione, ma l'app rimane in night mode (CSS) fino all'orario di fine.

#### Scenario: Night mode home shows clock prominently
- **WHEN** night mode è attivo e l'utente apre la home
- **THEN** la home SHALL mostrare un grande orologio al centro
- **AND** SHALL mostrare il prossimo evento in piccolo sotto
- **AND** SHALL nascondere weather/shopping/board/cameras tile

#### Scenario: Tap shows full UI without exiting night mode
- **WHEN** in night mode l'utente tocca lo schermo
- **THEN** la vista standard SHALL apparire (con i CSS night mode applicati = colori dimmati)
- **AND** SHALL tornare alla vista semplificata dopo 30 secondi di idle
