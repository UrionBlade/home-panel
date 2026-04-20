import type {
  BlinkCamera,
  BlinkCredentialsStatus,
  BlinkMotionClip,
  BlinkSetupInput,
} from "@home-panel/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import {
  type BlinkCameraRow,
  type BlinkMotionClipRow,
  blinkCameras,
  blinkCredentials,
  blinkMotionClips,
} from "../db/schema.js";
import {
  type BlinkPending2FA,
  type BlinkSession,
  blinkArmNetwork,
  blinkListCameras,
  blinkListMedia,
  blinkLogin,
  blinkRefreshToken,
  blinkRequestThumbnail,
  blinkVerify2FA,
} from "../lib/blink/client.js";

/* ---- DTO mappers ---- */

function cameraRowToDto(row: BlinkCameraRow): BlinkCamera {
  return {
    id: row.id,
    name: row.name,
    networkId: row.networkId,
    model: row.model,
    status: row.status,
    batteryLevel: row.batteryLevel,
    thumbnailUrl: row.thumbnailUrl,
    lastMotionAt: row.lastMotionAt,
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

function getSession(): BlinkSession | null {
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

  /* ----- arm / disarm ----- */
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
      await blinkArmNetwork(session, cam.networkId, true);
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
      await blinkArmNetwork(session, cam.networkId, false);
      return c.json({ armed: false });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- refresh thumbnail (quasi-live) ----- */
  .post("/cameras/:id/snapshot", async (c) => {
    const session = getSession();
    if (!session) return c.json({ error: "Non autenticato" }, 401);
    const id = c.req.param("id");
    const camera = db.select().from(blinkCameras).where(eq(blinkCameras.id, id)).get();
    if (!camera) return c.json({ error: "Camera non trovata" }, 404);
    if (!camera.networkId) return c.json({ error: "Camera senza networkId" }, 400);
    try {
      await blinkRequestThumbnail(session, camera.networkId, id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- clips ----- */
  .get("/clips", (c) => {
    const cameraId = c.req.query("cameraId");
    const rows = cameraId
      ? db
          .select()
          .from(blinkMotionClips)
          .where(eq(blinkMotionClips.cameraId, cameraId))
          .orderBy(desc(blinkMotionClips.recordedAt))
          .all()
      : db.select().from(blinkMotionClips).orderBy(desc(blinkMotionClips.recordedAt)).all();
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
    const result = db.delete(blinkMotionClips).where(eq(blinkMotionClips.id, id)).run();
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
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

async function syncCamerasAndClips(session: BlinkSession) {
  const now = new Date().toISOString();

  const remoteCameras = await blinkListCameras(session);
  for (const cam of remoteCameras) {
    const existing = db.select().from(blinkCameras).where(eq(blinkCameras.id, cam.id)).get();
    if (existing) {
      db.update(blinkCameras)
        .set({
          name: cam.name,
          networkId: cam.networkId,
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
    }
  }

  console.log(`[blink] sync: ${remoteCameras.length} cameras, ${newClips} new clips`);
  return { cameras: remoteCameras.length, newClips, totalClips: remoteClips.length };
}
