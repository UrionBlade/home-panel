/**
 * DIRIGERA — admin / diagnostic routes.
 *
 * - GET   /status         hub configured? connected? last sync?
 * - POST  /sync           force a fresh device reconciliation
 * - GET   /devices        raw hub device list (debug only)
 *
 * All routes are mounted under `/api/v1/dirigera/*`.
 */

import type { DirigeraStatus } from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { envSensors, leakSensors, lights } from "../db/schema.js";
import { getLastSyncAt, syncDevices } from "../lib/dirigera/bootstrap.js";
import { isConfigured as dirigeraIsConfigured, listDevices } from "../lib/dirigera/client.js";
import { isDirigeraWsConnected } from "../lib/dirigera/ws-subscriber.js";

export const dirigeraRouter = new Hono()
  .get("/status", (c) => {
    const configured = dirigeraIsConfigured();
    if (!configured) {
      const body: DirigeraStatus = {
        configured: false,
        connected: false,
        deviceCount: null,
        lastSyncAt: null,
        reason: "not_configured",
      };
      return c.json(body);
    }
    const lightsCount = db
      .select()
      .from(lights)
      .where(eq(lights.provider, "dirigera"))
      .all().length;
    const envCount = db.select().from(envSensors).all().length;
    const leakCount = db.select().from(leakSensors).all().length;
    const body: DirigeraStatus = {
      configured: true,
      connected: isDirigeraWsConnected(),
      deviceCount: lightsCount + envCount + leakCount,
      lastSyncAt: getLastSyncAt(),
      reason: isDirigeraWsConnected() ? undefined : "ws_disconnected",
    };
    return c.json(body);
  })

  .post("/sync", async (c) => {
    if (!dirigeraIsConfigured()) {
      return c.json({ error: "DIRIGERA not configured" }, 400);
    }
    try {
      const result = await syncDevices();
      return c.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 502);
    }
  })

  .get("/devices", async (c) => {
    if (!dirigeraIsConfigured()) {
      return c.json({ error: "DIRIGERA not configured" }, 400);
    }
    try {
      const devices = await listDevices();
      return c.json(devices);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 502);
    }
  });
