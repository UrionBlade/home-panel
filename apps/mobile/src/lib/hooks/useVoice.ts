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
 * Hook vocale unificato: usa il client nativo (Tauri iOS con Whisper)
 * se disponibile, altrimenti cade sul Web Speech API (browser dev).
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
    } catch {
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

  // --- Native path (Tauri iOS) ---
  useEffect(() => {
    console.log("[useVoice] effect native, isNative:", isNative, "enabled:", enabled);
    if (!isNative) return;

    nativeVoiceClient.subscribe(
      (status) => {
        console.log("[useVoice] native status:", status);
        setState((prev) => ({ ...prev, status }));
      },
      (command) => {
        console.log("[useVoice] native command:", command);
        if (!processingRef.current) {
          void processTranscript(command);
        }
      },
    );

    if (enabled) {
      console.log("[useVoice] avvio nativeVoiceClient.start()...");
      void nativeVoiceClient.start();
    } else {
      console.log("[useVoice] voice non abilitata, skip start");
    }

    return () => {
      void nativeVoiceClient.stop();
    };
  }, [enabled, processTranscript]);

  // --- Web Speech fallback (browser / dev) ---
  useEffect(() => {
    if (isNative) return;

    voiceClient.subscribe(
      (status) => setState((prev) => ({ ...prev, status })),
      (text) => {
        if (!processingRef.current) {
          void processTranscript(text);
        }
      },
    );

    if (enabled && voiceClient.supported) {
      voiceClient.start();
    }

    return () => {
      voiceClient.stop();
    };
  }, [enabled, processTranscript]);

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
