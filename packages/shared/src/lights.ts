/**
 * Lights — provider-agnostic control surface.
 *
 * The backend hides provider details (eWeLink today; Shelly/Tasmota later)
 * behind a uniform contract so the UI can render any switch/dimmer the same
 * way. See `apps/api/src/routes/lights.ts` for the concrete HTTP shape.
 */

export type LightState = "on" | "off" | "unknown";

export type LightProvider = "ewelink" | "dirigera";

/** One physical fixture as presented to the UI. */
export interface LightSummary {
  id: string;
  name: string;
  /** Legacy free-text label retained for pre-room data. New assignments go
   * through `roomId` and should be preferred by the UI. */
  room: string | null;
  /** FK-style pointer to a Room row, nullable. When a room is deleted the
   * light stays but falls back to the "Senza stanza" group. */
  roomId: string | null;
  provider: LightProvider;
  deviceId: string;
  state: LightState;
  /** ISO-8601 timestamp of the last successful provider read, or null. */
  lastSeenAt: string | null;
}

/** Body of POST /lights/:id — exactly one of `state` or `toggle`. */
export interface LightCommandInput {
  state?: "on" | "off";
  toggle?: boolean;
}

/** Result of POST /lights/sync. */
export interface LightSyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

/** A provider device discovered upstream but not yet adopted into `lights`. */
export interface RemoteLightDevice {
  provider: LightProvider;
  deviceId: string;
  name: string;
  online: boolean;
  state: LightState;
  /** True once a row in `lights` references this deviceId. */
  adopted: boolean;
}

/** Body of PUT /lights/providers/ewelink/credentials. */
export interface EwelinkCredentialsInput {
  email: string;
  password: string;
  /** E.164 country code including leading `+`, e.g. "+39". Drives region. */
  countryCode: string;
}

/** Safe-to-return credentials status (never exposes password or tokens). */
export interface EwelinkCredentialsStatus {
  configured: boolean;
  appConfigured: boolean;
  email: string | null;
  countryCode: string | null;
  region: "eu" | "us" | "as" | "cn" | null;
  /** ISO-8601 of the last successful login/refresh, or null. */
  lastAuthAt: string | null;
}
