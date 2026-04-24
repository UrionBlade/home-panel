/**
 * Shared SmartThings HTTP client.
 *
 * Used by both the laundry (washer/dryer) and TV routes. Authenticates
 * via OAuth2: access token + refresh token persisted in
 * `smartthings_config`. When the access token is near expiry (or the
 * server returns 401) a refresh is kicked off and the request retried
 * transparently.
 *
 * Legacy: a plain PAT column (`pat`) is still read as a fallback so
 * pre-migration rows keep working until the user re-links. New setups
 * go through the OAuth flow exclusively.
 */

import { db } from "../../db/client.js";
import { type SmartThingsConfigRow, smartthingsConfig } from "../../db/schema.js";

export const ST_BASE = "https://api.smartthings.com/v1";
const ST_TOKEN_URL = "https://api.smartthings.com/oauth/token";
/** Refresh the access token a minute before it expires so concurrent
 * requests don't race against the clock. */
const ST_REFRESH_SKEW_MS = 60_000;

/* ---------- Config read / persist ---------- */

export function getSmartThingsConfig(): SmartThingsConfigRow | undefined {
  const row = db.select().from(smartthingsConfig).get();
  if (!row?.pat && !row?.accessToken && process.env.SMARTTHINGS_PAT) {
    /* Env fallback kept for the legacy PAT workflow — useful in dev when
     * the DB is empty. Never populated with OAuth tokens. */
    const base: SmartThingsConfigRow = row ?? {
      id: 1,
      pat: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      washerDeviceId: null,
      dryerDeviceId: null,
      tvDeviceId: null,
      washerNickname: null,
      dryerNickname: null,
      tvNickname: null,
      washerRoomId: null,
      dryerRoomId: null,
      tvRoomId: null,
      updatedAt: "",
    };
    return { ...base, pat: process.env.SMARTTHINGS_PAT };
  }
  return row;
}

function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}): void {
  const existing = db.select().from(smartthingsConfig).get();
  const patch = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    /* Clear the legacy PAT the first time we get an OAuth token — once
     * OAuth works the PAT is guaranteed stale. */
    pat: null,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    db.update(smartthingsConfig).set(patch).run();
  } else {
    db.insert(smartthingsConfig).values(patch).run();
  }
}

/* ---------- OAuth token dance ---------- */

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function requireClientCredentials(): { id: string; secret: string } {
  const id = process.env.SMARTTHINGS_CLIENT_ID;
  const secret = process.env.SMARTTHINGS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new SmartThingsHttpError(
      500,
      "SMARTTHINGS_CLIENT_ID / SMARTTHINGS_CLIENT_SECRET mancanti nel .env",
    );
  }
  return { id, secret };
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const { id, secret } = requireClientCredentials();
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");

  const resp = await fetch(ST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: id,
      redirect_uri: params.redirectUri,
    }).toString(),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new SmartThingsHttpError(
      resp.status,
      `SmartThings token exchange failed (${resp.status}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await resp.json()) as RawTokenResponse;
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  saveTokens(tokens);
  return tokens;
}

async function refreshTokens(refreshToken: string): Promise<string> {
  const { id, secret } = requireClientCredentials();
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");

  const resp = await fetch(ST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: id,
    }).toString(),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new SmartThingsHttpError(
      resp.status,
      `SmartThings refresh failed (${resp.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await resp.json()) as RawTokenResponse;
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  saveTokens(tokens);
  return tokens.accessToken;
}

/* Coalesce concurrent refreshes — polling for laundry + TV can trigger
 * several 401s at once when the token dies. */
let inflightRefresh: Promise<string> | null = null;

async function coalescedRefresh(refreshToken: string): Promise<string> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = refreshTokens(refreshToken).finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/** Return a token suitable for calling SmartThings. Preferably the fresh
 * OAuth access token; falls back to the legacy PAT; `null` if the user
 * hasn't linked yet. */
export async function getStAccessToken(): Promise<string | null> {
  const row = getSmartThingsConfig();
  if (!row) return null;

  if (row.accessToken && row.refreshToken && row.expiresAt) {
    const expiresMs = new Date(row.expiresAt).getTime();
    if (expiresMs - ST_REFRESH_SKEW_MS > Date.now()) {
      return row.accessToken;
    }
    /* Token near expiry — proactively refresh so the upcoming request
     * doesn't start by hitting a 401. */
    try {
      return await coalescedRefresh(row.refreshToken);
    } catch (err) {
      console.error("[smartthings] refresh failed, dropping tokens:", err);
      db.update(smartthingsConfig)
        .set({ accessToken: null, refreshToken: null, expiresAt: null })
        .run();
      return null;
    }
  }

  /* Legacy PAT path. */
  return row.pat ?? null;
}

/** True when SmartThings is usable right now — either OAuth-linked or
 * the legacy PAT is still configured. */
export function isSmartThingsConfigured(): boolean {
  const row = getSmartThingsConfig();
  return !!(row && (row.accessToken || row.pat));
}

/* ---------- HTTP wrappers ---------- */

export class SmartThingsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SmartThingsHttpError";
  }
}

