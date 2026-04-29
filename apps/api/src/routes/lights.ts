/**
 * Lights — provider-agnostic HTTP surface.
 *
 * - GET    /                                  list adopted lights
 * - POST   /:id                                set state (on|off)
 * - POST   /:id/toggle                         flip last known state
 * - POST   /sync                               pull provider devices into DB
 * - GET    /providers/ewelink/credentials      safe status (no secrets)
 * - PUT    /providers/ewelink/credentials      set email/password + verify
 * - DELETE /providers/ewelink/credentials      clear saved creds + tokens
 * - GET    /providers/ewelink/remote           raw provider device list
 */

import { randomUUID } from "node:crypto";
import type {
  EwelinkCredentialsInput,
  EwelinkCredentialsStatus,
  LightCommandInput,
  LightSummary,
  LightSyncResult,
  RemoteLightDevice,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { lights, providerCredentials } from "../db/schema.js";
import { getAdapter, isKnownProvider, mapProviderError } from "../lib/lights/dispatcher.js";
import {
  EwelinkError,
  ensureEwelinkAccessToken,
  ewelinkListDevices,
  ewelinkLogin,
  extractThingState,
  getEwelinkAppKeys,
  getEwelinkCredentials,
  saveEwelinkCredentials,
} from "../lib/lights/providers/ewelink.js";
import {
  getEwelinkRedirectUri,
  makeAuthorizeUrl,
  setEwelinkPending,
} from "../lib/lights/providers/ewelink-oauth.js";

const EWELINK = "ewelink" as const;

/* ------------------------------------------------------------------------ */
/*  Helpers                                                                  */
/* ------------------------------------------------------------------------ */

function toSummary(row: typeof lights.$inferSelect): LightSummary {
  return {
    id: row.id,
    name: row.name,
    room: row.room,
    roomId: row.roomId,
    /* Schema stores provider as string; only "ewelink" is implemented today,
     * unknown values would have failed sync so this cast is safe. */
    provider: row.provider as LightSummary["provider"],
    deviceId: row.deviceId,
    state: row.lastState,
    lastSeenAt: row.lastSeenAt,
  };
}

function updateLastState(id: string, state: "on" | "off"): void {
  const now = new Date().toISOString();
  db.update(lights)
    .set({ lastState: state, lastSeenAt: now, updatedAt: now })
    .where(eq(lights.id, id))
    .run();
}

/* ------------------------------------------------------------------------ */
/*  Routes                                                                   */
/* ------------------------------------------------------------------------ */

export const lightsRouter = new Hono()

  .get("/", (c) => {
    const rows = db.select().from(lights).all();
    const body: LightSummary[] = rows.map(toSummary);
    return c.json(body);
  })

  /* Update a light's panel-side metadata: display name and/or room assignment.
   * The upstream provider is never contacted — this is the user's personal
   * labelling. Body fields are all optional; send only what changes. */
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(lights).where(eq(lights.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      name?: string;
      roomId?: string | null;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }
    const updates: { name?: string; roomId?: string | null; updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };
    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed || trimmed.length > 64) {
        return c.json({ error: "name 1-64 caratteri" }, 400);
      }
      updates.name = trimmed;
    }
    if (body.roomId !== undefined) {
      updates.roomId =
        typeof body.roomId === "string" && body.roomId.trim() ? body.roomId.trim() : null;
    }
    db.update(lights).set(updates).where(eq(lights.id, id)).run();
    const updated = db.select().from(lights).where(eq(lights.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(toSummary(updated));
  })

  .post("/sync", async (c) => {
    const provider = c.req.query("provider") ?? EWELINK;
    if (provider !== EWELINK) {
      return c.json({ error: `Unknown provider: ${provider}` }, 400);
    }
    try {
      const remote = await getAdapter(EWELINK).listRemote();
      const existing = db.select().from(lights).where(eq(lights.provider, EWELINK)).all();
      const byDeviceId = new Map(existing.map((r) => [r.deviceId, r]));
      const remoteIds = new Set(remote.map((r) => r.deviceId));
      const now = new Date().toISOString();

      let added = 0;
      let updated = 0;
      for (const d of remote) {
        const row = byDeviceId.get(d.deviceId);
        if (!row) {
          db.insert(lights)
            .values({
              id: randomUUID(),
              name: d.name,
              room: null,
              provider: EWELINK,
              deviceId: d.deviceId,
              lastState: d.state,
              lastSeenAt: now,
            })
            .run();
          added += 1;
        } else {
          /* Never overwrite name on sync — once adopted, the user owns it.
           * State, however, must track upstream to reflect physical reality. */
          const stateDrift = row.lastState !== d.state;
          if (stateDrift) {
            db.update(lights)
              .set({ lastState: d.state, lastSeenAt: now, updatedAt: now })
              .where(eq(lights.id, row.id))
              .run();
            updated += 1;
          } else {
            db.update(lights).set({ lastSeenAt: now }).where(eq(lights.id, row.id)).run();
          }
        }
      }

      /* Drop rows that no longer exist upstream so the UI stays accurate. */
      let removed = 0;
      for (const row of existing) {
        if (!remoteIds.has(row.deviceId)) {
          db.delete(lights).where(eq(lights.id, row.id)).run();
          removed += 1;
        }
      }

      const total = db.select().from(lights).where(eq(lights.provider, EWELINK)).all().length;
      const body: LightSyncResult = { added, updated, removed, total };
      return c.json(body);
    } catch (err) {
      const mapped = mapProviderError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/:id/toggle", async (c) => {
    const id = c.req.param("id");
    const row = db.select().from(lights).where(eq(lights.id, id)).get();
    if (!row) return c.json({ error: "Light not found" }, 404);
    const previous = row.lastState;
    const next = previous === "on" ? "off" : "on";
    /* Optimistic update: flip locally first so SSE viewers see the new
     * state immediately. If the upstream call fails we revert before
     * returning the error. */
    updateLastState(row.id, next);
    try {
      if (!isKnownProvider(row.provider)) {
        throw new Error(`Unknown provider: ${row.provider}`);
      }
      await getAdapter(row.provider).setState(row.deviceId, next);
      return c.json({ ok: true, state: next }, 202);
    } catch (err) {
      if (previous === "on" || previous === "off") {
        updateLastState(row.id, previous);
      }
      const mapped = mapProviderError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/:id", async (c) => {
    const id = c.req.param("id");
    const row = db.select().from(lights).where(eq(lights.id, id)).get();
    if (!row) return c.json({ error: "Light not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as LightCommandInput | null;
    if (!body) return c.json({ error: "Invalid body" }, 400);

    let target: "on" | "off";
    if (body.state === "on" || body.state === "off") {
      target = body.state;
    } else if (body.toggle === true) {
      target = row.lastState === "on" ? "off" : "on";
    } else {
      return c.json({ error: "Body must set `state` ('on'|'off') or `toggle: true`" }, 400);
    }

    const previous = row.lastState;
    updateLastState(row.id, target);
    try {
      if (!isKnownProvider(row.provider)) {
        throw new Error(`Unknown provider: ${row.provider}`);
      }
      await getAdapter(row.provider).setState(row.deviceId, target);
      return c.json({ ok: true, state: target }, 202);
    } catch (err) {
      if (previous === "on" || previous === "off") {
        updateLastState(row.id, previous);
      }
      const mapped = mapProviderError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  /* ---- eWeLink OAuth2 authorization (code flow) ---------------------- */

  /* Starts an OAuth2 authorization code flow: generates a CSRF state,
   * stores it in memory, and returns the hosted consent URL the client
   * should open in a new window. The companion callback
   * (/api/v1/lights/providers/ewelink/oauth/callback, Bearer-exempt)
   * completes the exchange. */
  .post("/providers/ewelink/oauth/start", async (c) => {
    const app = getEwelinkAppKeys();
    if (!app) {
      return c.json({ error: "EWELINK_APP_ID / EWELINK_APP_SECRET missing from server env" }, 400);
    }
    const redirectUri = getEwelinkRedirectUri();
    if (!redirectUri) {
      return c.json({ error: "EWELINK_OAUTH_REDIRECT_URI missing from server env" }, 400);
    }
    const body = (await c.req.json().catch(() => ({}))) as { region?: string } | null;
    const region =
      body?.region === "eu" ||
      body?.region === "us" ||
      body?.region === "as" ||
      body?.region === "cn"
        ? body.region
        : "eu";
    const state = randomUUID();
    setEwelinkPending(state, region);
    const authorizationUrl = makeAuthorizeUrl({
      clientId: app.appId,
      clientSecret: app.appSecret,
      redirectUri,
      state,
      region,
    });
    return c.json({ authorizationUrl, state });
  })

  /* ---- eWeLink credentials management -------------------------------- */

  .get("/providers/ewelink/credentials", (c) => {
    const creds = getEwelinkCredentials();
    const app = getEwelinkAppKeys();
    const body: EwelinkCredentialsStatus = {
      configured: creds !== null,
      appConfigured: app !== null,
      email: creds?.email ?? null,
      countryCode: creds?.countryCode ?? null,
      region: creds?.region ?? null,
      lastAuthAt: creds?.lastAuthAt ?? null,
    };
    return c.json(body);
  })

  .put("/providers/ewelink/credentials", async (c) => {
    const app = getEwelinkAppKeys();
    if (!app) {
      return c.json({ error: "EWELINK_APP_ID / EWELINK_APP_SECRET missing from server env" }, 400);
    }
    const body = (await c.req.json().catch(() => null)) as EwelinkCredentialsInput | null;
    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      typeof body.countryCode !== "string" ||
      body.email.length === 0 ||
      body.password.length === 0 ||
      !body.countryCode.startsWith("+")
    ) {
      return c.json({ error: "email, password and countryCode (e.g. '+39') are required" }, 400);
    }

    try {
      const logged = await ewelinkLogin(
        body.email,
        body.password,
        body.countryCode,
        app.appId,
        app.appSecret,
      );
      saveEwelinkCredentials({
        email: body.email,
        password: body.password,
        countryCode: body.countryCode,
        region: logged.region,
        accessToken: logged.accessToken,
        refreshToken: logged.refreshToken,
        lastAuthAt: new Date().toISOString(),
      });
      const status: EwelinkCredentialsStatus = {
        configured: true,
        appConfigured: true,
        email: body.email,
        countryCode: body.countryCode,
        region: logged.region,
        lastAuthAt: new Date().toISOString(),
      };
      return c.json(status);
    } catch (err) {
      if (err instanceof EwelinkError) {
        return c.json(
          { error: `Login failed: ${err.message}`, code: err.code },
          err.code === 401 || err.code === 402 || err.code === 406 ? 401 : 502,
        );
      }
      console.error("[lights] ewelink login error:", err);
      return c.json({ error: "Login failed" }, 502);
    }
  })

  .delete("/providers/ewelink/credentials", (c) => {
    db.delete(providerCredentials).where(eq(providerCredentials.provider, EWELINK)).run();
    /* Orphaned light rows would point at a now-unreachable account; wipe. */
    db.delete(lights).where(eq(lights.provider, EWELINK)).run();
    return c.json({ ok: true });
  })

  .get("/providers/ewelink/remote", async (c) => {
    try {
      /* Surface auth/config errors up front with a clean message. */
      await ensureEwelinkAccessToken();
      const things = await ewelinkListDevices();
      const adopted = new Set(
        db
          .select()
          .from(lights)
          .where(eq(lights.provider, EWELINK))
          .all()
          .map((r) => r.deviceId),
      );
      const body: RemoteLightDevice[] = things.map((t) => ({
        provider: EWELINK,
        deviceId: t.itemData.deviceid,
        name: t.itemData.name,
        online: t.itemData.online,
        state: extractThingState(t),
        adopted: adopted.has(t.itemData.deviceid),
      }));
      return c.json(body);
    } catch (err) {
      const mapped = mapProviderError(err);
      return c.json(mapped.body, mapped.status);
    }
  });
