import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync, unlinkSync } from "node:fs";
import type { IpCamera, IpCameraCreateInput, IpCameraUpdateInput } from "@home-panel/shared";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type IpCameraRow, ipCameraRecordings, ipCameras } from "../db/schema.js";
import { deletePath, upsertPath, whepOffer } from "../lib/ipCameras/mediamtx.js";
import { activeRecordingId, startRecording, stopRecording } from "../lib/ipCameras/recorder.js";
import { captureSnapshot } from "../lib/ipCameras/snapshot.js";

/**
 * Routes delle IP camera generiche (CamHiPro / Anpviz / Reolink / ONVIF).
 *
 * Contratto di sicurezza: user/password RTSP arrivano sul backend via
 * POST/PATCH ma non escono mai (`rowToIpCamera` li esclude deliberata-
 * mente). Lo snapshot endpoint è pensato per essere consumato da un
 * <img> e usa lo stesso token-via-query del proxy Blink.
 */
export const ipCamerasRouter = new Hono();

function rowToIpCamera(row: IpCameraRow): IpCamera {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    streamPath: row.streamPath,
    substreamPath: row.substreamPath,
    enabled: row.enabled,
    roomId: row.roomId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasCredentials: Boolean(row.username && row.password),
  };
}

function normaliseName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

function normaliseHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  /* Validation minimalista: host non vuoto, senza schema né path. */
  if (!trimmed || /[\s/]/.test(trimmed)) return null;
  return trimmed;
}

