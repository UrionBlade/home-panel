/**
 * Zigbee2MQTT bridge client.
 *
 * Subscribes to the bridge topics, mirrors the device list to SQLite, and
 * pushes live state changes over SSE. Pairing / rename / remove requests
 * from the API publish on `bridge/request/*` topics; Z2M answers on
 * `bridge/response/*` and follows up by re-publishing the updated
 * `bridge/devices` list which keeps our DB in sync without bespoke
 * roundtrip handling.
 */

import {
  ALARM_SSE_EVENTS,
  type AlarmEventKind,
  ZIGBEE_SSE_EVENTS,
  type ZigbeeBridgeState,
  type ZigbeeDevice,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import mqtt, { type MqttClient } from "mqtt";
import { db } from "../../db/client.js";
import { zigbeeDevices } from "../../db/schema.js";
import { sseEmitter } from "../../routes/sse.js";
import { countUnread, getAlarmState, recordEvent } from "../alarm/store.js";
import { sendApnsBatch } from "../push/apns.js";
import { listTokens, removeTokenByValue } from "../push/store.js";
import { removeDevice as dbRemoveDevice, getDevice, listDevices, upsertDevice } from "./store.js";

const ALARM_KIND_TITLES: Record<string, string> = {
  contact_open: "Apertura rilevata",
  motion: "Movimento rilevato",
  tamper: "Manomissione",
  leak: "Perdita d'acqua",
  manual: "Allarme manuale",
};

/** How long the siren should sound on each trigger, parsed from
 * ALARM_SIREN_DURATION_SECONDS. Default 5s — short for testing; bump
 * to 180+ once the wiring is validated. Clamped to the NAS-AB02B2
 * maximum of 1800. */
export function getSirenDurationSeconds(): number {
  const raw = process.env.ALARM_SIREN_DURATION_SECONDS;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(1800, Math.round(parsed));
}

/** Which melody index the NEO NAS-AB02B2 should play. The device exposes
 * 18 tones; 1–9 are cheery doorbell-style chimes (good for nothing in
 * an emergency), 10+ are proper alarm sirens. Default 18 (the most
 * recognisable burglar-alarm wail). Override via ALARM_SIREN_MELODY. */
function getSirenMelody(): number {
  const raw = process.env.ALARM_SIREN_MELODY;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 18) return 18;
  return Math.round(parsed);
}

/** Fan out an alarm event to every iOS push token registered. */
async function fanoutAlarmPush(event: {
  id: string;
  ieeeAddress: string;
  friendlyName: string;
  kind: string;
}) {
  const tokens = listTokens("ios").map((t) => t.token);
  if (tokens.length === 0) return;
  try {
    const results = await sendApnsBatch(tokens, {
      title: ALARM_KIND_TITLES[event.kind] ?? "Allarme",
      body: event.friendlyName,
      sound: "default",
      timeSensitive: true,
      collapseId: `alarm-${event.ieeeAddress}`,
      data: {
        kind: "alarm",
        alarmKind: event.kind,
        eventId: event.id,
        ieeeAddress: event.ieeeAddress,
      },
    });
    /* APNs returns 410 when a token is no longer valid (app uninstalled,
     * token rotated). Prune those right away so the next alarm doesn't
     * pay the cost of trying them again. */
    for (const r of results) {
      if (r.status === 410) {
        console.log(`[push] pruning unregistered token ${r.token.slice(0, 8)}…`);
        removeTokenByValue(r.token);
      } else if (!r.ok) {
        console.warn(
          `[push] APNs ${r.status ?? "?"} for token ${r.token.slice(0, 8)}…: ${r.reason ?? ""}`,
        );
      }
    }
  } catch (err) {
    console.error("[push] APNs fanout failed:", err);
  }
}

interface Z2MDevice {
  ieee_address: string;
  friendly_name: string;
  type: string;
  model_id?: string;
  manufacturer?: string;
  description?: string;
  definition?: {
    vendor?: string;
    model?: string;
    description?: string;
  } | null;
}

interface State {
  client: MqttClient | null;
  baseTopic: string;
  mqttConnected: boolean;
  z2mOnline: boolean;
  permitJoinUntil: number | null;
  /** Pending response promises keyed by request id (transaction). */
  pending: Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>;
}

const state: State = {
  client: null,
  baseTopic: process.env.ZIGBEE2MQTT_BASE_TOPIC || "zigbee2mqtt",
  mqttConnected: false,
  z2mOnline: false,
  permitJoinUntil: null,
  pending: new Map(),
};

