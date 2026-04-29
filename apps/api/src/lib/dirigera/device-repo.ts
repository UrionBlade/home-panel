/**
 * DIRIGERA device repository.
 *
 * Owns the upsert path from raw `DirigeraDevice` payloads (REST sync or
 * WebSocket push) into the local schema rows (`lights`, `env_sensors`,
 * `leak_sensors`, `env_sensor_history`).
 *
 * Two invariants matter here:
 *   1. User-managed fields (`roomId`, `friendlyName` once renamed,
 *      `nickname`) are NEVER overwritten by upstream sync once set —
 *      otherwise a user's room assignment for KAJPLATS would be lost
 *      every time DIRIGERA emits a state change.
 *   2. Leak transitions are idempotent: re-receiving a `wet=true`
 *      payload while the row is already wet does NOT re-fire push +
 *      modal events.
 */

import { randomUUID } from "node:crypto";
import type { DirigeraDevice, EnvSensor, LeakSensor, LightSummary } from "@home-panel/shared";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  type EnvSensorRow,
  envSensorHistory,
  envSensors,
  type LeakSensorRow,
  leakSensors,
  lights,
  rooms,
} from "../../db/schema.js";

/** Discriminated classification of a raw DIRIGERA device. The hub uses
 * loose `deviceType` strings + capability lists; we collapse them into
 * the four buckets the Home Panel cares about. */
export type DirigeraClassification =
  | { kind: "light"; device: DirigeraDevice }
  | { kind: "air_quality"; device: DirigeraDevice }
  | { kind: "climate"; device: DirigeraDevice }
  | { kind: "leak"; device: DirigeraDevice }
  | { kind: "ignored"; device: DirigeraDevice };

/** Map a hub device into one of our handled buckets. Anything we don't
 * recognise is returned as `ignored` so the sync logs it without
 * crashing or polluting our schema.
 *
 * Routing is attribute-driven first (most reliable across firmware
 * versions) and falls back to deviceType. DIRIGERA exposes the same
 * physical class under several deviceType strings — KLIPPBOK is
 * `waterSensor`, ALPSTUGA is `environmentSensor`, TIMMERFLÖTTE the
 * generic `sensor` — so trying to match on the string alone misses
 * devices and silently drops them into `ignored`. */
export function classifyDevice(device: DirigeraDevice): DirigeraClassification {
  if (device.deviceType === "light") {
    return { kind: "light", device };
  }
  const attrs = device.attributes as Record<string, unknown>;
  if (device.deviceType === "waterSensor" || typeof attrs.waterLeakDetected === "boolean") {
    return { kind: "leak", device };
  }
  /* ALPSTUGA reports CO2 + PM2.5 alongside temp/humidity. The TIMMERFLÖTTE
   * climate-only sensor only carries temp + humidity, so we route those
   * through the same env_sensors table with the AQ fields nullable. */
  const hasAirQuality = attrs.currentCO2 !== undefined || attrs.currentPM25 !== undefined;
  if (hasAirQuality || device.deviceType === "environmentSensor") {
    return { kind: "air_quality", device };
  }
  if (attrs.currentTemperature !== undefined || attrs.currentRH !== undefined) {
    return { kind: "climate", device };
  }
  return { kind: "ignored", device };
}

/* ------------------------------------------------------------------ */
/*  Lights upsert                                                      */
/* ------------------------------------------------------------------ */

interface LightUpsert {
  dirigeraId: string;
  name: string;
  isOn: boolean | undefined;
  lastSeen: string | null;
}

/** Upsert KAJPLATS-class lights into the shared `lights` table.
 * Preserves user assignments (`roomId`, custom `name` if it diverges
 * from the hub's customName) on subsequent syncs. */
