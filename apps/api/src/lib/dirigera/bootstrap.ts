/**
 * DIRIGERA bootstrap + runtime glue.
 *
 * Three responsibilities, all wired from the API entry point:
 *   1. `initDirigera` — first-pass sync + open WebSocket subscriber +
 *      register the lights provider, no-op if env vars missing.
 *   2. Bus listener — translate the WS subscriber's `device` /
 *      `device-removed` events into upserts + SSE broadcasts + leak
 *      push notifications.
 *   3. Retention — hourly job that drops env_sensor_history rows older
 *      than 7 days so the table stays bounded.
 */

import type { DirigeraDevice, LeakAlertPayload } from "@home-panel/shared";
import { lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { envSensorHistory } from "../../db/schema.js";
import { sseEmitter } from "../../routes/sse.js";
import { isApnsConfigured, sendApnsBatch } from "../push/apns.js";
import { listTokens } from "../push/store.js";
import { buildLeakAlertPayload } from "../push/templates/leak-alert.js";
import { isConfigured as dirigeraIsConfigured, listDevices } from "./client.js";
import {
  appendEnvHistory,
  classifyDevice,
  findLightByProviderId,
  getEnvSensor,
  upsertEnvSensor,
  upsertLeakSensor,
  upsertLight,
} from "./device-repo.js";
import {
  type DirigeraRemovedEvent,
  type DirigeraStateChangeEvent,
  dirigeraEventBus,
  startDirigeraSubscriber,
} from "./ws-subscriber.js";

let lastSyncAt: string | null = null;
let listenersAttached = false;
let retentionTimer: ReturnType<typeof setInterval> | null = null;

export function getLastSyncAt(): string | null {
  return lastSyncAt;
}

/** Idempotent boot. Safe to call from `src/index.ts` even if env is
 * missing — it short-circuits with a friendly log line. */
export async function initDirigera(): Promise<void> {
  if (!dirigeraIsConfigured()) {
    console.log("[dirigera] disabled — DIRIGERA_HOST/DIRIGERA_TOKEN not set");
    return;
  }

  attachListenersOnce();
  startRetentionScheduler();

  try {
    await syncDevices();
    console.log("[dirigera] initial sync OK");
  } catch (err) {
    /* Non-fatal: the WS subscriber will retry, and a manual /sync
     * endpoint can refresh once the hub is reachable. */
    console.warn("[dirigera] initial sync failed:", err instanceof Error ? err.message : err);
  }

  startDirigeraSubscriber();
}

/** Pull the full device list from the hub and reconcile with local
 * tables. Returns simple counters useful for the manual /sync route. */
export async function syncDevices(): Promise<{
  total: number;
  lights: number;
  envSensors: number;
  leakSensors: number;
  ignored: number;
}> {
  const devices = await listDevices();
  let lightsN = 0;
  let envN = 0;
  let leakN = 0;
  let ignoredN = 0;
  for (const device of devices) {
    const cls = classifyDevice(device);
    switch (cls.kind) {
      case "light":
        applyLight(device);
        lightsN += 1;
        break;
      case "air_quality":
      case "climate":
        applyEnv(device, cls.kind);
        envN += 1;
        break;
      case "leak":
        applyLeak(device);
        leakN += 1;
        break;
      case "ignored":
        ignoredN += 1;
        break;
    }
  }
  lastSyncAt = new Date().toISOString();
  return {
    total: devices.length,
    lights: lightsN,
    envSensors: envN,
    leakSensors: leakN,
    ignored: ignoredN,
  };
}

/* ------------------------------------------------------------------ */
/*  Per-classification appliers                                        */
/* ------------------------------------------------------------------ */

function applyLight(device: DirigeraDevice): void {
  if (device.deviceType !== "light") return;
  const attrs = device.attributes;
  const name = device.customName?.trim() || attrs.customName?.trim() || attrs.model || "Lampada";
  upsertLight({
    dirigeraId: device.id,
    name,
    isOn: typeof attrs.isOn === "boolean" ? attrs.isOn : undefined,
    lastSeen: device.lastSeen ?? null,
  });
  /* Notify the existing lights pipeline so the frontend updates without
   * a separate channel — we reuse the lights:update event so SSE
   * subscribers don't need new wiring. */
  const summary = findLightByProviderId(device.id);
  if (summary) {
    sseEmitter.emit("push", { event: "lights:update", payload: summary });
  }
}

function applyEnv(device: DirigeraDevice, kind: "air_quality" | "climate"): void {
  const attrs = device.attributes as Record<string, number | boolean | string | undefined>;
  const co2 = numOrNull(attrs.currentCO2);
  const pm25 = numOrNull(attrs.currentPM25);
  const temp = numOrNull(attrs.currentTemperature);
  const hum = numOrNull(attrs.currentRH);
  const battery = numOrNull(attrs.batteryPercentage);
  const friendlyName =
    device.customName?.trim() ||
    (attrs.customName as string | undefined)?.trim() ||
    (attrs.model as string | undefined) ||
    (kind === "air_quality" ? "Sensore aria" : "Sensore clima");

  const result = upsertEnvSensor({
    dirigeraId: device.id,
    kind,
    friendlyName,
    co2Ppm: co2,
    pm25,
    tempC: temp,
    humidityPct: hum,
    batteryPct: battery == null ? null : Math.round(battery),
    offline: typeof device.isReachable === "boolean" ? !device.isReachable : null,
    lastSeen: device.lastSeen ?? null,
  });

  /* Append a history point only when there's at least one numeric
   * value to preserve — pure "offline" updates don't pollute the
   * trend graph. */
  if (co2 != null || pm25 != null || temp != null || hum != null) {
    appendEnvHistory({
      sensorId: result.rowId,
      co2Ppm: co2,
      pm25,
      tempC: temp,
      humidityPct: hum,
    });
  }

  const summary = getEnvSensor(result.rowId);
  if (summary) {
    sseEmitter.emit("push", { event: "sensors:env-update", payload: summary });
  }
}

function applyLeak(device: DirigeraDevice): void {
  const attrs = device.attributes as Record<string, unknown>;
  const friendlyName =
    device.customName?.trim() ||
    (typeof attrs.customName === "string" ? attrs.customName.trim() : "") ||
    (typeof attrs.model === "string" ? attrs.model : "Sensore perdita");
  const battery = numOrNull(attrs.batteryPercentage);
  const detected = typeof attrs.waterLeakDetected === "boolean" ? attrs.waterLeakDetected : false;

  const { row, triggered, cleared } = upsertLeakSensor({
    dirigeraId: device.id,
    friendlyName,
    leakDetected: detected,
    batteryPct: battery == null ? null : Math.round(battery),
    offline: typeof device.isReachable === "boolean" ? !device.isReachable : null,
    lastSeen: device.lastSeen ?? null,
  });

  /* Always emit a generic update so the leak list view refreshes. */
  sseEmitter.emit("push", {
    event: "sensors:leak-update",
    payload: { sensorId: row.id, leakDetected: row.leakDetected },
  });

  if (triggered) {
    void fireLeakAlert(row.id, row.friendlyName, row.roomId);
  } else if (cleared) {
    sseEmitter.emit("push", {
      event: "sensors:leak-ack",
      payload: { sensorId: row.id, reason: "auto-cleared" },
    });
  }
}

async function fireLeakAlert(
  sensorId: string,
  friendlyName: string,
  roomId: string | null,
): Promise<void> {
  const triggeredAt = new Date().toISOString();
  let roomName: string | null = null;
  if (roomId) {
    const { rooms } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const r = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
    roomName = r?.name ?? null;
  }
  const payload: LeakAlertPayload = { sensorId, friendlyName, roomName, triggeredAt };

  /* SSE first — modale frontend reagisce subito, prima del roundtrip APNs. */
  sseEmitter.emit("push", { event: "sensors:leak-trigger", payload });

  if (isApnsConfigured()) {
    const tokens = listTokens("ios").map((t) => t.token);
    if (tokens.length > 0) {
      try {
        await sendApnsBatch(tokens, buildLeakAlertPayload(payload));
      } catch (err) {
        console.warn("[dirigera] leak APNs send failed:", err instanceof Error ? err.message : err);
      }
    }
  } else {
    console.warn("[dirigera] leak event fired but APNs not configured — push skipped");
  }
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/*  WS bus listener                                                    */
/* ------------------------------------------------------------------ */

function attachListenersOnce(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  dirigeraEventBus.on("device", (evt: DirigeraStateChangeEvent) => {
    const cls = classifyDevice(evt.device);
    switch (cls.kind) {
      case "light":
        applyLight(evt.device);
        return;
      case "air_quality":
      case "climate":
        applyEnv(evt.device, cls.kind);
        return;
      case "leak":
        applyLeak(evt.device);
        return;
      case "ignored":
        return;
    }
  });

  dirigeraEventBus.on("device-removed", (evt: DirigeraRemovedEvent) => {
    /* We don't auto-cascade-delete: the user is the source of truth for
     * whether they want a vanished sensor purged. We just log so any
     * confused user has a breadcrumb. */
    console.log(`[dirigera] hub reports device removed: ${evt.deviceId}`);
  });
}

/* ------------------------------------------------------------------ */
/*  Retention scheduler                                                */
/* ------------------------------------------------------------------ */

const RETENTION_DAYS = 7;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

function startRetentionScheduler(): void {
  if (retentionTimer) return;
  /* Run once at startup so a long-restart catches up immediately, then
   * every hour. */
  runRetention();
  retentionTimer = setInterval(runRetention, RETENTION_INTERVAL_MS);
}

export function stopRetentionScheduler(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}

function runRetention(): void {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = db.delete(envSensorHistory).where(lt(envSensorHistory.recordedAt, cutoff)).run();
    /* better-sqlite3 returns `changes` for DELETE statements. */
    const changes = (result as unknown as { changes?: number }).changes ?? 0;
    if (changes > 0) {
      console.log(`[dirigera] retention pruned ${changes} env_sensor_history rows`);
    }
  } catch (err) {
    console.warn("[dirigera] retention pass failed:", err instanceof Error ? err.message : err);
  }
}
