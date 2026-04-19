## ADDED Requirements

### Requirement: Wake word "Ok casa" is detected always-on while microphone is enabled

Il sistema SHALL ascoltare in modo continuo (always-on) il microfono dell'iPad quando l'app è in foreground e il toggle "Voice attivo" delle Settings è on, con l'unico scopo di rilevare la frase "Ok casa". Il rilevamento SHALL essere completamente on-device usando un modello di wake word (OpenWakeWord o equivalente) caricato come asset bundle dell'app. Nessun audio SHALL lasciare il device prima del wake word.

#### Scenario: Wake word starts on app launch
- **GIVEN** l'utente ha "Voice attivo = on" in Settings → Voce
- **WHEN** l'app viene aperta sull'iPad
- **THEN** il plugin Tauri SHALL avviare il loop wake word automaticamente
- **AND** SHALL emettere l'evento `voice:status` con `wake_word_active: true`
- **AND** il VoicePrivacyIndicator nell'header SHALL mostrare "in ascolto"

#### Scenario: User says "Ok casa"
- **GIVEN** il wake word loop è attivo
- **WHEN** l'utente pronuncia "Ok casa" a 1-3 metri di distanza
- **THEN** il modello SHALL rilevare il match con confidence > soglia configurata (default 0.6)
- **AND** SHALL emettere l'evento `voice:wake-word-detected`
- **AND** SHALL avviare immediatamente la registrazione + STT per il comando seguente

#### Scenario: False positive is rejected
- **WHEN** un suono ambientale simile (es. TV, conversazione) trigge il wake word con confidence < soglia
- **THEN** il sistema SHALL ignorare l'evento
- **AND** SHALL non avviare lo STT
- **AND** SHALL non incrementare alcun counter visibile

#### Scenario: User pauses listening
- **WHEN** l'utente tocca il VoicePrivacyIndicator nell'header
- **THEN** il loop SHALL stoppare immediatamente
- **AND** l'evento `voice:status` SHALL avere `wake_word_active: false`
- **AND** l'icona SHALL mostrare "in pausa"

### Requirement: Whisper.cpp transcribes Italian commands on-device

Il sistema SHALL usare Whisper.cpp (modello `ggml-small-it.bin`, ~466MB) caricato come asset dell'app per trascrivere i comandi vocali successivi al wake word. La trascrizione SHALL avvenire **completamente on-device**, nessun audio SHALL essere inviato a servizi cloud. La sessione di STT SHALL durare massimo 8 secondi (timeout silenzio 1.5 secondi) e ritornare la stringa trascritta come evento `voice:transcript-final`.

#### Scenario: STT after wake word
- **GIVEN** il wake word è stato rilevato
- **WHEN** l'utente dice "aggiungi latte alla spesa" entro 8 secondi
- **THEN** Whisper.cpp SHALL processare l'audio
- **AND** dopo 1.5 secondi di silenzio SHALL emettere `voice:transcript-final` con `{ text: "aggiungi latte alla spesa" }`
- **AND** durante la trascrizione SHALL emettere eventi `voice:transcript-partial` per UI live (se il modello supporta partial)

#### Scenario: STT timeout with no speech
- **WHEN** il wake word è rilevato ma l'utente non parla per 8 secondi
- **THEN** Whisper.cpp SHALL terminare la sessione
- **AND** SHALL emettere `voice:transcript-final` con `{ text: "" }`
- **AND** la UI SHALL chiudere l'overlay listening con un fade

#### Scenario: STT fails to load model
- **WHEN** il modello whisper non è disponibile (file mancante o corrotto)
- **THEN** il plugin SHALL emettere `voice:error` con `{ code: "model_load_failed", message: "Modello Whisper non trovato" }`
- **AND** SHALL fallback a modalità solo-touch (voice disabilitato fino al fix)

### Requirement: AVSpeechSynthesizer speaks Italian responses

Il sistema SHALL usare `AVSpeechSynthesizer` di iOS via plugin Swift bridge per il Text-to-Speech delle risposte. SHALL preferire la voce italiana neurale "Alice (Enhanced)" o "Federica (Premium)" se disponibili sul device, fallback su "Alice" standard. La voce SHALL essere configurata con `rate = 0.5`, `pitchMultiplier = 1.0`, `volume = 1.0`.

