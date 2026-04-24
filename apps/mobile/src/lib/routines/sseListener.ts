/**
 * Bridge between the server-emitted `routine:client-actions` SSE event and
 * the kiosk's local side-effects (currently: TTS).
 *
 * Scheduled routines run entirely server-side for device control, but they
 * may include a spoken response the user should hear on the panel. The
 * server accumulates those into `clientActions` and forwards them here.
 */

import type { RoutineClientAction } from "@home-panel/shared";
import { sseClient } from "../sse-client";
import { nativeVoiceClient } from "../voice/nativeVoiceClient";
import { voiceClient } from "../voice/voiceClient";

export interface RoutineClientActionsPayload {
  routineId: string;
  actions: RoutineClientAction[];
}

export function subscribeRoutineClientActions(): () => void {
  return sseClient.subscribe("routine:client-actions", (raw) => {
    const payload = raw as RoutineClientActionsPayload | null;
    if (!payload || !Array.isArray(payload.actions)) return;
    void runClientActions(payload.actions);
  });
}

export async function runClientActions(actions: RoutineClientAction[]): Promise<void> {
  /* Actions are emitted in the order the routine declared them. We speak
   * them sequentially with a small pause in between so multiple voice.speak
   * steps don't clobber each other. */
  const parts: string[] = [];
  for (const action of actions) {
    if (action.action === "voice.speak") {
      parts.push(action.text);
    }
  }
  if (parts.length === 0) return;
  const combined = parts.join(". ");
  try {
    if (nativeVoiceClient.supported) {
      await nativeVoiceClient.speak(combined);
    } else {
      await voiceClient.speak(combined);
    }
  } catch (err) {
    console.warn("[routines] speak failed:", err);
  }
}