ipCamerasRouter
  .get("/", (c) => {
    const rows = db.select().from(ipCameras).orderBy(asc(ipCameras.createdAt)).all();
    return c.json(rows.map(rowToIpCamera));
  })

  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as IpCameraCreateInput | null;
    if (!body) return c.json({ error: "Body JSON obbligatorio" }, 400);
    const name = normaliseName(body.name);
    const host = normaliseHost(body.host);
    if (!name) return c.json({ error: "name obbligatorio (1-64 caratteri)" }, 400);
    if (!host) return c.json({ error: "host obbligatorio (IP o hostname)" }, 400);

    const now = new Date().toISOString();
    const row: IpCameraRow = {
      id: randomUUID(),
      name,
      host,
      port: Number.isFinite(body.port) ? Number(body.port) : 554,
      username: typeof body.username === "string" ? body.username : null,
      password: typeof body.password === "string" ? body.password : null,
      streamPath:
        typeof body.streamPath === "string" && body.streamPath.trim() ? body.streamPath : "/11",
      substreamPath:
        body.substreamPath === null
          ? null
          : typeof body.substreamPath === "string"
            ? body.substreamPath
            : "/12",
      roomId: typeof body.roomId === "string" && body.roomId.trim() ? body.roomId.trim() : null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(ipCameras).values(row).run();
    /* Registra il path su MediaMTX così la live WebRTC è pronta
     * al primo connect. Errori non bloccano la risposta API. */
    void upsertPath(row);
    return c.json(rowToIpCamera(row), 201);
  })

  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(ipCameras).where(eq(ipCameras.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as IpCameraUpdateInput | null;
    if (!body) return c.json({ error: "Body JSON obbligatorio" }, 400);

    const updates: Partial<IpCameraRow> = {};
    if (body.name !== undefined) {
      const name = normaliseName(body.name);
      if (!name) return c.json({ error: "name non valido" }, 400);
      updates.name = name;
    }
    if (body.host !== undefined) {
      const host = normaliseHost(body.host);
      if (!host) return c.json({ error: "host non valido" }, 400);
      updates.host = host;
    }
    if (body.port !== undefined && Number.isFinite(body.port)) updates.port = Number(body.port);
    if (body.streamPath !== undefined) updates.streamPath = body.streamPath;
    if (body.substreamPath !== undefined) updates.substreamPath = body.substreamPath;
    if (body.username !== undefined) updates.username = body.username;
    if (body.password !== undefined) updates.password = body.password;
    if (body.roomId !== undefined) {
      updates.roomId =
        typeof body.roomId === "string" && body.roomId.trim() ? body.roomId.trim() : null;
    }
    if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);

    if (Object.keys(updates).length === 0) return c.json(rowToIpCamera(existing));
    updates.updatedAt = new Date().toISOString();
    db.update(ipCameras).set(updates).where(eq(ipCameras.id, id)).run();
    const updated = db.select().from(ipCameras).where(eq(ipCameras.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    /* Re-sincronizza il path MediaMTX se host/cred/stream sono cambiati.
     * Se il campo non è rilevante (es. solo roomId o name) l'upsert è
     * comunque idempotente e costa poco. */
    void upsertPath(updated);
    return c.json(rowToIpCamera(updated));
  })

  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(ipCameras).where(eq(ipCameras.id, id)).run();
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    void deletePath(id);
    return c.body(null, 204);
  })

  /* WHEP proxy WebRTC — il client manda un SDP offer, MediaMTX risponde
   * con SDP answer. Noi facciamo pass-through per tenere MediaMTX
   * dentro la rete Docker e validare Bearer auth sull'API. */
  .post("/:id/whep", async (c) => {
    const id = c.req.param("id");
    const row = db.select().from(ipCameras).where(eq(ipCameras.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (!row.enabled) return c.json({ error: "disabled" }, 400);

    const sdpOffer = await c.req.text();
    if (!sdpOffer) return c.json({ error: "SDP offer mancante" }, 400);

    try {
      const result = await whepOffer(id, sdpOffer);
      const headers: Record<string, string> = {
        "Content-Type": "application/sdp",
      };
      if (result.location) headers["Location"] = result.location;
      return new Response(result.body, { status: result.status, headers });
    } catch (err) {
      console.error("[ipCameras] whep error:", err);
      return c.json({ error: "webrtc_unavailable" }, 502);
    }
  })

  /* Snapshot JPEG generato on-demand — consumato da un <img>. Auth via
   * query `?token=...` perché <img> non può mandare header. Lo stesso
   * pattern del Blink proxy. */
  .get("/:id/snapshot.jpg", async (c) => {
    const token = c.req.query("token");
    if (!token || token !== process.env.API_TOKEN) {
      return c.json({ error: "invalid_token" }, 401);
    }
    const id = c.req.param("id");
    const row = db.select().from(ipCameras).where(eq(ipCameras.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (!row.enabled) return c.json({ error: "disabled" }, 400);

    try {
      const jpeg = await captureSnapshot(row);
      return new Response(jpeg, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch (err) {
      console.error("[ipCameras] snapshot error:", err);
      const message = err instanceof Error ? err.message : "snapshot_failed";
      return c.json({ error: message }, 502);
    }
  })

  /* Recording controls. Start spawna ffmpeg che scrive MP4 sul volume
   * Docker; stop gli manda SIGTERM per chiudere il file pulitamente. */
  .post("/:id/record/start", async (c) => {
    const id = c.req.param("id");
    const row = db.select().from(ipCameras).where(eq(ipCameras.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (!row.enabled) return c.json({ error: "disabled" }, 400);
    const body = (await c.req.json().catch(() => null)) as { label?: string | null } | null;
    try {
      const result = startRecording(row, body?.label ?? undefined);
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "start_failed";
      return c.json({ error: msg }, 400);
    }
  })

  .post("/:id/record/stop", (c) => {
    const id = c.req.param("id");
    const stopped = stopRecording(id);
    if (!stopped) return c.json({ error: "not_recording" }, 400);
    return c.json({ ok: true });
  })

  .get("/:id/record/status", (c) => {
    const id = c.req.param("id");
    return c.json({ recordingId: activeRecordingId(id) });
  })

  .get("/:id/recordings", (c) => {
    const id = c.req.param("id");
    const rows = db
      .select()
      .from(ipCameraRecordings)
      .where(eq(ipCameraRecordings.cameraId, id))
      .orderBy(desc(ipCameraRecordings.startedAt))
      .all();
    return c.json(
      rows.map((r) => ({
        id: r.id,
        cameraId: r.cameraId,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        durationSeconds: r.durationSeconds,
        sizeBytes: r.sizeBytes,
        label: r.label,
      })),
    );
  })

  .get("/recordings/:recId/stream", (c) => {
    const token = c.req.query("token");
    if (!token || token !== process.env.API_TOKEN) {
      return c.json({ error: "invalid_token" }, 401);
    }
    const recId = c.req.param("recId");
    const rec = db.select().from(ipCameraRecordings).where(eq(ipCameraRecordings.id, recId)).get();
    if (!rec) return c.json({ error: "not_found" }, 404);
    if (!existsSync(rec.filePath)) return c.json({ error: "file_missing" }, 410);
    const stat = statSync(rec.filePath);
    return new Response(createReadStream(rec.filePath) as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  })

  .delete("/recordings/:recId", (c) => {
    const recId = c.req.param("recId");
    const rec = db.select().from(ipCameraRecordings).where(eq(ipCameraRecordings.id, recId)).get();
    if (!rec) return c.json({ error: "not_found" }, 404);
    try {
      if (existsSync(rec.filePath)) unlinkSync(rec.filePath);
    } catch {
      /* ignore: best-effort */
    }
    db.delete(ipCameraRecordings).where(eq(ipCameraRecordings.id, recId)).run();
    return c.body(null, 204);
  });