#### Scenario: Speak response in Italian
- **WHEN** il client invoca `voice_speak("Ho aggiunto latte alla spesa")`
- **THEN** il plugin SHALL chiamare `AVSpeechSynthesizer.speak()` con AVSpeechUtterance
- **AND** la voce italiana neurale SHALL pronunciare la frase
- **AND** mentre parla SHALL emettere `voice:speaking-started` e poi `voice:speaking-finished`

#### Scenario: Prefer enhanced voice if available
- **WHEN** il device ha installato "Alice (Enhanced)"
- **THEN** SHALL usare quella voce
- **AND** se non installata SHALL fallback su "Alice" standard

#### Scenario: No Italian voice available
- **WHEN** il device non ha alcuna voce italiana installata
- **THEN** il plugin SHALL emettere `voice:error` con messaggio "Nessuna voce italiana disponibile, installala da iOS Settings → Accessibilità"

### Requirement: Plugin requires microphone permission and background audio entitlement

Il file `Info.plist` dell'app iOS SHALL contenere:
- `NSMicrophoneUsageDescription` con stringa italiana: "Home Panel usa il microfono per riconoscere il comando vocale 'Ok casa' e i tuoi comandi successivi. L'audio non lascia mai il tuo dispositivo."
- `UIBackgroundModes` con almeno `audio` (per mantenere il microfono attivo durante operazioni lunghe)

L'utente SHALL essere richiesto di accordare il permesso microfono al primo avvio dell'app dopo l'installazione. Se il permesso viene negato, l'app SHALL mostrare un messaggio elegante nelle Settings → Voce con istruzioni per attivarlo manualmente da iOS Settings.

#### Scenario: First launch prompts microphone permission
- **GIVEN** l'app viene installata e aperta per la prima volta
- **WHEN** l'utente entra nelle Settings → Voce e attiva "Voice attivo"
- **THEN** iOS SHALL mostrare il prompt nativo per il permesso microfono
- **AND** se accordato, il loop wake word SHALL avviarsi
- **AND** se negato, la UI SHALL mostrare "Permesso microfono negato. Vai in Settings di iOS per attivarlo."

#### Scenario: Background audio entitlement keeps listener alive
- **GIVEN** l'app è in foreground con il microfono attivo
- **WHEN** l'iPad blocca lo schermo o l'utente preme home brevemente
- **THEN** grazie all'entitlement `audio` il listener SHALL continuare per qualche secondo
- **AND** quando l'app torna in foreground SHALL riprendere normalmente

### Requirement: Tauri commands and events bridge frontend and native voice

Il plugin SHALL esporre questi comandi Tauri al frontend:

- `voice_start_listening()` — avvia il loop wake word
- `voice_stop_listening()` — stoppa il loop
- `voice_speak(text: String)` — TTS della stringa
- `voice_get_status() -> VoiceStatus` — `{ wake_word_active, is_listening, is_speaking, last_error }`

E SHALL emettere questi eventi:

- `voice:status` (su ogni cambio di stato)
- `voice:wake-word-detected` (al rilevamento)
- `voice:transcript-partial` `{ text }` (durante STT)
- `voice:transcript-final` `{ text }` (al completamento STT)
- `voice:speaking-started` / `voice:speaking-finished`
- `voice:error` `{ code, message }`

Su target non-iOS (browser dev) tutti i comandi SHALL essere no-op e gli eventi SHALL non essere emessi (il frontend gestisce graceful).

#### Scenario: Frontend invokes start
- **WHEN** il frontend invoca `invoke('voice_start_listening')`
- **THEN** il plugin SHALL avviare il loop wake word
- **AND** SHALL emettere `voice:status` con `wake_word_active: true`

#### Scenario: Frontend listens to events
- **WHEN** il frontend registra `listen('voice:wake-word-detected', handler)`
- **AND** il wake word viene rilevato
- **THEN** l'handler SHALL essere invocato
- **AND** l'overlay listening SHALL aprirsi
