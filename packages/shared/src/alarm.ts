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

export const ALARM_SSE_EVENTS = {
  state: "alarm:state",
  triggered: "alarm:triggered",
  acknowledged: "alarm:acknowledged",
} as const;
