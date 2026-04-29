/**
 * Home alarm system.
 *
 * Binary armed/disarmed flag at the system level + per-device opt-in
 * (`zigbeeDevices.armed`). When armed, contact-open / motion / leak /
 * tamper events from participating devices fire an `AlarmEvent`,
 * persisted in SQLite and broadcast over SSE.
 */

export interface AlarmState {
  /** Whether the alarm is currently armed. */
  armed: boolean;
  /** When the alarm was last armed (ISO timestamp). */
  armedAt: string | null;
  /** Free-form mode tag ("home" / "away" / "night") — reserved for the
   * future, the MVP only flips a single boolean. */
  mode: string;
}

export type AlarmEventKind = "contact_open" | "motion" | "tamper" | "leak" | "manual";

export interface AlarmEvent {
  id: string;
  ieeeAddress: string;
  friendlyName: string;
  kind: AlarmEventKind;
  /** ISO timestamp. */
  triggeredAt: string;
  /** ISO timestamp set when the user dismissed the event. Null = unread. */
  acknowledgedAt: string | null;
  /** Raw Zigbee state payload that fired the event. */
  payload: Record<string, unknown>;
}

export interface AlarmStateResponse {
  state: AlarmState;
  events: AlarmEvent[];
  unreadCount: number;
}

export interface AlarmArmInput {
  mode?: string;
}

/**
 * Disarm-code metadata exposed to the frontend so it can render the
 * right setup flow (first-time vs change vs reset). The plaintext code
 * never crosses the wire on this endpoint — it's POST-only.
 */
export interface DisarmCodeStatus {
  /** True once a code has been stored at least once. */
  configured: boolean;
  /** True when ALARM_DISARM_RESET=true on the API — lets the user set a
   * fresh code without supplying the previous one. */
  resetEnabled: boolean;
  /** Exact digit count of the configured code (4-8), so the keypad
   * modal can auto-submit at the right length and show the right
   * number of dots. Null when no code is set. */
  length: number | null;
}

export interface SetDisarmCodeInput {
  /** Required when `configured=true` and reset is disabled; ignored
   * otherwise. */
  oldCode?: string;
  /** 4–8 numeric digits. */
  newCode: string;
}

export interface SilenceAlarmInput {
  /** Numeric code currently configured. */
  code: string;
}

export const ALARM_SSE_EVENTS = {
  state: "alarm:state",
  triggered: "alarm:triggered",
  acknowledged: "alarm:acknowledged",
  silenced: "alarm:silenced",
} as const;
