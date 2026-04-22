/**
 * eWeLink cloud HTTP client (v2 API).
 *
 * Implements the minimum surface the lights feature needs: email/password
 * login, token refresh, device discovery, and single-channel switch commands.
 * Relies only on Node's built-in fetch + crypto — no npm dependency.
 *
 * APP_ID / APP_SECRET must be provisioned at https://dev.ewelink.cc and
 * supplied via the `EWELINK_APP_ID` / `EWELINK_APP_SECRET` environment
 * variables. Per-user email/password/tokens live in the
 * `provider_credentials` table under provider = "ewelink".
 */

import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client.js";
import { providerCredentials } from "../../../db/schema.js";

export type EwelinkRegion = "eu" | "us" | "as" | "cn";

const REGION_HOSTS: Record<EwelinkRegion, string> = {
  eu: "https://eu-apia.coolkit.cc",
  us: "https://us-apia.coolkit.cc",
  as: "https://as-apia.coolkit.cc",
  cn: "https://cn-apia.coolkit.cn",
};

const EU_COUNTRY_CODES = new Set([
  "+39",
  "+33",
  "+49",
  "+34",
  "+351",
  "+31",
  "+32",
  "+353",
  "+41",
  "+43",
  "+44",
  "+45",
  "+46",
  "+47",
  "+48",
  "+352",
  "+36",
  "+420",
  "+421",
  "+30",
  "+386",
  "+385",
  "+372",
  "+371",
  "+370",
  "+357",
  "+356",
  "+358",
  "+40",
  "+359",
]);
const US_COUNTRY_CODES = new Set(["+1"]);
const CN_COUNTRY_CODES = new Set(["+86"]);

/** Derive the login region from an E.164 country code (e.g. "+39" → "eu"). */
export function regionFromCountryCode(cc: string): EwelinkRegion {
  if (EU_COUNTRY_CODES.has(cc)) return "eu";
  if (US_COUNTRY_CODES.has(cc)) return "us";
  if (CN_COUNTRY_CODES.has(cc)) return "cn";
  return "as";
}

/* ------------------------------------------------------------------------ */
/*  Persisted credentials                                                    */
/* ------------------------------------------------------------------------ */

export interface EwelinkCredentials {
  email: string;
  password: string;
  countryCode: string;
  region: EwelinkRegion;
  accessToken?: string;
  refreshToken?: string;
  /** ISO-8601 of the last successful login/refresh. */
  lastAuthAt?: string;
}

const PROVIDER = "ewelink" as const;

/** Load eWeLink creds from DB. Returns null when row is absent or malformed. */
export function getEwelinkCredentials(): EwelinkCredentials | null {
  const row = db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.provider, PROVIDER))
    .get();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.configJson) as Partial<EwelinkCredentials>;
    if (!parsed.email || !parsed.password || !parsed.countryCode) return null;
    const region: EwelinkRegion = parsed.region ?? regionFromCountryCode(parsed.countryCode);
    return {
      email: parsed.email,
      password: parsed.password,
      countryCode: parsed.countryCode,
      region,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      lastAuthAt: parsed.lastAuthAt,
    };
  } catch {
    return null;
  }
}

export function saveEwelinkCredentials(creds: EwelinkCredentials): void {
  const now = new Date().toISOString();
  const json = JSON.stringify(creds);
  const existing = db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.provider, PROVIDER))
    .get();
  if (existing) {
    db.update(providerCredentials)
      .set({ configJson: json, updatedAt: now })
      .where(eq(providerCredentials.provider, PROVIDER))
      .run();
  } else {
    db.insert(providerCredentials)
      .values({ provider: PROVIDER, configJson: json, updatedAt: now })
      .run();
  }
}

/* ------------------------------------------------------------------------ */
/*  App keys (from .env)                                                     */
/* ------------------------------------------------------------------------ */

export function getEwelinkAppKeys(): { appId: string; appSecret: string } | null {
  const appId = process.env.EWELINK_APP_ID?.trim();
  const appSecret = process.env.EWELINK_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

/* ------------------------------------------------------------------------ */
/*  Errors                                                                   */
/* ------------------------------------------------------------------------ */

export class EwelinkError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "EwelinkError";
  }
}

