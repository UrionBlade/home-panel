/**
 * Native voice client for Tauri iOS.
 *
 * Uses Tauri commands for:
 *  - Audio capture via AVAudioEngine (Swift FFI)
 *  - STT via whisper-rs (Rust, on-device)
 *  - TTS via AVSpeechSynthesizer (Swift FFI)
 *  - Wake word "Ok casa" detected from the Whisper transcript
 *
 * Listens to Tauri events:
 *  - `voice:status` → status update
 *  - `voice:command` → command after wake word
 *  - `voice:error` → error
 */

import type { VoiceStatus } from "@home-panel/shared";

type StatusCallback = (status: VoiceStatus) => void;
/** A spoken command picked up after the wake word, plus an optional speaker
 * embedding the iOS plugin captured during the same window. The vector is
 * `null` when the on-device model isn't loaded yet or when 2.5 s of audio
 * weren't gathered before the command finalised. */
export interface VoiceCommandPayload {
  command: string;
  embedding: number[] | null;
}
type CommandCallback = (payload: VoiceCommandPayload) => void;

// Dynamic imports — these modules do not exist in browser dev,
// so we load them only when needed.
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let tauriListen:
  | ((event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>)
  | null = null;
let tauriApisLoaded = false;

async function loadTauriApis() {
  if (tauriApisLoaded) return;
  tauriApisLoaded = true;
  try {
    const core = await import("@tauri-apps/api/core");
    tauriInvoke = core.invoke;
    const event = await import("@tauri-apps/api/event");
    tauriListen = event.listen;
  } catch {
    // Not in Tauri (browser dev)
    tauriInvoke = null;
    tauriListen = null;
  }
}

class NativeVoiceClient {
  private _status: VoiceStatus = "disabled";
  private onStatusChange: StatusCallback | null = null;
  private onCommand: CommandCallback | null = null;
  private unlisteners: Array<() => void> = [];
  private running = false;
  private _supported: boolean | null = null;

  get status(): VoiceStatus {
    return this._status;
  }

  get supported(): boolean {
    // Synchronous check — Tauri is present when __TAURI_INTERNALS__ exists
    if (this._supported !== null) return this._supported;
    this._supported =
      typeof window !== "undefined" &&
      !!(
        window as unknown as {
          __TAURI_INTERNALS__?: unknown;
        }
      ).__TAURI_INTERNALS__;
    return this._supported;
  }

  private setStatus(s: VoiceStatus) {
    this._status = s;
    this.onStatusChange?.(s);
  }

  subscribe(onStatus: StatusCallback, onCommand: CommandCallback) {
    this.onStatusChange = onStatus;
    this.onCommand = onCommand;
  }

  private async invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    await loadTauriApis();
    if (!tauriInvoke) throw new Error("Tauri non disponibile");
    return tauriInvoke(cmd, args);
  }

  async requestPermission(): Promise<boolean> {
    try {
      return (await this.invoke("voice_request_permission")) as boolean;
    } catch {
      return false;
    }
  }

  async modelExists(): Promise<boolean> {
    try {
      return (await this.invoke("voice_model_exists")) as boolean;
    } catch {
      return false;
    }
  }

  async initWhisper(): Promise<void> {
    await this.invoke("voice_init_whisper");
  }

  async start(): Promise<void> {
    console.log(
      "[nativeVoice] start() chiamato, supported:",
      this.supported,
      "running:",
      this.running,
    );
    if (!this.supported) return;
    if (this.running) return;

    // Request microphone permission
    console.log("[nativeVoice] richiedo permesso microfono...");
    const granted = await this.requestPermission();
    console.log("[nativeVoice] permesso microfono:", granted);
    if (!granted) {
      console.warn("[nativeVoice] Permesso microfono negato");
      this.setStatus("error");
      return;
    }

    // Check model
    console.log("[nativeVoice] controllo modello...");
    const exists = await this.modelExists();
    console.log("[nativeVoice] modello esiste:", exists);
    if (!exists) {
      console.warn("[nativeVoice] Modello Whisper non scaricato");
      this.setStatus("error");
      return;
    }

    // Initialize Whisper
    console.log("[nativeVoice] inizializzo Whisper...");
    try {
      await this.initWhisper();
      console.log("[nativeVoice] Whisper inizializzato OK");
    } catch (e) {
      console.error("[nativeVoice] Errore init Whisper:", e);
      this.setStatus("error");
      return;
    }

    // Register event listeners (cleanup first to avoid accumulation on restart)
    console.log("[nativeVoice] setup event listeners...");
    this.cleanupListeners();
    await this.setupEventListeners();
    console.log("[nativeVoice] listeners registrati:", this.unlisteners.length);

    // Start continuous loop
    this.running = true;
    this.setStatus("idle");
    console.log("[nativeVoice] avvio voice_start_continuous...");
    try {
      await this.invoke("voice_start_continuous");
      console.log("[nativeVoice] voice_start_continuous avviato");
    } catch (e) {
      console.error("[nativeVoice] Errore avvio:", e);
      this.running = false;
      this.setStatus("error");
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.invoke("voice_stop_continuous");
    } catch {
      // ignore
    }
    this.setStatus("disabled");
    this.cleanupListeners();
  }

  async speak(text: string): Promise<void> {
    try {
      await this.invoke("voice_speak", { text });
    } catch {
      // ignore
    }
  }

  async stopSpeaking(): Promise<void> {
    try {
      await this.invoke("voice_stop_speaking");
    } catch {
      // ignore
    }
  }

  async setSensitivity(level: number): Promise<void> {
    if (!this.supported) return;
    try {
      await this.invoke("voice_set_sensitivity", { level });
    } catch {
      // Ignored — sensitivity is best-effort. The user can re-trigger by
      // moving the slider again, and a stale value is still functional.
    }
  }

  /** Block until the iOS plugin produces a 192-d speaker embedding from
   * the next ~2.5 s of audio. Used by the family-settings enrollment UI. */
  async captureSpeakerEmbedding(): Promise<number[]> {
    if (!this.supported) throw new Error("voce nativa non disponibile");
    return (await this.invoke("voice_capture_speaker_embedding")) as number[];
  }

  async pushToTalk(): Promise<void> {
    this.setStatus("listening");
    try {
      await this.invoke("voice_listen", { duration_secs: 5 });
    } catch {
      this.setStatus("error");
    }
  }

  private async setupEventListeners(): Promise<void> {
    await loadTauriApis();
    if (!tauriListen) return;

    try {
      const u1 = await tauriListen("voice:status", (e) => {
        const s = e.payload as VoiceStatus;
        this.setStatus(s);
      });
      this.unlisteners.push(u1);

      const u2 = await tauriListen("voice:command", (e) => {
        /* Tolerate both shapes:
         *   - new: { command: string, embedding: number[] | null }
         *   - old: string  (kept for an older iOS build still in TestFlight) */
        const raw = e.payload;
        const payload: VoiceCommandPayload =
          typeof raw === "string"
            ? { command: raw, embedding: null }
            : (raw as VoiceCommandPayload);
        console.log(
          "[nativeVoice] comando ricevuto:",
          payload.command,
          payload.embedding ? "(con embedding)" : "(senza embedding)",
        );
        this.onCommand?.(payload);
      });
      this.unlisteners.push(u2);

      const u3 = await tauriListen("voice:wake-word", () => {
        console.log("[nativeVoice] wake word rilevato");
        this.setStatus("listening");
      });
      this.unlisteners.push(u3);

      const u4 = await tauriListen("voice:transcript", (e) => {
        console.log("[nativeVoice] transcript:", e.payload);
      });
      this.unlisteners.push(u4);

      const u5 = await tauriListen("voice:error", (e) => {
        console.error("[nativeVoice] errore:", e.payload);
      });
      this.unlisteners.push(u5);

      const u6 = await tauriListen("voice:log", (e) => {
        console.log("[VOICE-SWIFT]", e.payload);
      });
      this.unlisteners.push(u6);
    } catch (err) {
      console.error("[nativeVoice] errore setup listeners:", err);
    }
  }

  private cleanupListeners() {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
  }
}

export const nativeVoiceClient = new NativeVoiceClient();
