import { createReadStream, existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  BlinkCamera,
  BlinkCredentialsStatus,
  BlinkMotionClip,
  BlinkSetupInput,
} from "@home-panel/shared";
import { ALARM_SSE_EVENTS } from "@home-panel/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import {
  type BlinkCameraRow,
  type BlinkMotionClipRow,
  blinkCameras,
  blinkCredentials,
  blinkMotionClips,
} from "../db/schema.js";
import { countUnread, getAlarmState, recordEvent } from "../lib/alarm/store.js";
import {
  type BlinkPending2FA,
  type BlinkSession,
  blinkListCameras,
  blinkListMedia,
  blinkLogin,
  blinkRefreshToken,
  blinkRequestThumbnail,
  blinkSetDeviceEnabled,
  blinkVerify2FA,
  installBlinkRefreshHandler,
} from "../lib/blink/client.js";
import { downloadPendingClips } from "../lib/blink/clip-downloader.js";
import {
  getSession as getLiveSession,
  startLiveSession,
  stopLiveSession,
  touchSession,
} from "../lib/blink/liveview-manager.js";
import { sendApnsBatch } from "../lib/push/apns.js";
import { listTokens } from "../lib/push/store.js";
import { getSirenDurationSeconds, triggerSirens } from "../lib/zigbee/client.js";
import { sseEmitter } from "./sse.js";

/* ---- DTO mappers ---- */

function cameraRowToDto(row: BlinkCameraRow): BlinkCamera {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    networkId: row.networkId,
    model: row.model,
    deviceType: row.deviceType,
    armed: row.enabled,
    armedForAlarm: row.armedForAlarm,
    status: row.status,
    batteryLevel: row.batteryLevel,
    thumbnailUrl: row.thumbnailUrl,
    lastMotionAt: row.lastMotionAt,
    roomId: row.roomId,
  };
}

function clipRowToDto(row: BlinkMotionClipRow): BlinkMotionClip {
  return {
    id: row.id,
    cameraId: row.cameraId,
    recordedAt: row.recordedAt,
    durationSeconds: row.durationSeconds,
    thumbnailPath: row.thumbnailPath,
    clipPath: row.clipPath,
    viewed: row.viewed,
  };
}

export function getSession(): BlinkSession | null {
  const creds = db.select().from(blinkCredentials).get();
  if (!creds?.accountId || !creds?.encryptedToken) return null;
  const region = creds.region ?? "u014";
  return {
    accessToken: creds.encryptedToken,
    refreshToken: creds.encryptedPassword ?? "",
    hardwareId: creds.hardwareId ?? "",
    accountId: Number(creds.accountId),
    region,
    host: `https://rest-${region}.immedia-semi.com`,
  };
}

/**
 * Attempts a Blink OAuth token refresh. On success updates the DB and
 * returns the new session. On failure returns null
 * (the user will need to log in again).
 *
 * Registered as the global refresh handler in `client.ts` so every
 * `blinkApi` call benefits from automatic 401 retry — without this
 * registration the scheduled routines (Buonanotte etc.) crash the
 * morning the access token rolls over even though the refresh token
 * is still valid.
 */
async function tryRefreshSession(session: BlinkSession): Promise<BlinkSession | null> {
  if (!session.refreshToken || !session.hardwareId) return null;
  try {
    console.log("[blink] token scaduto, provo refresh…");
    const refreshed = await blinkRefreshToken(session.refreshToken, session.hardwareId);
    const newSession: BlinkSession = {
      ...session,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    };
    // Persist the new tokens
    const now = new Date().toISOString();
    db.update(blinkCredentials)
      .set({
        encryptedToken: refreshed.accessToken,
        encryptedPassword: refreshed.refreshToken,
        updatedAt: now,
      })
      .where(eq(blinkCredentials.id, 1))
      .run();
    console.log("[blink] token refreshato con successo");
    return newSession;
  } catch (err) {
    console.error("[blink] refresh fallito:", err);
    return null;
  }
}

/**
 * Performs an authenticated Blink fetch; on 401 attempts an automatic
 * token refresh and retries the request once.
 */