function emit(event: string, payload: unknown) {
  sseEmitter.emit("push", { event, payload });
}

function broadcastBridge() {
  const bridge: ZigbeeBridgeState = {
    mqttConnected: state.mqttConnected,
    z2mOnline: state.z2mOnline,
    permitJoinUntil:
      state.permitJoinUntil && state.permitJoinUntil > Date.now()
        ? new Date(state.permitJoinUntil).toISOString()
        : null,
    deviceCount: listDevices().length,
  };
  emit(ZIGBEE_SSE_EVENTS.bridge, bridge);
}

function broadcastDevices() {
  emit(ZIGBEE_SSE_EVENTS.devices, listDevices());
}

function parseBattery(payload: Record<string, unknown>): number | null {
  const v = payload.battery;
  if (typeof v === "number") return Math.round(v);
  return null;
}

function parseLinkQuality(payload: Record<string, unknown>): number | null {
  const v = payload.linkquality;
  if (typeof v === "number") return Math.round(v);
  return null;
}

function isCoordinator(d: Z2MDevice): boolean {
  return d.type === "Coordinator";
}

/** Apply a `bridge/devices` snapshot to the DB. */
function applyDeviceList(list: Z2MDevice[]) {
  const seen = new Set<string>();
  for (const d of list) {
    if (isCoordinator(d)) continue;
    seen.add(d.ieee_address);
    upsertDevice({
      ieeeAddress: d.ieee_address,
      friendlyName: d.friendly_name,
      vendor: d.definition?.vendor ?? d.manufacturer ?? null,
      model: d.definition?.model ?? d.model_id ?? null,
      description: d.definition?.description ?? d.description ?? null,
      type: d.type ?? null,
    });
  }
  // Devices removed from Z2M (via panel or Z2M frontend) drop out of
  // the snapshot — mirror that locally so the panel doesn't keep
  // ghost rows around.
  for (const local of listDevices()) {
    if (!seen.has(local.ieeeAddress)) {
      dbRemoveDevice(local.ieeeAddress);
    }
  }
  broadcastDevices();
  broadcastBridge();
}

/** Look up the per-device "armed" opt-in flag (`zigbee_devices.armed`). */
function isDeviceArmed(ieeeAddress: string): boolean {
  const row = db
    .select({ armed: zigbeeDevices.armed })
    .from(zigbeeDevices)
    .where(eq(zigbeeDevices.ieeeAddress, ieeeAddress))
    .get();
  return row?.armed ?? true;
}

/** Mirror the kind-derivation rules used by the frontend
 * (`apps/mobile/src/lib/devices/model.ts`) on the backend so the alarm
 * runtime can pick out sirens without round-tripping through the UI. */
function isSirenDevice(dev: ZigbeeDevice): boolean {
  if (dev.kindOverride === "siren") return true;
  if (dev.kindOverride && dev.kindOverride !== "siren") return false;
  const desc = (dev.description ?? "").toLowerCase();
  const model = (dev.model ?? "").toLowerCase();
  return (
    desc.includes("siren") ||
    desc.includes("alarm") ||
    model.startsWith("hs2wd") ||
    model.startsWith("nas-ab02")
  );
}

/**
 * Decide whether a state payload represents a triggerable alarm event,
 * comparing the previous and the new state. Aqara/Z2M conventions:
 *   contact: false  → door/window OPEN
 *   occupancy: true → motion detected
 *   tamper: true    → device housing tampered
 *   water_leak: true→ leak detected
 */
function detectAlarmKind(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): AlarmEventKind | null {
  const wasContact = prev && typeof prev.contact === "boolean" ? prev.contact : true;
  if (typeof next.contact === "boolean" && wasContact && next.contact === false) {
    return "contact_open";
  }
  const wasOccupancy = prev && prev.occupancy === true;
  if (next.occupancy === true && !wasOccupancy) return "motion";
  const wasTamper = prev && prev.tamper === true;
  if (next.tamper === true && !wasTamper) return "tamper";
  const wasLeak = prev && prev.water_leak === true;
  if (next.water_leak === true && !wasLeak) return "leak";
  return null;
}