export function upsertLight(input: LightUpsert): void {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(lights)
    .where(and(eq(lights.provider, "dirigera"), eq(lights.deviceId, input.dirigeraId)))
    .get();

  const lastState: "on" | "off" | "unknown" =
    input.isOn === undefined ? "unknown" : input.isOn ? "on" : "off";

  if (existing) {
    db.update(lights)
      .set({
        /* Only refresh display name when the user hasn't customised it.
         * Heuristic: if the local name is still equal to the previous
         * hub-derived name (or has never diverged from the hub), accept
         * an upstream rename. We can't perfectly tell, so we accept the
         * upstream value only on first import; afterwards user wins. */
        lastState,
        lastSeenAt: input.lastSeen ?? now,
        updatedAt: now,
      })
      .where(eq(lights.id, existing.id))
      .run();
    return;
  }
  db.insert(lights)
    .values({
      id: randomUUID(),
      name: input.name,
      provider: "dirigera",
      deviceId: input.dirigeraId,
      lastState,
      lastSeenAt: input.lastSeen ?? now,
    })
    .run();
}

/* ------------------------------------------------------------------ */
/*  Environmental sensors upsert + history                             */
/* ------------------------------------------------------------------ */

interface EnvUpsert {
  dirigeraId: string;
  kind: "air_quality" | "climate";
  friendlyName: string;
  co2Ppm: number | null;
  pm25: number | null;
  tempC: number | null;
  humidityPct: number | null;
  batteryPct: number | null;
  offline: boolean;
  lastSeen: string | null;
}

/** Result returned to the caller so the listener can emit SSE +
 * append history with the right id without a second SELECT. */
export interface UpsertEnvResult {
  rowId: string;
  isNew: boolean;
}

export function upsertEnvSensor(input: EnvUpsert): UpsertEnvResult {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(envSensors)
    .where(eq(envSensors.dirigeraId, input.dirigeraId))
    .get();

  if (existing) {
    db.update(envSensors)
      .set({
        kind: input.kind,
        lastCo2Ppm: input.co2Ppm,
        lastPm25: input.pm25,
        lastTempC: input.tempC,
        lastHumidityPct: input.humidityPct,
        lastBatteryPct: input.batteryPct,
        offline: input.offline,
        lastSeen: input.lastSeen ?? now,
        updatedAt: now,
      })
      .where(eq(envSensors.id, existing.id))
      .run();
    return { rowId: existing.id, isNew: false };
  }
  const id = randomUUID();
  db.insert(envSensors)
    .values({
      id,
      dirigeraId: input.dirigeraId,
      kind: input.kind,
      friendlyName: input.friendlyName,
      lastCo2Ppm: input.co2Ppm,
      lastPm25: input.pm25,
      lastTempC: input.tempC,
      lastHumidityPct: input.humidityPct,
      lastBatteryPct: input.batteryPct,
      offline: input.offline,
      lastSeen: input.lastSeen ?? now,
    })
    .run();
  return { rowId: id, isNew: true };
}

/** Append an environmental reading to the rolling history table. The
 * retention scheduler trims rows older than 7 days hourly. */
export function appendEnvHistory(input: {
  sensorId: string;
  co2Ppm: number | null;
  pm25: number | null;
  tempC: number | null;
  humidityPct: number | null;
}): void {
  /* Set recordedAt explicitly as an ISO-8601 string. The SQL default
   * `CURRENT_TIMESTAMP` produces `YYYY-MM-DD HH:MM:SS` (space separator)
   * which sorts incorrectly against ISO-8601 cutoffs (`T` separator)
   * when both values fall in the same day — same-day records would be
   * filtered out of "last N hours" queries. */
  db.insert(envSensorHistory)
    .values({
      sensorId: input.sensorId,
      recordedAt: new Date().toISOString(),
      co2Ppm: input.co2Ppm,
      pm25: input.pm25,
      tempC: input.tempC,
      humidityPct: input.humidityPct,
    })
    .run();
}

/* ------------------------------------------------------------------ */
/*  Leak sensors upsert with transition detection                      */
/* ------------------------------------------------------------------ */

