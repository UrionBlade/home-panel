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

import { ZIGBEE_SSE_EVENTS, type ZigbeeBridgeState, type ZigbeeDevice } from "@home-panel/shared";
import mqtt, { type MqttClient } from "mqtt";
import { sseEmitter } from "../../routes/sse.js";
import { removeDevice as dbRemoveDevice, getDevice, listDevices, upsertDevice } from "./store.js";

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

/** Apply a `<friendly_name>` state payload to the matching device. */
function applyDeviceState(friendlyName: string, payload: Record<string, unknown>) {
  // Z2M emits the device topic keyed by friendly name, not ieee address.
  // Resolve via the in-memory list — friendly names are unique by design.
  const all = listDevices();
  const dev = all.find((d) => d.friendlyName === friendlyName);
  if (!dev) return;

  const battery = parseBattery(payload);
  const linkQuality = parseLinkQuality(payload);

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