/** Apply a `<friendly_name>` state payload to the matching device. */
function applyDeviceState(friendlyName: string, payload: Record<string, unknown>) {
  // Z2M emits the device topic keyed by friendly name, not ieee address.
  // Resolve via the in-memory list — friendly names are unique by design.
  const all = listDevices();
  const dev = all.find((d) => d.friendlyName === friendlyName);
  if (!dev) return;

  const battery = parseBattery(payload);
  const linkQuality = parseLinkQuality(payload);

  /* Capture previous state BEFORE the upsert so the trigger predicate
   * can see what changed. */
  const prevState = dev.state;
  const alarmKind = detectAlarmKind(prevState, payload);

  const updated = upsertDevice({
    ieeeAddress: dev.ieeeAddress,
    friendlyName: dev.friendlyName,
    state: payload,
    battery,
    linkQuality,
    lastSeenAt: new Date().toISOString(),
  });
  if (updated) {
    emit(ZIGBEE_SSE_EVENTS.device, updated);
  }

  /* Fire the alarm only if the system is armed AND the device is opted
   * in. Disarmed → silent log of state changes (already done above). */
  if (alarmKind) {
    const alarm = getAlarmState();
    if (alarm.armed && isDeviceArmed(dev.ieeeAddress)) {
      const event = recordEvent({
        ieeeAddress: dev.ieeeAddress,
        friendlyName: dev.friendlyName,
        kind: alarmKind,
        payload,
      });
      sseEmitter.emit("push", {
        event: ALARM_SSE_EVENTS.triggered,
        payload: event,
      });
      sseEmitter.emit("push", {
        event: ALARM_SSE_EVENTS.state,
        payload: { state: alarm, unreadCount: countUnread() },
      });
      /* Fire-and-forget APNs fanout. Failures are logged inside, never
       * thrown — the SSE alert is still the primary delivery channel
       * and we don't want a flaky push to break the live banner. */
      void fanoutAlarmPush(event);
      /* Drive the physical sirens. The function looks up armed sirens
       * itself; it's a no-op when the network has none. */
      triggerSirens(getSirenDurationSeconds());
    }
  }
}

function applyAvailability(friendlyName: string, raw: string) {
  const all = listDevices();
  const dev = all.find((d) => d.friendlyName === friendlyName);
  if (!dev) return;

  let availability: ZigbeeDevice["availability"] = "unknown";
  try {
    const parsed = JSON.parse(raw) as { state?: string };
    if (parsed.state === "online") availability = "online";
    else if (parsed.state === "offline") availability = "offline";
  } catch {
    if (raw === "online" || raw === "offline") availability = raw;
  }

  const updated = upsertDevice({
    ieeeAddress: dev.ieeeAddress,
    friendlyName: dev.friendlyName,
    availability,
  });
  if (updated) {
    emit(ZIGBEE_SSE_EVENTS.device, updated);
  }
}

function handleBridgeEvent(payload: Record<string, unknown>) {
  const type = payload.type as string | undefined;
  if (!type) return;
  emit(ZIGBEE_SSE_EVENTS.event, payload);

  // Auto-close the permit-join window when Z2M reports it closed
  // (timeout reached or coordinator decided).
  if (type === "device_joined" || type === "device_announce") {
    // Will be reconfirmed by the next bridge/devices push.
  }
}

function handleResponse(action: string, payload: Record<string, unknown>) {
  const transaction = (payload.transaction as string | undefined) ?? "";
  const pending = state.pending.get(transaction);
  if (!pending) return;
  state.pending.delete(transaction);
  if (payload.status === "ok") {
    pending.resolve(payload.data ?? null);
  } else {
    pending.reject(
      new Error(
        (payload.error as string | undefined) ??
          `zigbee2mqtt request '${action}' failed (status=${String(payload.status)})`,
      ),
    );
  }
}