interface LeakUpsert {
  dirigeraId: string;
  friendlyName: string;
  leakDetected: boolean;
  batteryPct: number | null;
  offline: boolean;
  lastSeen: string | null;
}

/** Discriminator returned to the listener so it knows whether to fire
 * the push notification + SSE leak-trigger event. */
export interface UpsertLeakResult {
  row: LeakSensorRow;
  /** True when this upsert flipped state false→true. */
  triggered: boolean;
  /** True when this upsert flipped state true→false. */
  cleared: boolean;
}

export function upsertLeakSensor(input: LeakUpsert): UpsertLeakResult {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(leakSensors)
    .where(eq(leakSensors.dirigeraId, input.dirigeraId))
    .get();

  if (existing) {
    const triggered = !existing.leakDetected && input.leakDetected;
    const cleared = existing.leakDetected && !input.leakDetected;
    db.update(leakSensors)
      .set({
        leakDetected: input.leakDetected,
        batteryPct: input.batteryPct,
        offline: input.offline,
        lastSeen: input.lastSeen ?? now,
        /* Clear the ack timestamp when the sensor returns to dry so the
         * next leak fires a fresh modal+push. */
        lastAckAt: cleared ? null : existing.lastAckAt,
        updatedAt: now,
      })
      .where(eq(leakSensors.id, existing.id))
      .run();
    const row = db
      .select()
      .from(leakSensors)
      .where(eq(leakSensors.id, existing.id))
      .get() as LeakSensorRow;
    return { row, triggered, cleared };
  }

  const id = randomUUID();
  db.insert(leakSensors)
    .values({
      id,
      dirigeraId: input.dirigeraId,
      friendlyName: input.friendlyName,
      leakDetected: input.leakDetected,
      batteryPct: input.batteryPct,
      offline: input.offline,
      lastSeen: input.lastSeen ?? now,
    })
    .run();
  const row = db.select().from(leakSensors).where(eq(leakSensors.id, id)).get() as LeakSensorRow;
  /* A first sync that arrives with leakDetected=true is itself a fresh
   * trigger — the user installed a wet sensor or the API restarted
   * during an active leak. We push notifications either way. */
  return { row, triggered: input.leakDetected, cleared: false };
}

export function ackLeakSensor(id: string): LeakSensorRow | null {
  const now = new Date().toISOString();
  db.update(leakSensors)
    .set({ lastAckAt: now, updatedAt: now })
    .where(eq(leakSensors.id, id))
    .run();
  return db.select().from(leakSensors).where(eq(leakSensors.id, id)).get() ?? null;
}

/* ------------------------------------------------------------------ */
/*  Read-side projections                                              */
/* ------------------------------------------------------------------ */

function envRowToSummary(row: EnvSensorRow, roomName: string | null): EnvSensor {
  return {
    id: row.id,
    providerId: row.dirigeraId,
    kind: row.kind,
    friendlyName: row.friendlyName,
    roomId: row.roomId ?? null,
    roomName,
    co2Ppm: row.lastCo2Ppm ?? null,
    pm25: row.lastPm25 ?? null,
    temperatureC: row.lastTempC ?? null,
    humidityPct: row.lastHumidityPct ?? null,
    batteryPct: row.lastBatteryPct ?? null,
    lastSeen: row.lastSeen ?? null,
    offline: row.offline,
  };
}

function leakRowToSummary(row: LeakSensorRow, roomName: string | null): LeakSensor {
  return {
    id: row.id,
    providerId: row.dirigeraId,
    friendlyName: row.friendlyName,
    roomId: row.roomId ?? null,
    roomName,
    leakDetected: row.leakDetected,
    batteryPct: row.batteryPct ?? null,
    lastSeen: row.lastSeen ?? null,
    lastAckAt: row.lastAckAt ?? null,
    offline: row.offline,
  };
}

/** Look up room display name for the given roomId, or null. Cached
 * per-call by Map; rooms are few so a Drizzle SELECT is cheap. */
