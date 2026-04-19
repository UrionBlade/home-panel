## 1. Setup plugin Tauri voice scaffolding

- [ ] 1.1 Creare la directory `apps/mobile/src-tauri/src/voice/` con `mod.rs`, `audio_buffer.rs`, `wake_word.rs`, `whisper.rs`, `tts.rs`, `state.rs`
- [ ] 1.2 Aggiungere a `Cargo.toml` le dipendenze `whisper-rs` con feature `coreml`, `cpal` per audio (se necessario), `tokio` per async
- [ ] 1.3 Aggiungere a `tauri.conf.json` la capability per i nuovi comandi voice
- [ ] 1.4 Aggiungere a `Info.plist` `NSMicrophoneUsageDescription` con stringa italiana
- [ ] 1.5 Verificare che `UIBackgroundModes: [audio]` sia presente (già aggiunto in `add-foundation`)

## 2. Bridge Swift per audio + TTS

- [ ] 2.1 Creare `apps/mobile/src-tauri/ios/VoicePlugin.swift` con setup `AVAudioEngine`
- [ ] 2.2 Implementare `@_cdecl("ios_start_audio_capture")` con install tap su input node
- [ ] 2.3 Implementare callback verso Rust con buffer audio float 16kHz mono
- [ ] 2.4 Implementare `@_cdecl("ios_stop_audio_capture")`
- [ ] 2.5 Implementare `@_cdecl("ios_speak")` con AVSpeechSynthesizer + voce italiana migliore
- [ ] 2.6 Implementare `@_cdecl("ios_request_mic_permission")` che chiama `AVAudioSession` permission API
- [ ] 2.7 Test su simulator: verificare che il bridge funzioni e che il permesso venga richiesto

## 3. Whisper.cpp integration

- [ ] 3.1 Aggiungere `whisper-rs` con feature CoreML al Cargo.toml
- [ ] 3.2 Implementare `apps/mobile/src-tauri/src/voice/whisper.rs` con:
  - `WhisperContext` lazily caricato da path del modello
  - Funzione `transcribe(samples: &[f32]) -> Result<String, Error>` con strategia greedy + lingua italiana hardcoded
- [ ] 3.3 Test unit con un file WAV italiano di esempio (placed in `tests/fixtures/`)
- [ ] 3.4 Implementare download del modello `ggml-small-it.bin` al primo avvio dell'app:
  - `apps/mobile/src-tauri/src/voice/model_loader.rs` con check se file esiste in `documents_dir/whisper-small-it.bin`
  - Se mancante, download da URL configurato (es. Hugging Face) con progress callback

## 4. Wake word detection

- [ ] 4.1 Selezionare libreria wake word (decisione finale: OpenWakeWord se esiste binding Rust, altrimenti Porcupine personal). Spiegazione decisione documentata in design.md
- [ ] 4.2 Procurare/creare modello "ok casa" (check huggingface community, eventuale fallback "hey casa")
- [ ] 4.3 Bundle del modello (~100KB) come asset Tauri in `assets/wake-word.bin`
- [ ] 4.4 Implementare `apps/mobile/src-tauri/src/voice/wake_word.rs` con `WakeWordDetector::new()` e `process_frame(samples) -> bool`
- [ ] 4.5 Soglia di detection configurabile via `voice_settings.sensitivity`

## 5. State machine voice engine

- [ ] 5.1 Implementare `apps/mobile/src-tauri/src/voice/state.rs` con enum `VoiceState`
- [ ] 5.2 Loop principale async che cicla: capture audio → if wake word → switch a Listening → accumulate audio per max 8s → transcribe → emit events
- [ ] 5.3 Gestione transitions sicure con Mutex
- [ ] 5.4 Voice activity detection (VAD) basico per stop early del listening dopo 1.5s di silenzio

## 6. Tauri commands ed eventi

- [ ] 6.1 Implementare i comandi pubblici: `voice_start_listening()`, `voice_stop_listening()`, `voice_speak(text)`, `voice_get_status()`, `voice_request_permission()`
- [ ] 6.2 Emettere gli eventi documentati: `voice:status`, `voice:wake-word-detected`, `voice:transcript-partial`, `voice:transcript-final`, `voice:speaking-started`, `voice:speaking-finished`, `voice:error`
- [ ] 6.3 Stub no-op per non-iOS targets

## 7. Backend: voice settings

- [x] 7.1 Aggiungere a `apps/api/src/db/schema.ts` la tabella `voice_settings` (singola riga: enabled, sensitivity, preferredTtsVoice, updatedAt)
- [x] 7.2 Migration + seed di default
- [x] 7.3 Creare `apps/api/src/routes/voice.ts` con `GET/PATCH /settings`

## 8. Frontend: voice client

- [x] 8.1 Creare `apps/mobile/src/lib/voice/voiceClient.ts` con wrapper `invoke` + `listen` per ogni comando/evento
- [x] 8.2 Esporre API tipizzata: `start()`, `stop()`, `speak(text)`, `onWakeWord(handler)`, `onTranscript(handler)`, `getStatus()`

## 9. Frontend: parser intent

- [x] 9.1 Creare `apps/mobile/src/lib/voice/voiceCommandParser.ts` con array `PATTERNS` + funzione `parse(text)`
- [x] 9.2 Implementare i 14 pattern documentati (add_to_shopping, remove_from_shopping, read_shopping, add_event, read_today_events, read_tomorrow_events, read_waste_today, read_waste_tomorrow, read_weather, set_timer, add_postit, routine_morning, routine_night, cancel)
- [x] 9.3 Test unit per ogni pattern con input italiani realistici