function onMessage(topic: string, raw: Buffer) {
  const text = raw.toString("utf8");

  if (topic === `${state.baseTopic}/bridge/state`) {
    try {
      const parsed = JSON.parse(text) as { state?: string };
      state.z2mOnline = parsed.state === "online";
    } catch {
      state.z2mOnline = text === "online";
    }
    broadcastBridge();
    return;
  }

  if (topic === `${state.baseTopic}/bridge/devices`) {
    try {
      const list = JSON.parse(text) as Z2MDevice[];
      applyDeviceList(list);
    } catch (err) {
      console.error("[zigbee] failed to parse bridge/devices payload", err);
    }
    return;
  }

  if (topic === `${state.baseTopic}/bridge/event`) {
    try {
      handleBridgeEvent(JSON.parse(text));
    } catch {
      /* malformed bridge event — ignore */
    }
    return;
  }

  if (topic.startsWith(`${state.baseTopic}/bridge/response/`)) {
    const action = topic.slice(`${state.baseTopic}/bridge/response/`.length);
    try {
      handleResponse(action, JSON.parse(text));
    } catch {
      /* malformed response — ignore */
    }
    return;
  }

  // Per-device topics: <base>/<friendly_name> and
  // <base>/<friendly_name>/availability.
  const prefix = `${state.baseTopic}/`;
  if (topic.startsWith(prefix)) {
    const rest = topic.slice(prefix.length);
    if (rest.startsWith("bridge/")) return;

    if (rest.endsWith("/availability")) {
      const name = rest.slice(0, -"/availability".length);
      applyAvailability(name, text);
      return;
    }

    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      applyDeviceState(rest, payload);
    } catch {
      /* device topics are always JSON in current Z2M; ignore otherwise. */
    }
  }
}

function publishRequest(action: string, payload: Record<string, unknown>): Promise<unknown> {
  if (!state.client || !state.mqttConnected) {
    return Promise.reject(new Error("zigbee2mqtt: MQTT not connected"));
  }
  const transaction = crypto.randomUUID();
  const body = { ...payload, transaction };
  const topic = `${state.baseTopic}/bridge/request/${action}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(transaction);
      reject(new Error(`zigbee2mqtt: request '${action}' timed out`));
    }, 10_000);
    state.pending.set(transaction, {
      resolve: (data) => {
        clearTimeout(timer);
        resolve(data);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    state.client?.publish(topic, JSON.stringify(body), { qos: 1 }, (err) => {
      if (err) {
        clearTimeout(timer);
        state.pending.delete(transaction);
        reject(err);
      }
    });
  });
}

export function startZigbeeBridge() {
  const url = process.env.MQTT_URL;
  if (!url) {
    console.log("[zigbee] MQTT_URL not set, bridge disabled");
    return;
  }

  console.log(`[zigbee] connecting to ${url} (base topic '${state.baseTopic}')`);
  const client = mqtt.connect(url, {
    clientId: `home-panel-api-${process.pid}`,
    reconnectPeriod: 5_000,
    keepalive: 30,
  });
  state.client = client;

  client.on("connect", () => {
    state.mqttConnected = true;
    console.log("[zigbee] MQTT connected");
    client.subscribe(`${state.baseTopic}/#`, { qos: 0 }, (err) => {
      if (err) console.error("[zigbee] subscribe failed", err);
    });
    broadcastBridge();
  });

  client.on("reconnect", () => {
    console.log("[zigbee] MQTT reconnecting…");
  });

  client.on("close", () => {
    if (state.mqttConnected) {
      console.log("[zigbee] MQTT disconnected");
    }
    state.mqttConnected = false;
    state.z2mOnline = false;
    broadcastBridge();
  });

  client.on("error", (err) => {
    console.error("[zigbee] MQTT error", err.message);
  });

  client.on("message", onMessage);
}

/* ----- Public bridge actions consumed by routes ----- */

export function getBridgeState(): ZigbeeBridgeState {
  return {
    mqttConnected: state.mqttConnected,
    z2mOnline: state.z2mOnline,
    permitJoinUntil:
      state.permitJoinUntil && state.permitJoinUntil > Date.now()
        ? new Date(state.permitJoinUntil).toISOString()
        : null,
    deviceCount: listDevices().length,
  };
}

export async function permitJoin(durationSeconds: number): Promise<string> {
  const clamped = Math.max(1, Math.min(254, Math.round(durationSeconds)));
  await publishRequest("permit_join", { time: clamped, value: clamped > 0 });
  state.permitJoinUntil = Date.now() + clamped * 1_000;
  broadcastBridge();
  return new Date(state.permitJoinUntil).toISOString();
}

export async function closePermitJoin(): Promise<void> {
  await publishRequest("permit_join", { time: 0, value: false });
  state.permitJoinUntil = null;
  broadcastBridge();
}

export async function renameDevice(ieeeAddress: string, friendlyName: string): Promise<void> {
  const dev = getDevice(ieeeAddress);
  if (!dev) throw new Error(`zigbee device ${ieeeAddress} not found`);
  await publishRequest("device/rename", {
    from: dev.friendlyName,
    to: friendlyName,
  });
}

