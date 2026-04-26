/**
 * Push notification registration types shared between the panel app
 * and the API. The flow:
 *
 *   1. Mobile app boots → asks iOS for permission → gets APNs token
 *   2. POST /push/register with {token, platform, label}
 *   3. Backend stores it; from now on, every alarm:triggered fans out
 *      to every registered token.
 *
 * Tokens older than ~6 months are pruned by the backend on demand.
 */

export type PushPlatform = "ios" | "android" | "web";

export interface PushDevice {
  id: string;
  token: string;
  platform: PushPlatform;
  label: string | null;
  familyMemberId: string | null;
  lastSeenAt: string;
  createdAt: string;
}

export interface PushRegisterInput {
  token: string;
  platform?: PushPlatform;
  label?: string | null;
  familyMemberId?: string | null;
}

export interface PushRegisterResponse {
  device: PushDevice;
  /** True when APNs is configured on the backend; false in dev when
   * env keys haven't been provided yet. The mobile app uses this to
   * surface a "Backend non ancora configurato" hint instead of
   * pretending push works. */
  apnsConfigured: boolean;
}

export interface PushDevicesResponse {
  devices: PushDevice[];
  apnsConfigured: boolean;
}

export interface PushTestInput {
  /** Optional: send only to this token; otherwise broadcast to all. */
  token?: string;
}
