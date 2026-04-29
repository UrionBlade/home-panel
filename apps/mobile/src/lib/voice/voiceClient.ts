import type { VoiceStatus } from "@home-panel/shared";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

type StatusCallback = (status: VoiceStatus) => void;
type TranscriptCallback = (text: string) => void;

/**
 * Voice client che usa Web Speech API per riconoscimento vocale.
 * Funziona su Safari iOS/macOS e Chrome.
 * Il wake word "Ok casa" viene rilevato dal transcript.
 */
class VoiceClient {
  private recognition: SpeechRecognitionLike | null = null;
  private _status: VoiceStatus = "disabled";
  private onStatusChange: StatusCallback | null = null;
  private onTranscript: TranscriptCallback | null = null;
  private wakeWordMode = true;
  private isListening = false;
  private commandTimeout = 0;

  get status(): VoiceStatus {
    return this._status;
  }

  private setStatus(s: VoiceStatus) {
    this._status = s;
    this.onStatusChange?.(s);
  }

  get supported(): boolean {
    return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  }

  subscribe(onStatus: StatusCallback, onTranscript: TranscriptCallback) {
    this.onStatusChange = onStatus;
    this.onTranscript = onTranscript;
  }

  start() {
    if (!this.supported) {
      console.warn("[voice] Web Speech API non supportata");
      return;
    }
    if (this.isListening) return;

    const W = window as unknown as SpeechRecognitionWindow;
    const SpeechRecognition = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec: SpeechRecognitionLike = new SpeechRecognition();
    this.recognition = rec;
    rec.lang = "it-IT";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.isListening = true;
      this.setStatus("idle");
    };

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last) return;

      const text = last[0]?.transcript?.trim().toLowerCase() ?? "";

      if (this.wakeWordMode) {
        if (text.includes("ok casa") || text.includes("okay casa") || text.includes("oca sa")) {
          this.wakeWordMode = false;
          this.setStatus("listening");

          // If the result already contains a command after "ok casa"
          if (last.isFinal) {
            let command = last[0]?.transcript?.trim() ?? "";
            command = command.replace(/^(ok\s*casa|okay\s*casa)[,.\s]*/i, "").trim();
            if (command.length > 2) {
              this.setStatus("processing");
              this.onTranscript?.(command);
              this.wakeWordMode = true;
              return;
            }
          }

          // Wait for the command for up to 8 seconds
          clearTimeout(this.commandTimeout);
          this.commandTimeout = window.setTimeout(() => {
            if (!this.wakeWordMode) {
              this.wakeWordMode = true;
              this.setStatus("idle");
            }
          }, 8000);
          return;
        }
      } else {
        // Listening for the command
        if (last.isFinal) {
          clearTimeout(this.commandTimeout);
          let command = last[0]?.transcript?.trim() ?? "";
          command = command.replace(/^(ok\s*casa|okay\s*casa)[,.\s]*/i, "").trim();
          if (command.length > 2) {
            this.setStatus("processing");
            this.onTranscript?.(command);
            this.wakeWordMode = true;
          }
          // Too short — stay in listening mode (the timeout will close it)
        } else {
          this.setStatus("listening");
        }
      }
    };

    rec.onerror = (event) => {
      console.warn("[voice] error:", event.error);
      if (event.error === "not-allowed") {
        this.setStatus("disabled");
        this.isListening = false;
        return;
      }
      // Restart on transient errors
      if (event.error !== "aborted") {
        this.setStatus("error");
        setTimeout(() => this.restart(), 1000);
      }
    };

    rec.onend = () => {
      this.isListening = false;
      // Continuously restart to simulate always-on listening
      if (this._status !== "disabled") {
        setTimeout(() => this.restart(), 300);
      }
    };

    try {
      rec.start();
    } catch {
      // Already listening
    }
  }

  private restart() {
    if (this._status === "disabled") return;
    this.wakeWordMode = true;
    this.start();
  }

  stop() {
    this.setStatus("disabled");
    this.isListening = false;
    this.wakeWordMode = true;
    try {
      this.recognition?.stop();
    } catch {
      // ignore
    }
    this.recognition = null;
  }

  /** Push-to-talk: bypasses the wake word and starts listening immediately. */
  pushToTalk() {
    if (!this.isListening) {
      this.start();
      // Wait for recognition to start
      setTimeout(() => {
        this.wakeWordMode = false;
        this.setStatus("listening");
      }, 500);
    } else {
      this.wakeWordMode = false;
      this.setStatus("listening");
    }
  }

  private cachedVoice: SpeechSynthesisVoice | null = null;

  private getBestItalianVoice(): SpeechSynthesisVoice | null {
    if (this.cachedVoice) return this.cachedVoice;
    const voices = speechSynthesis.getVoices();
    const italian = voices.filter((v) => v.lang.startsWith("it"));
    // Preference: Premium > Enhanced > any local > any
    const ranked = [
      italian.find((v) => /premium/i.test(v.name)),
      italian.find((v) => /enhanced/i.test(v.name)),
      // On macOS/iOS the best voices are: Federica, Luca, Alice
      italian.find((v) => /federica|luca|alice/i.test(v.name) && v.localService),
      italian.find((v) => v.localService),
      italian[0],
    ];
    this.cachedVoice = ranked.find(Boolean) ?? null;
    return this.cachedVoice;
  }

  async speak(text: string): Promise<void> {
    if (!("speechSynthesis" in window)) return;

    // Pre-load voices if not yet available
    if (speechSynthesis.getVoices().length === 0) {
      await new Promise<void>((r) => {
        speechSynthesis.onvoiceschanged = () => r();
        setTimeout(r, 1000);
      });
    }

    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "it-IT";
      utterance.rate = 0.95; // Slightly slower = more natural
      utterance.pitch = 1.05; // Slightly higher = warmer

      const voice = this.getBestItalianVoice();
      if (voice) utterance.voice = voice;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }

  stopSpeaking() {
    speechSynthesis?.cancel();
  }

  /** Soft-cancel: stop TTS if speaking, drop the live STT request if
   * listening, but keep the assistant enabled. Mirrors
   * `nativeVoiceClient.dismissCurrent()` so the overlay can close
   * without nuking the engine. */
  dismissCurrent() {
    if (this._status === "speaking") {
      this.stopSpeaking();
    }
    if (this._status === "listening" || this._status === "processing") {
      this.setStatus("idle");
    }
  }
}

export const voiceClient = new VoiceClient();