## 10. Frontend: intent handlers

- [x] 10.1 Creare `apps/mobile/src/lib/voice/intentHandlers.ts` con un handler per ogni intent
- [x] 10.2 Handler `add_to_shopping` chiama `apiClient.post('/api/v1/shopping/items/by-name', { name })` e ritorna risposta vocale
- [x] 10.3 Handler `remove_from_shopping` chiama `apiClient.delete('/api/v1/shopping/items/by-name?name=...')`
- [x] 10.4 Handler `read_shopping` chiama GET items e legge la lista naturale
- [x] 10.5 Handler `add_event` chiama `/api/v1/calendar/events/by-natural-language`
- [x] 10.6 Handler `read_today_events` / `read_tomorrow_events` chiama `/api/v1/calendar/today` o `/tomorrow` e formatta narrativa
- [x] 10.7 Handler `read_waste_today` / `read_waste_tomorrow` chiama `/api/v1/waste/today` o `/tomorrow` (usa `voiceText` direttamente)
- [x] 10.8 Handler `read_weather` chiama `/api/v1/weather/voice?when=now`
- [x] 10.9 Handler `set_timer` stub che ritorna "I timer arriveranno in una versione futura"
- [x] 10.10 Handler `add_postit` chiama `/api/v1/postits/by-natural-language`
- [x] 10.11 Handler `routine_morning` chiama 3 API in parallelo + compose
- [x] 10.12 Handler `routine_night` chiama 2 API + invoca `setNightMode(true)`
- [x] 10.13 Handler `cancel` ferma il TTS in corso e dice "Annullato"

## 11. Frontend: voice responses generator

- [x] 11.1 Creare `apps/mobile/src/lib/voice/voiceResponses.ts` con funzioni helper italiane
- [x] 11.2 `composeTodayEvents(events)`, `composeWasteText(types, when)`, `composeWeather(current)`, `composeShopping(items)`, ecc.
- [x] 11.3 Gestione plurali e articoli italiani

## 12. Frontend: hook useVoice

- [x] 12.1 Creare `apps/mobile/src/lib/hooks/useVoice.ts` che orchestral voiceClient + parser + handlers
- [x] 12.2 Espone state: `{ status, transcript, response, error }`
- [x] 12.3 Setup auto: subscribe agli eventi, chiama parser su transcript-final, invoca handler, chiama speak() con la risposta

## 13. Frontend: UI components

- [x] 13.1 Creare `apps/mobile/src/components/voice/VoiceWaveIndicator.tsx` con 5 barre animate Framer Motion + colori dinamici per stato
- [x] 13.2 Creare `apps/mobile/src/components/voice/VoiceListeningOverlay.tsx` con backdrop blur, onda enorme animata, trascrizione live, bottone Annulla
- [x] 13.3 Creare `apps/mobile/src/components/voice/VoicePrivacyIndicator.tsx` con icona microfono Phosphor + tap per pause + long press tooltip
- [x] 13.4 Reduced motion: VoiceWaveIndicator passa a static dot
- [x] 13.5 Coerenza con `.impeccable.md` (palette, easing, font)

## 14. Frontend: AppShell integration

- [x] 14.1 Aggiornare `AppHeader.tsx` per sostituire i placeholder con `VoiceWaveIndicator` + `VoicePrivacyIndicator`
- [x] 14.2 Aggiornare `AppShell.tsx` per montare `VoiceListeningOverlay` come sibling dello screensaver
- [x] 14.3 Reset idle timer su voice events (così lo screensaver non parte mentre l'utente parla)
- [x] 14.4 Inizializzare `useVoice()` a livello AppShell (single instance)

## 15. Settings → Voce

- [x] 15.1 Creare `apps/mobile/src/components/settings/VoiceSettings.tsx`
- [x] 15.2 Toggle Voice attivo, slider sensibilità, selettore voce TTS (lista voci installate via API native)
- [x] 15.3 Lista comandi disponibili come help espandibile
- [x] 15.4 Bottone "Test microfono" con visualizzazione waveform
- [x] 15.5 Aggiungere la sezione a `SettingsPage.tsx`

## 16. i18n

- [x] 16.1 Creare `apps/mobile/src/locales/it/voice.json` con tutte le stringhe (titoli, label, comandi help, error messages)

## 17. Test E2E voice

- [ ] 17.1 `pnpm typecheck && pnpm lint` verde
- [ ] 17.2 Test su iPad device reale: dire "Ok casa", verificare che l'overlay si apra
- [ ] 17.3 Test "Ok casa, aggiungi latte alla spesa" → verificare che item appaia in spesa e TTS dica "Ho aggiunto latte alla spesa"
- [ ] 17.4 Test "Ok casa, che eventi ho oggi" → verificare lettura corretta
- [ ] 17.5 Test "Ok casa, cosa porto fuori stasera" → verificare voiceText corretto
- [ ] 17.6 Test "Ok casa, che tempo fa" → verificare current weather italiano
- [ ] 17.7 Test "Ok casa, buongiorno" → routine completa
- [ ] 17.8 Test "Ok casa, buonanotte" → night mode + routine
- [ ] 17.9 Test "Ok casa, appunto: comprare il regalo" → postit creato
- [ ] 17.10 Test pause: tap privacy indicator → loop si ferma
- [ ] 17.11 Test disabilita: toggle settings off → loop fermato e indicator cambia
- [ ] 17.12 Test fail soft: modello whisper mancante → graceful error
- [ ] 17.13 Test reduced motion: indicatori statici
- [ ] 17.14 `openspec validate add-voice-control` verde