async function blinkFetchWithRetry(
  url: string,
  session: BlinkSession,
): Promise<{ response: Response; session: BlinkSession }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshSession(session);
    if (refreshed) {
      const retryRes = await fetch(url, {
        headers: { Authorization: `Bearer ${refreshed.accessToken}` },
      });
      return { response: retryRes, session: refreshed };
    }
  }
  return { response: res, session };
}

/* ---- In-memory 2FA state with TTL to avoid indefinite leak ---- */
const PENDING_2FA_TTL_MS = 5 * 60 * 1000; // 5 minutes
let pending2FA: BlinkPending2FA | null = null;
let pendingEmail: string | null = null;
let pending2FATimer: NodeJS.Timeout | null = null;

function setPending2FA(pending: BlinkPending2FA | null, email: string | null) {
  if (pending2FATimer) {
    clearTimeout(pending2FATimer);
    pending2FATimer = null;
  }
  pending2FA = pending;
  pendingEmail = email;
  if (pending) {
    pending2FATimer = setTimeout(() => {
      pending2FA = null;
      pendingEmail = null;
      pending2FATimer = null;
      console.warn("[blink] pending 2FA scaduto dopo 5 minuti");
    }, PENDING_2FA_TTL_MS);
  }
}

/* Wire the centralised 401 refresh path: every `blinkApi` call now
 * auto-recovers from an expired access token via tryRefreshSession.
 * Idempotent — safe to call once at module load. */
installBlinkRefreshHandler(tryRefreshSession);

