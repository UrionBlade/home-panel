/**
 * Blink cameras — tipi condivisi.
 */

export interface BlinkCamera {
  id: string;
  name: string;
  networkId: string | null;
  model: string | null;
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
