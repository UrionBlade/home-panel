/**
 * Periodic Blink background tasks:
 * - Every N minutes: re-sync cameras/clips and download any new motion files.
 * - Once a day: enforce retention by deleting clips older than the window.
 */

import { getSession, syncCamerasAndClips } from "../../routes/blink.js";
import { cleanupOldClips } from "./clip-downloader.js";

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

let syncTimer: ReturnType<typeof setInterval> | null = null;
let retentionTimer: ReturnType<typeof setInterval> | null = null;

async function runSyncTick(): Promise<void> {
  const session = getSession();
  if (!session) return; // Blink not configured yet
  try {
    await syncCamerasAndClips(session);
  } catch (err) {
    console.error("[blink-scheduler] sync failed:", err instanceof Error ? err.message : err);
  }
}

async function runRetentionTick(): Promise<void> {
  try {
    await cleanupOldClips();
  } catch (err) {
    console.error("[blink-scheduler] retention failed:", err instanceof Error ? err.message : err);
  }
}

export function startBlinkScheduler(): void {
  if (syncTimer || retentionTimer) return;

  // Kick both tasks after a short delay so startup isn't blocked.
  setTimeout(() => void runSyncTick(), 5_000);
  setTimeout(() => void runRetentionTick(), 10_000);

  syncTimer = setInterval(() => void runSyncTick(), SYNC_INTERVAL_MS);
  retentionTimer = setInterval(() => void runRetentionTick(), RETENTION_INTERVAL_MS);

  console.log(
    `[blink-scheduler] started (sync every ${SYNC_INTERVAL_MS / 60_000}m, retention daily)`,
  );
}

export function stopBlinkScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}
