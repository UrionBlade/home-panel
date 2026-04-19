## ADDED Requirements

### Requirement: Wave indicator in header reflects voice state

L'header dell'AppShell SHALL mostrare un componente `VoiceWaveIndicator` accanto al meteo che riflette lo stato del voice engine:

- **Idle (wake word attivo, niente in corso)**: 5 piccole barre verticali animate molto sottili pulsanti lentamente, colore `oklch(70% 0.05 60)` (calmo, quasi invisibile)
- **Listening (wake word rilevato, STT in corso)**: barre più alte, colore accent `oklch(72% 0.15 50)` (terracotta), animazione più vivace con waveform che reagisce all'audio amplitude
- **Speaking (TTS in corso)**: stessa shape ma colore `oklch(78% 0.13 75)` (ambra) per distinguere chi parla
- **Error**: barre statiche colore `oklch(60% 0.13 25)` (rosa scuro warning), tooltip con dettaglio errore
- **Disabled (utente ha pausa il voice)**: 5 barre flat statiche grigie

L'animazione SHALL essere `transform: scaleY(...)` per rimanere su GPU. SHALL rispettare `prefers-reduced-motion`.

#### Scenario: Idle state shows subtle pulse
- **WHEN** il voice è attivo ma niente è in corso
- **THEN** il VoiceWaveIndicator SHALL mostrare 5 barre con animazione lenta scaleY (1.0 → 1.3 → 1.0 in 2 secondi)
- **AND** colore `oklch(70% 0.05 60)`

#### Scenario: Listening state animates with audio
- **WHEN** il wake word è rilevato e STT in corso
- **THEN** le barre SHALL animare con scaleY più marcata
- **AND** colore terracotta accent

#### Scenario: Reduced motion replaces with static dot
- **WHEN** `prefers-reduced-motion: reduce`
- **THEN** il VoiceWaveIndicator SHALL mostrare solo un cerchio statico colorato per indicare lo stato (no animazione barre)

### Requirement: Listening overlay appears on wake word detection

Quando il wake word viene rilevato, il sistema SHALL mostrare un `VoiceListeningOverlay` fullscreen sopra l'AppShell con:
- Backdrop blur leggero (`backdrop-filter: blur(20px)`) sopra il contenuto sottostante
- Onda sonora **enorme** animata al centro (più grande del wave indicator dell'header) con waveform live basata sull'amplitude dell'audio
- Trascrizione live in basso (font Fraunces medium, fade-in delle parole man mano che arrivano)
- Bottone "Annulla" in basso (`size lg`, ghost variant) per dismettere senza eseguire
- Animazione di entrata: scale 0.95 → 1, opacity 0 → 1, durata 320ms ease-out-quart
- Durata massima 8 secondi (timeout STT) prima di chiudersi automaticamente

Dopo la trascrizione finale, l'overlay SHALL mostrare brevemente (~1.5s) la risposta vocale come testo grande mentre il TTS parla, poi si chiude con fade.

#### Scenario: Overlay opens on wake word
- **WHEN** il wake word è rilevato
- **THEN** `<VoiceListeningOverlay />` SHALL apparire con animazione scale + fade
- **AND** SHALL mostrare l'onda animata enorme + "In ascolto..."

#### Scenario: Live transcript update
- **WHEN** Whisper emette `voice:transcript-partial { text: "aggiungi" }`
- **THEN** l'overlay SHALL mostrare "aggiungi" nella sezione trascrizione
- **WHEN** l'evento partial successivo arriva con "aggiungi latte"
- **THEN** la trascrizione SHALL aggiornarsi a "aggiungi latte" con leggero fade della nuova parola

#### Scenario: Cancel dismisses overlay
- **WHEN** l'utente preme "Annulla"
- **THEN** l'overlay SHALL chiudersi
- **AND** SHALL chiamare `voice_stop_listening()` per resettare il loop al wake word

#### Scenario: Overlay shows response then closes
- **GIVEN** la trascrizione finale è "che tempo fa" e la risposta è "A Besozzo ci sono 18 gradi, soleggiato"
- **WHEN** il TTS inizia a parlare
- **THEN** l'overlay SHALL mostrare il testo della risposta in grande
- **AND** dopo che il TTS finisce SHALL chiudersi con fade dopo 500ms aggiuntivi

### Requirement: Privacy indicator is always visible when mic is enabled

Il sistema SHALL mostrare un `VoicePrivacyIndicator` sempre visibile nell'header (anche di fianco al wave) come icona Phosphor `microphone` con:
- **Mic on (loop attivo)**: icona piena `oklch(72% 0.13 30)` (rosso-rosato sottile)
- **Mic standby (loop pausato manualmente)**: icona outline `oklch(60% 0.04 80)` (grigio caldo)
- **Mic off (Settings disabled)**: icona barrata `oklch(60% 0.13 25)` (rosa scuro)

Tap sull'icona SHALL toggle pause rapido (mic on ↔ standby) senza dover entrare nelle Settings. Tap lungo SHALL mostrare un tooltip con stato corrente + link rapido alle Settings → Voce.

#### Scenario: Tap pauses mic
- **GIVEN** il mic è in loop attivo
- **WHEN** l'utente tap sul VoicePrivacyIndicator
- **THEN** il loop SHALL stoppare
- **AND** l'icona SHALL passare a outline standby
- **AND** l'evento `voice:status` SHALL emetterre `wake_word_active: false`

#### Scenario: Long press shows tooltip
- **WHEN** l'utente fa long press sull'icona
- **THEN** SHALL apparire un tooltip "Microfono attivo. Tap per mettere in pausa. Vai in Settings → Voce per disabilitare completamente."

### Requirement: Voice settings page allows full configuration

La sezione Settings → Voce SHALL contenere:
- **Toggle "Voice attivo"**: disabilita completamente il loop wake word
- **Slider "Sensibilità wake word"**: 0.4-0.9 (default 0.6), spiegazione "Più alto = meno falsi positivi, più difficile da attivare"
- **Selettore "Voce TTS"**: lista delle voci italiane installate sul device, anteprima audio al tap
- **Lista "Comandi disponibili"**: help espandibile con esempi per ogni intent
- **Bottone "Test microfono"**: registra 3 secondi di audio e mostra il livello visivamente
- **Indicatore stato**: privacy info, ultimo evento, errori recenti

#### Scenario: Toggle off disables loop
- **GIVEN** il loop wake word è attivo
- **WHEN** l'utente disattiva "Voice attivo"
- **THEN** il loop SHALL fermarsi
- **AND** il VoiceWaveIndicator SHALL passare a stato disabled
- **AND** la preferenza SHALL essere persistita in `voice_settings`

#### Scenario: Sensitivity slider applied
- **WHEN** l'utente cambia la sensibilità da 0.6 a 0.8
- **THEN** il backend SHALL persistere il valore
- **AND** il plugin SHALL applicare la nuova soglia al modello wake word
- **AND** SHALL essere effettivo immediatamente

#### Scenario: Test microphone shows audio level
- **WHEN** l'utente preme "Test microfono"
- **THEN** SHALL registrare 3 secondi
- **AND** SHALL mostrare un waveform visivo dell'amplitude registrata
- **AND** se nessun audio è rilevato SHALL avvisare "Nessun audio rilevato, controlla i permessi"
