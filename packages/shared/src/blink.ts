/**
 * Blink cameras — tipi condivisi.
 */

export type BlinkDeviceType = "camera" | "owl" | "doorbell";

export interface BlinkCamera {
  id: string;
  name: string;
  networkId: string | null;
  model: string | null;
  deviceType: BlinkDeviceType;
  /** Per-device motion detection flag — true when the camera is recording. */
  armed: boolean;
  status: "online" | "offline";
  batteryLevel: string | null;
  thumbnailUrl: string | null;
  lastMotionAt: string | null;
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
