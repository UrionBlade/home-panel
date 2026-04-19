## Why

Il voice control è il **secondo modo di interazione primario** del pannello (dopo il touch). L'utente vuole un'esperienza alla Google Home / Alexa, completamente on-device, gratuita, in italiano, che funziona realmente su iPad WKWebView (cosa che `Web Speech API` non garantisce). Tutte le altre change sono state progettate "voice-ready" con endpoint by-natural-language, by-name, today/tomorrow voice-friendly. Questa change le orchestra costruendo:

1. **Plugin Tauri custom complesso** in Rust + Swift bridge che integra:
   - **OpenWakeWord** per il rilevamento always-on di "Ok casa" (modello custom da addestrare o usare wake word generico tipo "Hey Casa")
   - **Whisper.cpp** per lo Speech-to-Text in italiano on-device (modello small ~466MB, ottimizzato per Apple Silicon M1+)
   - **AVSpeechSynthesizer** nativo iOS per il Text-to-Speech con voci italiane neurali (gratis, alta qualità Siri-like)
2. **Voice command parser** lato client che riceve la trascrizione, la classifica in intent (spesa/calendario/spazzatura/meteo/timer/postit/routine/saluto), estrae entità (nome prodotto, data, member name, ecc.), invoca le API delle altre change (by-name, by-natural-language, today, tomorrow)
3. **UI voice indicator**: onda Siri-like nell'header sempre visibile quando il microfono ascolta, fullscreen overlay quando rileva il wake word con trascrizione live + risposta vocale, indicatore privacy chiaro
4. **Routine pre-built**: "buongiorno" (legge meteo + eventi del giorno + sacchi spazzatura), "buonanotte" (passa a modalità notte + riassume domani)
5. **Toggle privacy completo**: tasto fisico in app per pausa rapida + toggle in Settings → Voce per disabilitare completamente l'ascolto

## What Changes

### Plugin Tauri custom esteso

