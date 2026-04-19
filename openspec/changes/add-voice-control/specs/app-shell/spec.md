## MODIFIED Requirements

### Requirement: Header shows live date, time, weather and voice indicator

L'header dell'AppShell SHALL mostrare in modo persistente:
1. Data corrente in formato lungo italiano
2. Ora corrente in formato 24h con secondi
3. Meteo compatto (popolato da `add-weather`)
4. **VoiceWaveIndicator + VoicePrivacyIndicator**: due componenti affiancati che mostrano lo stato del voice engine. Il `VoiceWaveIndicator` mostra un'animazione waveform Siri-like che cambia colore in base allo stato (idle/listening/speaking/error/disabled). Il `VoicePrivacyIndicator` mostra un'icona microfono che indica lo stato del loop wake word, con tap per pausa rapida. Entrambi popolati dalla change `add-voice-control`.
5. Indicatore di connessione al backend

#### Scenario: Clock updates every second
- **WHEN** l'app è in foreground sull'iPad
- **THEN** l'ora visualizzata nell'header SHALL aggiornarsi ogni secondo

#### Scenario: Voice indicators are always visible
- **WHEN** l'app è in foreground
- **THEN** il VoiceWaveIndicator e il VoicePrivacyIndicator SHALL essere sempre visibili nell'header
- **AND** SHALL riflettere lo stato corrente del voice engine

#### Scenario: Tap on privacy indicator pauses voice
- **WHEN** l'utente tocca il VoicePrivacyIndicator
- **AND** il loop wake word è attivo
- **THEN** il loop SHALL stoppare immediatamente
- **AND** l'icona SHALL cambiare a "in pausa"

#### Scenario: Backend offline indicator
- **WHEN** il backend non risponde a `GET /health` per più di 10 secondi
- **THEN** l'indicatore di connessione nell'header SHALL diventare rosso
