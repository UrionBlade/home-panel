/**
 * Minimal Apple Push Notification service (APNs) client.
 *
 * Implements just what the home-panel needs: send a remote notification
 * payload to one or more device tokens, signing requests with a JWT ES256
 * built from the user's `.p8` Auth Key.
 *
 * Design choices:
 *   - HTTP/2 to api.push.apple.com:443 (or sandbox), connection re-used
 *     across calls so latency stays low when fanning out to many tokens.
 *   - JWT cached for ~50 minutes — APNs accepts the same token for up to
 *     1h, regenerating each call would get us throttled.
 *   - No external npm dep (`@parse/node-apn` was tempting but its native
 *     HTTP/2 path doesn't bundle cleanly with tsup, and we only need a
 *     single endpoint).
 *   - No-ops when the env isn't fully configured: the rest of the app
 *     keeps booting cleanly even before the user provides the .p8 key.
 */

import { createSign } from "node:crypto";
import http2 from "node:http2";

interface ApnsConfig {
  /** Decoded .p8 contents (PEM, starts with "-----BEGIN PRIVATE KEY-----"). */
  keyPem: string;
  /** Apple Key ID from App Store Connect → Keys (10 chars). */
  keyId: string;
  /** Apple Developer Team ID (10 chars). */
  teamId: string;
  /** App bundle id, e.g. com.matteopoli.homepanel. */
  bundleId: string;
  /** When true, posts to the production gateway. Default true. Set
   * APNS_PRODUCTION=false (or = development for dev builds). */
  production: boolean;
}

let cachedConfig: ApnsConfig | null = null;
let configChecked = false;

function readConfig(): ApnsConfig | null {
  if (configChecked) return cachedConfig;
  configChecked = true;

  const keyB64 = process.env.APNS_KEY_BASE64;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if (!keyB64 || !keyId || !teamId || !bundleId) {
    console.log(
      "[push] APNs env not fully configured (need APNS_KEY_BASE64, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID); push notifications disabled",
    );
    return null;
  }

  let keyPem: string;
  try {
    keyPem = Buffer.from(keyB64, "base64").toString("utf8");
    if (!keyPem.includes("BEGIN PRIVATE KEY")) {
      throw new Error("APNS_KEY_BASE64 doesn't decode to a PEM private key");
    }
  } catch (err) {
    console.error("[push] APNS_KEY_BASE64 invalid:", err);
    return null;
  }

  const production = (process.env.APNS_PRODUCTION ?? "true").toLowerCase() !== "false";

  cachedConfig = { keyPem, keyId, teamId, bundleId, production };
  console.log(`[push] APNs configured (bundle=${bundleId}, production=${production})`);
  return cachedConfig;
}

export function isApnsConfigured(): boolean {
  return readConfig() !== null;
}

/* -------------------------------------------------------------- */
/*  JWT — ES256, cached ~50 minutes                                */
/* -------------------------------------------------------------- */

interface CachedJwt {
  token: string;
  expiresAt: number;
}
let cachedJwt: CachedJwt | null = null;
const JWT_TTL_MS = 50 * 60 * 1000; // ~50 minutes (APNs accepts up to 60)

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** ECDSA P-256 SHA-256 signature in JOSE / JWS format (concat r||s, 64 bytes). */
function signJwtEs256(unsigned: string, keyPem: string): string {
  const signer = createSign("SHA256");
  signer.update(unsigned);
  const der = signer.sign(keyPem);
  // Convert DER to JOSE r||s. DER: 30 ?? 02 r_len r... 02 s_len s...
  // r and s are 32 bytes when normalised.
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("APNs: bad ECDSA signature (no SEQ)");
  // total length (might be 1-byte or extended; APNs sigs are always short)
  const lenByte = der[offset];
  if (lenByte != null && lenByte > 0x80) {
    offset += 1 + (lenByte & 0x7f);
  } else {
    offset++;
  }
  if (der[offset++] !== 0x02) throw new Error("APNs: bad ECDSA signature (no INT r)");
  const rLen = der[offset++] ?? 0;
  let r: Buffer = der.subarray(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) throw new Error("APNs: bad ECDSA signature (no INT s)");
  const sLen = der[offset++] ?? 0;
  let s: Buffer = der.subarray(offset, offset + sLen);
  // Strip leading zero (DER positivity padding)
  if (r.length > 32 && r[0] === 0) r = r.subarray(1);
  if (s.length > 32 && s[0] === 0) s = s.subarray(1);
  // Left-pad to 32 bytes
  const padR = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  const padS = Buffer.concat([Buffer.alloc(32 - s.length), s]);
  return base64url(Buffer.concat([padR, padS]));
}

