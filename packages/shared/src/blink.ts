/**
 * Blink cameras — tipi condivisi.
 */

export type BlinkDeviceType = "camera" | "owl" | "doorbell";

export interface BlinkCamera {
  id: string;
  /** Nome originale della camera secondo Blink — usato come fallback. */
  name: string;
  /** Nome custom dato dall'utente dal pannello. Null = usa `name`. */
  nickname: string | null;
  networkId: string | null;
  model: string | null;
  deviceType: BlinkDeviceType;
  /** Per-device motion detection flag — true when the camera is recording. */
  armed: boolean;
  /** True when motion clips from this camera should fire the home alarm
   * (gated by `alarm_state.armed`). Default false. */
  armedForAlarm: boolean;
  status: "online" | "offline";
  batteryLevel: string | null;
  thumbnailUrl: string | null;
  lastMotionAt: string | null;
  /** Assigned room id, null if unassigned. Not a strict FK — the camera stays
   * listed under "Senza stanza" if the room was deleted. */
  roomId: string | null;
}

export interface BlinkMotionClip {
  id: string;
  cameraId: string;
  recordedAt: string;
  durationSeconds: number | null;
  thumbnailPath: string | null;
  clipPath: string | null;
  viewed: boolean;
}

export interface BlinkCredentialsStatus {
  configured: boolean;
  email: string | null;
  accountId: string | null;
}

export interface BlinkSetupInput {
  email: string;
  password: string;
}