- **Crate esistente** `apps/mobile/src-tauri/src/voice/` con sub-moduli `wake_word.rs`, `whisper.rs`, `tts.rs`
- **Wake word**: integrare OpenWakeWord (Rust crate o Python via FFI bridge — da decidere in design.md). Modello pre-addestrato per "hey casa"/"ok casa" (caricato come asset bundle dell'app)
- **STT**: integrare `whisper-rs` (binding Rust per whisper.cpp). Modello `ggml-small-it.bin` caricato come asset bundle
- **TTS**: bridge Swift `@_cdecl("ios_speak")` che usa `AVSpeechSynthesizer` con voce italiana neurale
- **Audio capture**: setup permesso microfono iOS via `Info.plist` (`NSMicrophoneUsageDescription`) + entitlement `audio` background mode
- Comandi Tauri esposti al frontend:
  - `voice_start_listening()` — avvia il loop wake word + STT
  - `voice_stop_listening()` — stoppa
  - `voice_speak(text: String)` — TTS della risposta
  - `voice_get_status()` — ritorna `{ wake_word_active, last_transcript, error }`
  - Eventi Tauri emessi al frontend: `voice:wake-word-detected`, `voice:transcript-partial`, `voice:transcript-final`, `voice:error`

### Frontend voice command parser

- **Servizio** `voiceCommandParser.ts` che riceve una stringa (la trascrizione finale di Whisper) e ritorna un `ParsedCommand` con `intent`, `entities`, `confidence`
- **Intent classifier** semplice basato su pattern matching italiano (regex + keyword) — niente ML lato client. I 9 intent supportati:
  1. `add_to_shopping` — "aggiungi X alla spesa" / "metti X nella lista"
  2. `remove_from_shopping` — "togli X dalla spesa"
  3. `read_shopping` — "leggi la spesa" / "cosa devo comprare"
  4. `add_event` — "aggiungi evento Y il Z" / "ricordami che..."
  5. `read_today_events` — "che eventi ho oggi" / "cosa devo fare oggi"
  6. `read_tomorrow_events` — "cosa devo fare domani"
  7. `read_waste_today` — "cosa porto fuori stasera" / "cosa si butta oggi"
  8. `read_waste_tomorrow` — "cosa porto fuori domani"
  9. `read_weather` — "che tempo fa" / "che tempo farà domani"
  10. `set_timer` — "imposta timer X minuti" / "sveglia tra X"
  11. `add_postit` — "appunto: X" / "aggiungi alla bacheca X"
  12. `routine_morning` — "buongiorno" / "ok casa, buongiorno"
  13. `routine_night` — "buonanotte"
  14. `cancel` — "annulla" / "stop"
- **Intent handler** che invoca le API delle altre change e costruisce la risposta vocale italiana

### UI components

- `VoiceWaveIndicator` nell'header: piccola onda Siri-like animata quando il microfono ascolta in background. Cambia colore (`oklch(70% 0.10 60)` calmo / `oklch(72% 0.15 50)` attivo / `oklch(78% 0.13 320)` errore)
- `VoiceListeningOverlay` fullscreen che appare al rilevamento del wake word: backdrop blur, onda enorme animata in centro, trascrizione live in basso (font Fraunces medio), bottone "Annulla"
- `VoicePrivacyIndicator` nell'header: piccola icona microfono sempre visibile quando il sistema può ascoltare (off / standby / active), tap per pausa rapida
- `VoiceSettings` in Settings → Voce: toggle on/off, sensitività wake word, voce TTS preferita, lista comandi supportati come help

### Routine pre-built

- **Buongiorno**: TTS "Buongiorno! Oggi a Besozzo `<weather>`. Hai `<event count>` eventi: `<list>`. Stasera dovrai portare fuori `<waste>`."
- **Buonanotte**: TTS "Buonanotte. Passo in modalità notte. Domani avrai `<event count>` eventi e dovrai portare fuori `<waste>`." + invoca `setNightMode(true)` immediato

## Capabilities

### New Capabilities

- `voice-engine`: plugin Tauri Whisper.cpp + wake word + AVSpeech + permessi iOS + audio entitlement
- `voice-commands`: parser intent + handler che orchestra le API delle altre feature
- `voice-ui`: VoiceWaveIndicator, VoiceListeningOverlay, VoicePrivacyIndicator
- `voice-routines`: buongiorno e buonanotte

### Modified Capabilities

- `app-shell`: sostituisce il placeholder voice indicator con `VoiceWaveIndicator` + `VoicePrivacyIndicator` reali

## Impact

**Codice nuovo**:
- `apps/mobile/src-tauri/src/voice/mod.rs` + sub-moduli
- `apps/mobile/src-tauri/src/voice/wake_word.rs`
- `apps/mobile/src-tauri/src/voice/whisper.rs`
- `apps/mobile/src-tauri/src/voice/tts.rs`
- `apps/mobile/src-tauri/ios/VoicePlugin.swift`
- `apps/mobile/src-tauri/assets/whisper-small-it.bin` (download al build, non committato)
- `apps/mobile/src-tauri/assets/wake-word-ok-casa.bin` (modello OpenWakeWord o equivalente)
- `apps/mobile/src/lib/voice/voiceClient.ts` — wrapper TS dei comandi/eventi Tauri
- `apps/mobile/src/lib/voice/voiceCommandParser.ts`
- `apps/mobile/src/lib/voice/intentHandlers.ts`
- `apps/mobile/src/lib/voice/voiceResponses.ts` — generatore di risposte italiane
- `apps/mobile/src/components/voice/VoiceWaveIndicator.tsx`
- `apps/mobile/src/components/voice/VoiceListeningOverlay.tsx`
- `apps/mobile/src/components/voice/VoicePrivacyIndicator.tsx`
- `apps/mobile/src/components/settings/VoiceSettings.tsx`
- `apps/mobile/src/lib/hooks/useVoice.ts`
- `apps/mobile/src/locales/it/voice.json`
- `apps/api/src/db/schema.ts` — tabella `voice_settings` (singola riga: enabled, sensitivity, preferredTtsVoice)
- `apps/api/src/routes/voice.ts` — settings + (futura) storia comandi

**Codice modificato**:
- `apps/mobile/src-tauri/Cargo.toml` — aggiunge `whisper-rs`, dipendenze audio
- `apps/mobile/src-tauri/tauri.conf.json` — capabilities permission + microphone usage
- `apps/mobile/src-tauri/Info.plist` — `NSMicrophoneUsageDescription` + `UIBackgroundModes: [audio]`
- `apps/mobile/src/components/layout/AppHeader.tsx` — sostituisce placeholder con VoiceWaveIndicator + VoicePrivacyIndicator
- `apps/mobile/src/components/layout/AppShell.tsx` — monta `VoiceListeningOverlay` come fratello dello screensaver
- `apps/mobile/src/pages/SettingsPage.tsx` — aggiunge sezione Voce

**Dipendenze native**:
- `whisper-rs` Rust crate (binding di whisper.cpp)
- Asset binari: modello Whisper italiano small (~466MB), modello wake word (~100KB)
- Eventualmente `cmake` come build dependency di whisper-rs

**Migration**: nuova tabella settings.

**Nessun breaking change** (estende solo l'AppShell).
