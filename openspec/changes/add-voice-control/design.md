## Context

Questa è la change tecnicamente più complessa del progetto. Richiede:
- Plugin Tauri Rust + Swift bridge avanzato
- Whisper.cpp integrato via `whisper-rs`
- Wake word detection always-on
- Audio capture via AVAudioEngine
- AVSpeechSynthesizer per TTS
- Permessi iOS + entitlements
- Asset binari da bundlare nell'app (~466MB modello Whisper)

L'utente ha esplicitamente scelto la strada "wake word + Whisper.cpp" tra le 3 opzioni proposte, sapendo che è l'effort più alto. La motivazione è la qualità top + privacy totale + niente compromessi su iPad WKWebView.

Tutte le altre change sono già state progettate "voice-ready" con endpoint by-name, by-natural-language, today/tomorrow voice-friendly. Questa change è quindi principalmente un **layer di orchestrazione** sopra API esistenti, più il plugin nativo per audio.

## Goals / Non-Goals

### Goals

1. Wake word "Ok casa" always-on funzionante su iPad
2. Whisper.cpp on-device per STT italiano
3. AVSpeech nativo per TTS italiano
4. 14 intent supportati (spesa, calendario, spazzatura, meteo, timer, postit, routine)
5. UI con onda Siri + privacy indicator chiaro
6. Routine pre-built (buongiorno, buonanotte)
7. Toggle privacy facile e comprensibile
8. Tutto offline, niente cloud

### Non-Goals