function buildJwt(config: ApnsConfig): string {
  const now = Date.now();
  if (cachedJwt && cachedJwt.expiresAt > now) return cachedJwt.token;

  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = { iss: config.teamId, iat: Math.floor(now / 1000) };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = signJwtEs256(unsigned, config.keyPem);
  const token = `${unsigned}.${signature}`;
  cachedJwt = { token, expiresAt: now + JWT_TTL_MS };
  return token;
}

/* -------------------------------------------------------------- */
/*  HTTP/2 client — single shared session, lazy-init               */
/* -------------------------------------------------------------- */

let session: http2.ClientHttp2Session | null = null;

function getSession(production: boolean): http2.ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;
  const host = production ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const next = http2.connect(`https://${host}:443`);
  next.on("error", (err) => {
    console.error("[push] APNs session error:", err.message);
  });
  next.on("close", () => {
    if (session === next) session = null;
  });
  session = next;
  return next;
}

export interface ApnsAlertPayload {
  title?: string;
  subtitle?: string;
  body: string;
  /** Sound file in app bundle, or "default" for the system sound. */
  sound?: string | "default" | null;
  /** App badge count (set to a number, or null to leave unchanged). */
  badge?: number | null;
  /** Free-form data merged into the JSON payload — read by the app to
   * deep-link into the alarm event detail, etc. */
  data?: Record<string, unknown>;
  /** Optional collapse id so multiple alarms from the same sensor merge
   * into a single banner. */
  collapseId?: string;
  /** When true, marks the notification as time-sensitive (iOS 15+). */
  timeSensitive?: boolean;
}

export interface ApnsResult {
  token: string;
  ok: boolean;
  /** APNs status code (200 ok, 400 bad request, 410 unregistered, …). */
  status?: number;
  /** APNs error reason string when status != 200. */
  reason?: string;
}

/**
 * Send the same payload to a list of device tokens. Returns one result
 * per token so the caller can prune unregistered ones (HTTP 410).
 */
export async function sendApnsBatch(
  tokens: string[],
  payload: ApnsAlertPayload,
): Promise<ApnsResult[]> {
  const config = readConfig();
  if (!config || tokens.length === 0) return [];

  const jwt = buildJwt(config);
  const ses = getSession(config.production);

  const aps: Record<string, unknown> = {
    alert: {
      title: payload.title,
      subtitle: payload.subtitle,
      body: payload.body,
    },
    sound: payload.sound === undefined ? "default" : (payload.sound ?? undefined),
  };
  if (payload.badge != null) aps.badge = payload.badge;
  if (payload.timeSensitive) aps["interruption-level"] = "time-sensitive";

  const body = JSON.stringify({ aps, ...payload.data });

  return Promise.all(
    tokens.map(
      (token) =>
        new Promise<ApnsResult>((resolve) => {
          const req = ses.request({
            ":method": "POST",
            ":path": `/3/device/${token}`,
            "apns-topic": config.bundleId,
            "apns-push-type": "alert",
            "apns-priority": payload.timeSensitive ? "10" : "5",
            ...(payload.collapseId ? { "apns-collapse-id": payload.collapseId } : {}),
            authorization: `bearer ${jwt}`,
          });
          let status: number | undefined;
          let chunks = "";
          req.on("response", (headers) => {
            const s = headers[":status"];
            status = typeof s === "number" ? s : undefined;
          });
          req.setEncoding("utf8");
          req.on("data", (c) => {
            chunks += c;
          });
          req.on("end", () => {
            const ok = status === 200;
            let reason: string | undefined;
            if (!ok && chunks) {
              try {
                const parsed = JSON.parse(chunks) as { reason?: string };
                reason = parsed.reason;
              } catch {
                reason = chunks;
              }
            }
            resolve({ token, ok, status, reason });
          });
          req.on("error", (err) => {
            resolve({ token, ok: false, reason: err.message });
          });
          req.end(body);
        }),
    ),
  );
}
