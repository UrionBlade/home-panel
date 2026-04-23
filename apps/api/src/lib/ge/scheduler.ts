/**
 * Background poller that keeps `ge_devices.lastState` in sync with the
 * cloud. Each tick:
 *   1. exits early if the user hasn't linked GE Appliances yet
 *   2. reads the full ERD bag for each known device
 *   3. decodes it and stores the result
 *
 * Reads happen sequentially — GE has been known to throttle parallel
 * ERD fetches from the same account — but errors on one device don't
 * stop the others.
 */

import { pollAcDevice } from "../../routes/ac.js";
import { listAcDevices } from "./device-repo.js";
import { geTokenStore } from "./store.js";

/** GE updates the cloud snapshot every few seconds; 60s is a good
 * tradeoff between freshness and rate-limit friendliness. */
const POLL_INTERVAL_MS = 60 * 1000;

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
