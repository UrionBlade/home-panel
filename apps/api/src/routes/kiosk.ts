import {
  createReadStream,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { KioskPhoto, KioskSettings, UpdateKioskSettingsInput } from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db } from "../db/client.js";
import { type KioskSettingsRow, kioskSettings } from "../db/schema.js";

/* ----- Photo list cache (in-memory, 5min TTL) ----- */
const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const CACHE_TTL_MS = 5 * 60 * 1000;

let photosCache: { files: string[]; ts: number } | null = null;

function getPhotosDir(): string {
  const row = db
    .select({ photosDir: kioskSettings.photosDir })
    .from(kioskSettings)
    .where(eq(kioskSettings.id, 1))
    .get();
  return row?.photosDir ?? "/data/photos";
}

function listPhotos(): string[] {
  if (photosCache && Date.now() - photosCache.ts < CACHE_TTL_MS) {
    return photosCache.files;
  }
  const dir = getPhotosDir();
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => PHOTO_EXTENSIONS.has(extname(f).toLowerCase()))
      .sort();
  } catch {
    // Directory does not exist or is not readable
    files = [];
  }
  photosCache = { files, ts: Date.now() };
  return files;
}

function refreshPhotosCache(): void {
  photosCache = null;
}

function rowToSettings(row: KioskSettingsRow): KioskSettings {
  return {
    nightModeEnabled: row.nightModeEnabled,
    nightStartHour: row.nightStartHour,
    nightEndHour: row.nightEndHour,
    nightBrightness: row.nightBrightness,
    screensaverEnabled: row.screensaverEnabled,
    screensaverIdleMinutes: row.screensaverIdleMinutes,
    photosDir: row.photosDir,
  };
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export const kioskRouter = new Hono()
  /* ----- GET /settings ----- */
  .get("/settings", (c) => {
    const row = db.select().from(kioskSettings).where(eq(kioskSettings.id, 1)).get();
    if (!row) {
      return c.json({ error: "kiosk_settings non inizializzato" }, 500);
    }
    return c.json(rowToSettings(row));
  })

  /* ----- PATCH /settings ----- */
  .patch("/settings", async (c) => {
    const body = (await c.req.json().catch(() => null)) as UpdateKioskSettingsInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<KioskSettingsRow> = {};

    if (body.nightModeEnabled !== undefined) {
      if (typeof body.nightModeEnabled !== "boolean") {
        return c.json({ error: "nightModeEnabled deve essere boolean" }, 400);
      }
      updates.nightModeEnabled = body.nightModeEnabled;
    }
    if (body.nightStartHour !== undefined) {
      if (
        !Number.isInteger(body.nightStartHour) ||
        body.nightStartHour < 0 ||
        body.nightStartHour > 23
      ) {
        return c.json({ error: "nightStartHour deve essere 0-23" }, 400);
      }
      updates.nightStartHour = body.nightStartHour;
    }
    if (body.nightEndHour !== undefined) {
      if (!Number.isInteger(body.nightEndHour) || body.nightEndHour < 0 || body.nightEndHour > 23) {
        return c.json({ error: "nightEndHour deve essere 0-23" }, 400);
      }
      updates.nightEndHour = body.nightEndHour;
    }
    if (body.nightBrightness !== undefined) {
      if (
        typeof body.nightBrightness !== "number" ||
        body.nightBrightness < 0 ||
        body.nightBrightness > 1
      ) {
        return c.json({ error: "nightBrightness deve essere 0-1" }, 400);
      }
      updates.nightBrightness = body.nightBrightness;
    }
    if (body.screensaverEnabled !== undefined) {
      if (typeof body.screensaverEnabled !== "boolean") {
        return c.json({ error: "screensaverEnabled deve essere boolean" }, 400);
      }
      updates.screensaverEnabled = body.screensaverEnabled;
    }
    if (body.screensaverIdleMinutes !== undefined) {
      if (!Number.isInteger(body.screensaverIdleMinutes) || body.screensaverIdleMinutes < 1) {
        return c.json({ error: "screensaverIdleMinutes deve essere >= 1" }, 400);
      }
      updates.screensaverIdleMinutes = body.screensaverIdleMinutes;
    }

    if (Object.keys(updates).length === 0) {
      const row = db.select().from(kioskSettings).where(eq(kioskSettings.id, 1)).get();
      if (!row) return c.json({ error: "kiosk_settings non inizializzato" }, 500);
      return c.json(rowToSettings(row));
    }

    updates.updatedAt = new Date().toISOString();
    db.update(kioskSettings).set(updates).where(eq(kioskSettings.id, 1)).run();

    const updated = db.select().from(kioskSettings).where(eq(kioskSettings.id, 1)).get();
    if (!updated) return c.json({ error: "kiosk_settings non inizializzato" }, 500);
    return c.json(rowToSettings(updated));
  })

  /* ----- GET /photos ----- */
  .get("/photos", (c) => {
    const files = listPhotos();
    const photos: KioskPhoto[] = files.map((filename) => ({
      filename,
      url: `/api/v1/kiosk/photos/${encodeURIComponent(filename)}`,
    }));
    return c.json(photos);
  })

  /* ----- GET /photos/:filename ----- */
  .get("/photos/:filename", (c) => {
    const filename = c.req.param("filename");
    // Path traversal protection: basename + extension check
    const safe = basename(filename);
    if (safe !== filename || safe.startsWith(".")) {
      return c.json({ error: "filename non valido" }, 400);
    }
    const ext = extname(safe).toLowerCase();
    if (!PHOTO_EXTENSIONS.has(ext)) {
      return c.json({ error: "formato non supportato" }, 400);
    }

    const dir = getPhotosDir();
    const filePath = resolve(join(dir, safe));
    // Double-check containment
    if (!filePath.startsWith(resolve(dir))) {
      return c.json({ error: "path non valido" }, 400);
    }

    try {
      statSync(filePath);
    } catch {
      return c.json({ error: "foto non trovata" }, 404);
    }

    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "public, max-age=3600, immutable");

    return stream(c, async (s) => {
      const readable = createReadStream(filePath);
      const reader = readable[Symbol.asyncIterator]();
      for await (const chunk of reader) {
        await s.write(chunk as Uint8Array);
      }
    });
  })

  /* ----- POST /photos/refresh ----- */
  .post("/photos/refresh", (c) => {
    refreshPhotosCache();
    const files = listPhotos();
    return c.json({ refreshed: true, count: files.length });
  })

  /* ----- POST /photos (multipart upload) -----
   * Accepts one image per request under the `file` field. Filename is taken
   * from the upload but normalised through `basename` + extension allowlist
   * so a malicious client can't traverse out of the photos directory. */
  .post("/photos", async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json({ error: "multipart richiesto" }, 400);
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: "campo 'file' mancante" }, 400);
    }
    const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per photo, plenty for a JPG
    if (file.size <= 0) return c.json({ error: "file vuoto" }, 400);
    if (file.size > MAX_BYTES) return c.json({ error: "file troppo grande (max 15MB)" }, 413);

    const safe = basename(file.name);
    const ext = extname(safe).toLowerCase();
    if (!PHOTO_EXTENSIONS.has(ext)) {
      return c.json({ error: "formato non supportato (jpg, jpeg, png)" }, 400);
    }
    if (safe !== file.name || safe.startsWith(".") || safe.length > 200) {
      return c.json({ error: "filename non valido" }, 400);
    }

    const dir = getPhotosDir();
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error("[kiosk] mkdir photosDir:", err);
      return c.json({ error: "directory foto non scrivibile" }, 500);
    }

    const filePath = resolve(join(dir, safe));
    if (!filePath.startsWith(resolve(dir))) {
      return c.json({ error: "path non valido" }, 400);
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(filePath, buffer);
    } catch (err) {
      console.error("[kiosk] write photo:", err);
      return c.json({ error: "scrittura fallita" }, 500);
    }

    refreshPhotosCache();
    return c.json(
      {
        filename: safe,
        url: `/api/v1/kiosk/photos/${encodeURIComponent(safe)}`,
      } satisfies KioskPhoto,
      201,
    );
  })

  /* ----- DELETE /photos/:filename ----- */
  .delete("/photos/:filename", (c) => {
    const filename = c.req.param("filename");
    const safe = basename(filename);
    if (safe !== filename || safe.startsWith(".")) {
      return c.json({ error: "filename non valido" }, 400);
    }
    const ext = extname(safe).toLowerCase();
    if (!PHOTO_EXTENSIONS.has(ext)) {
      return c.json({ error: "formato non supportato" }, 400);
    }

    const dir = getPhotosDir();
    const filePath = resolve(join(dir, safe));
    if (!filePath.startsWith(resolve(dir))) {
      return c.json({ error: "path non valido" }, 400);
    }

    try {
      unlinkSync(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return c.json({ error: "foto non trovata" }, 404);
      console.error("[kiosk] unlink photo:", err);
      return c.json({ error: "cancellazione fallita" }, 500);
    }

    refreshPhotosCache();
    return c.body(null, 204);
  });