export const blinkRouter = new Hono()
  /* ----- status ----- */
  .get("/status", (c) => {
    const creds = db.select().from(blinkCredentials).get();
    const body: BlinkCredentialsStatus & { needs2FA?: boolean } = {
      configured: !!creds?.accountId,
      email: creds?.email ?? null,
      accountId: creds?.accountId ?? null,
      needs2FA: !!pending2FA,
    };
    return c.json(body);
  })

  /* ----- setup: login step 1 ----- */
  .post("/setup", async (c) => {
    const body = (await c.req.json().catch(() => null)) as BlinkSetupInput | null;
    if (!body?.email || !body.password) {
      return c.json({ error: "email e password obbligatori" }, 400);
    }

    try {
      const result = await blinkLogin(body.email, body.password);

      if (!result.ok) {
        // 2FA required — save state and ask for PIN
        setPending2FA(result.pending, body.email);
        return c.json({ needs2FA: true, message: "Inserisci il PIN ricevuto via SMS/email" }, 200);
      }

      // Login OK without 2FA
      setPending2FA(null, null);
      await saveSession(body.email, result.session);
      syncCamerasAndClips(result.session).catch((e) =>
        console.error("[blink] sync after setup:", e),
      );

      return c.json(
        { configured: true, email: body.email, accountId: String(result.session.accountId) },
        201,
      );
    } catch (err) {
      setPending2FA(null, null);
      const msg = err instanceof Error ? err.message : "Login fallito";
      console.error("[blink] login failed:", msg);
      return c.json({ error: msg }, 400);
    }
  })

  /* ----- verify 2FA PIN ----- */
  .post("/verify-pin", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { pin: string } | null;
    if (!body?.pin) return c.json({ error: "PIN obbligatorio" }, 400);
    if (!pending2FA || !pendingEmail) {
      return c.json({ error: "Nessun login in attesa di verifica. Riprova il setup." }, 400);
    }

    try {
      const session = await blinkVerify2FA(body.pin, pending2FA);
      const email = pendingEmail;
      setPending2FA(null, null);

      await saveSession(email, session);
      syncCamerasAndClips(session).catch((e) => console.error("[blink] sync after 2FA:", e));

      return c.json({ configured: true, email, accountId: String(session.accountId) }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verifica PIN fallita";
      console.error("[blink] 2FA failed:", msg);
      return c.json({ error: msg }, 400);
    }
  })

  /* ----- credentials delete ----- */
  .delete("/credentials", (c) => {
    setPending2FA(null, null);
    db.delete(blinkCredentials).run();
    db.delete(blinkMotionClips).run();
    db.delete(blinkCameras).run();
    return c.json({ ok: true });
  })

  /* ----- cameras ----- */
  .get("/cameras", (c) => {
    const rows = db.select().from(blinkCameras).all();
    return c.json(rows.map(cameraRowToDto));
  })

  .get("/cameras/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(blinkCameras).where(eq(blinkCameras.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(cameraRowToDto(row));
  })

  /* Camera panel-side metadata: room assignment and/or nickname override.
   * Body: `{ roomId?: string | null, nickname?: string | null, name?: string }`.
   * Il campo `name` è un alias user-friendly di `nickname` — il frontend
   * universal-rename usa quello. Il nome originale di Blink resta intatto
   * nella colonna `name`, così la sync futura non lo sovrascrive. */
  .patch("/cameras/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(blinkCameras).where(eq(blinkCameras.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      roomId?: string | null;
      nickname?: string | null;
      name?: string | null;
      armedForAlarm?: boolean;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<BlinkCameraRow> = {};
    if (body.roomId !== undefined) {
      updates.roomId =
        typeof body.roomId === "string" && body.roomId.trim() ? body.roomId.trim() : null;
    }
    if (typeof body.armedForAlarm === "boolean") {
      updates.armedForAlarm = body.armedForAlarm;
    }
    /* Accept both `nickname` and `name` as user-chosen override; empty
     * string clears the override and restores the Blink-side name. */
    const rawNickname = body.nickname ?? body.name;
    if (rawNickname !== undefined) {
      if (rawNickname === null) {
        updates.nickname = null;
      } else if (typeof rawNickname === "string") {
        const trimmed = rawNickname.trim();
        if (!trimmed) updates.nickname = null;
        else if (trimmed.length > 64) return c.json({ error: "nome 1-64 caratteri" }, 400);
        else updates.nickname = trimmed;
      } else {
        return c.json({ error: "nome deve essere stringa o null" }, 400);
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      db.update(blinkCameras).set(updates).where(eq(blinkCameras.id, id)).run();
    }
    const updated = db.select().from(blinkCameras).where(eq(blinkCameras.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(cameraRowToDto(updated));
  })

  .post("/cameras/sync", async (c) => {
    const session = getSession();
    if (!session) return c.json({ error: "Credenziali Blink non configurate" }, 400);
    try {
      const result = await syncCamerasAndClips(session);
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync fallita";
      console.error("[blink] sync error:", msg);
      return c.json({ error: msg }, 500);
    }
  })

  /* ----- arm / disarm (per-camera motion detection) ----- */
  .post("/cameras/:id/arm", async (c) => {
    const session = getSession();
    if (!session) return c.json({ error: "Non autenticato" }, 401);
    const cam = db
      .select()
      .from(blinkCameras)
      .where(eq(blinkCameras.id, c.req.param("id")))
      .get();
    if (!cam) return c.json({ error: "not_found" }, 404);
    if (!cam.networkId) return c.json({ error: "Network ID mancante" }, 400);
    try {
      await blinkSetDeviceEnabled(session, cam.deviceType, cam.networkId, cam.id, true);
      db.update(blinkCameras)
        .set({ enabled: true, updatedAt: new Date().toISOString() })
        .where(eq(blinkCameras.id, cam.id))
        .run();
      return c.json({ armed: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  .post("/cameras/:id/disarm", async (c) => {
    const session = getSession();
    if (!session) return c.json({ error: "Non autenticato" }, 401);
    const cam = db
      .select()
      .from(blinkCameras)
      .where(eq(blinkCameras.id, c.req.param("id")))
      .get();
    if (!cam) return c.json({ error: "not_found" }, 404);
    if (!cam.networkId) return c.json({ error: "Network ID mancante" }, 400);
    try {
      await blinkSetDeviceEnabled(session, cam.deviceType, cam.networkId, cam.id, false);
      db.update(blinkCameras)
        .set({ enabled: false, updatedAt: new Date().toISOString() })
        .where(eq(blinkCameras.id, cam.id))
        .run();
      return c.json({ armed: false });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- live view (real RTSPS → HLS via ffmpeg) ----- */
  .post("/cameras/:id/live/start", async (c) => {
    const session = getSession();
    if (!session) return c.json({ error: "Non autenticato" }, 401);
    const id = c.req.param("id");
    const camera = db.select().from(blinkCameras).where(eq(blinkCameras.id, id)).get();
    if (!camera) return c.json({ error: "Camera non trovata" }, 404);
    if (!camera.networkId) return c.json({ error: "Camera senza networkId" }, 400);
    try {
      const live = await startLiveSession({
        cameraId: id,
        deviceType: camera.deviceType,
        networkId: camera.networkId,
        apiSession: session,
      });
      return c.json({ sessionId: live.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      if (msg.includes("ffmpeg non disponibile")) {
        return c.json({ error: "Server non pronto: installa ffmpeg" }, 503);
      }
      console.error(`[blink] liveview start failed (${id}):`, msg);
      return c.json({ error: msg }, 500);
    }
  })

  .post("/cameras/:id/live/stop", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { sessionId?: string } | null;
    const sessionId = body?.sessionId;
    if (!sessionId) return c.json({ error: "sessionId mancante" }, 400);
    await stopLiveSession(sessionId);
    return c.json({ ok: true });
  })

  /* ----- refresh thumbnail (the actual "live" for Blink cameras) -----
   *
   * Triggers Blink to capture a new JPEG and waits — polling the homescreen
   * every 1.2s — until the thumbnail URL actually changes. This replaces a
   * fixed "sleep 7s" with "sleep until ready", cutting the average loop
   * time to ~3-5s depending on camera model and network.
   */
  .post("/cameras/:id/snapshot", async (c) => {
    const session = getSession();
    if (!session) return c.json({ error: "Non autenticato" }, 401);
    const id = c.req.param("id");
    const camera = db.select().from(blinkCameras).where(eq(blinkCameras.id, id)).get();
    if (!camera) return c.json({ error: "Camera non trovata" }, 404);
    if (!camera.networkId) return c.json({ error: "Camera senza networkId" }, 400);

    const POLL_INTERVAL_MS = 1200;
    const MAX_WAIT_MS = 12_000;

    /* Ask Blink for a fresh thumbnail. A 409 "System is busy" means the
     * camera is still working on the previous request — not a real error,
     * just proceed to polling. Any other error is actually fatal. */
    try {
      await blinkRequestThumbnail(session, camera.deviceType, camera.networkId, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      const isBusy = msg.includes("409") || msg.toLowerCase().includes("busy");
      /* Blink Mini sometimes 406s the thumbnail trigger even with a correct
       * body — its firmware is fussier than Outdoor's. Fall through to
       * polling instead of failing: the Mini thumbnail updates on its own
       * cadence anyway. */
      const isSoft = isBusy || msg.includes("406");
      if (!isSoft) {
        console.error(`[blink] snapshot ${camera.deviceType} ${id} failed:`, err);
        return c.json({ error: msg }, 500);
      }
    }

    const originalUrl = camera.thumbnailUrl;
    const started = Date.now();
    let settled = false;

    while (Date.now() - started < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const remote = await blinkListCameras(session);
        const updated = remote.find((rc) => rc.id === id);
        if (updated && updated.thumbnail && updated.thumbnail !== originalUrl) {
          db.update(blinkCameras)
            .set({
              thumbnailUrl: updated.thumbnail,
              batteryLevel: updated.battery,
              status: updated.status === "online" ? "online" : "offline",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(blinkCameras.id, id))
            .run();
          settled = true;
          break;
        }
      } catch (err) {
        console.warn(`[blink] snapshot poll cycle failed (${id}):`, err);
      }
    }

    return c.json({
      ok: true,
      waitedMs: Date.now() - started,
      settled,
    });
  })

  /* ----- clips ----- */
  .get("/clips", (c) => {
    const cameraId = c.req.query("cameraId");
    const whereClause = cameraId
      ? and(eq(blinkMotionClips.cameraId, cameraId), isNull(blinkMotionClips.deletedAt))
      : isNull(blinkMotionClips.deletedAt);
    const rows = db
      .select()
      .from(blinkMotionClips)
      .where(whereClause)
      .orderBy(desc(blinkMotionClips.recordedAt))
      .all();
    return c.json(rows.map(clipRowToDto));
  })

  .get("/clips/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(blinkMotionClips).where(eq(blinkMotionClips.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(clipRowToDto(row));
  })

  .delete("/clips/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(blinkMotionClips).where(eq(blinkMotionClips.id, id)).get();
    if (!row || row.deletedAt) return c.json({ error: "not_found" }, 404);

    // Remove the cached .mp4 from disk, if any. Ignore disk errors: the
    // tombstone is what matters for sync idempotency.
    if (row.localPath && existsSync(row.localPath)) {
      try {
        unlinkSync(row.localPath);
      } catch (err) {
        console.warn(
          `[blink] failed to unlink ${row.localPath}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    db.update(blinkMotionClips)
      .set({ deletedAt: new Date().toISOString(), localPath: null })
      .where(eq(blinkMotionClips.id, id))
      .run();
    return c.body(null, 204);
  })

  /* ----- live HLS segments (no-auth, sessionId is the capability) ----- */
  .get("/live/:sessionId/stream.m3u8", (c) => {
    const sessionId = c.req.param("sessionId");
    const session = getLiveSession(sessionId);
    if (!session) return c.json({ error: "sessione scaduta" }, 404);
    touchSession(sessionId);
    if (!existsSync(session.playlistPath)) {
      /* ffmpeg hasn't written the playlist yet — tell the player to retry. */
      return c.json({ error: "playlist non pronta" }, 425);
    }
    const buf = readFileSync(session.playlistPath);
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  })

  .get("/live/:sessionId/:segment{seg-[0-9]+\\.ts}", (c) => {
    const sessionId = c.req.param("sessionId");
    const segment = c.req.param("segment");
    const session = getLiveSession(sessionId);
    if (!session) return c.json({ error: "sessione scaduta" }, 404);
    /* Guard against path traversal even though the regex already restricts
     * the capture. */
    const safeName = basename(segment);
    if (safeName !== segment) return c.json({ error: "path" }, 400);
    const filePath = join(session.dir, safeName);
    if (!existsSync(filePath)) return c.json({ error: "segmento non pronto" }, 404);
    touchSession(sessionId);
    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "video/mp2t",
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
      },
    });
  })

  /* ----- proxy media (con auto-refresh token) ----- */
  .get("/proxy", async (c) => {
    const url = c.req.query("url");
    if (!url) return c.json({ error: "url param obbligatorio" }, 400);
    const session = getSession();
    if (!session) return c.json({ error: "Non autenticato" }, 401);
    try {
      const { response: res } = await blinkFetchWithRetry(url, session);
      if (!res.ok) return c.json({ error: `Blink ${res.status}` }, res.status as 400);
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const body = await res.arrayBuffer();
      return new Response(body, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
      });
    } catch {
      return c.json({ error: "Errore proxy Blink" }, 502);
    }
  });

/* ---- Helpers ---- */

async function saveSession(email: string, session: BlinkSession) {
  const now = new Date().toISOString();
  const existing = db.select().from(blinkCredentials).get();
  const values = {
    email,
    encryptedToken: session.accessToken,
    encryptedPassword: session.refreshToken,
    hardwareId: session.hardwareId,
    accountId: String(session.accountId),
    region: session.region,
    updatedAt: now,
  };
  if (existing) {
    db.update(blinkCredentials).set(values).where(eq(blinkCredentials.id, existing.id)).run();
  } else {
    db.insert(blinkCredentials)
      .values({ id: 1, ...values })
      .run();
  }
}

export async function syncCamerasAndClips(session: BlinkSession) {
  const now = new Date().toISOString();

  const remoteCameras = await blinkListCameras(session);
  for (const cam of remoteCameras) {
    const existing = db.select().from(blinkCameras).where(eq(blinkCameras.id, cam.id)).get();
    if (existing) {
      db.update(blinkCameras)
        .set({
          name: cam.name,
          networkId: cam.networkId,
          deviceType: cam.deviceType,
          enabled: cam.enabled,
          status: cam.status === "online" ? "online" : "offline",
          batteryLevel: cam.battery,
          thumbnailUrl: cam.thumbnail,
          serialNumber: cam.serial,
          firmwareVersion: cam.firmwareVersion,
          updatedAt: now,
        })
        .where(eq(blinkCameras.id, cam.id))
        .run();
    } else {
      db.insert(blinkCameras)
        .values({
          id: cam.id,
          name: cam.name,
          networkId: cam.networkId,
          deviceType: cam.deviceType,
          enabled: cam.enabled,
          status: cam.status === "online" ? "online" : "offline",
          batteryLevel: cam.battery,
          thumbnailUrl: cam.thumbnail,
          serialNumber: cam.serial,
          firmwareVersion: cam.firmwareVersion,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }

  // Collect camera IDs in the DB
  const cameraIds = new Set(
    db
      .select({ id: blinkCameras.id })
      .from(blinkCameras)
      .all()
      .map((r) => r.id),
  );

  const remoteClips = await blinkListMedia(session);
  let newClips = 0;
  for (const clip of remoteClips) {
    // Auto-create camera if it doesn't exist (e.g. doorbell not on homescreen)
    if (!cameraIds.has(clip.cameraId)) {
      db.insert(blinkCameras)
        .values({
          id: clip.cameraId,
          name: clip.cameraName,
          status: "offline",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      cameraIds.add(clip.cameraId);
      console.log(`[blink] auto-created camera ${clip.cameraId} (${clip.cameraName})`);
    }
    const existing = db
      .select()
      .from(blinkMotionClips)
      .where(eq(blinkMotionClips.id, clip.id))
      .get();
    if (!existing) {
      db.insert(blinkMotionClips)
        .values({
          id: clip.id,
          cameraId: clip.cameraId,
          recordedAt: clip.recordedAt,
          clipPath: clip.mediaUrl,
          thumbnailPath: clip.thumbnailUrl,
          createdAt: now,
        })
        .run();
      newClips++;

      /* Fire the alarm only when the system is armed AND this camera
       * is opted into alarm coverage. We snapshot the camera row each
       * loop iteration to pick up the freshly-inserted row above. */
      const camRow = db.select().from(blinkCameras).where(eq(blinkCameras.id, clip.cameraId)).get();
      const alarm = getAlarmState();
      if (alarm.armed && camRow?.armedForAlarm) {
        const event = recordEvent({
          ieeeAddress: `blink:${clip.cameraId}`,
          friendlyName: camRow.nickname ?? camRow.name ?? "Camera",
          kind: "motion",
          payload: { source: "blink", clipId: clip.id, recordedAt: clip.recordedAt },
        });
        sseEmitter.emit("push", { event: ALARM_SSE_EVENTS.triggered, payload: event });
        sseEmitter.emit("push", {
          event: ALARM_SSE_EVENTS.state,
          payload: { state: alarm, unreadCount: countUnread() },
        });
        /* Push notify all iOS tokens. Errors swallowed so a flaky push
         * server can never block the siren. */
        const tokens = listTokens("ios").map((t) => t.token);
        if (tokens.length > 0) {
          sendApnsBatch(tokens, {
            title: "Movimento rilevato",
            body: camRow.nickname ?? camRow.name ?? "Camera",
            sound: "default",
            timeSensitive: true,
            collapseId: `alarm-blink-${clip.cameraId}`,
            data: {
              kind: "alarm",
              alarmKind: "motion",
              eventId: event.id,
              cameraId: clip.cameraId,
            },
          }).catch((err) => console.error("[blink] APNs fanout failed:", err));
        }
        triggerSirens(getSirenDurationSeconds());
      }
    }
  }

  console.log(`[blink] sync: ${remoteCameras.length} cameras, ${newClips} new clips`);

  // Download clip files to disk (errors are logged, never thrown).
  const download = await downloadPendingClips(session).catch((err) => {
    console.error("[blink] clip download batch failed:", err);
    return { attempted: 0, saved: 0, failed: 0 };
  });

  return {
    cameras: remoteCameras.length,
    newClips,
    totalClips: remoteClips.length,
    downloaded: download.saved,
  };
}
