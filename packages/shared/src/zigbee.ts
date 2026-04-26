/**
 * Shared types for the Zigbee bridge powered by Zigbee2MQTT (Z2M).
 *
 * Z2M speaks MQTT, the home-panel API subscribes to the bridge topics
 * and exposes a small REST surface to the mobile app:
 *
 *   GET    /zigbee/state            → bridge connection + permit-join window
 *   GET    /zigbee/devices          → device list (cached + persisted)
 *   POST   /zigbee/permit-join      → open pairing window
 *   PATCH  /zigbee/devices/:id      → rename + room assignment
 *   DELETE /zigbee/devices/:id      → remove device from the mesh
 *
 * The `state` payload of every device is provider-defined (opaque JSON
 * from Z2M, e.g. `{ contact: true, battery: 92, linkquality: 64 }`) —
 * the UI introspects it lazily so we don't have to migrate the DB
 * every time we add a new sensor model.
 */

/** Raw device descriptor as emitted by Z2M on `bridge/devices`. */
export interface ZigbeeDevice {
  ieeeAddress: string;
  friendlyName: string;
  vendor: string | null;
  model: string | null;
  description: string | null;
  /** EndDevice | Router | Coordinator — Z2M's `type` field. */
  type: string | null;
  /** Last received state payload (sensor readings, switch state, …). */
  state: Record<string, unknown>;
  /** Battery level in percent if the device reports it. */
  battery: number | null;
  /** RSSI-like quality 0–255. */
  linkQuality: number | null;
  /** Availability tracker output. */
  availability: "online" | "offline" | "unknown";
  /** ISO timestamp of the last MQTT message we saw for this device. */
  lastSeenAt: string | null;
  /** Optional room assignment from the home-panel side. */
  roomId: string | null;
}

/** Bridge-level state — connection + pairing window. */
export interface ZigbeeBridgeState {
  /** Whether the home-panel API has an open MQTT connection. */
  mqttConnected: boolean;
  /** Whether Z2M itself reports `bridge/state` = online. */
  z2mOnline: boolean;
  /** When permit-join was opened, if currently open. */
  permitJoinUntil: string | null;
  /** Number of devices in the mesh (excluding the coordinator). */
  deviceCount: number;
}

export interface ZigbeeStateResponse {
  bridge: ZigbeeBridgeState;
  devices: ZigbeeDevice[];
}

export interface ZigbeePermitJoinInput {
  /** Seconds the join window stays open. Min 1, max 254. */
  durationSeconds: number;
}

export interface ZigbeePermitJoinResponse {
  /** ISO timestamp when the window will close. */
  until: string;
}

export interface ZigbeeRenameInput {
  friendlyName: string;
}

export interface ZigbeeAssignRoomInput {
  roomId: string | null;
}

/** SSE event names used by the mobile client to refresh state. */
export const ZIGBEE_SSE_EVENTS = {
  bridge: "zigbee:bridge",
  devices: "zigbee:devices",
  device: "zigbee:device",
  event: "zigbee:event",
} as const;
