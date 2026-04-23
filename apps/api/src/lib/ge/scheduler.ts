/**
 * Safety-net poller for `ge_devices.lastState`.
 *
 * Live updates arrive through the WebSocket subscriber (ws-subscriber.ts);
 * this scheduler only runs on a slow interval to catch the rare cases
 * where the push path is down (socket closed, account token rotated,
 * network blip). When WS is healthy these ticks are essentially idempotent
 * overhead — cheap enough to keep as a backstop.
 */

import { pollAcDevice } from "../../routes/ac.js";
import { listAcDevices } from "./device-repo.js";
import { geTokenStore } from "./store.js";

/** Safety-net interval: 5 minutes. The primary sync path is the WS
 * subscriber, so this only has to guarantee eventual consistency. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function runTick(): Promise<void> {
  if (inflight) return; // Previous tick still running — skip this one.
  if (!geTokenStore.loadTokens()) return; // Not linked yet.

  const devices = listAcDevices();
  if (devices.length === 0) return;

  inflight = true;
  try {
    for (const device of devices) {
      try {
        await pollAcDevice(device.id);
      } catch (err) {
        console.warn(
          `[ac-scheduler] poll ${device.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } finally {
    inflight = false;
  }
}

export function startAcScheduler(): void {
  if (pollTimer) return;
  // Kick first tick a few seconds after boot so migrations / seeds have
  // finished. Subsequent ticks run on the interval.
  setTimeout(() => void runTick(), 7_000);
  pollTimer = setInterval(() => void runTick(), POLL_INTERVAL_MS);
}