export async function removeZigbeeDevice(ieeeAddress: string): Promise<void> {
  const dev = getDevice(ieeeAddress);
  if (!dev) throw new Error(`zigbee device ${ieeeAddress} not found`);
  await publishRequest("device/remove", { id: dev.friendlyName, force: false });
  dbRemoveDevice(ieeeAddress);
  broadcastDevices();
  broadcastBridge();
}

/* ------------------------------------------------------------------ */
/*  Siren control                                                      */
/* ------------------------------------------------------------------ */

/* Z2M expose contract differs across siren models.
 *
 * NEO NAS-AB02B2: `alarm: true` triggers the wail via a Zigbee warning
 * command, but `melody`/`volume`/`duration` are persistent attributes
 * written to separate clusters. When all keys are sent in a single
 * publish Z2M only honours the warning command and silently drops the
 * attribute writes — so the siren keeps playing whatever melody it
 * had cached (the cheery doorbell tone). Splitting into two publishes
 * (config first, then trigger) lets each cluster get its own write.
 *
 * HEIMAN HS2WD-E and other IAS-WD sirens consume the `warning` object
 * — that one is happily delivered on the same publish as `alarm`. */
function configPayload(durationSec: number): Record<string, unknown> {
  return {
    duration: durationSec,
    volume: "high",
    melody: getSirenMelody(),
  };
}

function triggerPayload(durationSec: number): Record<string, unknown> {
  return {
    alarm: true,
    warning: {
      duration: durationSec,
      mode: "burglar",
      level: "high",
      strobe: true,
      strobe_duty_cycle: 5,
      strobe_level: "high",
    },
  };
}

const STOP_PAYLOAD: Record<string, unknown> = {
  alarm: false,
  warning: { duration: 0, mode: "stop", strobe: false, level: "low" },
};

function publishSirenSet(friendlyName: string, payload: Record<string, unknown>) {
  if (!state.client || !state.mqttConnected) {
    console.warn("[zigbee] cannot drive siren — MQTT disconnected");
    return;
  }
  const topic = `${state.baseTopic}/${friendlyName}/set`;
  state.client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
      console.warn(`[zigbee] siren publish failed (${friendlyName}):`, err.message);
    }
  });
}

/** Fire every armed siren on the network for `durationSec`. The siren
 * itself enforces the cutoff so a backend crash mid-alarm still stops
 * the noise. Disarmed sirens (per-device `armed` opted out) are
 * skipped — useful for demo/dummy units kept in the inventory.
 *
 * Two-step publish per siren: melody/volume/duration first as cluster
 * attributes, then the actual `alarm: true` warning command after a
 * short delay so Z2M has time to process the attribute writes. The
 * NEO converter only honours one of the two clusters per publish, so
 * combining them in a single message silently drops the melody change. */
export function triggerSirens(durationSec: number): { fired: number } {
  const sirens = listDevices()
    .filter(isSirenDevice)
    .filter((d) => d.armed);
  if (sirens.length === 0) {
    console.log("[zigbee] triggerSirens: no armed siren found");
    return { fired: 0 };
  }
  const cfg = configPayload(durationSec);
  const trig = triggerPayload(durationSec);
  for (const dev of sirens) {
    publishSirenSet(dev.friendlyName, cfg);
  }
  /* 250ms is a comfortable margin: Z2M typically flushes the attribute
   * write under 100ms, but we don't want to race the radio. */
  setTimeout(() => {
    for (const dev of sirens) {
      publishSirenSet(dev.friendlyName, trig);
    }
  }, 250);
  console.log(
    `[zigbee] triggered ${sirens.length} siren(s) for ${durationSec}s (melody=${getSirenMelody()}): ${sirens
      .map((d) => d.friendlyName)
      .join(", ")}`,
  );
  return { fired: sirens.length };
}

/** Silence every siren regardless of armed state — when the user disarms
 * we don't want a forgotten "demo" toggle to keep blaring. */
export function silenceSirens(): { silenced: number } {
  const sirens = listDevices().filter(isSirenDevice);
  for (const dev of sirens) {
    publishSirenSet(dev.friendlyName, STOP_PAYLOAD);
  }
  if (sirens.length > 0) {
    console.log(`[zigbee] silenced ${sirens.length} siren(s)`);
  }
  return { silenced: sirens.length };
}