function buildRoomLookup(): (id: string | null) => string | null {
  const all = db.select().from(rooms).all();
  const map = new Map<string, string>();
  for (const r of all) map.set(r.id, r.name);
  return (id) => (id ? (map.get(id) ?? null) : null);
}

export function listEnvSensors(): EnvSensor[] {
  const lookup = buildRoomLookup();
  return db
    .select()
    .from(envSensors)
    .all()
    .map((row) => envRowToSummary(row, lookup(row.roomId)));
}

export function getEnvSensor(id: string): EnvSensor | null {
  const row = db.select().from(envSensors).where(eq(envSensors.id, id)).get();
  if (!row) return null;
  const roomName = row.roomId
    ? (db.select().from(rooms).where(eq(rooms.id, row.roomId)).get()?.name ?? null)
    : null;
  return envRowToSummary(row, roomName);
}

export function listLeakSensors(): LeakSensor[] {
  const lookup = buildRoomLookup();
  return db
    .select()
    .from(leakSensors)
    .all()
    .map((row) => leakRowToSummary(row, lookup(row.roomId)));
}

export function getLeakSensor(id: string): LeakSensor | null {
  const row = db.select().from(leakSensors).where(eq(leakSensors.id, id)).get();
  if (!row) return null;
  const roomName = row.roomId
    ? (db.select().from(rooms).where(eq(rooms.id, row.roomId)).get()?.name ?? null)
    : null;
  return leakRowToSummary(row, roomName);
}

export function getEnvHistory(
  sensorId: string,
  hours: number,
): {
  recordedAt: string;
  co2Ppm: number | null;
  pm25: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
}[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = db
    .select()
    .from(envSensorHistory)
    .where(and(eq(envSensorHistory.sensorId, sensorId), gte(envSensorHistory.recordedAt, cutoff)))
    .all();

  /* Bucket into 5-minute windows with simple AVG. The dataset is tiny
   * (≤ ~1500 rows for a single sensor in 24h) so we can do this in
   * memory without pushing aggregation down to SQLite. */
  const BUCKET_MS = 5 * 60 * 1000;
  const buckets = new Map<
    number,
    {
      n: number;
      co2: number | null;
      pm: number | null;
      temp: number | null;
      hum: number | null;
    }
  >();
  for (const row of rows) {
    const t = Date.parse(row.recordedAt);
    if (Number.isNaN(t)) continue;
    const key = Math.floor(t / BUCKET_MS) * BUCKET_MS;
    const cur = buckets.get(key) ?? { n: 0, co2: null, pm: null, temp: null, hum: null };
    cur.n += 1;
    cur.co2 = avgFold(cur.co2, row.co2Ppm);
    cur.pm = avgFold(cur.pm, row.pm25);
    cur.temp = avgFold(cur.temp, row.tempC);
    cur.hum = avgFold(cur.hum, row.humidityPct);
    buckets.set(key, cur);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => ({
      recordedAt: new Date(k).toISOString(),
      co2Ppm: v.co2,
      pm25: v.pm,
      temperatureC: v.temp,
      humidityPct: v.hum,
    }));
}

function avgFold(running: number | null, next: number | null): number | null {
  if (next == null) return running;
  if (running == null) return next;
  /* Running mean: keep it simple, cheap, and stable for our tiny
   * bucket sizes. We don't track weights because each row is one
   * reading. */
  return (running + next) / 2;
}

/** Map a list of `LightSummary` rows by provider id, used by the lights
 * provider to look up the local row when a hub-side patch needs to
 * update our cached state. */
export function findLightByProviderId(deviceId: string): LightSummary | null {
  const row = db
    .select()
    .from(lights)
    .where(and(eq(lights.provider, "dirigera"), eq(lights.deviceId, deviceId)))
    .get();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    room: row.room,
    roomId: row.roomId,
    provider: "dirigera",
    deviceId: row.deviceId,
    state: row.lastState,
    lastSeenAt: row.lastSeenAt,
  };
}
