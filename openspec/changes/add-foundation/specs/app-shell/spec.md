## ADDED Requirements

### Requirement: App shell adapts between iPad landscape and iPhone portrait

L'AppShell SHALL renderizzare due layout differenti a seconda del dispositivo:
- **iPad in landscape (>= 1024px width)**: layout a mosaico asimmetrico a 12 colonne, header in alto con orologio + meteo + indicatore voice, navigazione tramite tab bar laterale o inferiore.
- **iPhone in portrait (< 768px width)**: stack verticale, header compatto, tab bar inferiore, gesture-driven.

L'adattamento SHALL essere fluido tramite container queries e media queries, NON tramite due alberi React separati. SHALL NOT nascondere funzionalità su iPhone (no "amputazione mobile"): tutto è raggiungibile, solo il layout cambia.

#### Scenario: iPad Pro 11 renders mosaic layout
- **WHEN** l'app viene caricata su un viewport >= 1024px in landscape
- **THEN** la home page SHALL essere visualizzata come griglia 12 colonne con tile di dimensioni variabili
- **AND** la tab bar SHALL essere posizionata in basso con label visibili sotto le icone

#### Scenario: iPhone 14 renders vertical stack
- **WHEN** l'app viene caricata su un viewport < 768px in portrait
- **THEN** la home page SHALL essere visualizzata come stack verticale di tile a larghezza piena
- **AND** la tab bar SHALL essere fissata in basso con safe area inset

#### Scenario: All features are reachable on both devices
- **WHEN** un utente naviga su iPhone tra le tab Home / Calendario / Spesa / Bacheca / Telecamere / Settings
- **THEN** ogni tab SHALL essere accessibile e SHALL mostrare la stessa funzionalità della versione iPad

### Requirement: Header shows live date, time, weather placeholder, and voice indicator

L'header dell'AppShell SHALL mostrare in modo persistente:
1. Data corrente in formato lungo italiano (es. "Martedì 7 aprile")
2. Ora corrente in formato 24h con secondi (es. "14:23")
3. Slot meteo (placeholder per ora; sarà popolato dalla change `add-weather`)
4. Indicatore voice always-on (placeholder per ora; sarà popolato dalla change `add-voice-control`)
5. Eventuale indicatore di connessione al backend (verde se ok, ambra se degraded, rosso se offline)

L'orologio SHALL aggiornarsi al secondo senza ricaricare componenti pesanti.

#### Scenario: Clock updates every second
- **WHEN** l'app è in foreground sull'iPad
- **THEN** l'ora visualizzata nell'header SHALL aggiornarsi ogni secondo
- **AND** l'aggiornamento SHALL NOT causare re-render dell'intera AppShell, solo del componente Clock

#### Scenario: Backend offline indicator
- **WHEN** il backend non risponde a `GET /health` per più di 10 secondi
- **THEN** l'indicatore di connessione nell'header SHALL diventare rosso
- **AND** SHALL mostrare un tooltip "Backend non raggiungibile" al tap/hover

### Requirement: Tab navigation includes all foundational sections

La tab bar SHALL contenere esattamente queste tab nell'ordine seguente: **Home**, **Calendario**, **Spesa**, **Bacheca**, **Telecamere**, **Settings**. Ogni tab SHALL avere un'icona Phosphor `duotone` e una label italiana. La tab attiva SHALL essere visualmente evidenziata con accent color e leggera scale up. Le tab SHALL essere semplicemente registrate nel router; il contenuto delle tab non-Settings SHALL essere placeholder ("In arrivo nella prossima change") finché non verranno popolate dalle rispettive change verticali.

#### Scenario: Settings tab is fully functional in foundation
- **WHEN** l'utente tocca la tab Settings
- **THEN** la UI SHALL mostrare almeno: gestione famiglia (CRUD family members), selettore tema (auto/light/dark), info versione app
- **AND** queste sezioni SHALL essere completamente funzionanti dopo `add-foundation`

#### Scenario: Other tabs show placeholder
- **WHEN** l'utente tocca una tab tra Home / Calendario / Spesa / Bacheca / Telecamere
- **THEN** la UI SHALL mostrare uno schermo di placeholder elegante (non un errore) che indica "In arrivo nella change `<nome>`"
- **AND** SHALL essere visivamente coerente con il design system

### Requirement: Global error boundary catches rendering failures

L'AppShell SHALL essere wrappata da un error boundary React globale che intercetta qualsiasi eccezione di rendering nei componenti figli e mostra una schermata di fallback elegante (non un crash con white screen) con: messaggio di errore in italiano, bottone "Ricarica", e log dell'errore inviato a console.

#### Scenario: Child component throws during render
- **WHEN** un componente figlio dell'AppShell lancia un'eccezione durante il render
- **THEN** l'error boundary SHALL catturare l'errore
- **AND** SHALL renderizzare la schermata di fallback con il messaggio "Qualcosa è andato storto" e un bottone "Ricarica"
- **AND** l'errore SHALL essere loggato in console (e in futuro inviato a un sink di telemetria)
