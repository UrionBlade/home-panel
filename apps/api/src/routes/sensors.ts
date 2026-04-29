/**
 * Provider-agnostic sensors API.
 *
 * - GET  /env                  list all environmental sensors
 * - GET  /env/:id              single env sensor detail
 * - GET  /env/:id/history      bucketed 24h trend (default) — ?hours=N
 * - GET  /leak                 list all water-leak sensors
 * - POST /leak/:id/ack         acknowledge an active leak alert
 *
 * Producer today is the DIRIGERA hub via the bootstrap pipeline; the
 * shapes returned here are the same regardless of source so a future
 * Z2M / Matter-direct integration can populate the same tables.
 *
 * In NODE_ENV !== "production" we expose POST /leak/:id/test-trigger
 * to inject a synthetic leak event (push + SSE) — handy when iterating
 * on the modal/UI without bothering the real KLIPPBOK.
 */

import type { LeakAckResponse, LeakAlertPayload } from "@home-panel/shared";
import { Hono } from "hono";
import {
  ackLeakSensor,
  getEnvHistory,
  getEnvSensor,
  getLeakSensor,
  listEnvSensors,
  listLeakSensors,
} from "../lib/dirigera/device-repo.js";
import { isApnsConfigured, sendApnsBatch } from "../lib/push/apns.js";
import { listTokens } from "../lib/push/store.js";
import { buildLeakAlertPayload } from "../lib/push/templates/leak-alert.js";
import { sseEmitter } from "./sse.js";

export const sensorsRouter = new Hono()
  .get("/env", (c) => c.json(listEnvSensors()))

  .get("/env/:id", (c) => {
    const sensor = getEnvSensor(c.req.param("id"));
    if (!sensor) return c.json({ error: "not_found" }, 404);
    return c.json(sensor);
  })

  .get("/env/:id/history", (c) => {
    const id = c.req.param("id");
    const sensor = getEnvSensor(id);
    if (!sensor) return c.json({ error: "not_found" }, 404);
    const hoursParam = c.req.query("hours");
    const hours = hoursParam ? Number(hoursParam) : 24;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
      return c.json({ error: "hours must be a positive number ≤ 168" }, 400);
    }
    return c.json(getEnvHistory(id, hours));
  })

  .get("/leak", (c) => c.json(listLeakSensors()))

  .post("/leak/:id/ack", (c) => {
    const id = c.req.param("id");
    const before = getLeakSensor(id);
    if (!before) return c.json({ error: "not_found" }, 404);
    const updated = ackLeakSensor(id);
    if (!updated) return c.json({ error: "not_found" }, 404);
    sseEmitter.emit("push", {
      event: "sensors:leak-ack",
      payload: { sensorId: id, reason: "user-ack" },
    });
    const body: LeakAckResponse = {
      sensor: { ...before, lastAckAt: updated.lastAckAt },
    };
    return c.json(body);
  })

  /* Dev-only synthetic leak trigger — emits SSE + push as if KLIPPBOK
   * had fired. Lets the UI/modal/sound flow be exercised on demand. */
  .post("/leak/:id/test-trigger", async (c) => {
    if (process.env.NODE_ENV === "production") {
      return c.json({ error: "test-trigger disabled in production" }, 403);
    }
    const sensor = getLeakSensor(c.req.param("id"));
    if (!sensor) return c.json({ error: "not_found" }, 404);
    const payload: LeakAlertPayload = {
      sensorId: sensor.id,
      friendlyName: sensor.friendlyName,
      roomName: sensor.roomName,
      triggeredAt: new Date().toISOString(),
    };
    sseEmitter.emit("push", { event: "sensors:leak-trigger", payload });
    if (isApnsConfigured()) {
      const tokens = listTokens("ios").map((t) => t.token);
      if (tokens.length > 0) {
        try {
          await sendApnsBatch(tokens, buildLeakAlertPayload(payload));
        } catch (err) {
          console.warn(
            "[sensors] test-trigger APNs send failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    return c.json({ ok: true, payload });
  });
