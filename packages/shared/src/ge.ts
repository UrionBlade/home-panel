/** GE Appliances (Comfort / SmartHQ) — air conditioner types. */

/** AC operating modes. Not every unit supports every mode; the UI filters
 * by capability reported by the device. */
export type AcMode = "cool" | "heat" | "dry" | "fan" | "auto";

/** Fan speed levels. "auto" lets the appliance pick. */
export type AcFanSpeed = "auto" | "low" | "mid" | "high";

/** Swing / louver position. "off" = fixed, "on" = oscillating. Some units
 * expose a richer set (H/V split); that gets layered on later if needed. */
export type AcSwing = "off" | "on";

/** Live state of a single AC unit, as reported by the GE cloud. */
export interface AcState {
  power: boolean;
  mode: AcMode;
  /** Celsius. GE returns Fahrenheit on US units; the backend normalises. */
  currentTemp: number | null;
  targetTemp: number;
  fanSpeed: AcFanSpeed;
  swing: AcSwing;
  /** ISO timestamp of the latest cloud snapshot. */
  updatedAt: string;
}

/** AC device row as surfaced to the client. `state` is null until the
 * first successful poll. */
export interface AcDevice {
  id: string;
  serial: string;
  model: string | null;
  nickname: string | null;
  roomId: string | null;
  state: AcState | null;
  lastSeenAt: string | null;
}

/** Config status returned by GET /api/v1/ac/config. */
export interface GeCredentialsStatus {
  configured: boolean;
  /** Email shown in the Settings UI as "connected as X". */
  email: string | null;
}

/** Input for POST /api/v1/ac/config — initial login against Brillion. The
 * backend drives the OAuth dance server-side against the same endpoints
 * used by the GE Comfort Android app, then stores only the token triple.
 * The password is used once and discarded; if the refresh token eventually
 * dies the user re-submits the form. */
export interface GeSetupInput {
  email: string;
  password: string;
}

/** Partial command sent to POST /api/v1/ac/:id/command. Any subset of
 * fields can be specified; missing fields leave the corresponding
 * attribute untouched. */
export interface AcCommandInput {
  power?: boolean;
  targetTemp?: number;
  mode?: AcMode;
  fanSpeed?: AcFanSpeed;
  swing?: AcSwing;
}

/** Input for PATCH /api/v1/ac/devices/:id — local metadata only
 * (nickname + room). Device state changes go through /command. */
export interface AcDeviceUpdateInput {
  nickname?: string | null;
  roomId?: string | null;
}
