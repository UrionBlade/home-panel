/**
 * GE Appliances (Comfort / SmartHQ) constants.
 *
 * Client credentials are the same ones embedded in the official GE Comfort /
 * SmartHQ Android app, shared by every community integration (gehome,
 * ge-smarthq, homebridge-smarthq). They are public by nature — publishing
 * them here is no different from shipping them inside an .apk. Overridable
 * via env vars for the day GE rotates them.
 *
 * Endpoints:
 *  - LOGIN_URL hosts the OAuth2 /auth + /token endpoints.
 *  - API_URL is the SmartHQ Digital Twin API v2 used for device discovery
 *    and commands (/v2/device, /v2/command, ...).
 */

export const GE_CLIENT_ID = process.env.GE_CLIENT_ID ?? "564c31616c4f7474434b307435412b4d2f6e7672";
export const GE_CLIENT_SECRET =
  process.env.GE_CLIENT_SECRET ??
  "6476512b5246446d452f697154444941387052645938466e5671746e5847593d";

export const GE_LOGIN_URL = "https://accounts.brillion.geappliances.com";
export const GE_API_URL = "https://client.mysmarthq.com";

/** Access tokens returned by GE last one hour. We refresh proactively a
 * minute before expiry to avoid racy 401s during polling. */
export const GE_TOKEN_REFRESH_SKEW_MS = 60_000;
