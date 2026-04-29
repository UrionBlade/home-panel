/**
 * Environmental sensors — provider-agnostic shapes the UI consumes.
 *
 * The DIRIGERA hub is the only producer today (see ./dirigera.ts), but
 * the Home Panel persists and exposes these as a uniform contract so a
 * future Matter-direct or Z2M sensor source plugs in without touching
 * the frontend.
 */

/** Severity buckets used for color coding tiles, badges, voice replies. */
export type SensorSeverity = "good" | "medium" | "high" | "unknown";

/** A temperature/humidity (and optionally CO2/PM2.5) sensor row. */
export interface EnvSensor {
  id: string;
  /** Stable provider device id (DIRIGERA UUID). */
  providerId: string;
  /** Discriminator so the UI knows which fields are populated. */
  kind: "air_quality" | "climate";
  friendlyName: string;
  roomId: string | null;
  roomName: string | null;
  /** Air quality only — ppm, NDIR sensor. Null on climate-only sensors. */
  co2Ppm: number | null;
  /** Air quality only — µg/m³. Null on climate-only sensors. */
  pm25: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  /** Battery level for battery-powered sensors, percent. Null when wired. */
  batteryPct: number | null;
  /** ISO-8601 timestamp of the most recent reading. */
  lastSeen: string | null;
  /** True when the hub last marked the device unreachable. */
  offline: boolean;
}

/** Single point of historical data, suitable for the 24h trend graph. */
export interface EnvHistoryPoint {
  /** ISO-8601 timestamp aligned to the bucket window (5min by default). */
  recordedAt: string;
  co2Ppm: number | null;
  pm25: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
}

/** Water leak detector row. */
export interface LeakSensor {
  id: string;
  providerId: string;
  friendlyName: string;
  roomId: string | null;
  roomName: string | null;
  /** True when the hub reports an active leak. */
  leakDetected: boolean;
  batteryPct: number | null;
  lastSeen: string | null;
  /** ISO-8601 timestamp of the last user acknowledgement, or null. */
  lastAckAt: string | null;
  offline: boolean;
}

/** Payload pushed via SSE on a leak transition false→true. The frontend
 * uses this to render the modal and play the alert sound. */
export interface LeakAlertPayload {
  sensorId: string;
  friendlyName: string;
  roomName: string | null;
  /** ISO-8601 timestamp of the trigger event. */
  triggeredAt: string;
}

/** Body of POST /api/v1/sensors/leak/:id/ack — acknowledged but state
 * does not flip; the hub is what controls the dry/wet boolean. */
export interface LeakAckResponse {
  sensor: LeakSensor;
}
