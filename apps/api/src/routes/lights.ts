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
import { getAdapter, mapProviderError } from "../lib/lights/dispatcher.js";
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

const EWELINK = "ewelink" as const;

/* ------------------------------------------------------------------------ */
/*  Helpers                                                                  */
/* ------------------------------------------------------------------------ */

function toSummary(row: typeof lights.$inferSelect): LightSummary {
  return {
    id: row.id,
    name: row.name,
    room: row.room,
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
    const next = row.lastState === "on" ? "off" : "on";
    try {
      await getAdapter(EWELINK).setState(row.deviceId, next);
      updateLastState(row.id, next);
      return c.json({ ok: true, state: next }, 202);
    } catch (err) {
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

    try {
      await getAdapter(EWELINK).setState(row.deviceId, target);
      updateLastState(row.id, target);
      return c.json({ ok: true, state: target }, 202);
    } catch (err) {
      const mapped = mapProviderError(err);
      return c.json(mapped.body, mapped.status);
    }
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