export function stHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

/**
 * Wrap fetch with a small retry/backoff for transient SmartThings errors.
 * ST occasionally returns 5xx/429/408 even when the device is reachable —
 * a couple of quick retries make the backend feel reliable without
 * masking real auth/config failures.
 */
async function stFetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const delays = [0, 250, 750]; // 3 attempts total
  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(url, init);
      if (res.status < 500 && res.status !== 408 && res.status !== 429) {
        return res;
      }
      lastErr = new SmartThingsHttpError(res.status, `SmartThings ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new SmartThingsHttpError(599, "SmartThings unreachable");
}

async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getStAccessToken();
  if (!token) {
    throw new SmartThingsHttpError(401, "SmartThings non configurato");
  }

  const doFetch = (t: string) =>
    stFetchWithRetry(`${ST_BASE}${path}`, {
      ...init,
      headers: { ...stHeaders(t), ...(init.headers as Record<string, string>) },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    /* Token was revoked server-side before expiry — force a refresh once. */
    const row = getSmartThingsConfig();
    if (row?.refreshToken) {
      try {
        const fresh = await coalescedRefresh(row.refreshToken);
        res = await doFetch(fresh);
      } catch {
        /* fall through and surface the original 401 */
      }
    }
  }
  return res;
}

export async function stFetch<T>(path: string): Promise<T> {
  const res = await authedRequest(path);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SmartThingsHttpError(res.status, `SmartThings ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function stPost<T>(path: string, body: unknown): Promise<T> {
  const res = await authedRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SmartThingsHttpError(res.status, `SmartThings ${res.status}: ${text}`);
  }
  // Some SmartThings commands respond with 200 and empty body; tolerate.
  const text = await res.text().catch(() => "");
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/* ---------- Typed helpers ---------- */

export interface SmartThingsDeviceRaw {
  deviceId: string;
  name: string;
  label: string;
  deviceTypeName?: string;
  manufacturerName?: string;
  presentationId?: string;
  components: Array<{
    id: string;
    capabilities: Array<{ id: string }>;
  }>;
}

export async function stListDevices(): Promise<SmartThingsDeviceRaw[]> {
  const data = await stFetch<{ items: SmartThingsDeviceRaw[] }>("/devices");
  return data.items ?? [];
}

export type SmartThingsStatus = {
  components: Record<
    string,
    Record<string, Record<string, { value: unknown; timestamp?: string; unit?: string }>>
  >;
};

export async function stGetDeviceStatus(deviceId: string): Promise<SmartThingsStatus> {
  return stFetch<SmartThingsStatus>(`/devices/${deviceId}/status`);
}

export interface SmartThingsCommand {
  component?: string;
  capability: string;
  command: string;
  arguments?: unknown[];
}

export async function stSendCommands(
  deviceId: string,
  commands: SmartThingsCommand[],
): Promise<void> {
  const withDefaults = commands.map((c) => ({
    component: c.component ?? "main",
    capability: c.capability,
    command: c.command,
    arguments: c.arguments ?? [],
  }));
  await stPost(`/devices/${deviceId}/commands`, { commands: withDefaults });
}
