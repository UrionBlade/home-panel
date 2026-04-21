/**
 * Download motion clips from Blink cloud to local disk.
 *
 * Layout under BLINK_CLIPS_DIR:
 *   DD-MM-YYYY/<camera-slug>/<ISO-timestamp>.mp4
 *
 * `local_path` in the DB points at the absolute file once the clip is saved
 * and `downloaded_at` records when.
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { readdir, rmdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { blinkCameras, blinkMotionClips } from "../../db/schema.js";
import type { BlinkSession } from "./client.js";

const DEFAULT_CLIPS_DIR = "./data/blink-clips";

function getClipsDir(): string {
  return resolve(process.env.BLINK_CLIPS_DIR ?? DEFAULT_CLIPS_DIR);
}

function getRetentionDays(): number {
  const raw = process.env.BLINK_CLIPS_RETENTION_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "camera"
  );
}

/** Italian-style date folder: DD-MM-YYYY. */
function formatDateFolder(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown-date";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/** ISO timestamp safe for filesystem: colons -> dashes. */
function sanitizeTimestamp(iso: string): string {
  return iso.replace(/:/g, "-").replace(/\.\d+/, "");
}

async function downloadOne(
  session: BlinkSession,
  clipId: string,
  remoteUrl: string,
  cameraName: string,
  recordedAt: string,
): Promise<string> {
  const dayFolder = formatDateFolder(recordedAt);
  const camFolder = slugify(cameraName);
  const fileName = `${sanitizeTimestamp(recordedAt)}__${clipId}.mp4`;
  const dir = join(getClipsDir(), dayFolder, camFolder);
  const fullPath = join(dir, fileName);

  if (existsSync(fullPath)) {
    return fullPath;
  }

  mkdirSync(dir, { recursive: true });

  const res = await fetch(remoteUrl, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "*/*",
    },
  });

  if (!res.ok || !res.body) {
    throw new Error(`blink download ${clipId}: HTTP ${res.status}`);
  }

  const tmpPath = `${fullPath}.part`;
  try {
    await pipeline(
      Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(tmpPath),
    );
  } catch (err) {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
    throw err;
  }

  // Atomic rename so consumers never observe a half-written file.
  renameSync(tmpPath, fullPath);
  return fullPath;
}

/**
 * Downloads every clip in blink_motion_clips that is missing a local_path.
 * Errors on a single clip don't abort the batch — they are logged and skipped.
 * Returns counts useful for logging/telemetry.
 */
export async function downloadPendingClips(
  session: BlinkSession,
): Promise<{ attempted: number; saved: number; failed: number }> {
  const pending = db
    .select({
      id: blinkMotionClips.id,
      clipPath: blinkMotionClips.clipPath,
      recordedAt: blinkMotionClips.recordedAt,
      cameraId: blinkMotionClips.cameraId,
      cameraName: blinkCameras.name,
    })
    .from(blinkMotionClips)
    .leftJoin(blinkCameras, eq(blinkMotionClips.cameraId, blinkCameras.id))
    .where(and(isNull(blinkMotionClips.localPath), isNotNull(blinkMotionClips.clipPath)))
    .all();

  let saved = 0;
  let failed = 0;
  for (const row of pending) {
    if (!row.clipPath) continue;
    try {
      const localPath = await downloadOne(
        session,
        row.id,
        row.clipPath,
        row.cameraName ?? row.cameraId,
        row.recordedAt,
      );
      db.update(blinkMotionClips)
        .set({ localPath, downloadedAt: new Date().toISOString() })
        .where(eq(blinkMotionClips.id, row.id))
        .run();
      saved++;
    } catch (err) {
      failed++;
      console.warn(
        `[blink] download failed for clip ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (pending.length > 0) {
    console.log(`[blink] clip download: ${saved}/${pending.length} saved, ${failed} failed`);
  }
  return { attempted: pending.length, saved, failed };
}

/**
 * Removes local clip files older than the retention window and nulls out
 * their local_path in the DB (keeping the metadata row intact). Also prunes
 * empty day/camera folders.
 */
export async function cleanupOldClips(): Promise<{ deleted: number }> {
  const days = getRetentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const stale = db
    .select({ id: blinkMotionClips.id, localPath: blinkMotionClips.localPath })
    .from(blinkMotionClips)
    .where(and(isNotNull(blinkMotionClips.localPath), lt(blinkMotionClips.recordedAt, cutoff)))
    .all();

  let deleted = 0;
  for (const row of stale) {
    if (!row.localPath) continue;
    try {
      if (existsSync(row.localPath)) {
        unlinkSync(row.localPath);
      }
      db.update(blinkMotionClips)
        .set({ localPath: null, downloadedAt: null })
        .where(eq(blinkMotionClips.id, row.id))
        .run();
      deleted++;
      // Best-effort prune of now-empty parent directories.
      await pruneEmptyDir(dirname(row.localPath));
    } catch (err) {
      console.warn(
        `[blink] retention cleanup failed for ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (deleted > 0) {
    console.log(`[blink] retention: removed ${deleted} clips older than ${days}d`);
  }
  return { deleted };
}

async function pruneEmptyDir(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir);
    if (entries.length === 0) {
      await rmdir(dir);
      await pruneEmptyDir(dirname(dir));
    }
  } catch {
    // Ignore: directory may be gone or non-empty.
  }
}

/** Exposed for manual invocation / tests. */
export function blinkClipsDir(): string {
  return getClipsDir();
}

export function blinkClipsRetentionDays(): number {
  return getRetentionDays();
}