- **Niente voice fingerprinting** ("chi sta parlando"). Tutti gli utenti sono trattati come "famiglia".
- **Niente conversazioni multi-turno complesse**. Solo disambiguazione semplice (es. "quale latte?").
- **Niente comandi sulla domotica** (luci, prese smart). Quelli vivranno in change futura quando l'utente comprerà gli accessori.
- **Niente custom wake word** addestrato sull'utente. Modello generico OK casa, accuracy ragionevole.
- **Niente push-to-talk fallback** in questa change. Solo wake word. (Possibile aggiunta futura.)
- **Niente trascrizione e analisi della voce** ai fini di ML/analytics. Lo STT serve solo per il comando immediato e poi è scartato.
- **Niente notifiche vocali in background** (es. timer scaduto mentre l'app è in background). Limitazioni iOS sui background mode.

## Decisions

### D1. Whisper.cpp via `whisper-rs` Rust crate

**Decisione**: usare il crate Rust `whisper-rs` (https://github.com/tazz4843/whisper-rs) che è il binding ufficiale di whisper.cpp. Maturo, attivamente mantenuto, supporta CoreML su Apple per accelerazione hardware.

```toml
[dependencies]
whisper-rs = { version = "0.13", features = ["coreml"] }
```

Il modello da bundlare è `ggml-small-it.bin` (~466MB), specifico per italiano. Scaricato in fase di build dal CI/script o committato come Git LFS.

**Alternative considerate**:
- *whisper-cpp originale via FFI manuale*: troppo lavoro, whisper-rs è già un wrapper buono
- *Whisper.swift*: esiste ma è un fork meno mantenuto
- *OpenAI Whisper API*: richiederebbe cloud, no.

### D2. Wake word con OpenWakeWord (o alternativa)

**Decisione**: prima opzione **OpenWakeWord** (https://github.com/dscripka/openWakeWord), Apache 2.0, funziona on-device, ha un toolkit per addestrare modelli custom o usare modelli generici "Hey Casa" (in inglese). Per un wake word italiano "Ok casa" si può:
- Usare un modello generico "hey casa" (esiste community trained)
- Addestrare un modello custom con ~100 sample dell'utente (procedura documentata)
- Fallback: usare un wake word inglese standard ("hey computer", "hey jarvis") e accettare il compromesso

**Alternative considerate**:
- *Picovoice Porcupine*: free for personal use, modelli custom via portale loro, ottima accuracy. Ma licenza limita a personal/non-commercial e richiede una API key.
- *Snowboy*: deprecato, no
- *MyCroft Precise*: discontinued

Da decidere in implementazione se OpenWakeWord o Porcupine è più semplice da integrare. L'open source ha il vantaggio della libertà di licenza, Porcupine ha quality migliore. Per ora pianifico OpenWakeWord nel design ma lascio aperto.

### D3. AVSpeechSynthesizer via Swift bridge

**Decisione**: voci italiane native iOS sono ottime e gratis. La libreria standard è `AVSpeechSynthesizer`. Bridge Swift con `@_cdecl("ios_speak")`:

```swift
import AVFoundation

let synth = AVSpeechSynthesizer()

@_cdecl("ios_speak")
public func ios_speak(_ text: UnsafePointer<CChar>) {
    let str = String(cString: text)
    let utterance = AVSpeechUtterance(string: str)
    utterance.voice = bestItalianVoice()
    utterance.rate = 0.5
    DispatchQueue.main.async {
        synth.speak(utterance)
    }
}

func bestItalianVoice() -> AVSpeechSynthesisVoice? {
    let italian = AVSpeechSynthesisVoice.speechVoices()
        .filter { $0.language.hasPrefix("it") }
    return italian.first { $0.quality == .premium }
        ?? italian.first { $0.quality == .enhanced }
        ?? italian.first
}
```

### D4. Audio capture via AVAudioEngine

**Decisione**: il loop principale del voice è in Rust ma usa Swift bridge per accedere a `AVAudioEngine` (l'unico modo affidabile per audio capture su iOS). Il flusso:
1. Swift apre AVAudioEngine + tap su input node
2. Buffer audio (16kHz mono PCM) passati a Rust via callback C
3. Rust feeds the buffer al wake word detector
4. Su detection → buffer accumulato per N secondi → passato a Whisper

```swift
@_cdecl("ios_start_audio_capture")
public func ios_start_audio_capture() {
    let engine = AVAudioEngine()
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        let samples = buffer.floatChannelData?[0]
        // Pass to Rust via FFI
        rust_audio_callback(samples, Int32(buffer.frameLength))
    }
    try? engine.start()
}
```

### D5. Architettura del plugin

```
src-tauri/src/voice/
├── mod.rs              # Public Tauri commands
├── audio_buffer.rs     # Ring buffer per audio frames
├── wake_word.rs        # OpenWakeWord integration
├── whisper.rs          # Whisper.cpp integration via whisper-rs
├── tts.rs              # Bridge a Swift speak()
└── state.rs            # State machine: Idle → WakeWord → Listening → Processing → Speaking → Idle
```

### D6. State machine del voice engine

```
[Disabled] ←→ [Idle (loop wake word)] → [WakeWordDetected]
                    ↓                           ↓
                 [Paused]              [Listening (STT 8s)]
                                              ↓
                                       [Processing intent]
                                              ↓
                                        [Speaking (TTS)]
                                              ↓
                                          (back to Idle)
```

### D7. Frontend: hook + parser + handler separati

```
apps/mobile/src/lib/voice/
├── voiceClient.ts          # Wrapper invoke + listen Tauri commands/events
├── voiceCommandParser.ts   # transcript → ParsedCommand
├── intentHandlers.ts       # ParsedCommand → API call → response
├── voiceResponses.ts       # template italiani per le risposte
└── routines.ts             # buongiorno + buonanotte orchestratori
```

L'`useVoice()` hook espone tutto: state, methods, eventi. I componenti `VoiceWaveIndicator`, `VoiceListeningOverlay`, `VoicePrivacyIndicator` lo consumano.

### D8. Intent classifier semplice (no ML)

**Decisione**: classifier basato su array di pattern + keyword matching, niente ML lato client. Esempio:

```ts
const PATTERNS: IntentPattern[] = [
  {
    intent: 'add_to_shopping',
    matchers: [
      /aggiungi (?<product>.+?) alla spesa/i,
      /metti (?<product>.+?) (?:nella lista|alla spesa)/i,
      /(?<product>.+?) sulla lista della spesa/i,
    ],
    minConfidence: 0.7,
  },
  // ... altri intent
];

function parse(text: string): ParsedCommand | null {
  const lowercased = text.toLowerCase().trim();
  for (const pattern of PATTERNS) {
    for (const matcher of pattern.matchers) {
      const match = lowercased.match(matcher);
      if (match) {
        return {
          intent: pattern.intent,
          entities: match.groups || {},
          confidence: 0.85,  // simplified
          raw: text,
        };
      }
    }
  }
  return null;
}
```

**Alternative considerate**:
- *NLP library tipo `compromise` o `wink-nlp`*: ottime ma overkill, ~100KB+ bundle
- *Cloud NLU (Dialogflow, Wit.ai)*: viola privacy on-device

### D9. Modelli come asset bundle vs download al primo avvio

**Decisione**: il modello Whisper (~466MB) è troppo grosso per essere committato in git. Strategie:
1. **Download al primo avvio dell'app**: il backend Tauri scarica il modello da un URL (es. Hugging Face) al primo avvio, salvato nella documents directory. Pro: niente bundle gigante, contro: serve internet al primo setup.
2. **Bundled in xcassets**: il modello entra nell'IPA, ma l'IPA passa da ~10MB a ~480MB. Pro: zero setup, contro: store delivery massive.
3. **Side-load via Tauri assets**: copiato manualmente nella build folder dallo sviluppatore.

**Proposta**: opzione 1 (download al primo avvio) con UI chiara durante il download (~5 min su connessione decente). L'utente vede una barra "Scaricamento modello vocale italiano (466MB)... 23%".

Il modello wake word è piccolo (~100KB) e può essere bundlato direttamente.

### D10. Privacy: nessun audio persiste mai

**Decisione**: l'audio captured è processato in memoria (ring buffer) e mai scritto su disco. Le trascrizioni Whisper sono usate per il command parsing e poi scartate (nessuna history). Solo i risultati delle azioni (item aggiunti, eventi creati) persistono.

L'utente ha questa garanzia documentata in `/voice/privacy` UI section.

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Whisper.cpp build per iOS è complesso (CoreML, signature) | Documentare passo-passo nei tasks. Usare CI per validare. Fallback: usare modello senza CoreML (più lento ma funziona). |
| Modello 466MB consuma RAM | iPad Pro M1 ha 8GB, iPad Pro 2 (A12Z) ha 6GB. Whisper small richiede ~700MB RAM. Marginale ma OK. |
| Wake word generico ha accuracy bassa | Documentare procedura per addestrare modello custom OpenWakeWord se l'utente vuole. |
| Permessi microfono possono essere negati | Graceful UI in Settings con istruzioni per riattivare da iOS Settings. |
| Background mode `audio` può essere rifiutato in App Store review | App è personale, non pubblicata in Store. Sideload o TestFlight personale. |
| AVSpeech può non avere voci premium installate | Documentare come scaricarle: iOS Settings → Accessibilità → Contenuti pronunciati → Voci → Italiano → Premium |
| Ring buffer + audio capture consuma batteria | OK su iPad always-plugged. Su iPhone si attiva il loop solo manualmente. |
| Disambiguazione conversazionale è complessa | Implementazione iniziale: gestiamo solo 1 livello di disambiguazione (es. "quale latte?"). Niente nesting. |
| Cold start del modello Whisper aggiunge latenza al primo comando | Pre-warm: caricare il modello in memoria all'avvio del plugin, anche prima del primo wake word. |
| Falsi positivi del wake word su TV/musica | Soglia configurabile + filtro VAD (voice activity detection) prima del trigger |

## Migration Plan

1. Setup plugin Tauri scaffolding `voice/`
2. Bridge Swift per AVAudioEngine + AVSpeechSynthesizer
3. Integrazione `whisper-rs` con un esempio statico (file WAV → trascrizione)
4. Integrazione wake word (modello generico bundled)
5. State machine + commands Tauri
6. Frontend voice client + parser + handlers
7. UI VoiceWaveIndicator + VoiceListeningOverlay + VoicePrivacyIndicator
8. Routine buongiorno/buonanotte
9. Settings UI
10. Test su iPad simulator + device reale
11. Download modello Whisper al primo avvio
12. Test E2E: dire "ok casa, aggiungi latte alla spesa", verificare che funzioni end-to-end

**Rollback**: revert. Il plugin native va ricompilato, l'app smette di chiedere permesso microfono.

## Open Questions

1. **OpenWakeWord vs Porcupine**: decisione finale in implementazione. Verificare se esiste modello italiano "ok casa" pre-trained su huggingface o equivalente. Altrimenti Porcupine è più affidabile per uso personale.
2. **Modello Whisper small vs base vs medium**: small è il sweet spot (466MB, accuracy decente, gira veloce su M1). Base è troppo cattivo, medium troppo grosso. Confermare con test.
3. **Disambiguazione multi-turn**: implementazione iniziale supporta solo 1 turno. Futuro: stack di context.
4. **Voice analytics opt-in**: salvare quante volte l'utente usa quale comando per migliorare il parsing? — *Proposta*: no, viola la privacy garantita.
5. **Comandi vocali per timer**: la change `add-voice-control` include intent `set_timer`, ma non esiste ancora una change `add-timers-and-alarms`. Dove gestiamo l'azione `set_timer`? — *Proposta*: stub che restituisce "I timer arriveranno in una versione futura" e l'intent diventa funzionante quando arriva la change timer.
