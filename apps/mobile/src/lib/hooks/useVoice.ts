import type { VoiceStatus } from "@home-panel/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { handleIntent } from "../voice/intentHandlers";
import { playJokeSound } from "../voice/jokeSounds";
import { nativeVoiceClient } from "../voice/nativeVoiceClient";
import { voiceClient } from "../voice/voiceClient";
import { parseVoiceCommand } from "../voice/voiceCommandParser";

interface VoiceState {
  status: VoiceStatus;
  transcript: string | null;
  response: string | null;
}

/**
 * Unified voice hook: uses the native client (Tauri iOS with Whisper)
 * when available, otherwise falls back to the Web Speech API (browser dev).
 */
export function useVoice(enabled = false) {
  const [state, setState] = useState<VoiceState>({
    status: "disabled",
    transcript: null,
    response: null,
  });
  const processingRef = useRef(false);
  const isNative = nativeVoiceClient.supported;

  const processTranscript = useCallback(async (text: string) => {
    processingRef.current = true;
    setState((prev) => ({
      ...prev,
      status: "processing",
      transcript: text,
      response: null,
    }));

    const native = nativeVoiceClient.supported;
    const speakFn = native
      ? (t: string) => nativeVoiceClient.speak(t)
      : (t: string) => voiceClient.speak(t);

    const command = parseVoiceCommand(text);
    if (!command) {
      const fallback = `Non ho capito "${text}"`;
      setState((prev) => ({ ...prev, status: "speaking", response: fallback }));
      await speakFn(fallback);
      setState((prev) => ({ ...prev, status: "idle" }));
      processingRef.current = false;
      return;
    }

    try {
      let response = await handleIntent(command);
      const hasJokeSound = response.startsWith("🥁");
      if (hasJokeSound) response = response.slice(2);
      setState((prev) => ({ ...prev, status: "speaking", response }));
      await speakFn(response);
      if (native) {
        await new Promise((r) => setTimeout(r, Math.max(response.length * 60, 2000)));
      }
      if (hasJokeSound) playJokeSound();
    } catch (err) {
      console.error("[useVoice] handleIntent error:", err);
      const errorMsg = "Si è verificato un errore";
      setState((prev) => ({ ...prev, status: "error", response: errorMsg }));
      await speakFn(errorMsg);
      if (native) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setState((prev) => ({ ...prev, status: "idle", transcript: null, response: null }));
    processingRef.current = false;
  }, []);

  // Subscribe once for the hook lifecycle (stable callbacks).
  // Avoids re-subscribing Tauri listeners on every `enabled` change.
  // `isNative` is a stable (cached) getter so it does not belong in deps.
  useEffect(() => {
    if (nativeVoiceClient.supported) {
      nativeVoiceClient.subscribe(
        (status) => setState((prev) => ({ ...prev, status })),
        (payload) => {
          /* For now we drop the speaker embedding here — `processTranscript`
           * is a thin parser/dispatcher that doesn't carry speaker context.
           * Identification happens server-side in a future commit; the
           * embedding is already available via `payload.embedding`. */
          if (!processingRef.current) void processTranscript(payload.command);
        },
      );
    } else {
      voiceClient.subscribe(
        (status) => setState((prev) => ({ ...prev, status })),
        (text) => {
          if (!processingRef.current) void processTranscript(text);
        },
      );
    }
  }, [processTranscript]);

  // Start/stop driven by `enabled`: cleanup calls stop ONLY if started.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    if (nativeVoiceClient.supported) {
      void nativeVoiceClient.start();
    } else if (voiceClient.supported) {
      voiceClient.start();
    }

    return () => {
      if (cancelled) return;
      cancelled = true;
      if (nativeVoiceClient.supported) {
        void nativeVoiceClient.stop();
      } else {
        voiceClient.stop();
      }
    };
  }, [enabled]);

  const pushToTalk = useCallback(() => {
    if (nativeVoiceClient.supported) {
      void nativeVoiceClient.pushToTalk();
    } else {
      voiceClient.pushToTalk();
    }
  }, []);

  const toggle = useCallback(() => {
    if (nativeVoiceClient.supported) {
      if (nativeVoiceClient.status === "disabled") {
        void nativeVoiceClient.start();
      } else {
        void nativeVoiceClient.stop();
      }
    } else {
      if (voiceClient.status === "disabled") {
        voiceClient.start();
      } else {
        voiceClient.stop();
      }
    }
  }, []);

  const supported = isNative || voiceClient.supported;

  return {
    ...state,
    supported,
    processTranscript,
    pushToTalk,
    toggle,
  };
}
