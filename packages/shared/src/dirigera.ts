/**
 * DIRIGERA hub — raw shapes returned by the IKEA gateway REST API.
 *
 * These types model what the hub emits, not the internal Home Panel
 * schemas. The backend translates DIRIGERA payloads into `LightSummary`,
 * `EnvSensor`, `LeakSensor` (see ./sensors.ts) before exposing them to
 * the frontend; nothing typed here is meant to leak into UI components.
 */

/** DIRIGERA classifies devices by `deviceType`. We only model the ones
 * the Home Panel cares about; the gateway also serves outlets, blinds,
 * remotes, etc. that we ignore today. */
export type DirigeraDeviceType =
  | "light"
  | "sensor"
  | "outlet"
  | "blinds"
  | "controller"
  | "speaker"
  | "gateway"
  | "airPurifier"
  | "motionSensor"
  | "environmentSensor"
  | "waterSensor";

/** Subset of attributes returned for every device, regardless of type. */
export interface DirigeraDeviceCommon {
  id: string;
  type: "device";
  deviceType: DirigeraDeviceType;
  createdAt: string;
  isReachable: boolean;
  lastSeen: string;
  attributes: Record<string, unknown>;
  capabilities: { canSend?: string[]; canReceive?: string[] };
  room?: { id: string; name: string; color?: string; icon?: string };
  customName?: string;
  /** Vendor-provided readable name fallback when customName is absent. */
  productCode?: string;
}

/** Light attributes — KAJPLATS exposes isOn + lightLevel + colorTemperature
 * (single-white bulb, no color wheel). */
export interface DirigeraLightState extends DirigeraDeviceCommon {
  deviceType: "light";
  attributes: {
    isOn?: boolean;
    /** 1-100 percent. */
    lightLevel?: number;
    /** Mirek colour temp; only meaningful on tunable-white models. */
    colorTemperature?: number;
    customName?: string;
    model?: string;
    productCode?: string;
  };
}

/** Air quality sensor reading — ALPSTUGA + TIMMERFLÖTTE share the same
 * shape; CO2/PM2.5 are nullable on the simpler model. */
export interface DirigeraAirReading extends DirigeraDeviceCommon {
  deviceType: "sensor" | "environmentSensor";
  attributes: {
    /** ppm — CO2 NDIR sensor on ALPSTUGA. */
    currentCO2?: number;
    /** µg/m³ — PM2.5 on ALPSTUGA. */
    currentPM25?: number;
    currentTemperature?: number;
    currentRH?: number;
    /** 0-100 % battery level when battery-powered. */
    batteryPercentage?: number;
    customName?: string;
    model?: string;
  };
}

/** KLIPPBOK — boolean leak detected + battery level. */
export interface DirigeraLeakState extends DirigeraDeviceCommon {
  deviceType: "sensor" | "waterSensor";
  attributes: {
    waterLeakDetected?: boolean;
    batteryPercentage?: number;
    customName?: string;
    model?: string;
  };
}

/** Discriminated union for narrowing in the device repo. */
export type DirigeraDevice = DirigeraLightState | DirigeraAirReading | DirigeraLeakState;

/** Hub-level metadata (firmware, model). */
export interface DirigeraHubInfo {
  id: string;
  type: "gateway";
  attributes: {
    firmwareVersion?: string;
    serialNumber?: string;
    model?: string;
    timezone?: string;
  };
}

/** Status surface exposed by /api/v1/dirigera/status. */
export interface DirigeraStatus {
  configured: boolean;
  connected: boolean;
  /** Number of devices last seen during sync, or null when never synced. */
  deviceCount: number | null;
  lastSyncAt: string | null;
  /** Reason string when `connected` is false. */
  reason?: "not_configured" | "auth_failed" | "unreachable" | "ws_disconnected";
}

/** WebSocket frame shape — the hub multiplexes several event types over a
 * single connection. */
export type DirigeraWsMessage =
  | { type: "deviceStateChanged"; data: DirigeraDevice }
  | { type: "deviceAdded"; data: DirigeraDevice }
  | { type: "deviceRemoved"; data: { id: string } };