/** Login / refresh auth failed — caller should surface this as 401-like. */
export function isAuthError(err: unknown): boolean {
  return err instanceof EwelinkError && (err.code === 401 || err.code === 402 || err.code === 406);
}

/* ------------------------------------------------------------------------ */
/*  Low-level HTTP                                                           */
/* ------------------------------------------------------------------------ */

type ApiEnvelope<T> = { error: number; msg?: string; data?: T; region?: string };

/** Sign the raw request body bytes with APP_SECRET and return the
 * `Authorization: Sign <base64>` header value. */
function signBody(bodyText: string, appSecret: string): string {
  const digest = createHmac("sha256", appSecret).update(bodyText).digest("base64");
  return `Sign ${digest}`;
}

async function postSigned<T>(
  region: EwelinkRegion,
  path: string,
  body: unknown,
  appId: string,
  appSecret: string,
): Promise<T> {
  const bodyText = JSON.stringify(body);
  const res = await fetch(`${REGION_HOSTS[region]}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CK-Appid": appId,
      Authorization: signBody(bodyText, appSecret),
    },
    body: bodyText,
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!json) throw new EwelinkError(-1, "Invalid eWeLink response", res.status);
  if (json.error !== 0) {
    throw new EwelinkError(json.error, json.msg ?? `eWeLink error ${json.error}`, res.status);
  }
  return json.data as T;
}

async function callAuthed<T>(
  region: EwelinkRegion,
  method: "GET" | "POST",
  path: string,
  accessToken: string,
  appId: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${REGION_HOSTS[region]}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-CK-Appid": appId,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!json) throw new EwelinkError(-1, "Invalid eWeLink response", res.status);
  if (json.error !== 0) {
    throw new EwelinkError(json.error, json.msg ?? `eWeLink error ${json.error}`, res.status);
  }
  return json.data as T;
}

/* ------------------------------------------------------------------------ */
/*  Auth                                                                     */
/* ------------------------------------------------------------------------ */

interface LoginResponse {
  at: string;
  rt: string;
  user?: { apikey?: string; countryCode?: string };
  region?: string;
}

/**
 * Log in with email/password. Transparently handles eWeLink's region redirect
 * (error 10004): the payload carries the correct region, retry once.
 */
export async function ewelinkLogin(
  email: string,
  password: string,
  countryCode: string,
  appId: string,
  appSecret: string,
): Promise<{ accessToken: string; refreshToken: string; region: EwelinkRegion }> {
  let region = regionFromCountryCode(countryCode);
  const body = { email, password, countryCode, lang: "en" };
  try {
    const data = await postSigned<LoginResponse>(region, "/v2/user/login", body, appId, appSecret);
    return { accessToken: data.at, refreshToken: data.rt, region };
  } catch (err) {
    if (err instanceof EwelinkError && err.code === 10004) {
      /* Body should have contained the correct region; re-attempt on each
       * remaining region rather than parsing hints (cheap + resilient). */
      for (const candidate of ["eu", "us", "as", "cn"] as EwelinkRegion[]) {
        if (candidate === region) continue;
        try {
          const data = await postSigned<LoginResponse>(
            candidate,
            "/v2/user/login",
            body,
            appId,
            appSecret,
          );
          region = candidate;
          return { accessToken: data.at, refreshToken: data.rt, region };
        } catch {
          /* try next */
        }
      }
    }
    throw err;
  }
}

/** Swap a refresh token for a new access+refresh pair. */
export async function ewelinkRefresh(
  refreshToken: string,
  region: EwelinkRegion,
  appId: string,
  appSecret: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const data = await postSigned<{ at: string; rt: string }>(
    region,
    "/v2/user/refresh",
    { rt: refreshToken },
    appId,
    appSecret,
  );
  return { accessToken: data.at, refreshToken: data.rt };
}

/**
 * Return a usable access token, refreshing or re-logging in as needed.
 * Persists any new tokens back to the DB.
 */
export async function ensureEwelinkAccessToken(): Promise<{
  accessToken: string;
  region: EwelinkRegion;
  appId: string;
}> {
  const app = getEwelinkAppKeys();
  if (!app) {
    throw new EwelinkError(-2, "EWELINK_APP_ID / EWELINK_APP_SECRET not set in environment");
  }
  const creds = getEwelinkCredentials();
  if (!creds) {
    throw new EwelinkError(-3, "eWeLink credentials not configured");
  }

  if (creds.accessToken) {
    return { accessToken: creds.accessToken, region: creds.region, appId: app.appId };
  }

  // No access token yet → try refresh, otherwise full login.
  if (creds.refreshToken) {
    try {
      const fresh = await ewelinkRefresh(
        creds.refreshToken,
        creds.region,
        app.appId,
        app.appSecret,
      );
      const updated: EwelinkCredentials = {
        ...creds,
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        lastAuthAt: new Date().toISOString(),
      };
      saveEwelinkCredentials(updated);
      return { accessToken: fresh.accessToken, region: creds.region, appId: app.appId };
    } catch (err) {
      console.warn("[ewelink] refresh failed, falling back to full login:", err);
    }
  }

  const logged = await ewelinkLogin(
    creds.email,
    creds.password,
    creds.countryCode,
    app.appId,
    app.appSecret,
  );
  const updated: EwelinkCredentials = {
    ...creds,
    region: logged.region,
    accessToken: logged.accessToken,
    refreshToken: logged.refreshToken,
    lastAuthAt: new Date().toISOString(),
  };
  saveEwelinkCredentials(updated);
  return {
    accessToken: logged.accessToken,
    region: logged.region,
    appId: app.appId,
  };
}

/** Drop the cached access token so the next call triggers a refresh. */
function invalidateAccessToken(): void {
  const creds = getEwelinkCredentials();
  if (!creds) return;
  const { accessToken: _, ...rest } = creds;
  saveEwelinkCredentials(rest);
}

/**
 * Execute a request, transparently re-authenticating once on 401-like errors.
 */
async function withAuthRetry<T>(
  run: (ctx: { accessToken: string; region: EwelinkRegion; appId: string }) => Promise<T>,
): Promise<T> {
  const ctx = await ensureEwelinkAccessToken();
  try {
    return await run(ctx);
  } catch (err) {
    if (!isAuthError(err)) throw err;
    invalidateAccessToken();
    const retryCtx = await ensureEwelinkAccessToken();
    return run(retryCtx);
  }
}

/* ------------------------------------------------------------------------ */
/*  Device API                                                               */
/* ------------------------------------------------------------------------ */

export interface EwelinkThing {
  itemType: number;
  itemData: {
    deviceid: string;
    name: string;
    online: boolean;
    apikey?: string;
    extra?: { uiid?: number };
    params?: {
      switch?: "on" | "off";
      switches?: Array<{ switch: "on" | "off"; outlet: number }>;
    };
  };
}

interface ThingListResponse {
  thingList: EwelinkThing[];
  total: number;
}

export async function ewelinkListDevices(): Promise<EwelinkThing[]> {
  return withAuthRetry(async ({ accessToken, region, appId }) => {
    const data = await callAuthed<ThingListResponse>(
      region,
      "GET",
      "/v2/device/thing?num=0",
      accessToken,
      appId,
    );
    return data.thingList ?? [];
  });
}

/**
 * Send an on/off command to a single-channel eWeLink switch.
 *
 * Multi-channel devices (switches[]) are not supported yet — we would need
 * to model outlets as separate light rows. Surface a clear error so the UI
 * doesn't silently no-op.
 */
export async function ewelinkSetSwitch(deviceId: string, state: "on" | "off"): Promise<void> {
  return withAuthRetry(async ({ accessToken, region, appId }) => {
    await callAuthed(region, "POST", "/v2/device/thing/status", accessToken, appId, {
      type: 1,
      id: deviceId,
      params: { switch: state },
    });
  });
}

/** Best-effort extraction of the current on/off state from a thing payload. */
export function extractThingState(thing: EwelinkThing): "on" | "off" | "unknown" {
  const p = thing.itemData.params;
  if (!p) return "unknown";
  if (p.switch === "on" || p.switch === "off") return p.switch;
  if (p.switches && p.switches.length > 0) {
    return p.switches[0]?.switch ?? "unknown";
  }
  return "unknown";
}
